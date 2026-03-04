import { load } from "cheerio";
import { extractJsonLdObjects } from "../utils/jsonld.js";

function parseEuroAmount(input) {
  if (!input) return null;
  const s = String(input);

  const m = s.match(/€\s*([\d\.\,]+)/) || s.match(/([\d\.\,]+)/);
  if (!m) return null;

  const raw = m[1];
  const normalized = raw.replace(/\./g, "").replace(/,/g, ".");
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;

  const eur = Math.round(n);
  return eur >= 10000 ? eur : null;
}

function findPriceFromJsonLd(jsonlds) {
  for (const obj of jsonlds) {
    const offers = obj?.offers || obj?.Offers;
    const offerArr = Array.isArray(offers) ? offers : offers ? [offers] : [];

    for (const off of offerArr) {
      const price =
        off?.price ??
        off?.Price ??
        off?.priceSpecification?.price ??
        off?.priceSpecification?.Price ??
        null;
      const parsed = parseEuroAmount(price);
      if (parsed) return parsed;
    }

    const rootPrice = obj?.price ?? obj?.Price ?? null;
    const parsedRoot = parseEuroAmount(rootPrice);
    if (parsedRoot) return parsedRoot;
  }
  return null;
}

function findPriceFromMeta($) {
  const candidates = [
    $("meta[property='product:price:amount']").attr("content"),
    $("meta[property='og:price:amount']").attr("content"),
    $("meta[name='price']").attr("content")
  ].filter(Boolean);

  for (const c of candidates) {
    const p = parseEuroAmount(c);
    if (p) return p;
  }
  return null;
}

function findPriceFromText($) {
  const text = $("body").text().replace(/\s+/g, " ");
  const matches = [...text.matchAll(/€\s*[\d\.\,]+/g)].map((m) => parseEuroAmount(m[0]));
  const filtered = matches.filter((x) => Number.isFinite(x) && x >= 10000);
  if (!filtered.length) return null;

  // vraagprijs is vaak het grootste eurobedrag op de pagina
  return Math.max(...filtered);
}

function findSolarPanels($) {
  const text = $("body").text().replace(/\s+/g, " ").toLowerCase();

  // "12 zonnepanelen"
  const m = text.match(/(\d{1,3})\s*(zonnepanelen|pv[-\s]?panelen|panelen)\b/);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0 && n < 400) {
      return { hasSolarPanels: true, solarPanelsCount: n };
    }
  }

  if (text.includes("zonnepanelen") || text.includes("pv-panelen") || text.includes("pv panelen")) {
    return { hasSolarPanels: true, solarPanelsCount: null };
  }

  return { hasSolarPanels: false, solarPanelsCount: null };
}

export async function fetchHuislijnListingData(listingUrl) {
  const r = await fetch(listingUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; HuislijnWidgetTester/1.0)",
      Accept: "text/html,application/xhtml+xml"
    }
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Listing fetch ${r.status} ${r.statusText}: ${txt.slice(0, 200)}`);
  }

  const html = await r.text();
  const $ = load(html);

  const jsonlds = extractJsonLdObjects($);

  const askingPriceEur =
    findPriceFromJsonLd(jsonlds) ??
    findPriceFromMeta($) ??
    findPriceFromText($) ??
    null;

  const { hasSolarPanels, solarPanelsCount } = findSolarPanels($);

  return {
    url: listingUrl,
    askingPriceEur,
    hasSolarPanels,
    solarPanelsCount
  };
}
