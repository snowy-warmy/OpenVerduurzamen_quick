import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULT_DIR = path.join(process.cwd(), ".data");
const DATA_DIR = process.env.DATA_DIR || DEFAULT_DIR;

const CACHE_DIR = path.join(DATA_DIR, "cache");
const EVENTS_DIR = path.join(DATA_DIR, "events");
const EVENTS_FILE = path.join(EVENTS_DIR, "events.ndjson");

let initPromise = null;
async function init() {
  if (!initPromise) {
    initPromise = (async () => {
      // Try to create directories; if DATA_DIR fails, fallback to DEFAULT_DIR
      try {
        await fs.mkdir(CACHE_DIR, { recursive: true });
        await fs.mkdir(EVENTS_DIR, { recursive: true });
      } catch {
        // fallback
        const fallbackCache = path.join(DEFAULT_DIR, "cache");
        const fallbackEvents = path.join(DEFAULT_DIR, "events");
        await fs.mkdir(fallbackCache, { recursive: true });
        await fs.mkdir(fallbackEvents, { recursive: true });
      }
    })();
  }
  return initPromise;
}

function keyToFilename(key) {
  const h = crypto.createHash("sha256").update(key).digest("hex");
  return `${h}.json`;
}

function getCachePath(key) {
  // if DATA_DIR not writable, init() will have created fallback dirs,
  // but we keep it simple: attempt DATA_DIR first.
  return path.join(CACHE_DIR, keyToFilename(key));
}

export async function cacheGet(key) {
  await init();
  const fp = getCachePath(key);
  try {
    const raw = await fs.readFile(fp, "utf8");
    const obj = JSON.parse(raw);

    if (obj?.expiresAt && Date.now() > obj.expiresAt) {
      // lazy eviction
      await fs.unlink(fp).catch(() => {});
      return null;
    }
    return obj?.value ?? null;
  } catch {
    return null;
  }
}

export async function cacheSet(key, value, ttlMs) {
  await init();
  const fp = getCachePath(key);

  const payload = {
    key,
    createdAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
    value
  };

  // atomic write: write temp then rename
  const tmp = `${fp}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(payload), "utf8");
  await fs.rename(tmp, fp);
}

export async function cacheDelete(key) {
  await init();
  const fp = getCachePath(key);
  await fs.unlink(fp).catch(() => {});
}

export async function eventAppend(evt) {
  await init();
  const line = JSON.stringify({
    ...evt,
    ts: evt.ts || new Date().toISOString()
  }) + "\n";
  await fs.appendFile(EVENTS_FILE, line, "utf8");
}
