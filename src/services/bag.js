import { Router, json as expressJson } from "express";
import { LRUCache } from "lru-cache";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import readline from "node:readline";
import crypto from "node:crypto";

import { parseHuislijnUrl } from "../utils/parseHuislijnUrl.js";
import { bagLookupAddress } from "../services/bag.js";
import { epGetEnergyLabel } from "../services/epOnline.js";
import { openaiGenerateCards } from "../services/openai.js";
import { getSchemaDebug } from "../services/openaiSchema.js";
import { getListingFactsViaOpenAIWebSearch } from "../services/listingFactsOpenAI.js";
import { cacheGet, cacheSet, eventAppend, getEventsFilePath, getBaseDir } from "../services/persist.js";

const router = Router();

// In-memory cache (hot)
const cache = new LRUCache({
  max: 5000,
  ttl: 1000 * 60 * 60 * 6 // 6h
});

// In-memory listing facts cache (hot)
const listingCache = new LRUCache({
  max: 5000,
  ttl: 1000 * 60 * 60 * 6 // 6h
});

// Disk cache TTL (default 31 days)
const ttlDays = Number(process.env.CACHE_TTL_DAYS || "31");
const diskTtlMs = ttlDays * 24 * 60 * 60 * 1000;

function isAllowedOrigin(origin) {
  if (!origin) return false;
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return allowed.includes(origin);
}

function getClientIp(req) {
  const xf = req.headers["x-forwarded-for"]?.toString();
  if (xf) return xf.split(",")[0].trim();
  return null;
}

function maskIp(ip) {
  if (!ip) return null;
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) return `${m[1]}.${m[2]}.0.0`;
  return null;
}

function hashIp(ip) {
  if (!ip) return null;
  const salt = process.env.IP_HASH_SALT || "";
  return crypto.createHash("sha256").update(`${salt}|${ip}`).digest("hex");
}

function csvEscape(v) {
  const s = (v === null || v === undefined) ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

// CORS for API routes
router.use((req, res, next) => {
  const origin = req.headers.origin;

  if (isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Version endpoint
router.get("/version", async (_req, res) => {
  res.json({
    service: "huislijn-duurzaam-widget",
    schemaDebug: getSchemaDebug(),
    node: process.version,
    renderCommit: process.env.RENDER_GIT_COMMIT || null,
    renderServiceId: process.env.RENDER_SERVICE_ID || null,
    websearchEnabled: ((process.env.ENABLE_WEBSEARCH || "true").toLowerCase() === "true"),
    cacheTtlDays: ttlDays,
    dataDir: process.env.DATA_DIR || null,
    baseDirResolved: await getBaseDir().catch(() => null)
  });
});

/**
 * Track endpoint for analytics (clicks, impressions, etc.)
 * POST /api/track
 * Body example:
 * { type:"cta_click", url:"...", listingId:"...", cardIndex:0, meta:{...} }
 */
router.post("/track", expressJson({ limit: "50kb" }), async (req, res) => {
  try {
    const origin = req.headers.origin || null;
    const referer = req.headers.referer || null;
    const ua = req.headers["user-agent"] || null;

    const ip = getClientIp(req);
    const storeFullIp = (process.env.STORE_FULL_IP || "false").toLowerCase() === "true";

    const body = req.body || {};
    const evt = {
      type: String(body.type || "unknown"),
      url: body.url ? String(body.url) : null,
      listingId: body.listingId ? String(body.listingId) : null,
      cacheKey: body.cacheKey ? String(body.cacheKey) : null,
      cardIndex: Number.isFinite(body.cardIndex) ? body.cardIndex : null,
      meta: body.meta && typeof body.meta === "object" ? body.meta : null,
      origin,
      referer,
      ua,
      ipMasked: maskIp(ip),
      ipHash: hashIp(ip),
      ip: storeFullIp ? ip : null
    };

    await eventAppend(evt);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false });
  }
});

/**
 * CSV export of events enriched with address fields (from disk cache).
 * GET /api/export.csv
 *
 * Auth:
 * - Set EXPORT_TOKEN in env
 * - Call with header: Authorization: Bearer <EXPORT_TOKEN>
 *   OR ?token=<EXPORT_TOKEN>
 *
 * Filters:
 * - ?type=cta_click
 * - ?since=2026-03-01 (ISO date)
 */
router.get("/export.csv", async (req, res) => {
  const token = process.env.EXPORT_TOKEN;
  if (!token) return res.status(403).send("EXPORT_TOKEN not set");

  const auth = req.headers.authorization || "";
  const ok = auth === `Bearer ${token}` || req.query.token === token;
  if (!ok) return res.status(401).send("Unauthorized");

  const typeFilter = req.query.type ? String(req.query.type) : null;
  const sinceStr = req.query.since ? String(req.query.since) : null;
  const sinceMs = sinceStr ? Date.parse(sinceStr) : null;

  const eventsPath = await getEventsFilePath();
  // If file doesn't exist yet, return header only
  try {
    await fs.access(eventsPath);
  } catch {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="events.csv"');
    res.end("ts,type,postcode,huisnummer,huisletter,huisnummertoevoeging,listingId,url,ipMasked,ipHash,ip\n");
    return;
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="events.csv"');

  // Header
  res.write("ts,type,postcode,huisnummer,huisletter,huisnummertoevoeging,listingId,url,ipMasked,ipHash,ip\n");

  // memoize address lookups from disk cache
  const addrMemo = new Map();

  const rl = readline.createInterface({
    input: createReadStream(eventsPath, { encoding: "utf8" }),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    let evt;
    try {
      evt = JSON.parse(line);
    } catch {
      continue;
    }

    if (typeFilter && evt.type !== typeFilter) continue;

    if (sinceMs && evt.ts) {
      const t = Date.parse(evt.ts);
      if (Number.isFinite(t) && t < sinceMs) continue;
    }

    // Try to resolve cacheKey either from event or from URL
    let cacheKey = evt.cacheKey || null;

    if (!cacheKey && evt.url) {
      try {
        const p = parseHuislijnUrl(String(evt.url));
        cacheKey = `${p.listingId || ""}|${p.street}|${p.houseNumberRaw}|${p.place || ""}`;
      } catch {
        cacheKey = null;
      }
    }

    let addr = null;
    if (cacheKey) {
      if (addrMemo.has(cacheKey)) {
        addr = addrMemo.get(cacheKey);
      } else {
        const cached = await cacheGet(`cards:${cacheKey}`);
        // cached could be null if never requested
        const bag = cached?.bag || null;

        addr = {
          postcode: bag?.postcode ?? "",
          huisnummer: bag?.huisnummer ?? "",
          huisletter: bag?.huisletter ?? "",
          huisnummertoevoeging: bag?.huisnummertoevoeging ?? ""
        };

        addrMemo.set(cacheKey, addr);
      }
    } else {
      addr = { postcode: "", huisnummer: "", huisletter: "", huisnummertoevoeging: "" };
    }

    const row = [
      csvEscape(evt.ts || ""),
      csvEscape(evt.type || ""),
      csvEscape(addr.postcode),
      csvEscape(addr.huisnummer),
      csvEscape(addr.huisletter),
      csvEscape(addr.huisnummertoevoeging),
      csvEscape(evt.listingId || ""),
      csvEscape(evt.url || ""),
      csvEscape(evt.ipMasked || ""),
      csvEscape(evt.ipHash || ""),
      csvEscape(evt.ip || "")
    ].join(",") + "\n";

    res.write(row);
  }

  res.end();
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

    const parsedResolved = await timed("parse_url", async () => parseHuislijnUrl(url));
    const cacheKey = `${parsedResolved.listingId || ""}|${parsedResolved.street}|${parsedResolved.houseNumberRaw}|${parsedResolved.place || ""}`;

    // Cache lookup (mem -> disk)
    if (!noCache) {
      const mem = cache.get(cacheKey);
      if (mem) return res.json({ ...mem, cached: true, cacheLayer: "mem" });

      const disk = await timed("disk_cache_get", async () => cacheGet(`cards:${cacheKey}`));
      if (disk) {
        cache.set(cacheKey, disk);
        return res.json({ ...disk, cached: true, cacheLayer: "disk" });
      }
    }

    // BAG (non-fatal)
    let bag = null;
    try {
      bag = await timed("bag", async () => bagLookupAddress(parsedResolved));
    } catch (e) {
      bag = null;
      if (debug) {
        timings.bag_error = String(e?.message || e);
        timings.bag_error_stage = e?._stage || "bag";
      }
    }

    // EP-online (non-fatal)
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

    // Listing facts (optional)
    const listingKey = parsedResolved.listingId ? `id:${parsedResolved.listingId}` : `url:${url}`;
    let listing = null;

    if (!noCache) listing = listingCache.get(listingKey) || null;

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

    if (fast && !listing) {
      listing = { url, askingPriceEur: null, hasSolarPanels: null, solarPanelsCount: null, source: "fast" };
    }

    if (!listing) {
      listing = { url, askingPriceEur: null, hasSolarPanels: null, solarPanelsCount: null, source: websearchEnabled ? "none" : "disabled" };
    }

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

    // Save caches
    cache.set(cacheKey, payload);

    if (!noCache) {
      const toPersist = {
        addressParsedFromUrl: payload.addressParsedFromUrl,
        bag: payload.bag,
        energyLabel: payload.energyLabel
          ? {
              label: payload.energyLabel.label ?? null,
              registratiedatum: payload.energyLabel.registratiedatum ?? null,
              building: payload.energyLabel.building ?? null
            }
          : null,
        listing: payload.listing ?? null,
        cards: payload.cards,
        generatedAt: payload.generatedAt
      };

      await timed("disk_cache_set", async () => cacheSet(`cards:${cacheKey}`, toPersist, diskTtlMs));
    }

    res.json(payload);
  } catch (err) {
    console.error(err);
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
                GEMINI_API_KEY: Boolean(process.env.GEMINI_API_KEY),
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
