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

// Cache listing facts separately (price/pv can change; web_search is slower)
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
    renderServiceId: process.env.RENDER_SERVICE_ID || null,
    websearchEnabled: ((process.env.ENABLE_WEBSEARCH || "true").toLowerCase() === "true")
  });
});

router.get("/cards", async (req, res) => {
  const debug = req.query.debug === "1";
  const noCache = debug || req.query.nocache === "1";
  const fast = req.query.fast === "1";
  const enrich = req.query.enrich === "1";

  const websearchEnabled = (process.env.ENABLE_WEBSEARCH || "true").toLowerCase() === "true";

  // timings + stage debug
  const timings = {};
  let stage = "start";

  async function timed(name, fn) {
    const t0 = Date.now();
    stage = name;
    try {
      const out = await fn();
      timings[name] = Date.now() - t0;
      return out;
    } catch (e) {
      timings[name] = Date.now() - t0;
      e._stage = name;
      throw e;
    }
  }

  try {
    const url = req.query.url;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "Missing ?url=" });
    }

    const parsed = timed("parse_url", async () => parseHuislijnUrl(url));
    const parsedResolved = await parsed;

    const cacheKey = `${parsedResolved.listingId || ""}|${parsedResolved.street}|${parsedResolved.houseNumberRaw}|${parsedResolved.place || ""}`;

    if (!noCache) {
      const cached = cache.get(cacheKey);
      if (cached) return res.json({ ...cached, cached: true });
    }

    // 1) BAG lookup (non-fatal: if it fails, continue with parsed URL)
    let bag = null;
    try {
      bag = await timed("bag", async () => bagLookupAddress(parsedResolved));
    } catch (e) {
      bag = null;
      if (debug) {
        // keep going; include error in debug later
        timings.bag_error = String(e?.message || e);
        timings.bag_error_stage = e?._stage || "bag";
      }
    }

    // 2) EP-online (non-fatal: if it fails, continue without label)
    let energyLabel = null;
    try {
      energyLabel = await timed("ep_online", async () =>
        epGetEnergyLabel({
          vboId: bag?.adresseerbaarObjectIdentificatie,
          postcode: bag?.postcode,
          huisnummer: bag?.huisnummer,
          huisletter: bag?.huisletter,
          huisnummertoevoeging: bag?.huisnummertoevoeging
        })
      );
    } catch (e) {
      energyLabel = null;
      if (debug) {
        timings.ep_error = String(e?.message || e);
        timings.ep_error_stage = e?._stage || "ep_online";
      }
    }

    // 3) Listing facts (web_search) - optional
    const listingKey = parsedResolved.listingId ? `id:${parsedResolved.listingId}` : `url:${url}`;
    let listing = null;

    if (!noCache) listing = listingCache.get(listingKey) || null;

    // Only do websearch on enrich=1 and enabled
    if (!listing && enrich && websearchEnabled) {
      try {
        const facts = await timed("websearch_listing", async () =>
          getListingFactsViaOpenAIWebSearch({
            url,
            listingId: parsedResolved.listingId,
            addressHint: `${parsedResolved.street} ${parsedResolved.houseNumberRaw}${parsedResolved.place ? ", " + parsedResolved.place : ""}`
          })
        );

        listing = {
          url,
          askingPriceEur: facts.askingPriceEur ?? null,
          hasSolarPanels: facts.hasSolarPanels ?? null,
          solarPanelsCount: facts.solarPanelsCount ?? null,
          notes: facts.notes ?? ""
        };

        listingCache.set(listingKey, listing);
      } catch (e) {
        listing = {
          url,
          askingPriceEur: null,
          hasSolarPanels: null,
          solarPanelsCount: null,
          notes: "web_search failed",
          error: String(e?.message || e)
        };
      }
    }

    // Fast path: never block on listing facts
    if (fast && !listing) {
      listing = { url, askingPriceEur: null, hasSolarPanels: null, solarPanelsCount: null, source: "fast" };
    }

    // If websearch disabled OR not enriching, keep listing empty
    if (!listing) {
      listing = { url, askingPriceEur: null, hasSolarPanels: null, solarPanelsCount: null, source: websearchEnabled ? "none" : "disabled" };
    }

    // 4) OpenAI cards (this is the ONLY fatal step by default)
    const cards = await timed("openai_cards", async () =>
      openaiGenerateCards({
        address: {
          street: bag?.openbareRuimteNaam || parsedResolved.street,
          houseNumber: bag?.huisnummer || parsedResolved.houseNumber,
          houseLetter: bag?.huisletter || parsedResolved.houseLetter,
          houseNumberSuffix: bag?.huisnummertoevoeging || parsedResolved.houseNumberSuffix,
          postcode: bag?.postcode || null,
          place: bag?.woonplaatsNaam || parsedResolved.place || null
        },
        bag,
        energyLabel,
        listing: {
          url: listing.url,
          askingPriceEur: listing.askingPriceEur,
          hasSolarPanels: listing.hasSolarPanels,
          solarPanelsCount: listing.solarPanelsCount
        }
      })
    );

    const payload = {
      addressParsedFromUrl: parsedResolved,
      bag,
      energyLabel,
      listing,
      cards,
      generatedAt: new Date().toISOString(),
      ...(debug
        ? {
            debug: {
              schemaDebug: getSchemaDebug(),
              stage,
              timings,
              flags: { fast, enrich, noCache, websearchEnabled }
            }
          }
        : {})
    };

    cache.set(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error(err);

    // Try to surface underlying cause (undici often puts details in err.cause)
    const cause = err?.cause ? String(err.cause?.message || err.cause) : null;

    res.status(500).json({
      error: "Failed to generate cards",
      detail: String(err?.message || err),
      ...(debug
        ? {
            debug: {
              schemaDebug: getSchemaDebug(),
              stage: err?._stage || stage,
              cause,
              timings,
              flags: {
                websearchEnabled: (process.env.ENABLE_WEBSEARCH || "true").toLowerCase() === "true"
              },
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
