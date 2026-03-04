export const OPENAI_SCHEMA_VERSION = "2026-03-04-01";

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
          // IMPORTANT: strict schema => required moet ALLE keys bevatten die in properties staan
          required: [
            "title",
            "subtitle",
            "bullets",
            "cta",
            "indicative_cost",
            "indicative_saving"
          ],
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

            // Required maar mag leeg
            indicative_cost: { type: "string", minLength: 0, maxLength: 40 },
            indicative_saving: { type: "string", minLength: 0, maxLength: 50 }
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
