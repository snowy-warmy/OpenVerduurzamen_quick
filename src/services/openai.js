import OpenAI from "openai";
import { getOpenAICardsSchema, OPENAI_SCHEMA_VERSION } from "./openaiSchema.js";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function openaiGenerateCards({ address, bag, energyLabel, listing }) {
  const model = process.env.OPENAI_MODEL || "gpt-5.2";
  const schema = getOpenAICardsSchema();

  const currentLabel = (energyLabel?.label || "").toUpperCase() || null;

  const prompt = {
    address,
    listing: listing ?? null,
    energyLabel: {
      label: currentLabel,
      registratiedatum: energyLabel?.registratiedatum ?? null,
      building: energyLabel?.building ?? null
    },
    bag: bag ?? null
  };

  const resp = await client.responses.create({
    model,
    instructions:
      "Je maakt 3 verduurzamingskaartjes voor woningzoekers (NL), extreem compact en scanbaar. " +
      "Kies herkenbare hoofdproducten: HR++/triple glas, (hybride) warmtepomp-ready, kierdichting, dak/vloer/spouwisolatie, zonnepanelen (alleen als niet aanwezig). " +
      "Als zonnepanelen al aanwezig zijn: géén 'zonnepanelen plaatsen'-kaart. " +
      "Bullets moeten super kort: EXACT 3 bullets, max 5 woorden per bullet, geen lange zinnen. " +
      "Voorbeelden bullets: 'Kieren dichten bij kozijnen', 'Radiatoren geschikt maken', 'Vloer warmer, minder tocht'. " +
      "Vul per kaart deze velden:\n" +
      "- label_jump: zoals 'C→B' (conservatief). Als label onbekend: leeg.\n" +
      "- indicative_cost: investering bandbreedte, bv. '€2.500–€6.000'\n" +
      "- indicative_saving: MAANDELIJKSE besparing (p/m implied), bv. '€20–€45'\n" +
      "- indicative_value_uplift: conservatieve waardestijging, bv. '€5k–€15k (~1–3%)' of ''\n" +
      "Noem de vraagprijs niet letterlijk in tekst; gebruik hem alleen om uplift te schatten. " +
      "Geen harde garanties. " +
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

  let parsed;
  try {
    parsed = JSON.parse(resp.output_text);
  } catch {
    throw new Error("OpenAI did not return valid JSON (unexpected).");
  }

  return parsed;
}
