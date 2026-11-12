/**
 * POST /api/chat: the endpoint the chat page calls.
 *
 * Request:  { "question": "How much is a parking permit?", "history": [ { "role": "user", "content": "..." }, ... ] }
 * Success:  { "type": "answer" | "clarify" | "fallback", "answer": "...", "sources": [...], "suggestion": {...} | null }
 * Problem:  { "error": { "code": "question_too_long", "message": "A friendly message" } }
 *
 * All the real work happens in lib/rag.ts. This file only reads the request and
 * makes sure the student always gets a friendly message, never a crash or stack trace.
 */
import { answerQuestion } from "@/lib/rag";
import { FriendlyError } from "@/lib/gemini";

export async function POST(request: Request) {
  let body: { question?: unknown; history?: unknown };
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid_request", "The request wasn't in the expected format.", 400);
  }

  try {
    const result = await answerQuestion(body?.question, body?.history);
    return Response.json(result);
  } catch (err) {
    if (err instanceof FriendlyError) return errorResponse(err.code, err.message, err.httpStatus);
    // Anything unexpected: log the error type only (no student text), reply politely.
    console.error(`[api/chat] unexpected error: ${(err as Error)?.name ?? "unknown"}`);
    return errorResponse("server_error", "Something went wrong on our end. Please try again.", 500);
  }
}

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}
