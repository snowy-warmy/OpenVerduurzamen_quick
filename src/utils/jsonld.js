export function extractJsonLdObjects($) {
  const out = [];
  $("script[type='application/ld+json']").each((_, el) => {
    const txt = $(el).text();
    if (!txt) return;
    try {
      const parsed = JSON.parse(txt);
      if (Array.isArray(parsed)) out.push(...parsed);
      else out.push(parsed);
    } catch {
      // ignore
    }
  });
  return out;
}
