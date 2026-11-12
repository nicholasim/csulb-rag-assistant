/**
 * POST /api/request-topic: the "Request this topic" button on fallback answers.
 *
 * Our brief's "option to write a claim": when the assistant can't answer, a student can
 * ask us to add the topic. We log ONLY the question text (no IP address, no personal
 * info, no database). On Vercel these lines show up in the project's Logs tab, where the
 * team can look for common requests and add sources for them.
 */
import { MAX_QUESTION_LENGTH } from "@/lib/limits";

export async function POST(request: Request) {
  let question: unknown;
  try {
    ({ question } = await request.json());
  } catch {
    return Response.json({ error: { code: "invalid_request", message: "The request wasn't in the expected format." } }, { status: 400 });
  }
  if (typeof question !== "string" || !question.trim() || question.length > MAX_QUESTION_LENGTH) {
    return Response.json({ error: { code: "invalid_question", message: "There was no question to send." } }, { status: 400 });
  }

  console.log(`[topic-request] ${JSON.stringify(question.trim())}`);
  return Response.json({ ok: true, message: "Thanks, we'll consider adding this topic." });
}
