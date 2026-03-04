const EP_BASE = "https://public.ep-online.nl/api/v5";

export async function epGetEnergyLabel({ vboId, postcode, huisnummer, huisletter, huisnummertoevoeging }) {
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
    headers: {
      "Authorization": apiKey,
      "Accept": "application/json"
    }
  });

  if (r.status === 404) return null;
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`EP-Online ${r.status} ${r.statusText}: ${txt.slice(0, 300)}`);
  }

  const data = await r.json();

  // We don't hard-assume field names; keep raw + attempt best-effort extraction.
  const label =
    data?.labelklasse ??
    data?.labelKlasse ??
    data?.energieklasse ??
    data?.class ??
    data?.Class ??
    null;

  const registratiedatum =
    data?.registratiedatum ??
    data?.registratieDatum ??
    data?.registrationDate ??
    null;

  return {
    label,
    registratiedatum,
    raw: data
  };
}
