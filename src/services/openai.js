import { GoogleGenAI } from "@google/genai";
import { getOpenAICardsSchema, OPENAI_SCHEMA_VERSION } from "./openaiSchema.js";

const ai = new GoogleGenAI({}); // uses GEMINI_API_KEY

export async function openaiGenerateCards({ address, bag, energyLabel, listing }) {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
  const schema = getOpenAICardsSchema();

  // Make sure listing signals are always present & normalized
  const normalizedListing = listing
    ? {
        ...listing,
        hasSolarPanels:
          typeof listing.hasSolarPanels === "boolean" ? listing.hasSolarPanels : null,
        solarPanelsCount:
          Number.isFinite(listing.solarPanelsCount) ? listing.solarPanelsCount : null,
        askingPriceEur:
          Number.isFinite(listing.askingPriceEur) ? listing.askingPriceEur : null,
        existingMeasures: Array.isArray(listing.existingMeasures)
          ? listing.existingMeasures
          : []
      }
    : null;

  const prompt = {
    address,
    listing: normalizedListing,
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
    "Bullets: EXACT 3 bullets, max 5 woorden per bullet (geen lange zinnen). " +
    "indicative_cost: bandbreedte, bv. '€2.500–€6.000'. " +
    "indicative_saving: MAANDELIJKS, bv. '€20–€45' (geen '/jaar'). " +
    "indicative_value_uplift: bv. '€5k–€15k (~1–3%)' of ''. " +
    "label_jump: kort, bv. 'C→B' of 'A→A' of ''. " +
    "BELANGRIJK (harde regel): listing.existingMeasures bevat reeds aanwezige maatregelen. " +
    "Adviseer NOOIT een maatregel die al aanwezig is. " +
    "Specifiek: als existingMeasures 'zonnepanelen' bevat OF listing.hasSolarPanels=true -> GEEN zonnepanelen kaart. " +
    "Als existingMeasures 'warmtepomp' bevat -> geen warmtepomp kaart. " +
    "Als existingMeasures 'hrpp_glas' of 'triple_glas' bevat -> geen glas kaart. " +
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
      responseMimeType: "application/json",
      responseJsonSchema: schema
    }
  });

  let parsed;
  try {
    parsed = JSON.parse(resp.text);
  } catch {
    throw new Error(
      `Gemini returned non-JSON: ${String(resp.text || "").slice(0, 500)}`
    );
  }

  return parsed;
}
