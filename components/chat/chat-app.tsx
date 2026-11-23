"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { MenuIcon, PencilIcon, SquarePenIcon } from "lucide-react";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Message, MessageContent } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { ChatMessage, ChatResponse } from "@/lib/rag";
import { AssistantMessage, type AssistantTurn } from "./assistant-message";
import { ChatInput } from "./chat-input";
import { CategoryList, Wordmark } from "./sidebar-nav";
import { Welcome } from "./welcome";

type UserTurn = { id: string; role: "user"; content: string };
type Turn = UserTurn | AssistantTurn;

const FOOTER_NOTE = "Answers come only from official CSULB web pages. Don't enter personal information.";

let nextId = 0;
const newId = () => `turn-${++nextId}`;

/** What we send as "history" so follow-ups (like "graduation" after "How do I apply?") make sense. */
function historyFrom(turns: Turn[]): ChatMessage[] {
  return turns
    .flatMap((t): ChatMessage[] => {
      if (t.role === "user") return [{ role: "user", content: t.content }];
      if (t.state === "done") return [{ role: "assistant", content: t.response.answer }];
      return [];
    })
    .slice(-6);
}

/**
 * Ask the API. Resolves to a finished assistant turn (an answer or a friendly error),
 * or to null if the student pressed Stop (the request was cancelled).
 */
async function fetchAnswer(
  id: string,
  question: string,
  history: ChatMessage[],
  signal: AbortSignal,
): Promise<AssistantTurn | null> {
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, history }),
      signal,
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.answer) {
      return { id, role: "assistant", question, state: "done", response: data as ChatResponse };
    }
    const error = data?.error ?? { code: "server_error", message: "Something went wrong on our end. Please try again." };
    return { id, role: "assistant", question, state: "error", error };
  } catch {
    if (signal.aborted) return null; // stopped on purpose: not an error
    return {
      id,
      role: "assistant",
      question,
      state: "error",
      error: { code: "network_error", message: "We couldn't reach the assistant. Check your internet connection and try again." },
    };
  }
}

export function ChatApp({ pageCount }: { pageCount: number }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null); // small gray note under the box, e.g. "Stopped."
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const requestRef = useRef<AbortController | null>(null); // lets Stop cancel the request in flight
  const waiting = turns.some((t) => t.role === "assistant" && t.state === "loading");
  const lastQuestionId = turns.findLast((t) => t.role === "user")?.id;

  /** Put text in the question box and move the cursor to the end, ready to edit. */
  function putInBox(text: string) {
    setDraft(text);
    requestAnimationFrame(() => {
      const box = textareaRef.current;
      if (!box) return;
      box.focus();
      box.setSelectionRange(text.length, text.length);
    });
  }

  /** Send a request for an assistant turn; returns null if it was stopped. */
  async function request(id: string, question: string, history: ChatMessage[]) {
    const controller = new AbortController();
    requestRef.current = controller;
    const finished = await fetchAnswer(id, question, history, controller.signal);
    if (requestRef.current === controller) requestRef.current = null;
    return finished;
  }

  async function ask(rawQuestion: string) {
    const question = rawQuestion.trim();
    if (!question || waiting) return;
    // History is always rebuilt from what's on screen, so stopped or edited questions are never sent.
    const history = historyFrom(turns);
    const answerId = newId();
    setTurns((t) => [
      ...t,
      { id: newId(), role: "user", content: question },
      { id: answerId, role: "assistant", question, state: "loading" },
    ]);
    setDraft("");
    setNotice(null);
    const finished = await request(answerId, question, history);
    if (finished) setTurns((t) => t.map((turn) => (turn.id === answerId ? finished : turn)));
  }

  async function retry(turn: AssistantTurn) {
    if (waiting) return;
    // History = everything before the failed question.
    const index = turns.findIndex((t) => t.id === turn.id);
    const history = historyFrom(turns.slice(0, Math.max(0, index - 1)));
    setTurns((t) => t.map((x) => (x.id === turn.id ? { ...turn, state: "loading" } : x)));
    setNotice(null);
    const finished = await request(turn.id, turn.question, history);
    if (finished) setTurns((t) => t.map((x) => (x.id === turn.id ? finished : x)));
  }

  /**
   * Stop (button or Esc): cancel the request, remove the loading answer AND its question from
   * the chat, and put the question back in the box so the student can edit and resend it.
   */
  function stop() {
    const index = turns.findIndex((t) => t.role === "assistant" && t.state === "loading");
    if (index === -1) return;
    requestRef.current?.abort();
    requestRef.current = null;
    const loading = turns[index] as AssistantTurn;
    const questionIndex = turns[index - 1]?.role === "user" ? index - 1 : index;
    setTurns((t) => t.filter((_, i) => i < questionIndex || i > index));
    putInBox(loading.question);
    setNotice("Stopped. Your question is back in the box.");
  }

  // Esc stops a loading answer (only listens while something is loading).
  const onEscape = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === "Escape") stop();
  });
  useEffect(() => {
    if (!waiting) return;
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [waiting]);

  /** Edit: remove the most recent question and its answer, and put the question back in the box. */
  function editQuestion(turn: UserTurn) {
    if (waiting) return;
    const index = turns.findIndex((t) => t.id === turn.id);
    setTurns((t) => t.slice(0, index));
    setNotice(null);
    putInBox(turn.content);
  }

  // "New chat": cancel anything loading, clear the conversation, and go back to the welcome screen.
  function newChat() {
    requestRef.current?.abort();
    requestRef.current = null;
    setTurns([]);
    setDraft("");
    setNotice(null);
    setMenuOpen(false);
  }

  // Sidebar category: put its starter question in the box so the student can edit or send it.
  function pickCategory(starter: string) {
    setMenuOpen(false);
    putInBox(starter);
  }

  return (
    <div className="flex h-dvh bg-background">
      {/* Desktop sidebar */}
      {/* relative: the category buttons' hidden screen-reader labels (sr-only = position: absolute)
          must be positioned inside this scroll box. Without it they were placed against the page and
          made it 183px taller than the window, so the whole page could scroll (Entry 26). */}
      <aside className="relative hidden w-72 shrink-0 flex-col gap-8 overflow-y-auto bg-sidebar px-4 py-6 text-sidebar-foreground lg:flex">
        <div className="flex flex-col gap-5 px-1">
          <Wordmark />
          <Button
            variant="outline"
            onClick={newChat}
            className="h-10 justify-start gap-2 border-sidebar-border bg-transparent px-3 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-sidebar-ring"
          >
            <SquarePenIcon data-icon="inline-start" className="text-gold" />
            New chat
          </Button>
        </div>
        <CategoryList onPick={pickCategory} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header with the slide-out menu */}
        <header className="flex items-center justify-between gap-3 bg-sidebar px-4 py-3 text-sidebar-foreground lg:hidden">
          <Wordmark />
          <div className="flex items-center gap-1">
            {turns.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={newChat}
                className="size-11 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                aria-label="New chat"
              >
                <SquarePenIcon />
              </Button>
            )}
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    aria-label="Browse services"
                  />
                }
              >
                <MenuIcon />
              </SheetTrigger>
              <SheetContent side="left" className="w-80 gap-6 overflow-y-auto border-sidebar-border bg-sidebar p-4 text-sidebar-foreground">
                <SheetHeader className="p-1">
                  <SheetTitle className="sr-only">Browse services</SheetTitle>
                  <SheetDescription className="sr-only">Pick a service to fill in a starter question.</SheetDescription>
                  <Wordmark />
                </SheetHeader>
                <CategoryList onPick={pickCategory} />
              </SheetContent>
            </Sheet>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col">
          {turns.length === 0 ? (
            <div className="relative min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
                <Welcome onAsk={ask} pageCount={pageCount} />
              </div>
            </div>
          ) : (
            <MessageScrollerProvider autoScroll>
              <MessageScroller className="flex-1">
                <MessageScrollerViewport>
                  <MessageScrollerContent
                    className="mx-auto w-full max-w-3xl gap-8 px-4 py-6 sm:px-6 sm:py-8"
                    role="log"
                    aria-live="polite"
                    aria-label="Conversation"
                  >
                    {turns.map((turn) => (
                      <MessageScrollerItem key={turn.id} messageId={turn.id} scrollAnchor={turn.role === "user"}>
                        {turn.role === "user" ? (
                          <Message align="end" className="group/question">
                            <MessageContent>
                              <span className="sr-only">You:</span>
                              {/* w-full: the bubble's max width (80%) must be measured against the whole
                                  chat column. When this row was only as wide as its text, 80% of "hello"
                                  was narrower than "hello" itself, so it broke mid-word ("he / llo"). */}
                              <div className="flex w-full min-w-0 items-center justify-end gap-1">
                                {/* Edit: only on the most recent question. Shows on hover with a mouse,
                                    always on touch screens, and whenever it has keyboard focus. */}
                                {turn.id === lastQuestionId && !waiting && (
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => editQuestion(turn)}
                                    aria-label="Edit this question"
                                    className="shrink-0 text-muted-foreground transition-opacity [@media(hover:hover)]:opacity-0 group-hover/question:opacity-100 focus-visible:opacity-100"
                                  >
                                    <PencilIcon />
                                  </Button>
                                )}
                                <Bubble variant="default" align="end">
                                  <BubbleContent className="rounded-2xl rounded-br-md px-4 py-2.5 text-[15px] leading-6 sm:text-base">
                                    {turn.content}
                                  </BubbleContent>
                                </Bubble>
                              </div>
                            </MessageContent>
                          </Message>
                        ) : (
                          <AssistantMessage
                            turn={turn}
                            onAsk={ask}
                            onRetry={retry}
                            isLatest={turn.id === turns[turns.length - 1]?.id}
                          />
                        )}
                      </MessageScrollerItem>
                    ))}
                  </MessageScrollerContent>
                </MessageScrollerViewport>
                <MessageScrollerButton />
              </MessageScroller>
            </MessageScrollerProvider>
          )}

          {/* Sticky question box + footer note */}
          <div className="border-t border-border bg-background">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
              <ChatInput
                value={draft}
                onChange={(value) => {
                  setDraft(value);
                  setNotice(null);
                }}
                onSubmit={() => ask(draft)}
                waiting={waiting}
                onStop={stop}
                notice={notice}
                textareaRef={textareaRef}
              />
              <p className="text-center text-xs leading-5 text-muted-foreground">{FOOTER_NOTE}</p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
