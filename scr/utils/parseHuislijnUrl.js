import { slugToName, parseHouseNumber } from "./text.js";

export function parseHuislijnUrl(inputUrl) {
  const u = new URL(inputUrl);
  const parts = u.pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1] || "";

  // last slug example: vogelzand-4202b-julianadorp
  const slugParts = last.split("-").filter(Boolean);

  const idx = slugParts.findIndex((p) => /^\d/.test(p));
  if (idx === -1) {
    throw new Error(`Could not find housenumber segment in slug: ${last}`);
  }

  const streetSlug = slugParts.slice(0, idx).join("-");
  const houseSlug = slugParts[idx];
  const placeSlug = slugParts.slice(idx + 1).join("-");

  const street = slugToName(streetSlug);
  const place = placeSlug ? slugToName(placeSlug) : null;

  const house = parseHouseNumber(houseSlug);

  return {
    rawUrl: inputUrl,
    slug: last,
    street,
    place,
    houseNumberRaw: houseSlug,
    houseNumber: house.huisnummer,
    houseLetter: house.huisletter,
    houseNumberSuffix: house.huisnummertoevoeging
  };
}
