// src/services/bag.js
// BAG API Individuele Bevragingen (Kadaster)
// Root: https://api.bag.kadaster.nl/lvbag/individuelebevragingen/v2/  (X-Api-Key header) :contentReference[oaicite:0]{index=0}

const BAG_ROOT =
  process.env.BAG_API_ROOT ||
  "https://api.bag.kadaster.nl/lvbag/individuelebevragingen/v2"; // :contentReference[oaicite:1]{index=1}

function withTimeout(ms) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  return { controller, done: () => clearTimeout(t) };
}

function normalizeString(s) {
  return String(s || "").trim();
}

function pickFirstEmbedded(json) {
  const emb = json?._embedded || {};
  return (
    emb.adressen ||
    emb.adressenuitgebreid ||
    emb.adressenUitgebreid ||
    emb.adressen_uitgebreid ||
    []
  );
}

function lastPathSegment(url) {
  const s = String(url || "");
  const parts = s.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}

function extractPandIds(item) {
  // best-effort for different shapes
  if (Array.isArray(item?.pandIdentificaties)) return item.pandIdentificaties.filter(Boolean);
  if (Array.isArray(item?.pandidentificaties)) return item.pandidentificaties.filter(Boolean);

  const emb = item?._embedded || {};
  if (Array.isArray(emb?.panden)) {
    return emb.panden
      .map((p) => p?.identificatie || p?.pandIdentificatie || p?.pandidentificatie)
      .filter(Boolean);
  }

  const links = item?._links || {};
  if (Array.isArray(links?.panden)) {
    return links.panden.map((l) => lastPathSegment(l?.href)).filter(Boolean);
  }

  return [];
}

function extractVboId(item) {
  return (
    item?.adresseerbaarObjectIdentificatie ||
    item?.adresseerbaarobjectidentificatie ||
    item?.verblijfsobjectIdentificatie ||
    item?.verblijfsobjectidentificatie ||
    // fallback: parse from links
    lastPathSegment(item?._links?.verblijfsobject?.href) ||
    lastPathSegment(item?._links?.adresseerbaarObject?.href) ||
    null
  );
}

/**
 * Lookup postcode + ids from street/house/place using BAG API.
 * Input `parsed` should contain:
 *  - street, place, houseNumber, houseLetter, houseNumberSuffix (optional)
 */
export async function bagLookupAddress(parsed) {
  const apiKey = process.env.BAG_API_KEY;
  if (!apiKey) throw new Error("BAG_API_KEY missing");

  const street = normalizeString(parsed?.street);
  const place = normalizeString(parsed?.place);
  const huisnummer = Number(parsed?.houseNumber);

  if (!street || !place || !Number.isFinite(huisnummer)) {
    throw new Error("BAG lookup: missing street/place/huisnummer");
  }

  const huisletter = normalizeString(parsed?.houseLetter || "");
  const huisnummertoevoeging = normalizeString(parsed?.houseNumberSuffix || "");

  // We try a couple of parameter name variants (BAG has had variations historically)
  // Primary: woonplaatsNaam / openbareRuimteNaam / huisnummer / huisletter / huisnummertoevoeging
  const attempts = [
    {
      path: "/adressenuitgebreid",
      params: {
        woonplaatsNaam: place,
        openbareRuimteNaam: street,
        huisnummer: String(huisnummer),
        ...(huisletter ? { huisletter } : {}),
        ...(huisnummertoevoeging ? { huisnummertoevoeging } : {})
      }
    },
    // Fallback: lowercase variants some clients used
    {
      path: "/adressenuitgebreid",
      params: {
        woonplaatsnaam: place,
        openbareruimtenaam: street,
        huisnummer: String(huisnummer),
        ...(huisletter ? { huisletter } : {}),
        ...(huisnummertoevoeging ? { huisnummertoevoeging } : {})
      }
    },
    // If uitgebreid fails, try basic /adressen (often no Accept-Crs needed)
    {
      path: "/adressen",
      params: {
        woonplaatsNaam: place,
        openbareRuimteNaam: street,
        huisnummer: String(huisnummer),
        ...(huisletter ? { huisletter } : {}),
        ...(huisnummertoevoeging ? { huisnummertoevoeging } : {})
      }
    }
  ];

  let lastErr = null;

  for (const a of attempts) {
    const qs = new URLSearchParams(a.params).toString();
    const url = `${BAG_ROOT}${a.path}?${qs}`;

    const { controller, done } = withTimeout(8000);

    try {
      const resp = await fetch(url, {
        method: "GET",
        headers: {
          "X-Api-Key": apiKey, // header as specified by Kadaster docs :contentReference[oaicite:2]{index=2}
          Accept: "application/hal+json",
          // Some endpoints with geometry may require Accept-Crs (epsg:28992) :contentReference[oaicite:3]{index=3}
          "Accept-Crs": "EPSG:28992"
        },
        signal: controller.signal
      });

      done();

      if (!resp.ok) {
        lastErr = new Error(`BAG ${a.path} ${resp.status}: ${await safeText(resp)}`);
        continue;
      }

      const json = await resp.json();
      const list = pickFirstEmbedded(json);

      if (!Array.isArray(list) || list.length === 0) {
        lastErr = new Error(`BAG ${a.path}: no results`);
        continue;
      }

      const item = list[0];

      const result = {
        openbareRuimteNaam:
          item?.openbareRuimteNaam ||
          item?.openbareruimtenaam ||
          street,
        woonplaatsNaam:
          item?.woonplaatsNaam ||
          item?.woonplaatsnaam ||
          place,
        postcode:
          item?.postcode ||
          null,
        huisnummer:
          item?.huisnummer !== undefined ? item.huisnummer : huisnummer,
        huisletter:
          item?.huisletter ?? (huisletter || null),
        huisnummertoevoeging:
          item?.huisnummertoevoeging ?? (huisnummertoevoeging || null),
        adresseerbaarObjectIdentificatie: extractVboId(item),
        pandIdentificaties: extractPandIds(item)
      };

      // If postcode is missing, try next attempt
      if (!result.postcode) {
        lastErr = new Error(`BAG ${a.path}: result missing postcode`);
        continue;
      }

      return result;
    } catch (e) {
      done();
      lastErr = e;
      continue;
    }
  }

  throw lastErr || new Error("BAG lookup failed");
}

async function safeText(resp) {
  try {
    const t = await resp.text();
    return t?.slice(0, 300) || "";
  } catch {
    return "";
  }
}
