"use client";

import Link from "next/link";
import { type FormEvent, type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { ContentReport } from "@/components/content-report";
import { useMarketplaceAccount } from "@/components/marketplace-account-provider";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { StatusTag } from "@/components/ui/tag";
import { Textarea } from "@/components/ui/textarea";
import { formatMonthYear } from "@/lib/listing-page";
import {
  ANSWER_MAX,
  MODERATION_REASON_MAX,
  QUESTION_MAX,
  moderationReasonError,
  parseListingQuestions,
  questionCountLabel,
  questionTextError,
  type ListingQuestion,
  type ListingQuestionAction,
  type ListingQuestionsState,
} from "@/lib/listing-questions";

export const QUESTIONS_COPY = {
  empty: "Aún no hay preguntas. Pregunta lo que necesites saber; la respuesta queda para todos.",
  publicNote: "Tu pregunta y su respuesta son públicas. No incluyas números de teléfono, enlaces ni correos.",
  signIn: "Ingresa para preguntar",
  sold: "Esta publicación se vendió. Las preguntas quedan como referencia y ya no reciben respuestas.",
  closed: "Esta publicación no recibe preguntas por ahora.",
  seller: "Responde desde aquí: tu respuesta queda visible para todas las personas que vean la publicación.",
  unanswered: "Sin respuesta todavía",
  loadFailed: "No pudimos cargar las preguntas.",
} as const;

type Feedback = { message: string; failed: boolean; at: string } | null;
type Post = (action: ListingQuestionAction, fields: Record<string, string>, success: string, at: string) => Promise<boolean>;

// "Preguntas" on the listing page (big-11, docs/ux-effortless/listing.md). Public questions and the seller's
// one answer. The section renders the same "Cargando…" state on the server and on the first client render; it asks
// for the Q&A only after the account check settles, so the flags (can ask, can answer, admin) are the visitor's own
// and nothing mismatches on hydration.
// `initialState` is optional: a page that already read get_listing_questions on the server (or a test) can pass it;
// the section still refreshes it for the visitor once the account check settles.
export function ListingQuestions({
  listingId,
  sold,
  loginHref,
  initialState = null,
}: {
  listingId: string;
  sold: boolean;
  loginHref: string;
  initialState?: ListingQuestionsState | null;
}) {
  const account = useMarketplaceAccount();
  const [state, setState] = useState<ListingQuestionsState | null>(initialState);
  const [loadFailed, setLoadFailed] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const headingId = useId();

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoadFailed(false);
    try {
      const response = await fetch(`/api/listing-questions?listingId=${encodeURIComponent(listingId)}`, { cache: "no-store", signal });
      if (!response.ok) throw new Error("load");
      setState(parseListingQuestions(await response.json()));
    } catch (error) {
      if ((error as Error).name !== "AbortError") setLoadFailed(true);
    }
  }, [listingId]);

  useEffect(() => {
    if (!account.ready) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [account.ready, account.authenticated, load]);

  useEffect(() => {
    if (feedback) feedbackRef.current?.focus();
  }, [feedback]);

  const post: Post = async (action, fields, success, at) => {
    try {
      const response = await fetch("/api/listing-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, listingId, ...fields }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setFeedback({ message: result?.message ?? "No pudimos guardar el cambio. Intenta nuevamente.", failed: true, at });
        return false;
      }
      if (result?.state) setState(parseListingQuestions(result.state));
      else void load();
      setFeedback({ message: success, failed: false, at });
      return true;
    } catch {
      setFeedback({ message: "No pudimos conectar. Revisa tu conexión e intenta nuevamente.", failed: true, at });
      return false;
    }
  };

  const feedbackFor = (at: string) =>
    feedback?.at === at ? (
      <p ref={feedbackRef} tabIndex={-1} role={feedback.failed ? "alert" : "status"} className={feedback.failed ? "t-ui font-semibold text-danger" : "t-ui font-semibold text-ink"}>
        {feedback.message}
      </p>
    ) : null;

  // A sold listing with no questions has nothing to show: the section is left out.
  if (state && sold && state.questions.length === 0) return null;

  const questions = state?.questions ?? [];
  const accepting = Boolean(state?.accepting) && !sold;
  const signedOut = account.ready && !account.authenticated;

  return (
    <section id="preguntas" aria-labelledby={headingId} className="scroll-mt-4">
      <h2 id={headingId} className="t-section text-ink">Preguntas</h2>
      {state && questions.length > 0 ? <p className="mt-1 t-meta">{questionCountLabel(questions.filter((question) => !question.hidden).length)}</p> : null}

      {!state && !loadFailed ? <p role="status" className="mt-3 t-meta">Cargando preguntas…</p> : null}
      {loadFailed ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p role="alert" className="t-ui text-ink-2">{QUESTIONS_COPY.loadFailed}</p>
          <button type="button" onClick={() => void load()} className={buttonClasses({ variant: "quiet" })}>Reintentar</button>
        </div>
      ) : null}

      {state ? (
        <>
          {sold ? <p className="mt-3 t-meta">{QUESTIONS_COPY.sold}</p> : null}
          {!sold && !accepting && questions.length > 0 ? <p className="mt-3 t-meta">{QUESTIONS_COPY.closed}</p> : null}
          {accepting && state.canAnswer ? <p className="mt-3 t-ui text-ink-2">{QUESTIONS_COPY.seller}</p> : null}

          {accepting && state.canAsk ? <AskForm post={post} feedback={feedbackFor("ask")} /> : null}
          {accepting && signedOut ? (
            <p className="mt-3 t-ui">
              <Link href={loginHref} className="link font-semibold">{QUESTIONS_COPY.signIn}</Link>
              <span className="text-ink-2"> · La respuesta queda visible para todos.</span>
            </p>
          ) : null}

          {questions.length === 0 ? (
            <p className="mt-4 t-ui text-ink-2">{QUESTIONS_COPY.empty}</p>
          ) : (
            <ol className="mt-4 grid gap-3">
              {questions.map((question) => (
                <QuestionItem
                  key={question.id}
                  question={question}
                  canAnswer={accepting && state.canAnswer}
                  isAdmin={state.isAdmin}
                  signedIn={account.ready && account.authenticated}
                  post={post}
                  feedback={feedbackFor(question.id)}
                />
              ))}
            </ol>
          )}
        </>
      ) : null}
    </section>
  );
}

function AskForm({ post, feedback }: { post: Post; feedback: ReactNode }) {
  const fieldId = useId();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The counter in Textarea counts from its own state: a new key starts it at zero after a question goes out.
  const [round, setRound] = useState(0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const invalid = questionTextError(text, "question");
    setError(invalid);
    if (invalid) return;
    setBusy(true);
    const sent = await post("ask", { body: text }, "Publicamos tu pregunta. Te avisaremos cuando la respondan.", "ask");
    setBusy(false);
    if (sent) {
      setText("");
      setRound((value) => value + 1);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-3 grid max-w-2xl gap-3">
      <Field id={`${fieldId}-pregunta`} label="Haz una pregunta" hint={QUESTIONS_COPY.publicNote} error={error}>
        <Textarea
          key={round}
          name="body"
          rows={3}
          maxLength={QUESTION_MAX}
          value={text}
          placeholder="¿Incluye estuche? ¿Tiene algún detalle que no se ve en las fotos?"
          onChange={(event) => {
            setText(event.target.value);
            if (error) setError(null);
          }}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" loading={busy} loadingLabel="Enviando…">Enviar pregunta</Button>
      </div>
      {feedback}
    </form>
  );
}

function QuestionItem({
  question,
  canAnswer,
  isAdmin,
  signedIn,
  post,
  feedback,
}: {
  question: ListingQuestion;
  canAnswer: boolean;
  isAdmin: boolean;
  signedIn: boolean;
  post: Post;
  feedback: ReactNode;
}) {
  const [panel, setPanel] = useState<"answer" | "moderate" | null>(null);
  const asked = formatMonthYear(question.createdAt);
  const answered = formatMonthYear(question.answeredAt);
  const unanswered = !question.answer;

  return (
    <li className="rounded-panel border border-subtle p-4">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 t-meta">
        <span className="font-semibold text-ink">{question.isMine ? "Tu pregunta" : `Pregunta de ${question.askerName}`}</span>
        {asked ? <span>{asked}</span> : null}
        {question.hidden ? <StatusTag domain="review" status="hidden" /> : null}
      </p>
      <p className="mt-1 whitespace-pre-line break-words t-body text-ink">{question.body}</p>
      {question.hidden && question.hiddenReason ? <p className="mt-1 t-meta">Motivo: {question.hiddenReason}</p> : null}

      {question.answer ? (
        <div className="mt-3 border-l-2 border-accent pl-3">
          <p className="t-meta"><span className="font-semibold text-ink">Respuesta de quien vende</span>{answered ? ` · ${answered}` : ""}</p>
          <p className="mt-1 whitespace-pre-line break-words t-ui text-ink">{question.answer}</p>
        </div>
      ) : (
        <p className="mt-2 t-meta">{QUESTIONS_COPY.unanswered}</p>
      )}

      {panel === "answer" ? (
        <AnswerForm question={question} post={post} onClose={() => setPanel(null)} />
      ) : panel === "moderate" ? (
        <ModerationForm question={question} post={post} onClose={() => setPanel(null)} />
      ) : null}
      <div className="mt-3 grid gap-2">
        {feedback}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {canAnswer && unanswered && !question.hidden && panel !== "answer" ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => setPanel("answer")}>Responder</Button>
          ) : null}
          {isAdmin && panel !== "moderate" ? (
            <button type="button" onClick={() => setPanel("moderate")} className={buttonClasses({ variant: "quiet", className: "t-meta" })}>
              {question.hidden ? "Mostrar" : "Ocultar"}
            </button>
          ) : null}
          {/* Signed out, the report link would repeat a sign-in prompt under every question; it shows once signed in. */}
          {signedIn && !question.isMine && !question.hidden ? (
            <ContentReport targetType="question" targetId={question.id} label="Reportar pregunta" />
          ) : null}
        </div>
      </div>
    </li>
  );
}

function AnswerForm({ question, post, onClose }: { question: ListingQuestion; post: Post; onClose: () => void }) {
  const fieldId = useId();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const invalid = questionTextError(text, "answer");
    setError(invalid);
    if (invalid) return;
    setBusy(true);
    const sent = await post("answer", { questionId: question.id, answer: text }, "Publicamos tu respuesta. Quien preguntó recibirá un aviso.", question.id);
    setBusy(false);
    if (sent) onClose();
  }

  return (
    <form onSubmit={submit} noValidate className="mt-3 grid max-w-2xl gap-3 rounded-panel bg-canvas p-4">
      <Field id={`${fieldId}-respuesta`} label="Tu respuesta" hint="Se publica una sola vez y no se puede editar. No incluyas números de teléfono, enlaces ni correos." error={error}>
        <Textarea
          name="answer"
          rows={3}
          maxLength={ANSWER_MAX}
          value={text}
          autoFocus
          onChange={(event) => {
            setText(event.target.value);
            if (error) setError(null);
          }}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="secondary" loading={busy} loadingLabel="Enviando…">Enviar respuesta</Button>
        <button type="button" onClick={onClose} className={buttonClasses({ variant: "quiet" })}>Cancelar</button>
      </div>
    </form>
  );
}

function ModerationForm({ question, post, onClose }: { question: ListingQuestion; post: Post; onClose: () => void }) {
  const fieldId = useId();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hide = !question.hidden;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const invalid = moderationReasonError(reason);
    setError(invalid);
    if (invalid) return;
    setBusy(true);
    const sent = await post(
      hide ? "hide" : "restore",
      { questionId: question.id, reason },
      hide ? "Ocultamos la pregunta. Ya no se muestra en la publicación." : "La pregunta vuelve a mostrarse en la publicación.",
      question.id,
    );
    setBusy(false);
    if (sent) onClose();
  }

  return (
    <form onSubmit={submit} noValidate className="mt-3 grid max-w-lg gap-3 rounded-panel bg-canvas p-4">
      <Field id={`${fieldId}-motivo`} label={hide ? "Motivo para ocultar" : "Motivo para mostrar"} hint="Queda en el historial de moderación." error={error}>
        <Input
          name="reason"
          value={reason}
          maxLength={MODERATION_REASON_MAX}
          autoFocus
          onChange={(event) => {
            setReason(event.target.value);
            if (error) setError(null);
          }}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant={hide ? "danger" : "secondary"} loading={busy} loadingLabel="Guardando…">
          {hide ? "Ocultar pregunta" : "Mostrar pregunta"}
        </Button>
        <button type="button" onClick={onClose} className={buttonClasses({ variant: "quiet" })}>Cancelar</button>
      </div>
    </form>
  );
}
