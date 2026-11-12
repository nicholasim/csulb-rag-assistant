"use client";

import type { RefObject } from "react";
import { ArrowUpIcon } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { MAX_QUESTION_LENGTH } from "@/lib/limits";
import { cn } from "@/lib/utils";

const SHOW_COUNTER_AT = 400; // show "432 / 500" once the question gets close to the limit

/**
 * The question box: Enter sends, Shift+Enter adds a new line.
 * It starts about two lines tall and grows as you type (up to a limit, then scrolls).
 */
export function ChatInput({
  value,
  onChange,
  onSubmit,
  disabled,
  textareaRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean; // true while waiting for an answer
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const length = value.trim().length;
  const tooLong = length > MAX_QUESTION_LENGTH;
  const canSend = !disabled && length > 0 && !tooLong;

  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSubmit();
      }}
    >
      <label htmlFor="question" className="sr-only">
        Ask a question about CSULB services
      </label>
      {/* Focus: one thin, darker-gold ring (3.6:1 on white) instead of the default thick double ring. */}
      <InputGroup className="rounded-2xl border-input bg-background has-[[data-slot=input-group-control]:focus-visible]:border-gold-ring has-[[data-slot=input-group-control]:focus-visible]:ring-1 has-[[data-slot=input-group-control]:focus-visible]:ring-gold-ring">
        <InputGroupTextarea
          id="question"
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (canSend) onSubmit();
            }
          }}
          placeholder="Ask about a CSULB service…"
          rows={1}
          aria-invalid={tooLong || undefined}
          aria-describedby="question-help"
          className="max-h-40 min-h-[4.25rem] py-3 pl-4 text-base"
        />
        <InputGroupAddon align="inline-end" className="self-end pr-3 pb-3">
          {/* aria-disabled instead of disabled: a truly disabled button makes InputGroup fade
              the whole box. The form's onSubmit already ignores empty or too-long questions. */}
          <InputGroupButton
            type="submit"
            size="icon-sm"
            variant="default"
            aria-disabled={!canSend}
            className="rounded-full bg-gold text-gold-foreground hover:bg-black hover:text-gold aria-disabled:cursor-not-allowed aria-disabled:bg-muted aria-disabled:text-muted-foreground"
            aria-label="Send question"
          >
            <ArrowUpIcon />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <p
        id="question-help"
        aria-live="polite"
        className={cn(
          "px-1 text-xs tabular-nums sm:min-h-4",
          tooLong ? "font-medium text-destructive" : "text-muted-foreground",
        )}
      >
        {tooLong
          ? `${length} / ${MAX_QUESTION_LENGTH}: please shorten your question`
          : length >= SHOW_COUNTER_AT
            ? `${length} / ${MAX_QUESTION_LENGTH}`
            : <span className="hidden sm:inline">Enter to send, Shift + Enter for a new line</span>}
      </p>
    </form>
  );
}
