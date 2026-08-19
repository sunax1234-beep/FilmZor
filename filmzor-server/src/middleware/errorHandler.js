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

  // Iné časti kódu (napr. mediaProxy.js) vyhadzujú obyčajný Error s
  // priradeným .status namiesto WebshareApiError — predtým sa tu status aj
  // hláška ignorovali a vždy to spadlo na generickú 500 bez ohľadu na to,
  // aký status/hlášku volajúci kód zámerne nastavil.
  if (typeof err.status === "number") {
    return res.status(err.status).json({ success: false, error: err.message });
  }

  res.status(500).json({ success: false, error: "Interná chyba servera." });
}
