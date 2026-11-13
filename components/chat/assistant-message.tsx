"use client";

import { useState } from "react";
import { AlertCircleIcon, CheckIcon, ExternalLinkIcon, InfoIcon, MailIcon, MessageCircleQuestionIcon, PhoneIcon, RotateCwIcon, SendIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Message, MessageContent } from "@/components/ui/message";
import { Spinner } from "@/components/ui/spinner";
import type { ChatResponse } from "@/lib/rag";
import type { HelpOffice } from "@/lib/help-office";
import { AnswerText } from "./answer-text";
import { SourceChips } from "./source-chips";

export type AssistantTurn = {
  id: string;
  role: "assistant";
  question: string; // the question this turn answers (used for Retry and "Request this topic")
} & (
  | { state: "loading" }
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

function AssistantMark() {
  return (
    <div
      aria-hidden
      className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-black text-sm font-bold text-gold"
    >
      C
    </div>
  );
}

export function AssistantMessage({
  turn,
  onAsk,
  onRetry,
}: {
  turn: AssistantTurn;
  onAsk: (question: string) => void; // used by clarifying-option buttons
  onRetry: (turn: AssistantTurn) => void;
}) {
  return (
    <Message align="start" className="gap-3">
      <AssistantMark />
      <MessageContent className="gap-3 pt-1">
        <span className="sr-only">Assistant:</span>
        {/* We fixed a typo before searching: say so, like a search engine's "Did you mean". */}
        {turn.state === "done" && turn.response.correctedQuestion && (
          <p className="text-sm text-muted-foreground">
            Showing results for: <span className="font-medium text-foreground">{turn.response.correctedQuestion}</span>
          </p>
        )}
        {turn.state === "loading" && <LoadingState />}
        {turn.state === "error" && <ErrorState message={turn.error.message} onRetry={() => onRetry(turn)} />}
        {turn.state === "done" && turn.response.type === "answer" && <AnswerState turn={turn} response={turn.response} />}
        {turn.state === "done" && turn.response.type === "clarify" && <ClarifyState response={turn.response} onAsk={onAsk} />}
        {turn.state === "done" && turn.response.type === "fallback" && <FallbackState question={turn.question} response={turn.response} onAsk={onAsk} />}
        {turn.state === "done" && turn.response.type === "chat" && <ChatState response={turn.response} onAsk={onAsk} />}
      </MessageContent>
    </Message>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center gap-3 py-1.5" role="status">
      <span className="flex gap-1" aria-hidden>
        <span className="size-2 animate-bounce rounded-full bg-gold [animation-delay:-0.3s] motion-reduce:animate-none" />
        <span className="size-2 animate-bounce rounded-full bg-gold [animation-delay:-0.15s] motion-reduce:animate-none" />
        <span className="size-2 animate-bounce rounded-full bg-gold motion-reduce:animate-none" />
      </span>
      <span className="text-sm text-muted-foreground">Checking official CSULB pages…</span>
    </div>
  );
}

function AnswerState({ turn, response }: { turn: AssistantTurn; response: ChatResponse }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const ids = response.sources.map((s) => s.id);
  return (
    <>
      <AnswerText
        text={response.answer}
        citableIds={ids}
        onCite={(id) => setOpenId(id)}
      />
      <SourceChips
        sources={response.sources}
        openId={openId}
        onToggle={(id) => setOpenId((current) => (current === id ? null : id))}
        messageId={turn.id}
      />
    </>
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
