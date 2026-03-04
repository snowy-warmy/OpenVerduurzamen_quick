import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Strict schema: we gokken niet, null als we het niet zeker weten
const LISTING_FACTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["askingPriceEur", "solarPanelsCount", "hasSolarPanels", "notes"],
  properties: {
    askingPriceEur: { type: ["integer", "null"] },
    solarPanelsCount: { type: ["integer", "null"] },
    hasSolarPanels: { type: ["boolean", "null"] },
    notes: { type: "string", minLength: 0, maxLength: 240 }
  }
};

/**
 * Best-effort listing facts via OpenAI web_search tool.
 * Let op: als ENABLE_WEBSEARCH=false staat, wordt deze functie in routes/cards.js niet aangeroepen,
 * maar het bestand moet wél bestaan voor de import.
 */
export async function getListingFactsViaOpenAIWebSearch({ url, listingId, addressHint }) {
  const model =
    process.env.OPENAI_MODEL_WEB_SEARCH ||
    process.env.OPENAI_MODEL ||
    "gpt-5-nano-2025-08-07";

  const context = {
    url,
    listingId: listingId || null,
    addressHint: addressHint || null
  };

  const resp = await client.responses.create({
    model,
    tools: [{ type: "web_search" }],
    tool_choice: "auto",
    text: {
      format: {
        type: "json_schema",
        name: "huislijn_listing_facts",
        strict: true,
        schema: LISTING_FACTS_SCHEMA
      }
    },
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              "Gebruik web search om uit HUISLIJN (huislijn.nl) de volgende velden te halen voor deze woninglisting.\n" +
              "- askingPriceEur: vraagprijs in hele euro’s (bv. 395000)\n" +
              "- solarPanelsCount: aantal zonnepanelen als expliciet genoemd\n" +
              "- hasSolarPanels: true/false als expliciet, anders null\n\n" +
              "Regels:\n" +
              "- Niet gokken. Als je het niet zeker weet: null.\n" +
              "- Als er alleen staat 'zonnepanelen aanwezig' zonder aantal: hasSolarPanels=true en solarPanelsCount=null.\n" +
              "- Probeer eerst info van de listing URL zelf; als dat niet kan, gebruik zoekresultaat-snippets binnen huislijn.nl.\n" +
              "- Zet in notes kort waar je het vond (pagina/snippet).\n\n" +
              "Context:\n" +
              JSON.stringify(context, null, 2)
          }
        ]
      }
    ]
  });

  // OpenAI SDK geeft een text output terug in output_text (bij json_schema)
  let parsed;
  try {
    parsed = JSON.parse(resp.output_text);
  } catch {
    throw new Error("web_search returned non-JSON (unexpected)");
  }

  return {
    askingPriceEur: parsed.askingPriceEur ?? null,
    solarPanelsCount: parsed.solarPanelsCount ?? null,
    hasSolarPanels: parsed.hasSolarPanels ?? null,
    notes: parsed.notes ?? ""
  };
}
