const BAG_BASE = "https://api.bag.kadaster.nl/lvbag/individuelebevragingen/v2";

export async function bagLookupAddress(parsed) {
  const apiKey = process.env.BAG_API_KEY;
  if (!apiKey) throw new Error("Missing BAG_API_KEY");

  // Strategy:
  // 1) Try “structured” query (woonplaats + straat + huisnummer + letter/toevoeging)
  // 2) Fallback to q-search
  const structured = await tryStructured(parsed, apiKey);
  if (structured) return structured;

  const q = [parsed.street, parsed.houseNumberRaw, parsed.place].filter(Boolean).join(" ");
  const byQ = await tryQ(q, apiKey);
  return byQ; // may be null
}

async function tryStructured(parsed, apiKey) {
  if (!parsed.place) return null;

  const params = new URLSearchParams({
    woonplaatsNaam: parsed.place,
    openbareRuimteNaam: parsed.street,
    huisnummer: String(parsed.houseNumber),
    exacteMatch: "true",
    pageSize: "10"
  });

  if (parsed.houseLetter) params.set("huisletter", parsed.houseLetter);
  if (parsed.houseNumberSuffix) params.set("huisnummertoevoeging", parsed.houseNumberSuffix);

  const url = `${BAG_BASE}/adressen?${params.toString()}`;
  const data = await bagFetch(url, apiKey);
  return pickFirstAdres(data);
}

async function tryQ(q, apiKey) {
  if (!q) return null;
  const params = new URLSearchParams({
    q,
    pageSize: "10"
  });

  const url = `${BAG_BASE}/adressen?${params.toString()}`;
  const data = await bagFetch(url, apiKey);
  return pickFirstAdres(data);
}

async function bagFetch(url, apiKey) {
  const r = await fetch(url, {
    headers: {
      "X-Api-Key": apiKey,
      "Accept": "application/hal+json"
    }
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`BAG ${r.status} ${r.statusText}: ${txt.slice(0, 300)}`);
  }
  return r.json();
}

function pickFirstAdres(data) {
  const adressen = data?._embedded?.adressen;
  if (!Array.isArray(adressen) || adressen.length === 0) return null;

  const a = adressen[0];
  return {
    openbareRuimteNaam: a.openbareRuimteNaam,
    woonplaatsNaam: a.woonplaatsNaam,
    postcode: a.postcode,
    huisnummer: a.huisnummer,
    huisletter: a.huisletter || null,
    huisnummertoevoeging: a.huisnummertoevoeging || null,
    adresseerbaarObjectIdentificatie: a.adresseerbaarObjectIdentificatie || null,
    pandIdentificaties: a.pandIdentificaties || []
  };
}
