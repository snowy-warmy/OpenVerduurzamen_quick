export const OPENAI_SCHEMA_VERSION = "2026-03-04-03";

export function getOpenAICardsSchema() {
  return {
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
          required: [
            "title",
            "subtitle",
            "bullets",
            "cta",
            "label_jump",
            "indicative_cost",
            "indicative_saving",
            "indicative_value_uplift"
          ],
          properties: {
            title: { type: "string", minLength: 3, maxLength: 52 },
            subtitle: { type: "string", minLength: 3, maxLength: 90 },

            // Force compact bullets: always 3 bullets, short text
            bullets: {
              type: "array",
              minItems: 3,
              maxItems: 3,
              items: { type: "string", minLength: 3, maxLength: 40 }
            },

            cta: { type: "string", minLength: 3, maxLength: 32 },

            // Label jump pill like "C→B" (or "A→A" if already high)
            label_jump: { type: "string", minLength: 0, maxLength: 8 },

            // Required, but can be empty ""
            indicative_cost: { type: "string", minLength: 0, maxLength: 32 },         // "€2.500–€6.000"
            indicative_saving: { type: "string", minLength: 0, maxLength: 24 },       // "€20–€45" (p/m implied)
            indicative_value_uplift: { type: "string", minLength: 0, maxLength: 48 }  // "€5k–€15k (~1–3%)"
          }
        }
      },
      disclaimer: { type: "string", minLength: 10, maxLength: 240 }
    }
  };
}

export function getSchemaDebug() {
  const schema = getOpenAICardsSchema();
  const item = schema.properties.cards.items;
  return {
    OPENAI_SCHEMA_VERSION,
    itemRequired: item.required,
    itemPropertyKeys: Object.keys(item.properties)
  };
}
