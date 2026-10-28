import type Anthropic from "@anthropic-ai/sdk";
import type { AiClient } from "@/lib/ai/claude";

// Local screenshots only: lib/ai/claude.ts loads this under `next dev` with LARIA_AI_FAKE=1, never in a production
// build. It calls nothing and answers the two helpers' requests with fixed, plausible JSON in the shape the API returns.

function message(model: string, answer: unknown): Anthropic.Beta.BetaMessage {
  return {
    id: "msg_fake_local",
    type: "message",
    role: "assistant",
    model,
    container: null,
    context_management: null,
    diagnostics: null,
    content: [{ type: "text", text: JSON.stringify(answer), citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    usage: {
      cache_creation: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      fallback_credit: null,
      inference_geo: null,
      input_tokens: 0,
      iterations: null,
      output_tokens: 0,
      output_tokens_details: null,
      server_tool_use: null,
      service_tier: null,
      speed: null,
    },
  };
}

function questionOf(params: Anthropic.Beta.MessageCreateParamsNonStreaming) {
  const content = params.messages[0]?.content;
  if (typeof content === "string") return content;
  return (content ?? []).map((block) => (block.type === "text" ? block.text : "")).join(" ");
}

const CATEGORY_WORDS: [RegExp, string][] = [
  [/guitarra/, "guitars"], [/\bbajos\b|\bbajo eléctrico/, "basses"], [/teclado|piano/, "keyboards"], [/pedal/, "pedals"],
  [/amplificador|ampli\b/, "amplifiers"], [/micr[oó]fono/, "microphones"], [/bater[ií]a|platillo/, "percussion"],
];

function storeAnswer(question: string) {
  const text = question.toLowerCase();
  const inventory = { search: "", stock: "all", publication: "", category: "", price: "", sort: "updated" };
  const statistics = { period: "30", focus: "" };
  const gaps: string[] = [];
  for (const [pattern, category] of CATEGORY_WORDS) if (pattern.test(text)) { inventory.category = category; break; }
  const brand = /\b(fender|boss|yamaha|gibson|ibanez|roland|shure|marshall)\b/.exec(text)?.[1];
  if (brand) inventory.search = brand[0].toUpperCase() + brand.slice(1);
  if (/vend[ií]|m[aá]s vendid/.test(text)) {
    if (/mes|semana|ayer|hoy/.test(text)) gaps.push("dates");
    return { destination: "reorder", inventory: { ...inventory, search: "", category: "" }, statistics, gaps: ["sales", ...gaps] };
  }
  if (/visto|vistas|consult|contacto/.test(text)) {
    if (/semana/.test(text)) statistics.period = "7";
    if (/\bmes\b/.test(text)) gaps.push("dates");
    statistics.focus = /consult|contacto/.test(text) ? "contacts" : "views";
    return { destination: "statistics", inventory: { ...inventory, search: "", category: "" }, statistics, gaps };
  }
  if (/agotad|sin stock/.test(text)) inventory.stock = "out";
  else if (/poco stock|stock bajo|por acabarse|menos de \d/.test(text)) {
    inventory.stock = "low";
    inventory.sort = "available_asc";
    if (/\d/.test(text)) gaps.push("quantity");
  }
  if (/sin precio/.test(text)) inventory.price = "none";
  if (/sin publicar|sin publicaci[oó]n/.test(text)) inventory.publication = "none";
  if (/m[aá]s caro|m[aá]s de \d+ soles/.test(text)) {
    inventory.sort = "price_desc";
    if (/\d/.test(text)) gaps.push("price_range");
  }
  const asked = inventory.stock !== "all" || inventory.category || inventory.search || inventory.price || inventory.publication || inventory.sort !== "updated";
  return { destination: asked ? "inventory" : "none", inventory, statistics, gaps };
}

const LISTING_ANSWER = {
  recognized: true,
  category: "pedals",
  instrument_type: "pedals",
  brand: "Boss",
  model: "DS-1 Distortion",
  title: "Pedal Boss DS-1 Distortion naranja",
  details: ["Carcasa metálica naranja", "Perillas Tone, Level y Dist", "Entrada y salida de 1/4\"", "Desgaste leve en la pintura del borde"],
  description: "Pedal de distorsión Boss DS-1 con su carcasa naranja de metal y las tres perillas de fábrica. Las fotos muestran el frente, los costados con las entradas y la base con su etiqueta.",
  confidence: "high",
};

export const fakeAiClient: AiClient = {
  beta: {
    messages: {
      async create(params) {
        const schema = params.output_config?.format?.schema as { properties?: Record<string, unknown> } | undefined;
        const answer = schema?.properties && "destination" in schema.properties ? storeAnswer(questionOf(params)) : LISTING_ANSWER;
        return message(params.model, answer);
      },
    },
  },
};
