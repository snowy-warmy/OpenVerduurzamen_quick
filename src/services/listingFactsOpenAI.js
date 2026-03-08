import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({});

const MEASURES_ENUM = [
  "zonnepanelen",
  "warmtepomp",
  "hybride_warmtepomp",
  "hrpp_glas",
  "triple_glas",
  "spouwisolatie",
  "dakisolatie",
  "vloerisolatie",
  "bodemisolatie",
  "vloerverwarming"
];

const LISTING_FACTS_SCHEMA = {
  type: "object",
  required: ["askingPriceEur", "solarPanelsCount", "hasSolarPanels", "existingMeasures", "notes"],
  additionalProperties: false,
  properties: {
    askingPriceEur: { type: ["integer", "null"] },
    solarPanelsCount: { type: ["integer", "null"] },
    hasSolarPanels: { type: ["boolean", "null"] },
    existingMeasures: {
      type: "array",
      items: { type: "string", enum: MEASURES_ENUM },
      maxItems: 10
    },
    notes: { type: "string" }
  }
};

export async function getListingFactsViaOpenAIWebSearch({ url, listingId, addressHint }) {
  const enabled = (process.env.ENABLE_WEBSEARCH || "true").toLowerCase() === "true";
  if (!enabled) {
    return {
      askingPriceEur: null,
      solarPanelsCount: null,
      hasSolarPanels: null,
      existingMeasures: [],
      notes: "websearch disabled"
    };
  }

  const model =
    process.env.GEMINI_MODEL_SEARCH ||
    process.env.GEMINI_MODEL ||
    "gemini-2.5-flash-lite";

  const context = {
    url,
    listingId: listingId || null,
    addressHint: addressHint || null
  };

  const resp = await ai.models.generateContent({
    model,
    contents:
      "Lees de Huislijn listing en haal alleen feiten eruit.\n\n" +
      "Geef JSON met:\n" +
      "- askingPriceEur (hele euro’s) indien duidelijk\n" +
      "- hasSolarPanels (true/false/null)\n" +
      "- solarPanelsCount (integer/null)\n" +
      "- existingMeasures: lijst van reeds aanwezige verduurzamingsmaatregelen (uit enum)\n\n" +
      "Regels:\n" +
      "- NIET gokken. Bij twijfel -> null / leeg.\n" +
      "- Als er 'zonnepanelen' staat zonder aantal: hasSolarPanels=true, solarPanelsCount=null.\n" +
      "- Zet in existingMeasures 'zonnepanelen' als zonnepanelen genoemd worden.\n" +
      "- Gebruik urlContext om de pagina te lezen; als dat niet lukt, gebruik googleSearch snippets.\n\n" +
      "Context:\n" + JSON.stringify(context, null, 2),
    config: {
      tools: [{ urlContext: {} }, { googleSearch: {} }],
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
    existingMeasures: Array.isArray(parsed.existingMeasures) ? parsed.existingMeasures : [],
    notes: parsed.notes ?? ""
  };
}
