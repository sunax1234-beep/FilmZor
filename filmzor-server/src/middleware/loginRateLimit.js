import rateLimit from "express-rate-limit";

// Bez tohto by appka fungovala ako nechránený proxy na skúšanie Webshare
// hesiel — /login len preposiela username+password na Webshare API bez
// akéhokoľvek obmedzenia počtu pokusov. `app.set("trust proxy", 1)` v
// server.js je nutný predpoklad, aby express-rate-limit vedelo správne
// prečítať klientovu IP spoza Fly.io proxy (inak by rátalo všetky
// požiadavky pod jednou internou IP).
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Príliš veľa pokusov o prihlásenie. Skús to znova o chvíľu." },
});
