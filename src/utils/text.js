export function slugToName(slug) {
  const s = decodeURIComponent(slug || "")
    .replace(/-/g, " ")
    .trim();
  if (!s) return "";

  // simple Title Case (goed genoeg voor BAG search; BAG is meestal niet case-sensitive)
  return s
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function parseHouseNumber(raw) {
  const x = (raw || "").trim();

  // Common: 4202b -> huisnummer=4202, huisletter=B
  // Also handles: 12ab -> huisnummer=12, huisletter=A, toevoeging=B
  const m = x.match(/^(\d+)([a-zA-Z]?)([0-9a-zA-Z]{0,4})$/);
  if (!m) {
    // fallback: digits first
    const d = x.match(/^(\d+)/);
    if (!d) throw new Error(`Invalid house number: ${raw}`);
    return { huisnummer: Number(d[1]), huisletter: null, huisnummertoevoeging: null };
  }

  const huisnummer = Number(m[1]);
  const huisletter = m[2] ? m[2].toUpperCase() : null;
  const huisnummertoevoeging = m[3] ? m[3] : null;

  return { huisnummer, huisletter, huisnummertoevoeging };
}
