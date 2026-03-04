const EP_BASE = "https://public.ep-online.nl/api/v5";

function firstRecord(data) {
  if (Array.isArray(data)) return data[0] || null;
  return data || null;
}

function str(x) {
  return typeof x === "string" ? x : null;
}
function num(x) {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

function pickLabel(rec) {
  const v =
    rec?.Energieklasse ??
    rec?.EnergieKlasse ??
    rec?.energieklasse ??
    rec?.labelklasse ??
    rec?.labelKlasse ??
    rec?.energieLabel ??
    null;
  return typeof v === "string" ? v.trim().toUpperCase() : null;
}

function pickRegistratiedatum(rec) {
  return (
    str(rec?.Registratiedatum) ??
    str(rec?.registratiedatum) ??
    str(rec?.registratieDatum) ??
    null
  );
}

export async function epGetEnergyLabel({
  vboId,
  postcode,
  huisnummer,
  huisletter,
  huisnummertoevoeging
}) {
  const apiKey = process.env.EPONLINE_API_KEY;
  if (!apiKey) throw new Error("Missing EPONLINE_API_KEY");

  let url;
  if (vboId) {
    url = `${EP_BASE}/PandEnergielabel/AdresseerbaarObject/${encodeURIComponent(vboId)}`;
  } else {
    if (!postcode || !huisnummer) return null;

    const params = new URLSearchParams({
      postcode: String(postcode).replace(/\s+/g, ""),
      huisnummer: String(huisnummer)
    });
    if (huisletter) params.set("huisletter", huisletter);
    if (huisnummertoevoeging) params.set("huisnummertoevoeging", huisnummertoevoeging);

    url = `${EP_BASE}/PandEnergielabel/Adres?${params.toString()}`;
  }

  const r = await fetch(url, {
    headers: { Authorization: apiKey, Accept: "application/json" }
  });

  if (r.status === 404) return null;
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`EP-Online ${r.status} ${r.statusText}: ${txt.slice(0, 300)}`);
  }

  const data = await r.json();
  const rec = firstRecord(data);

  const gebouwtype = str(rec?.Gebouwtype) ?? str(rec?.gebouwtype) ?? null;
  const gebouwklasse = str(rec?.Gebouwklasse) ?? str(rec?.gebouwklasse) ?? null;
  const bouwjaar = num(rec?.Bouwjaar) ?? num(rec?.bouwjaar) ?? null;

  const gebruiksoppervlakteThermischeZone =
    num(rec?.Gebruiksoppervlakte_thermische_zone) ??
    num(rec?.GebruiksoppervlakteThermischeZone) ??
    null;

  // PV is niet altijd aanwezig; best-effort keys
  const pvAantal =
    num(rec?.Aantal_zonnepanelen) ??
    num(rec?.AantalZonnepanelen) ??
    num(rec?.PV_Aantal) ??
    null;

  return {
    label: pickLabel(rec),
    registratiedatum: pickRegistratiedatum(rec),
    building: {
      gebouwklasse,
      gebouwtype,
      bouwjaar,
      gebruiksoppervlakteThermischeZone,
      pvAantal
    },
    raw: data
  };
}
