import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULT_DIR = path.join(process.cwd(), ".data");

// baseDir can switch to fallback if mount is missing/unwritable
let baseDir = process.env.DATA_DIR || DEFAULT_DIR;
let cacheDir = path.join(baseDir, "cache");
let eventsDir = path.join(baseDir, "events");
let eventsFile = path.join(eventsDir, "events.ndjson");

let initialized = false;

async function ensureDirs() {
  if (initialized) return;

  try {
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.mkdir(eventsDir, { recursive: true });
    initialized = true;
  } catch {
    baseDir = DEFAULT_DIR;
    cacheDir = path.join(baseDir, "cache");
    eventsDir = path.join(baseDir, "events");
    eventsFile = path.join(eventsDir, "events.ndjson");

    await fs.mkdir(cacheDir, { recursive: true });
    await fs.mkdir(eventsDir, { recursive: true });
    initialized = true;
  }
}

function keyToFilename(key) {
  const h = crypto.createHash("sha256").update(key).digest("hex");
  return `${h}.json`;
}

function cachePath(key) {
  return path.join(cacheDir, keyToFilename(key));
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

  await fs.appendFile(eventsFile, line, "utf8");
}

export async function getEventsFilePath() {
  await ensureDirs();
  return eventsFile;
}

export async function getBaseDir() {
  await ensureDirs();
  return baseDir;
}
