import { WebshareApiError } from "../services/webshareClient.js";

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  console.error("[filmzor-server] chyba:", err);

  if (err instanceof WebshareApiError) {
    return res.status(err.status || 502).json({
      success: false,
      error: err.message,
      code: err.code,
    });
  }

  res.status(500).json({ success: false, error: "Interná chyba servera." });
}
