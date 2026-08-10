// Worker entry point (Cloudflare Workers + Static Assets). Statické súbory
// rieši ASSETS binding, /api/* sa proxuje na Fly.io backend na strane
// servera (nie z prehliadača) — vďaka tomu je session cookie z pohľadu
// prehliadača first-party (patrí tejto istej doméne, nie fly.dev) a
// nepadá pod blokovanie "cookies tretej strany" (Safari/Firefox private
// mode/Brave defaultne blokujú, Chrome smeruje rovnakým smerom).
const BACKEND_ORIGIN = "https://filmzor.fly.dev";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const target = new URL(url.pathname + url.search, BACKEND_ORIGIN);
      return fetch(new Request(target, request));
    }
    return env.ASSETS.fetch(request);
  },
};
