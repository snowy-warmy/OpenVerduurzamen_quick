import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function openaiGenerateCards({ address, bag, energyLabel }) {
  const model = process.env.OPENAI_MODEL || "gpt-5.2";

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["cards", "disclaimer"],
    properties: {
      cards: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "subtitle", "bullets", "cta"],
          properties: {
            title: { type: "string", minLength: 3, maxLength: 60 },
            subtitle: { type: "string", minLength: 3, maxLength: 120 },
            bullets: {
              type: "array",
              minItems: 3,
              maxItems: 4,
              items: { type: "string", minLength: 3, maxLength: 120 }
            },
            cta: { type: "string", minLength: 3, maxLength: 40 },
            indicative_cost: { type: "string", minLength: 0, maxLength: 40 },
            indicative_saving: { type: "string", minLength: 0, maxLength: 50 }
          }
        }
      },
      disclaimer: { type: "string", minLength: 10, maxLength: 240 }
    }
  };

  const prompt = {
    address,
    energyLabel: {
      label: energyLabel?.label ?? null,
      registratiedatum: energyLabel?.registratiedatum ?? null
    },
    // Keep BAG details optional (can be large); still useful context for the model:
    bag: bag ?? null
  };

  const resp = await client.responses.create({
    model,
    instructions:
      "Je bent een Nederlandse verduurzamings-assistent voor woningzoekers. " +
      "Maak precies 3 compacte kaartjes met concrete, realistische verduurzamingsacties. " +
      "Houd het vriendelijk en praktisch; géén medische/legale claims. " +
      "Als energielabel ontbreekt: wees expliciet en geef generieke maar nuttige tips. " +
      "Gebruik €-indicaties als bandbreedte en benoem dat het afhangt van woningtype/isolatie.",
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
