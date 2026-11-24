/**
 * POST /api/chat: the endpoint the chat page calls.
 *
 * Request:  { "question": "How much is a parking permit?", "history": [ { "role": "user", "content": "..." }, ... ] }
 * Success:  { "type": "answer" | "clarify" | "fallback", "answer": "...", "sources": [...], "suggestion": {...} | null }
 * Problem:  { "error": { "code": "question_too_long", "message": "A friendly message" } }
 * With "Accept: application/x-ndjson" (the chat page): progress steps first, one JSON line each,
 * then the same success or problem object as the last line (see streamAnswer below).
 *
 * All the real work happens in lib/rag.ts. This file only reads the request and
 * makes sure the student always gets a friendly message, never a crash or stack trace.
 */
import { answerQuestion } from "@/lib/rag";
import { FriendlyError } from "@/lib/gemini";

// Hosting limit for this route (seconds). lib/rag.ts already answers or gives a friendly error
// within 28s (Entry 28); this stops the platform from holding a request any longer.
export const maxDuration = 30;

export async function POST(request: Request) {
  let body: { question?: unknown; history?: unknown };
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid_request", "The request wasn't in the expected format.", 400);
  }

  // The chat page asks for progress steps (Entry 29): it sends Accept: application/x-ndjson and gets
  // one JSON line per event as it happens: {"event":"stage",...} lines, then exactly one
  // {"event":"result","data":...} or {"event":"error","error":...}. Everyone else (the test runner,
  // scripts, any other caller) gets the plain JSON reply as before.
  if (request.headers.get("accept")?.includes("application/x-ndjson")) {
    return streamAnswer(body);
  }

  try {
    const result = await answerQuestion(body?.question, body?.history);
    return Response.json(result);
  } catch (err) {
    const { code, message, status } = describeError(err);
    return errorResponse(code, message, status);
  }
}

function streamAnswer(body: { question?: unknown; history?: unknown }) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Each event is its own chunk, so it can be sent to the page right away.
      const send = (event: object) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The student pressed Stop (the stream was cancelled): nothing left to send.
        }
      };
      try {
        const result = await answerQuestion(body?.question, body?.history, (stage) => send({ event: "stage", ...stage }));
        send({ event: "result", data: result });
      } catch (err) {
        const { code, message } = describeError(err);
        send({ event: "error", error: { code, message } });
      }
      try {
        controller.close();
      } catch {
        // already cancelled
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      // Don't let a proxy or the host hold the lines back and send them all at once.
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

/** A friendly code and message for any error. Unexpected errors log their type only (no student text). */
function describeError(err: unknown): { code: string; message: string; status: number } {
  if (err instanceof FriendlyError) return { code: err.code, message: err.message, status: err.httpStatus };
  console.error(`[api/chat] unexpected error: ${(err as Error)?.name ?? "unknown"}`);
  return { code: "server_error", message: "Something went wrong on our end. Please try again.", status: 500 };
}

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}
