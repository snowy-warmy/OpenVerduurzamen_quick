import { Router } from "express";
import { LRUCache } from "lru-cache";
import { parseHuislijnUrl } from "../utils/parseHuislijnUrl.js";
import { bagLookupAddress } from "../services/bag.js";
import { epGetEnergyLabel } from "../services/epOnline.js";
import { openaiGenerateCards } from "../services/openai.js";
import { getSchemaDebug } from "../services/openaiSchema.js";

const router = Router();

const cache = new LRUCache({
  max: 1000,
  ttl: 1000 * 60 * 60 * 24 // 24h
});

function isAllowedOrigin(origin) {
  if (!origin) return false;
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return allowed.includes(origin);
}

// CORS for API routes
router.use((req, res, next) => {
  const origin = req.headers.origin;

  if (isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Handy: check what code is running on Render
router.get("/version", (_req, res) => {
  res.json({
    service: "huislijn-duurzaam-widget",
    schemaDebug: getSchemaDebug(),
    node: process.version,
    renderCommit: process.env.RENDER_GIT_COMMIT || null,
    renderServiceId: process.env.RENDER_SERVICE_ID || null
  });
});

router.get("/cards", async (req, res) => {
  const debug = req.query.debug === "1";

  try {
    const url = req.query.url;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "Missing ?url=" });
    }

    const parsed = parseHuislijnUrl(url);
    const cacheKey = `${parsed.street}|${parsed.houseNumberRaw}|${parsed.place || ""}`;

    const cached = cache.get(cacheKey);
    if (cached) return res.json({ ...cached, cached: true });

    const bag = await bagLookupAddress(parsed);

    const energyLabel = await epGetEnergyLabel({
      vboId: bag?.adresseerbaarObjectIdentificatie,
      postcode: bag?.postcode,
      huisnummer: bag?.huisnummer,
      huisletter: bag?.huisletter,
      huisnummertoevoeging: bag?.huisnummertoevoeging
    });

    const cards = await openaiGenerateCards({
      address: {
        street: bag?.openbareRuimteNaam || parsed.street,
        houseNumber: bag?.huisnummer || parsed.houseNumber,
        houseLetter: bag?.huisletter || parsed.houseLetter,
        houseNumberSuffix: bag?.huisnummertoevoeging || parsed.houseNumberSuffix,
        postcode: bag?.postcode || null,
        place: bag?.woonplaatsNaam || parsed.place || null
      },
      bag,
      energyLabel
    });

    const payload = {
      addressParsedFromUrl: parsed,
      bag,
      energyLabel,
      cards,
      generatedAt: new Date().toISOString(),
      ...(debug ? { debug: { schemaDebug: getSchemaDebug() } } : {})
    };

    cache.set(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error(err);

    // return extra debug info only when debug=1
    res.status(500).json({
      error: "Failed to generate cards",
      detail: String(err?.message || err),
      ...(debug
        ? {
            debug: {
              schemaDebug: getSchemaDebug(),
              envPresent: {
                OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY),
                BAG_API_KEY: Boolean(process.env.BAG_API_KEY),
                EPONLINE_API_KEY: Boolean(process.env.EPONLINE_API_KEY)
              }
            }
          }
        : {})
    });
  }
});

export default router;
