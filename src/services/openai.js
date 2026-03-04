import OpenAI from "openai";
import { getOpenAICardsSchema, OPENAI_SCHEMA_VERSION } from "./openaiSchema.js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function openaiGenerateCards({ address, bag, energyLabel }) {
  const model = process.env.OPENAI_MODEL || "gpt-5.2";
  const schema = getOpenAICardsSchema();

  const prompt = {
    address,
    energyLabel: {
      label: energyLabel?.label ?? null,
      registratiedatum: energyLabel?.registratiedatum ?? null
    },
    bag: bag ?? null
  };

  const resp = await client.responses.create({
    model,
    instructions:
      "Je bent een Nederlandse verduurzamings-assistent voor woningzoekers. " +
      "Maak precies 3 compacte kaartjes met concrete, realistische verduurzamingsacties. " +
      "Houd het vriendelijk en praktisch. " +
      "Als energielabel ontbreekt: benoem dat en geef generieke maar nuttige tips. " +
      "Vul indicative_cost en indicative_saving altijd: als je het niet weet, zet een lege string. " +
      `Schema versie: ${OPENAI_SCHEMA_VERSION}.`,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              "Genereer 3 verduurzamingskaartjes voor deze woningcontext (JSON volgens schema). Context:\n" +
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
