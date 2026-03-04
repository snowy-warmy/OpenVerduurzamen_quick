import { Router } from "express";
import { LRUCache } from "lru-cache";
import { parseHuislijnUrl } from "../utils/parseHuislijnUrl.js";
import { bagLookupAddress } from "../services/bag.js";
import { epGetEnergyLabel } from "../services/epOnline.js";
import { openaiGenerateCards } from "../services/openai.js";
import { getSchemaDebug } from "../services/openaiSchema.js";
import { getListingFactsViaOpenAIWebSearch } from "../services/listingFactsOpenAI.js";

const router = Router();

// Cache full payload (cards output etc.)
const cache = new LRUCache({
  max: 1000,
  ttl: 1000 * 60 * 60 * 24 // 24h
});

// Cache listing facts separately (price/pv can change; and web_search is slower)
const listingCache = new LRUCache({
  max: 1000,
  ttl: 1000 * 60 * 60 * 6 // 6h
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

// Handy: check what code is running
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
  const noCache = debug || req.query.nocache === "1";
  const fast = req.query.fast === "1";
  const enrich = req.query.enrich === "1";

  // Web search feature flag (default true)
  const websearchEnabled = (process.env.ENABLE_WEBSEARCH || "true").toLowerCase() === "true";

  try {
    const url = req.query.url;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "Missing ?url=" });
    }

    const parsed = parseHuislijnUrl(url);

    const cacheKey = `${parsed.listingId || ""}|${parsed.street}|${parsed.houseNumberRaw}|${parsed.place || ""}`;

    if (!noCache) {
      const cached = cache.get(cacheKey);
      if (cached) return res.json({ ...cached, cached: true });
    }

    // 1) BAG lookup -> postcode + VBO-id
    const bag = await bagLookupAddress(parsed);

    // 2) EP-online label + building info
    const energyLabel = await epGetEnergyLabel({
      vboId: bag?.adresseerbaarObjectIdentificatie,
      postcode: bag?.postcode,
      huisnummer: bag?.huisnummer,
      huisletter: bag?.huisletter,
      huisnummertoevoeging: bag?.huisnummertoevoeging
    });

    // 3) Listing facts via OpenAI web_search (optional, can be slow)
    const listingKey = parsed.listingId ? `id:${parsed.listingId}` : `url:${url}`;

    let listing = null;

    // Prefer cached listing facts
    if (!noCache) listing = listingCache.get(listingKey) || null;

    // Only run websearch when (enrich=1) and enabled
    if (!listing && enrich && websearchEnabled) {
      try {
        const facts = await getListingFactsViaOpenAIWebSearch({
          url,
          listingId: parsed.listingId,
          addressHint: `${parsed.street} ${parsed.houseNumberRaw}${parsed.place ? ", " + parsed.place : ""}`
        });

        listing = {
          url,
          askingPriceEur: facts.askingPriceEur ?? null,
          hasSolarPanels: facts.hasSolarPanels ?? null,
          solarPanelsCount: facts.solarPanelsCount ?? null,
          notes: facts.notes ?? "",
          sources: Array.isArray(facts.sources) ? facts.sources : []
        };

        listingCache.set(listingKey, listing);
      } catch (e) {
        listing = {
          url,
          askingPriceEur: null,
          hasSolarPanels: null,
          solarPanelsCount: null,
          notes: "web_search failed",
          sources: [],
          error: String(e?.message || e)
        };
      }
    }

    // Fast path: do NOT block on listing facts
    if (fast && !listing) {
      listing = {
        url,
        askingPriceEur: null,
        hasSolarPanels: null,
        solarPanelsCount: null,
        source: websearchEnabled ? "fast" : "disabled"
      };
    }

    // If still null (not fast, not enrich, or disabled), use empty listing
    if (!listing) {
      listing = {
        url,
        askingPriceEur: null,
        hasSolarPanels: null,
        solarPanelsCount: null,
        source: websearchEnabled ? "none" : "disabled"
      };
    }

    // 4) OpenAI cards
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
      energyLabel,
      // keep only fields relevant for advice
      listing: {
        url: listing.url,
        askingPriceEur: listing.askingPriceEur,
        hasSolarPanels: listing.hasSolarPanels,
        solarPanelsCount: listing.solarPanelsCount
      }
    });

    const payload = {
      addressParsedFromUrl: parsed,
      bag,
      energyLabel,
      listing: {
        url: listing.url,
        askingPriceEur: listing.askingPriceEur,
        hasSolarPanels: listing.hasSolarPanels,
        solarPanelsCount: listing.solarPanelsCount,
        source: listing.source || null
      },
      cards,
      generatedAt: new Date().toISOString(),
      ...(debug
        ? {
            debug: {
              schemaDebug: getSchemaDebug(),
              websearchEnabled,
              fast,
              enrich,
              listingNotes: listing.notes || "",
              listingSources: listing.sources || [],
              listingError: listing.error || null
            }
          }
        : {})
    };

    cache.set(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error(err);
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
