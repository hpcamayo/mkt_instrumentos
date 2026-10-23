// big-11: public questions on a listing (docs/ux-effortless/listing.md). Shared by the API route, the
// listing page's "Preguntas" section and the tests: limits, the contact-detail check, the RPC output parser and the
// error mapping. The database (supabase/migrations/20261102130000_ux_listing_questions.sql) has the final word.

export const QUESTION_MIN = 5;
export const QUESTION_MAX = 300;
export const ANSWER_MIN = 2;
export const ANSWER_MAX = 600;
export const MODERATION_REASON_MIN = 3;
export const MODERATION_REASON_MAX = 500;

export type ListingQuestion = {
  id: string;
  body: string;
  askerName: string;
  createdAt: string;
  answer: string | null;
  answeredAt: string | null;
  hidden: boolean;
  hiddenReason: string | null;
  isMine: boolean;
};

export type ListingQuestionsState = {
  signedIn: boolean;
  canAsk: boolean;
  canAnswer: boolean;
  isAdmin: boolean;
  accepting: boolean;
  questions: ListingQuestion[];
};

export type ListingQuestionAction = "ask" | "answer" | "hide" | "restore";

export const EMPTY_QUESTIONS_STATE: ListingQuestionsState = {
  signedIn: false,
  canAsk: false,
  canAnswer: false,
  isAdmin: false,
  accepting: false,
  questions: [],
};

export const CONTACT_DETAILS_MESSAGE =
  "No escribas números de teléfono, enlaces ni correos. Las preguntas y respuestas son públicas; para hablar con quien vende, usa el botón de contacto.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isQuestionId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

// Whitespace folded to single spaces and trimmed, as the database stores it.
export function normalizeQuestionText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

// The PAY-1 filter as laria_private.text_has_contact_details applies it: a run of 6+ digits once spaces, dots and
// dashes are ignored, a link, or an e-mail address. Keep it in step with the SQL.
export function hasContactDetails(value: string) {
  return (
    /[0-9]{6,}/.test(value.replace(/[\s.-]/g, "")) ||
    /(https?:\/\/|www\.|\.(com|pe|net|org|io|me|link|ly|app)(\/|\s|$))/i.test(value) ||
    /[^\s@]+@[^\s@]+\.[^\s@]+/.test(value)
  );
}

// The instant check before sending: null when the text can go, otherwise the message to show.
export function questionTextError(value: string, kind: "question" | "answer") {
  const text = normalizeQuestionText(value);
  const [min, max] = kind === "question" ? [QUESTION_MIN, QUESTION_MAX] : [ANSWER_MIN, ANSWER_MAX];
  if (text.length < min || text.length > max) {
    return kind === "question"
      ? `La pregunta debe tener entre ${QUESTION_MIN} y ${QUESTION_MAX} caracteres.`
      : `La respuesta debe tener entre ${ANSWER_MIN} y ${ANSWER_MAX} caracteres.`;
  }
  if (hasContactDetails(text)) return CONTACT_DETAILS_MESSAGE;
  return null;
}

export function moderationReasonError(value: string) {
  const length = value.trim().length;
  return length < MODERATION_REASON_MIN || length > MODERATION_REASON_MAX
    ? `Escribe un motivo de entre ${MODERATION_REASON_MIN} y ${MODERATION_REASON_MAX} caracteres.`
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const text = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : null);

// get_listing_questions → the section's state. Rows that do not parse are left out instead of breaking the list.
export function parseListingQuestions(value: unknown): ListingQuestionsState {
  if (!isRecord(value)) return EMPTY_QUESTIONS_STATE;
  const rows = Array.isArray(value.questions) ? value.questions : [];
  const questions = rows.flatMap((row): ListingQuestion[] => {
    if (!isRecord(row) || !isQuestionId(row.id) || !text(row.body) || !text(row.created_at)) return [];
    return [{
      id: row.id,
      body: row.body as string,
      askerName: text(row.asker_name) ?? "Usuario de Laria",
      createdAt: row.created_at as string,
      answer: text(row.answer),
      answeredAt: text(row.answered_at),
      hidden: row.status === "hidden",
      hiddenReason: text(row.hidden_reason),
      isMine: row.is_mine === true,
    }];
  });
  return {
    signedIn: value.signed_in === true,
    canAsk: value.can_ask === true,
    canAnswer: value.can_answer === true,
    isAdmin: value.is_admin === true,
    accepting: value.accepting === true,
    questions,
  };
}

const FALLBACK: Record<ListingQuestionAction, string> = {
  ask: "No pudimos publicar tu pregunta. Intenta nuevamente.",
  answer: "No pudimos publicar tu respuesta. Intenta nuevamente.",
  hide: "No pudimos ocultar la pregunta. Intenta nuevamente.",
  restore: "No pudimos mostrar la pregunta. Intenta nuevamente.",
};

// 'QUESTION_CODE: mensaje' from the database → the message, as written there. Anything else (a network or permission
// error) becomes a plain retry message; internal text never reaches the page.
export function questionErrorMessage(message: string | null | undefined, action: ListingQuestionAction) {
  const match = /QUESTION_[A-Z_]+: ([\s\S]+)$/.exec(message ?? "");
  return match ? match[1].trim() : FALLBACK[action];
}

// The code alone ("QUESTION_PENDING_LIMIT"), for status codes and tests.
export function questionErrorCode(message: string | null | undefined) {
  return /\b(QUESTION_[A-Z_]+):/.exec(message ?? "")?.[1] ?? null;
}

export function questionErrorStatus(code: string | null) {
  if (code === "QUESTION_AUTH_REQUIRED") return 401;
  if (code === "QUESTION_ADMIN_REQUIRED" || code === "QUESTION_ANSWER_FORBIDDEN" || code === "QUESTION_OWN_LISTING") return 403;
  if (code === "QUESTION_NOT_FOUND") return 404;
  if (code === "QUESTION_PENDING_LIMIT" || code === "QUESTION_DAILY_LIMIT") return 429;
  if (code === "QUESTION_LISTING_UNAVAILABLE" || code === "QUESTION_ALREADY_ANSWERED" || code === "QUESTION_STATUS_UNCHANGED") return 409;
  if (code) return 400;
  return 503;
}

export function questionCountLabel(count: number) {
  return `${count} ${count === 1 ? "pregunta" : "preguntas"}`;
}
