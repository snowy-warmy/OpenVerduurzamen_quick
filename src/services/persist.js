import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULT_DIR = path.join(process.cwd(), ".data");
const DATA_DIR = process.env.DATA_DIR || DEFAULT_DIR;

const CACHE_DIR = path.join(DATA_DIR, "cache");
const EVENTS_DIR = path.join(DATA_DIR, "events");
const EVENTS_FILE = path.join(EVENTS_DIR, "events.ndjson");

let initialized = false;

async function ensureDirs() {
  if (initialized) return;

  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.mkdir(EVENTS_DIR, { recursive: true });
    initialized = true;
  } catch {
    // fallback to local .data if mount is missing/unwritable
    const fbCache = path.join(DEFAULT_DIR, "cache");
    const fbEvents = path.join(DEFAULT_DIR, "events");
    await fs.mkdir(fbCache, { recursive: true });
    await fs.mkdir(fbEvents, { recursive: true });
    initialized = true;
  }
}

function keyToFilename(key) {
  const h = crypto.createHash("sha256").update(key).digest("hex");
  return `${h}.json`;
}

function cachePath(key) {
  return path.join(CACHE_DIR, keyToFilename(key));
}

export async function cacheGet(key) {
  await ensureDirs();
  const fp = cachePath(key);

  try {
    const raw = await fs.readFile(fp, "utf8");
    const obj = JSON.parse(raw);

    if (obj?.expiresAt && Date.now() > obj.expiresAt) {
      await fs.unlink(fp).catch(() => {});
      return null;
    }
    return obj?.value ?? null;
  } catch {
    return null;
  }
}

export async function cacheSet(key, value, ttlMs) {
  await ensureDirs();
  const fp = cachePath(key);

  const payload = {
    key,
    createdAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
    value
  };

  const tmp = `${fp}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(payload), "utf8");
  await fs.rename(tmp, fp);
}

export async function eventAppend(evt) {
  await ensureDirs();
  const line =
    JSON.stringify({
      ...evt,
      ts: evt.ts || new Date().toISOString()
    }) + "\n";

  await fs.appendFile(EVENTS_FILE, line, "utf8");
}
