import "dotenv/config";

export const config = {
  port: Number(process.env.PORT) || 4000,
  sessionSecret: process.env.SESSION_SECRET || "dev-only-insecure-secret",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  nodeEnv: process.env.NODE_ENV || "development",
  // V produkcii ukazuje na pripojený Fly.io volume (viď fly.toml [[mounts]]),
  // aby prihlásenia prežili reštart/redeploy/auto-stop stroja — bez toho by
  // sme boli odkázaní na MemoryStore, ktorý sa zakaždým vyprázdni.
  sessionDir: process.env.SESSION_DIR || (process.env.NODE_ENV === "production" ? "/data/sessions" : ".sessions"),
};

if (config.nodeEnv === "production" && config.sessionSecret === "dev-only-insecure-secret") {
  throw new Error("V produkcii musíš nastaviť vlastný SESSION_SECRET v .env súbore.");
}
