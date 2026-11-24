"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircleIcon, CheckIcon, CopyIcon, HeartHandshakeIcon, ExternalLinkIcon, InfoIcon, MailIcon, MessageCircleQuestionIcon, PhoneIcon, RotateCwIcon, SearchIcon, SendIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button, buttonVariants } from "@/components/ui/button";
import { Message, MessageContent } from "@/components/ui/message";
import { Spinner } from "@/components/ui/spinner";
import type { ChatResponse, Stage } from "@/lib/rag";
import { cn } from "@/lib/utils";
import { CHIPS_START_MS, ENTER_STEP_MS, enterDelay } from "@/lib/enter";
import { plainTextForCopy } from "@/lib/copy-text";
import type { HelpOffice } from "@/lib/help-office";
import type { BeachSyncSearch } from "@/lib/club-search";
import { AnswerText } from "./answer-text";
import { SourceChips } from "./source-chips";

export type AssistantTurn = {
  id: string;
  role: "assistant";
  question: string; // the question this turn answers (used for Retry and "Request this topic")
} & (
  | { state: "loading"; stages?: Stage[] } // progress steps received so far (Entry 29)
  | { state: "done"; response: ChatResponse }
  | { state: "error"; error: { code: string; message: string } }
);

/**
 * Pull the options out of a clarifying question so they can be buttons.
 * "Do you mean admission, scholarships, graduation, financial aid, or something else?"
 * -> ["admission", "scholarships", "graduation", "financial aid"]
 */
export function clarifyOptions(question: string): string[] {
  const match = question.match(/\b(?:mean|about|asking about|looking for)\s+(.+?)\?/i);
  if (!match) return [];
  const options = match[1]
    .split(/,\s*(?:or\s+)?|\s+or\s+/i)
    .map((o) => o.trim().replace(/^(the|a|an)\s+/i, "").replace(/[.]$/, ""))
    .filter((o) => o && !/^something else$|^other$/i.test(o) && o.length <= 40);
  return options.length >= 2 ? options : [];
}

/** The "C" mark that stands in for an avatar next to assistant messages. */
// Text inside a flex row (next to an icon, or inside a button). A flex item normally can't get
// narrower than its longest word, so a long URL or email would stick out of the bubble and be cut
// off. min-w-0 lets it shrink; overflow-wrap: break-word then breaks ONLY a word that can't fit on
// a line by itself. Normal words always wrap whole (never "he / llo").
const WRAP = "min-w-0 wrap-break-word";

// The assistant's avatar (Entry 30). Long Beach State's sharks, used as given (never flipped or
// redrawn), cropped and trimmed in public/brand/, with 1x/2x/3x files for sharp small sizes.
const SHARKS = {
  working: "shark-working", // gold curled shark: while the answer loads (gently bobbing)
  answer: "shark-answer", // pointing shark: a normal answer
  main: "shark-main-head", // standing shark, head crop: fallbacks, clarifying questions, small talk, errors
} as const;

/** Which avatar a turn gets. Crisis replies get a plain support icon, never the cartoon mascot. */
function avatarFor(turn: AssistantTurn): keyof typeof SHARKS | "support" {
  if (turn.state === "loading") return "working";
  if (turn.state === "error") return "main";
  if (turn.response.crisis) return "support";
  if (turn.response.type === "answer") return "answer";
  return "main";
}

function SharkImage({ kind, className }: { kind: keyof typeof SHARKS; className?: string }) {
  const file = SHARKS[kind];
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny pre-sized PNGs with our own 1x/2x/3x files
    <img
      aria-hidden
      alt=""
      src={`/brand/${file}-32.png`}
      srcSet={`/brand/${file}-32.png 1x, /brand/${file}-64.png 2x, /brand/${file}-96.png 3x`}
      width={32}
      height={32}
      className={cn("size-8 select-none", className)}
      draggable={false}
    />
  );
}

function AssistantAvatar({ turn }: { turn: AssistantTurn }) {
  const kind = avatarFor(turn);
  // Shark handoff (Entry 32): only when this message changes from "working" to a normal answer
  // while on screen. The working shark swims out and the pointing shark pops in (app/globals.css),
  // inside the fixed 32px box, so nothing else moves. Every other change is an instant swap.
  const [previousKind, setPreviousKind] = useState(kind);
  const [handoff, setHandoff] = useState(false);
  if (kind !== previousKind) {
    setPreviousKind(kind);
    setHandoff(previousKind === "working" && kind === "answer");
  }
  if (kind === "support") {
    return (
      <div aria-hidden className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <HeartHandshakeIcon className="size-4" />
      </div>
    );
  }
  return (
    <div className="relative mt-0.5 size-8 shrink-0">
      {handoff && <SharkImage kind="working" className="shark-out absolute inset-0" />}
      <SharkImage kind={kind} className={cn(kind === "working" && "animate-shark-bob", handoff && "shark-in")} />
    </div>
  );
}

export function AssistantMessage({
  turn,
  onAsk,
  onRetry,
  isLatest = false,
}: {
  turn: AssistantTurn;
  onAsk: (question: string) => void; // used by clarifying options, example questions and follow-ups
  onRetry: (turn: AssistantTurn) => void;
  isLatest?: boolean; // follow-up suggestions show only under the most recent answer
}) {
  return (
    <Message align="start" className="enter gap-3">
      <AssistantAvatar turn={turn} />
      <MessageContent className="gap-3 pt-1">
        <span className="sr-only">Assistant:</span>
        {/* We fixed a typo before searching: say so, like a search engine's "Did you mean". */}
        {turn.state === "done" && turn.response.correctedQuestion && (
          <p className="text-sm text-muted-foreground">
            Showing results for: <span className="font-medium text-foreground">{turn.response.correctedQuestion}</span>
          </p>
        )}
        {turn.state === "loading" && <ProgressSteps stages={turn.stages ?? []} />}
        {turn.state === "error" && <div className="enter"><ErrorState message={turn.error.message} onRetry={() => onRetry(turn)} /></div>}
        {turn.state === "done" && turn.response.type === "answer" && <AnswerState turn={turn} response={turn.response} onAsk={onAsk} showFollowUps={isLatest} />}
        {turn.state === "done" && turn.response.type === "clarify" && <div className="enter"><ClarifyState response={turn.response} onAsk={onAsk} /></div>}
        {turn.state === "done" && turn.response.type === "fallback" && <div className="enter"><FallbackState question={turn.question} response={turn.response} onAsk={onAsk} /></div>}
        {turn.state === "done" && turn.response.type === "chat" && <div className="enter flex flex-col gap-3"><ChatState response={turn.response} onAsk={onAsk} /></div>}
      </MessageContent>
    </Message>
  );
}

// Replies that arrive within this time (small talk, crisis replies, quick fallbacks) show no steps.
const STEPS_DELAY_MS = 400;

function stageLabel(stage: Stage) {
  return stage.stage === "searching"
    ? `Searching ${stage.pages} CSULB pages…`
    : `Reading ${stage.sections} matching section${stage.sections === 1 ? "" : "s"}…`;
}

/**
 * Progress steps while an answer loads (Entry 29). Only steps the server really reached, in order,
 * with real numbers: "Searching N CSULB pages…" then "Reading N matching sections…" (while Gemini
 * reads them). There's no "Writing your answer" step: the same Gemini call may end up as a fallback.
 * The newest step is current (a softly pulsing dot); earlier steps are checked off and faded.
 */
function ProgressSteps({ stages }: { stages: Stage[] }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), STEPS_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  const steps = stages.length ? stages.map(stageLabel) : ["Sending your question…"];
  return (
    <div data-slot="progress-steps" role="status" aria-live="polite" className="py-1">
      {!visible ? (
        <span className="sr-only">Working on your answer</span>
      ) : (
        <ol className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          {steps.map((label, i) => {
            const current = i === steps.length - 1;
            return (
              <li
                key={label}
                className={cn(
                  "flex items-center gap-2 duration-300 animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none",
                  !current && "opacity-60",
                )}
              >
                {current ? (
                  <span aria-hidden className="flex size-3.5 shrink-0 items-center justify-center">
                    <span className="size-2 rounded-full bg-gold animate-pulse motion-reduce:animate-none" />
                  </span>
                ) : (
                  <CheckIcon aria-hidden className="size-3.5 shrink-0 text-gold-ink" />
                )}
                <span className={WRAP}>{label}</span>
                {!current && <span className="sr-only">(done)</span>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function AnswerState({
  turn,
  response,
  onAsk,
  showFollowUps,
}: {
  turn: AssistantTurn;
  response: ChatResponse;
  onAsk: (q: string) => void;
  showFollowUps: boolean;
}) {
  const [openId, setOpenId] = useState<number | null>(null);
  const ids = response.sources.map((s) => s.id);
  const extra = response.beachsyncSearch ? 1 : 0; // the BeachSync button takes one entrance step
  return (
    <>
      {/* Answer parts enter in order (Entry 31): text, then each source chip, then each follow-up. */}
      <div className="enter">
        <AnswerText
          text={response.answer}
          citableIds={ids}
          onCite={(id) => setOpenId(id)}
        />
      </div>
      <SourceChips
        sources={response.sources}
        openId={openId}
        onToggle={(id) => setOpenId((current) => (current === id ? null : id))}
        messageId={turn.id}
      />
      {/* Club questions: search BeachSync for the rest of the clubs (Entry 34). */}
      {response.beachsyncSearch && (
        <div className="enter" style={enterDelay(CHIPS_START_MS + (response.sources.length + 1) * ENTER_STEP_MS)}>
          <BeachSyncButton search={response.beachsyncSearch} />
        </div>
      )}
      {/* Copy: normal answers only, never on crisis replies (Entry 32). */}
      {!response.crisis && <CopyAnswer response={response} delayMs={CHIPS_START_MS + (response.sources.length + 1 + extra) * ENTER_STEP_MS} />}
      {showFollowUps && response.followUps && response.followUps.length > 0 && (
        <FollowUps
          questions={response.followUps}
          onAsk={onAsk}
          startMs={CHIPS_START_MS + (response.sources.length + 2 + extra) * ENTER_STEP_MS}
        />
      )}
    </>
  );
}

/**
 * Copy the answer as clean plain text plus its sources (Entry 32, lib/copy-text.ts). Always visible
 * (not hover-only) so it works on touch screens. "Copied" shows for 1.5s; if the browser blocks the
 * clipboard, a short "Couldn't copy" note shows instead of failing silently.
 */
function CopyAnswer({ response, delayMs }: { response: ChatResponse; delayMs: number }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    clearTimeout(timer.current);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(plainTextForCopy(response.answer, response.sources));
      setState("copied");
      timer.current = setTimeout(() => setState("idle"), 1500);
    } catch {
      setState("failed");
      timer.current = setTimeout(() => setState("idle"), 3000);
    }
  }
  return (
    <div className="enter flex items-center gap-2" style={enterDelay(delayMs)}>
      <Button
        variant="ghost"
        size="sm"
        onClick={copy}
        aria-label={state === "copied" ? "Copied" : "Copy answer"}
        className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
      >
        {state === "copied" ? <CheckIcon data-icon="inline-start" className="text-gold-ink" /> : <CopyIcon data-icon="inline-start" />}
        {state === "copied" && <span className="text-xs">Copied</span>}
      </Button>
      <span aria-live="polite" className="text-xs text-muted-foreground">
        {state === "failed" ? "Couldn't copy" : <span className="sr-only">{state === "copied" ? "Answer copied" : ""}</span>}
      </span>
    </div>
  );
}

/**
 * "You could also ask": 2-3 suggested next questions under the latest answer (Entry 27). Kept quiet
 * on purpose (muted text, thin border, no fill) so it doesn't read as part of the answer; hover and
 * keyboard focus make it stronger. Each one was checked in lib/rag.ts to be answerable by our pages.
 */
function FollowUps({ questions, onAsk, startMs }: { questions: string[]; onAsk: (q: string) => void; startMs: number }) {
  return (
    <div className="flex flex-col gap-2 pt-1">
      <p className="enter text-xs text-muted-foreground" style={enterDelay(startMs)}>
        You could also ask
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Suggested follow-up questions">
        {questions.map((question, i) => (
          <button
            key={question}
            type="button"
            onClick={() => onAsk(question)}
            aria-label={`Ask: ${question}`}
            style={enterDelay(startMs + (i + 1) * ENTER_STEP_MS)}
            className="enter max-w-full rounded-full border border-border/70 bg-transparent px-3 py-1.5 text-left text-sm leading-5 text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/50 hover:text-foreground focus-visible:border-foreground/30 focus-visible:bg-muted/50 focus-visible:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <span className={WRAP}>{question}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** A reply to small talk ("hi", "what can you do?"): looks like an answer, but has no sources. */
function ChatState({ response, onAsk }: { response: ChatResponse; onAsk: (q: string) => void }) {
  const examples = response.examples ?? [];
  return (
    <>
      <AnswerText text={response.answer} citableIds={[]} onCite={() => {}} />
      {examples.length > 0 && (
        <div className="flex max-w-full flex-col items-start gap-2" role="group" aria-label="Example questions">
          {examples.map((example) => (
            <Button key={example} variant="outline" size="sm" className="h-auto min-h-8 max-w-full whitespace-normal py-1.5 text-left" onClick={() => onAsk(example)}>
              <span className={WRAP}>{example}</span>
            </Button>
          ))}
        </div>
      )}
    </>
  );
}

function ClarifyState({ response, onAsk }: { response: ChatResponse; onAsk: (q: string) => void }) {
  const options = clarifyOptions(response.answer);
  return (
    // Pale gold with a gold edge: "the assistant needs one more detail from you".
    <Bubble variant="accent" className="max-w-full sm:max-w-[90%]">
      <BubbleContent className="flex flex-col gap-3 rounded-xl border-l-4 border-l-gold px-4 py-3">
        <p className="flex items-start gap-2 text-[15px] leading-7 sm:text-base">
          <MessageCircleQuestionIcon aria-hidden className="mt-1.5 size-4 shrink-0 text-gold-ink" />
          <span className={WRAP}>{response.answer}</span>
        </p>
        {options.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Choose one">
            {options.map((option) => (
              <Button key={option} variant="outline" size="sm" className="h-auto min-h-8 max-w-full whitespace-normal bg-background py-1.5 text-left capitalize" onClick={() => onAsk(option)}>
                <span className={WRAP}>{option}</span>
              </Button>
            ))}
          </div>
        )}
      </BubbleContent>
    </Bubble>
  );
}

function FallbackState({ question, response, onAsk }: { question: string; response: ChatResponse; onAsk: (q: string) => void }) {
  // Show only the fixed fallback sentence here; the suggested page becomes a button below.
  const sentence = response.answer.split(" You may find help")[0];
  const examples = response.offTopic ? (response.examples ?? []) : [];
  return (
    <Bubble variant="muted" className="max-w-full sm:max-w-[90%]">
      <BubbleContent className="flex flex-col gap-3 rounded-xl px-4 py-3">
        <p className="flex items-start gap-2 text-[15px] leading-7 sm:text-base">
          <InfoIcon aria-hidden className="mt-1.5 size-4 shrink-0 text-muted-foreground" />
          <span className={WRAP}>{sentence}</span>
        </p>
        {/* Never a dead end: a CSULB question gets the office that can help; anything else gets
            what we can help with and a few example questions. */}
        {response.helpOffice && <WhoCanHelp office={response.helpOffice} />}
        {examples.length > 0 && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm">
              I can answer questions about CSULB student services, like parking, financial aid, advising, and registration. Try one of these:
            </p>
            <div className="flex max-w-full flex-col items-start gap-2" role="group" aria-label="Example questions">
              {examples.map((example) => (
                <Button key={example} variant="outline" size="sm" className="h-auto min-h-8 max-w-full whitespace-normal bg-background py-1.5 text-left" onClick={() => onAsk(example)}>
                  <span className={WRAP}>{example}</span>
                </Button>
              ))}
            </div>
          </div>
        )}
        {response.beachsyncSearch && <BeachSyncButton search={response.beachsyncSearch} />}
        <div className="flex flex-wrap items-center gap-2">
          {response.suggestion && (
            <Button
              size="sm"
              className="h-auto min-h-8 max-w-full whitespace-normal py-1.5 text-left"
              nativeButton={false}
              render={<a href={response.suggestion.url} target="_blank" rel="noreferrer" />}
            >
              <span className={WRAP}>Try: {response.suggestion.title}</span>
              <ExternalLinkIcon data-icon="inline-end" />
              <span className="sr-only"> (opens in a new tab)</span>
            </Button>
          )}
          <RequestTopicButton question={question} />
        </div>
      </BubbleContent>
    </Bubble>
  );
}

/**
 * "Search BeachSync for "chess"" (Entry 34): opens CSULB's full club list (BeachSync, run by Campus
 * Labs) searched for the student's topic. The link is built by our code (lib/club-search.ts), not
 * the AI. The note says where those listings come from, since student organizations write them.
 */
function BeachSyncButton({ search }: { search: BeachSyncSearch }) {
  return (
    <div className="flex flex-col items-start gap-1">
      {/* A plain link styled as a button, so screen readers announce it as a link. */}
      <a
        href={search.url}
        target="_blank"
        rel="noreferrer"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-auto min-h-8 max-w-full whitespace-normal bg-background py-1.5 text-left")}
      >
        <SearchIcon data-icon="inline-start" />
        <span className={WRAP}>Search BeachSync for &ldquo;{search.term}&rdquo;</span>
        <ExternalLinkIcon data-icon="inline-end" />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      <p className="text-xs text-muted-foreground">Club listings on BeachSync are written by student organizations and may change.</p>
    </div>
  );
}

/** "Who can help": the office's name (linked to its official page), its one-line description, and
 *  the phone/email we verified on its page. Nothing here is written by the AI. */
function WhoCanHelp({ office }: { office: HelpOffice }) {
  return (
    <section aria-label="Who can help" className="flex flex-col gap-1.5 rounded-lg border bg-background px-3 py-2.5">
      <h3 className="text-xs font-semibold text-muted-foreground">Who can help</h3>
      <a href={office.url} target="_blank" rel="noreferrer" className="flex max-w-full items-center gap-1.5 font-medium underline underline-offset-4">
        <span className={WRAP}>{office.name}</span>
        <ExternalLinkIcon aria-hidden className="size-3.5 shrink-0" />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      {office.description && <p className="text-sm text-muted-foreground">{office.description}</p>}
      {(office.phone || office.email) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {office.phone && (
            <a href={`tel:${office.phone.replace(/[^\d+]/g, "")}`} className="flex max-w-full items-center gap-1.5 underline underline-offset-4">
              <PhoneIcon aria-hidden className="size-3.5 shrink-0" />
              <span className={WRAP}>{office.phone}</span>
            </a>
          )}
          {office.email && (
            <a href={`mailto:${office.email}`} className="flex max-w-full items-center gap-1.5 underline underline-offset-4">
              <MailIcon aria-hidden className="size-3.5 shrink-0" />
              <span className={WRAP}>{office.email}</span>
            </a>
          )}
        </div>
      )}
    </section>
  );
}

/** "Request this topic": logs only the question text on the server so the team can add sources later. */
function RequestTopicButton({ question }: { question: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  if (state === "sent") {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground" role="status">
        <CheckIcon aria-hidden className="size-4 text-gold-ink" />
        Thanks, we&apos;ll consider adding this topic.
      </p>
    );
  }

  async function send() {
    setState("sending");
    try {
      const res = await fetch("/api/request-topic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      setState(res.ok ? "sent" : "failed");
    } catch {
      setState("failed");
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" className="h-8 bg-background" onClick={send} disabled={state === "sending"}>
        {state === "sending" ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
        Request this topic
      </Button>
      {state === "failed" && (
        <p className="text-sm text-destructive" role="status">
          That request didn&apos;t go through. Please try again.
        </p>
      )}
    </>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  // Calm, readable error: black text, red only on the icon and a thin border.
  // The retry button sits under the message (not beside it) so long messages don't get squeezed on phones.
  return (
    <Alert className="max-w-full border-destructive/40 sm:max-w-[90%]">
      <AlertCircleIcon className="text-destructive" />
      <AlertTitle>No answer this time</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3 text-foreground">
        <span>{message}</span>
        <Button variant="outline" size="sm" className="h-8" onClick={onRetry}>
          <RotateCwIcon data-icon="inline-start" />
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}
