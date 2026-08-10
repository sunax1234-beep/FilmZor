import { Router } from "express";
import { callWebshare, WebshareApiError } from "../services/webshareClient.js";
import { webshareLoginDigest } from "../utils/md5crypt.js";
import { searchMovieOnWebshare, searchEpisodeOnWebshare } from "../services/webshareMatcher.js";
import { streamMovie } from "../services/mediaProxy.js";

const router = Router();

function asyncHandler(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

/**
 * GET /api/webshare/session
 * Vráti len to, či je aktuálny prehliadač (session cookie) prihlásený na
 * Webshare — nikdy nevracia samotný token.
 */
router.get("/session", (req, res) => {
  res.json({
    success: true,
    loggedIn: Boolean(req.session.wst),
    username: req.session.username || null,
  });
});

/**
 * POST /api/webshare/login
 * Body: { username, password, keepLoggedIn? }
 *
 * Prihlási sa voči Webshare (salt -> md5_crypt+sha1 -> login) a výsledný
 * session token (WST) uloží LEN do serverovej session. Frontend ho nikdy
 * neuvidí — na ďalšie požiadavky ho backend priloží sám.
 */
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { username, password, keepLoggedIn } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ success: false, error: "Chýba username alebo password." });
    }

    let saltResponse, loginResponse;
    try {
      saltResponse = await callWebshare("/salt/", { username_or_email: username });
    } catch (e) {
      // Webshare vracia na zlé/neexistujúce meno FATAL (my ho inak mapujeme
      // na 502) — v kontexte loginu to takmer vždy znamená zlé údaje, nie
      // pád servera, preto tu vracaiame 401 s jasnou správou namiesto toho.
      if (e instanceof WebshareApiError) {
        throw new WebshareApiError("Nesprávne prihlasovacie meno, alebo Webshare dočasne odmieta prihlásenie.", "LOGIN_REJECTED", 401);
      }
      throw e;
    }
    const salt = saltResponse.salt;

    if (!salt) {
      throw new WebshareApiError("Pre zadaného používateľa sa nepodarilo získať salt.", "NO_SALT", 400);
    }

    const digest = webshareLoginDigest(password, salt);

    try {
      loginResponse = await callWebshare("/login/", {
        username_or_email: username,
        password: digest,
        keep_logged_in: keepLoggedIn ? 1 : 0,
      });
    } catch (e) {
      if (e instanceof WebshareApiError) {
        throw new WebshareApiError("Nesprávne meno alebo heslo, alebo Webshare dočasne odmieta prihlásenie (napr. po viacerých neúspešných pokusoch).", "LOGIN_REJECTED", 401);
      }
      throw e;
    }

    if (!loginResponse.token) {
      throw new WebshareApiError("Prihlásenie zlyhalo — Webshare nevrátilo token.", "NO_TOKEN", 401);
    }

    req.session.wst = loginResponse.token;
    req.session.username = username;
    // Predvolená cookie.maxAge (12h, nastavená v server.js) platí, kým
    // používateľ výslovne nezaškrtne "Zapamätať si prihlásenie" — vtedy ju
    // pre TÚTO session predĺžime, aby sa nemusel prihlasovať pri každej
    // návšteve nanovo.
    if (keepLoggedIn) {
      req.session.cookie.maxAge = 1000 * 60 * 60 * 24 * 30; // 30 dní
    }

    res.json({
      success: true,
      username,
      isVip: loginResponse.vip === "1",
      vipUntil: loginResponse.vip_until || null,
    });
  })
);

/**
 * POST /api/webshare/logout
 * Zruší session token na Webshare aj lokálnu server session.
 */
router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    if (req.session.wst) {
      await callWebshare("/logout/", { wst: req.session.wst }).catch(() => {
        // Aj keď zlyhá volanie na Webshare, lokálnu session aj tak zmažeme.
      });
    }
    req.session.destroy(() => {});
    res.json({ success: true });
  })
);

/**
 * POST /api/webshare/search
 * Film:   { title, originalTitle?, year?, category?, sort?, limit?, offset? }
 * Epizóda seriálu: { title, originalTitle?, season, episode, category?, sort?, limit?, offset? }
 * (spätná kompatibilita: `query` sa berie ako `title`, ak `title` chýba)
 *
 * Multi-Query Aggregator: paralelne (Promise.all) sa spustí TOP 3-4 najrelevantnejších
 * vyhľadávacích fráz (lokalizovaný aj originálny názov, spojený aj s medzerou,
 * s "+1" variantom pre prvé diely sérií), výsledky sa zlúčia a deduplikujú podľa
 * `ident`. Každý súbor dostane fuzzy-match skóre 0-100 (zhoda kľúčových slov, rok,
 * "1"/"I" pri prvom diele, CZ/SK bonus) a súbory pod 40 % sa zahodia. Zvyšok je
 * zoradený podľa veľkosti súboru. Detaily viď services/webshareMatcher.js.
 */
router.post(
  "/search",
  asyncHandler(async (req, res) => {
    const {
      title,
      originalTitle,
      alternateTitle,
      year,
      season,
      episode,
      query,
      category = "video",
      sort = "largest",
      limit = 20,
      offset = 0,
    } = req.body || {};

    const primaryTitle = title || query;

    if ((!primaryTitle || !String(primaryTitle).trim()) && !originalTitle) {
      return res.status(400).json({
        success: false,
        error: "Chýba vyhľadávací výraz (title/originalTitle, prípadne staršie query).",
      });
    }

    const opts = {
      title: primaryTitle ? String(primaryTitle).trim() : null,
      originalTitle: originalTitle ? String(originalTitle).trim() : null,
      alternateTitle: alternateTitle ? String(alternateTitle).trim() : null,
      category,
      sort,
      limit,
      offset,
      wst: req.session.wst,
    };

    const isEpisodeSearch = season !== undefined && season !== null && episode !== undefined && episode !== null;

    const result = isEpisodeSearch
      ? await searchEpisodeOnWebshare({ ...opts, season, episode })
      : await searchMovieOnWebshare({ ...opts, year: year || null });

    res.json({
      success: true,
      total: result.files.length,
      files: result.files,
      queriedPhrases: result.queriedPhrases,
      isLooselyMatched: result.isLooselyMatched,
      noResults: result.noResults,
    });
  })
);

/**
 * POST /api/webshare/get-link
 * Body: { ident, downloadType? }
 *
 * Vyžaduje prihláseného používateľa (WST token zo session) — generovanie
 * odkazu je viazané na konkrétny Webshare účet a jeho limity.
 */
router.post(
  "/get-link",
  asyncHandler(async (req, res) => {
    if (!req.session.wst) {
      return res.status(401).json({
        success: false,
        error: "Na generovanie odkazu sa treba najprv prihlásiť cez /api/webshare/login.",
      });
    }

    const { ident, downloadType = "file_download" } = req.body || {};

    if (!ident) {
      return res.status(400).json({ success: false, error: "Chýba identifikátor súboru (ident)." });
    }

    const linkResponse = await callWebshare("/file_link/", {
      ident,
      wst: req.session.wst,
      download_type: downloadType,
    });

    if (!linkResponse.link) {
      throw new WebshareApiError("Webshare nevrátilo odkaz na stiahnutie.", "NO_LINK", 502);
    }

    res.json({ success: true, link: linkResponse.link });
  })
);

/**
 * GET /api/webshare/stream/:ident
 *
 * Živý remux prehrávania: video sa 1:1 kopíruje, zvuk sa prekóduje na AAC,
 * výstupom je fragmentovaný MP4 pipe-ovaný priamo do odpovede. Vďaka tomu
 * funguje spoľahlivo prehrávanie aj pre .mkv súbory s AC3/DTS zvukom, ktoré
 * by prehliadač inak vôbec neprehral. Podporuje aj Range hlavičku (seek) —
 * pozri services/mediaProxy.js pre detaily.
 *
 * Používa sa priamo ako <video src>, preto vyžaduje session cookie
 * (crossOrigin="use-credentials" na frontende), nie Authorization hlavičku.
 */
router.get(
  "/stream/:ident",
  asyncHandler(async (req, res) => {
    if (!req.session.wst) {
      return res.status(401).json({
        success: false,
        error: "Na prehratie sa treba najprv prihlásiť cez /api/webshare/login.",
      });
    }

    const { ident } = req.params;
    if (!ident) {
      return res.status(400).json({ success: false, error: "Chýba identifikátor súboru (ident)." });
    }

    await streamMovie({ ident, wst: req.session.wst, rangeHeader: req.headers.range, res });
  })
);

export default router;
