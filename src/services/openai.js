import OpenAI from "openai";
import { getOpenAICardsSchema, OPENAI_SCHEMA_VERSION } from "./openaiSchema.js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function openaiGenerateCards({ address, bag, energyLabel, listing }) {
  const model = process.env.OPENAI_MODEL || "gpt-5.2";
  const schema = getOpenAICardsSchema();

  const prompt = {
    address,
    listing: listing ?? null,
    energyLabel: {
      label: energyLabel?.label ?? null,
      registratiedatum: energyLabel?.registratiedatum ?? null,
      building: energyLabel?.building ?? null
    },
    bag: bag ?? null
  };

  const resp = await client.responses.create({
    model,
    instructions:
      "Je maakt 3 verduurzamingskaartjes voor woningzoekers (NL). " +
      "Doel: super compact, herkenbare hoofdmaatregelen (bijv. HR++ glas, warmtepomp, zonnepanelen, kierdichting, dak/vloer/spouwisolatie). " +
      "Gebruik context: energielabel + gebouwtype + bouwjaar + m² + zonnepanelen + vraagprijs (als beschikbaar). " +
      "Als zonnepanelen al aanwezig zijn: géén kaart 'zonnepanelen plaatsen'. " +
      "Tekstregels kort houden. Bullets: maximaal 2–3 korte punten. " +
      "BELANGRIJK FORMATS:\n" +
      "- indicative_cost: altijd een investering als bandbreedte, bv. '€3.000–€6.000'\n" +
      "- indicative_saving: altijd MAANDELIJKSE besparing, zonder '/jaar', bv. '€25–€60'\n" +
      "- indicative_value_uplift: conservatieve waardestijging, bv. '€5k–€15k (~1–3%)' of leeg als onbekend\n" +
      "Noem de vraagprijs niet letterlijk in de tekst (alleen gebruiken voor uplift). " +
      "Geen harde garanties, wel realistische bandbreedtes. " +
      `Schema versie: ${OPENAI_SCHEMA_VERSION}.`,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              "Genereer 3 kaartjes (JSON volgens schema). Context:\n" +
              JSON.stringify(prompt, null, 2)
          }
        ]
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "verduurzaming_cards",
        strict: true,
        schema
      }
    }
  });

  const jsonText = resp.output_text;

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("OpenAI did not return valid JSON (unexpected).");
  }

  return parsed;
}
