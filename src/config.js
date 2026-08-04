import "dotenv/config";

export const config = {
  port: Number(process.env.PORT) || 4000,
  sessionSecret: process.env.SESSION_SECRET || "dev-only-insecure-secret",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  nodeEnv: process.env.NODE_ENV || "development",
};

if (config.nodeEnv === "production" && config.sessionSecret === "dev-only-insecure-secret") {
  throw new Error("V produkcii musíš nastaviť vlastný SESSION_SECRET v .env súbore.");
}
