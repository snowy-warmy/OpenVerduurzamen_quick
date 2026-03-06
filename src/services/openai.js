import { GoogleGenAI } from "@google/genai";
import { getOpenAICardsSchema, OPENAI_SCHEMA_VERSION } from "./openaiSchema.js";

const ai = new GoogleGenAI({}); // pakt GEMINI_API_KEY automatisch op :contentReference[oaicite:5]{index=5}

export async function openaiGenerateCards({ address, bag, energyLabel, listing }) {
  const model =
    process.env.GEMINI_MODEL ||
    "gemini-2.5-flash-lite";

  const schema = getOpenAICardsSchema();

  const prompt = {
    address,
    listing: listing ?? null,
    energyLabel: {
      label: (energyLabel?.label || "").toUpperCase() || null,
      registratiedatum: energyLabel?.registratiedatum ?? null,
      building: energyLabel?.building ?? null
    },
    bag: bag ?? null
  };

  const instructionText =
    "Je maakt 3 verduurzamingskaartjes voor woningzoekers (NL), compact en scanbaar. " +
    "Kies herkenbare hoofdmaatregelen: HR++/triple glas, kierdichting, dak/vloer/spouwisolatie, (hybride) warmtepomp-ready, zonnepanelen (alleen als niet aanwezig). " +
    "Bullets: EXACT 3 bullets, max 5 woorden per bullet. " +
    "indicative_cost: bandbreedte, bv. '€2.500–€6.000'. " +
    "indicative_saving: MAANDELIJKS, bv. '€20–€45'. " +
    "indicative_value_uplift: bv. '€5k–€15k (~1–3%)' of ''. " +
    "label_jump: bv. 'C→B' of 'A→A' of ''. " +
    "Geen harde garanties. " +
    `Schema versie: ${OPENAI_SCHEMA_VERSION}.`;

  const contents =
    instructionText +
    "\n\nContext JSON:\n" +
    JSON.stringify(prompt, null, 2);

  const resp = await ai.models.generateContent({
    model,
    contents,
    config: {
      // Structured output in Gemini: responseMimeType + responseJsonSchema :contentReference[oaicite:6]{index=6}
      responseMimeType: "application/json",
      responseJsonSchema: schema
    }
  });

  let parsed;
  try {
    parsed = JSON.parse(resp.text);
  } catch (e) {
    throw new Error(`Gemini returned non-JSON: ${String(resp.text || "").slice(0, 200)}`);
  }

  return parsed;
}
