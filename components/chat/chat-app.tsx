"use client";

import { useRef, useState } from "react";
import { MenuIcon } from "lucide-react";
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

/** Ask the API. Always resolves to a finished assistant turn (an answer or a friendly error). */
async function fetchAnswer(id: string, question: string, history: ChatMessage[]): Promise<AssistantTurn> {
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, history }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.answer) {
      return { id, role: "assistant", question, state: "done", response: data as ChatResponse };
    }
    const error = data?.error ?? { code: "server_error", message: "Something went wrong on our end. Please try again." };
    return { id, role: "assistant", question, state: "error", error };
  } catch {
    return {
      id,
      role: "assistant",
      question,
      state: "error",
      error: { code: "network_error", message: "We couldn't reach the assistant. Check your internet connection and try again." },
    };
  }
}

export function ChatApp() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const waiting = turns.some((t) => t.role === "assistant" && t.state === "loading");

  async function ask(rawQuestion: string) {
    const question = rawQuestion.trim();
    if (!question || waiting) return;
    const history = historyFrom(turns);
    const answerId = newId();
    setTurns((t) => [
      ...t,
      { id: newId(), role: "user", content: question },
      { id: answerId, role: "assistant", question, state: "loading" },
    ]);
    setDraft("");
    const finished = await fetchAnswer(answerId, question, history);
    setTurns((t) => t.map((turn) => (turn.id === answerId ? finished : turn)));
  }

  async function retry(turn: AssistantTurn) {
    if (waiting) return;
    // History = everything before the failed question.
    const index = turns.findIndex((t) => t.id === turn.id);
    const history = historyFrom(turns.slice(0, Math.max(0, index - 1)));
    setTurns((t) => t.map((x) => (x.id === turn.id ? { ...turn, state: "loading" } : x)));
    const finished = await fetchAnswer(turn.id, turn.question, history);
    setTurns((t) => t.map((x) => (x.id === turn.id ? finished : x)));
  }

  // Sidebar category: put its starter question in the box so the student can edit or send it.
  function pickCategory(starter: string) {
    setDraft(starter);
    setMenuOpen(false);
    requestAnimationFrame(() => {
      const box = textareaRef.current;
      if (!box) return;
      box.focus();
      box.setSelectionRange(starter.length, starter.length);
    });
  }

  return (
    <div className="flex h-dvh bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-72 shrink-0 flex-col gap-8 overflow-y-auto bg-sidebar px-4 py-6 text-sidebar-foreground lg:flex">
        <div className="px-1">
          <Wordmark />
        </div>
        <CategoryList onPick={pickCategory} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header with the slide-out menu */}
        <header className="flex items-center justify-between gap-3 bg-sidebar px-4 py-3 text-sidebar-foreground lg:hidden">
          <Wordmark />
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
        </header>

        <main className="flex min-h-0 flex-1 flex-col">
          {turns.length === 0 ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
                <Welcome onAsk={ask} />
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
                          <Message align="end">
                            <MessageContent>
                              <span className="sr-only">You:</span>
                              <Bubble variant="default" align="end">
                                <BubbleContent className="rounded-2xl rounded-br-md px-4 py-2.5 text-[15px] leading-6 sm:text-base">
                                  {turn.content}
                                </BubbleContent>
                              </Bubble>
                            </MessageContent>
                          </Message>
                        ) : (
                          <AssistantMessage turn={turn} onAsk={ask} onRetry={retry} />
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
              <ChatInput value={draft} onChange={setDraft} onSubmit={() => ask(draft)} disabled={waiting} textareaRef={textareaRef} />
              <p className="text-center text-xs leading-5 text-muted-foreground">{FOOTER_NOTE}</p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
