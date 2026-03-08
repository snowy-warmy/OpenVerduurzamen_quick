import { Router } from "express";
import express from "express";
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

// In-memory cache for listing facts (hot)
const listingCache = new LRUCache({
  max: 5000,
  ttl: 1000 * 60 * 60 * 6 // 6h
});

// Disk cache TTL (default 31 days)
const ttlDays = Number(process.env.CACHE_TTL_DAYS || "31");
const diskTtlMs = ttlDays * 24 * 60 * 60 * 1000;

// Prevent double token spend on concurrent same-key requests
const inflight = new Map(); // cacheKey -> Promise<payload>

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
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

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
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

// Handy: check what code is running
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
 * Track endpoint
 * POST /api/track
 * Body: { type, url, listingId?, cacheKey?, cardIndex?, meta? }
 */
router.post("/track", express.json({ limit: "50kb" }), async (req, res) => {
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
 * CSV export of events + address fields (from disk cache)
 * GET /api/export.csv
 *
 * Auth:
 * - set EXPORT_TOKEN in env
 * - use header Authorization: Bearer <EXPORT_TOKEN>
 *   OR ?token=<EXPORT_TOKEN>
 *
 * Filters:
 * - ?type=cta_click
 * - ?since=YYYY-MM-DD (ISO)
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
  res.write("ts,type,postcode,huisnummer,huisletter,huisnummertoevoeging,listingId,url,ipMasked,ipHash,ip\n");

  const addrMemo = new Map(); // cacheKey -> addr object

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

    // Resolve cacheKey (event -> url fallback)
    let ck = evt.cacheKey || null;
    if (!ck && evt.url) {
      try {
        const p = parseHuislijnUrl(String(evt.url));
        ck = `${p.listingId || ""}|${p.street}|${p.houseNumberRaw}|${p.place || ""}`;
      } catch {
        ck = null;
      }
    }

    let addr = { postcode: "", huisnummer: "", huisletter: "", huisnummertoevoeging: "" };

    if (ck) {
      if (addrMemo.has(ck)) {
        addr = addrMemo.get(ck);
      } else {
        const cached = await cacheGet(`cards:${ck}`);
        const bag = cached?.bag || null;

        addr = {
          postcode: bag?.postcode ?? "",
          huisnummer: bag?.huisnummer ?? "",
          huisletter: bag?.huisletter ?? "",
          huisnummertoevoeging: bag?.huisnummertoevoeging ?? ""
        };

        addrMemo.set(ck, addr);
      }
    }

    const row =
      [
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

  const url = req.query.url;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing ?url=" });
  }

  try {
    const parsedResolved = await timed("parse_url", async () => parseHuislijnUrl(url));
    const cacheKey = `${parsedResolved.listingId || ""}|${parsedResolved.street}|${parsedResolved.houseNumberRaw}|${parsedResolved.place || ""}`;

    // 0) Memory -> Disk cache
    if (!noCache) {
      const mem = cache.get(cacheKey);
      if (mem) return res.json({ ...mem, cached: true, cacheLayer: "mem" });

      const disk = await timed("disk_cache_get", async () => cacheGet(`cards:${cacheKey}`));
      if (disk) {
        cache.set(cacheKey, disk);
        return res.json({ ...disk, cached: true, cacheLayer: "disk" });
      }

      // in-flight dedupe
      if (inflight.has(cacheKey)) {
        const inflightPayload = await inflight.get(cacheKey);
        return res.json({ ...inflightPayload, cached: true, cacheLayer: "inflight" });
      }
    }

    const computePromise = (async () => {
      // 1) BAG lookup (non-fatal)
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

      // 2) EP-online (non-fatal)
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

      // 3) Listing facts (optional)
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

            // NEW: list of already-present measures (e.g. ["zonnepanelen", "dakisolatie", ...])
            existingMeasures: Array.isArray(facts.existingMeasures) ? facts.existingMeasures : [],

            notes: facts.notes ?? ""
          };

          listingCache.set(listingKey, listing);
        } catch (e) {
          listing = {
            url,
            askingPriceEur: null,
            hasSolarPanels: null,
            solarPanelsCount: null,
            existingMeasures: [],
            notes: "web_search failed",
            error: String(e?.message || e)
          };
        }
      }

      if (fast && !listing) {
        listing = {
          url,
          askingPriceEur: null,
          hasSolarPanels: null,
          solarPanelsCount: null,
          existingMeasures: [],
          source: "fast"
        };
      }

      if (!listing) {
        listing = {
          url,
          askingPriceEur: null,
          hasSolarPanels: null,
          solarPanelsCount: null,
          existingMeasures: [],
          source: websearchEnabled ? "none" : "disabled"
        };
      }

      // 4) Cards (fatal)
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

          // UPDATED: pass existingMeasures through to model
          listing: {
            url: listing.url,
            askingPriceEur: listing.askingPriceEur,
            hasSolarPanels: listing.hasSolarPanels,
            solarPanelsCount: listing.solarPanelsCount,
            existingMeasures: listing.existingMeasures || []
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

      // 5) Save caches (memory + disk)
      cache.set(cacheKey, payload);

      if (!noCache) {
        // Compact payload for disk (avoid huge blobs like energyLabel.raw)
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
          listing: payload.listing ?? null, // includes existingMeasures now
          cards: payload.cards,
          generatedAt: payload.generatedAt
        };

        await timed("disk_cache_set", async () => cacheSet(`cards:${cacheKey}`, toPersist, diskTtlMs));
      }

      return payload;
    })();

    if (!noCache) inflight.set(cacheKey, computePromise);

    const payload = await computePromise;

    if (!noCache) inflight.delete(cacheKey);

    res.json(payload);
  } catch (err) {
    if (!noCache) {
      // avoid stuck inflight
      try {
        const parsedTmp = parseHuislijnUrl(url);
        const ckTmp = `${parsedTmp.listingId || ""}|${parsedTmp.street}|${parsedTmp.houseNumberRaw}|${parsedTmp.place || ""}`;
        inflight.delete(ckTmp);
      } catch {}
    }

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
                EPONLINE_API_KEY: Boolean(process.env.EPONLINE_API_KEY),
                EXPORT_TOKEN: Boolean(process.env.EXPORT_TOKEN),
                IP_HASH_SALT: Boolean(process.env.IP_HASH_SALT)
              }
            }
          }
        : {})
    });
  }
});

export default router;
