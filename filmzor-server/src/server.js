import express from "express";
import session from "express-session";
import cors from "cors";
import { config } from "./config.js";
import webshareRouter from "./routes/webshare.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

app.use(express.json());

app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
    // Range/Content-Range treba explicitne povoliť pre <video> streamovanie cez cross-origin.
    allowedHeaders: ["Content-Type", "Range"],
    exposedHeaders: ["Content-Range", "Content-Length", "Accept-Ranges"],
  })
);

// Poznámka: MemoryStore je v poriadku pre lokálny vývoj/demo. Pre produkciu
// s viacerými inštanciami servera nahraď trvalým store (napr. Redis).
app.use(
  session({
    name: "filmzor.sid",
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: config.nodeEnv === "production",
      maxAge: 1000 * 60 * 60 * 12, // 12 hodín
    },
  })
);

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/api/webshare", webshareRouter);

app.use((req, res) => {
  res.status(404).json({ success: false, error: "Endpoint neexistuje." });
});

app.use(errorHandler);

// "0.0.0.0" = počúva na všetkých sieťových rozhraniach, nie len na localhost —
// potrebné, aby sa vedeli pripojiť aj iné zariadenia v LAN (napr. Smart TV).
app.listen(config.port, "0.0.0.0", () => {
  console.log(`FilmZor Webshare backend beží na http://0.0.0.0:${config.port} (LAN: http://192.168.10.11:${config.port})`);
});
