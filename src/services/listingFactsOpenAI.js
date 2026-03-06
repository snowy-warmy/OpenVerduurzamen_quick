import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({});

const LISTING_FACTS_SCHEMA = {
  type: "object",
  required: ["askingPriceEur", "solarPanelsCount", "hasSolarPanels", "notes"],
  properties: {
    askingPriceEur: { type: ["integer", "null"] },
    solarPanelsCount: { type: ["integer", "null"] },
    hasSolarPanels: { type: ["boolean", "null"] },
    notes: { type: "string" }
  }
};

export async function getListingFactsViaOpenAIWebSearch({ url, listingId, addressHint }) {
  const enabled = (process.env.ENABLE_WEBSEARCH || "true").toLowerCase() === "true";
  if (!enabled) {
    return { askingPriceEur: null, solarPanelsCount: null, hasSolarPanels: null, notes: "websearch disabled" };
  }

  const model =
    process.env.GEMINI_MODEL_SEARCH ||
    process.env.GEMINI_MODEL ||
    "gemini-2.5-flash-lite";

  const prompt = {
    url,
    listingId: listingId || null,
    addressHint: addressHint || null
  };

  const resp = await ai.models.generateContent({
    model,
    contents:
      "Haal ALLEEN uit Huislijn (liefst uit de URL zelf) de velden:\n" +
      "- askingPriceEur (hele euro’s)\n" +
      "- hasSolarPanels (true/false/null)\n" +
      "- solarPanelsCount (integer/null)\n" +
      "Niet gokken; bij twijfel null.\n" +
      "Gebruik urlContext om de pagina te lezen en googleSearch als fallback.\n\n" +
      "Context:\n" + JSON.stringify(prompt, null, 2),
    config: {
      // Google Search grounding + URL context tools :contentReference[oaicite:7]{index=7}
      tools: [{ googleSearch: {} }, { urlContext: {} }],
      responseMimeType: "application/json",
      responseJsonSchema: LISTING_FACTS_SCHEMA
    }
  });

  let parsed;
  try {
    parsed = JSON.parse(resp.text);
  } catch {
    throw new Error(`Gemini listingFacts returned non-JSON: ${String(resp.text || "").slice(0, 200)}`);
  }

  return {
    askingPriceEur: parsed.askingPriceEur ?? null,
    solarPanelsCount: parsed.solarPanelsCount ?? null,
    hasSolarPanels: parsed.hasSolarPanels ?? null,
    notes: parsed.notes ?? ""
  };
}
