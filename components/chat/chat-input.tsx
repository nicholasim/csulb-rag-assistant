"use client";

import type { RefObject } from "react";
import { ArrowUpIcon } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { MAX_QUESTION_LENGTH } from "@/lib/limits";
import { cn } from "@/lib/utils";

const SHOW_COUNTER_AT = 400; // show "432 / 500" once the question gets close to the limit

/** The question box: Enter sends, Shift+Enter adds a new line. */
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
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSubmit();
      }}
    >
      <label htmlFor="question" className="sr-only">
        Ask a question about CSULB services
      </label>
      <InputGroup className="rounded-2xl border-input bg-background shadow-[0_1px_0_rgba(0,0,0,0.04)]">
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
          className="max-h-40 min-h-12 px-4 pt-3.5 text-base"
        />
        <InputGroupAddon align="block-end" className="justify-between pb-2.5 pl-4">
          <span
            id="question-help"
            aria-live="polite"
            className={cn("text-xs font-normal tabular-nums", tooLong ? "font-medium text-destructive" : "text-muted-foreground")}
          >
            {tooLong
              ? `${length} / ${MAX_QUESTION_LENGTH}: please shorten your question`
              : length >= SHOW_COUNTER_AT
                ? `${length} / ${MAX_QUESTION_LENGTH}`
                : <span className="hidden sm:inline">Enter to send, Shift + Enter for a new line</span>}
          </span>
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
    </form>
  );
}
