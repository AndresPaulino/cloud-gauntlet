// The tutor's Claude call, shared by the local dev server (server/devApi.ts, key from .env)
// and the hosted static site (src/ui/Tutor.tsx, key pasted by the visitor and kept in their browser).
import Anthropic from '@anthropic-ai/sdk';

export const MODELS = { sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5' } as const;

export const SYSTEM = `You are the tutor inside "Cloud Gauntlet", a training app that takes an AWS beginner to passing the AWS Certified Solutions Architect – Associate (SAA-C03) exam. The learner has no AWS account; the app has a simulated AWS console, lessons, labs, an architecture builder and practice exams.

How to tutor:
- Explain in plain English first, then the precise AWS detail. Use a short analogy when a concept is abstract.
- Tie answers back to the exam: name the keywords in a question that point to the right answer and the distractor traps.
- When the learner got a question wrong, diagnose the misconception behind their choice before explaining the right answer.
- Prefer short answers (under ~250 words) unless asked to go deeper. Use markdown bullets and **bold** for key terms; no tables wider than 3 columns.
- Be accurate as of 2026 and use current service names. If something is uncertain or changed recently, say so.
- Never give the answer to a practice question the learner is still working on unless they ask for it; offer a hint first.`;

export interface TutorRequest {
  model?: keyof typeof MODELS;
  context?: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
}

/** Streams the tutor's answer as text chunks. Throws on a bad request or an API error. */
export async function streamTutor(client: Anthropic, body: TutorRequest, onText: (chunk: string) => void, signal?: AbortSignal) {
  const messages = (body.messages ?? []).slice(-30).filter((m) => m.content?.trim());
  if (!messages.length || messages[0].role !== 'user') throw new Error('messages must start with a user turn');
  const stream = client.beta.messages.stream({
    model: MODELS[body.model ?? 'sonnet'] ?? MODELS.sonnet,
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium' },
    system: body.context ? `${SYSTEM}\n\nWhat the learner is looking at right now:\n${body.context.slice(0, 12000)}` : SYSTEM,
    messages,
  } as Anthropic.Beta.Messages.MessageCreateParamsStreaming, { signal });
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') onText(event.delta.text);
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === 'refusal') onText('\n\n_(The tutor declined to answer that one. Try rephrasing.)_');
  if (final.stop_reason === 'max_tokens') onText('\n\n_(Answer cut off. Ask me to continue.)_');
}

export function tutorError(e: unknown, badKey: string): string {
  return e instanceof Anthropic.AuthenticationError ? badKey
    : e instanceof Anthropic.RateLimitError ? 'Rate limited. Wait a moment and retry.'
    : e instanceof Anthropic.APIError ? `Claude API error ${e.status}: ${e.message}`
    : e instanceof Error ? e.message : String(e);
}

/** Browser-direct client for the hosted site. The key goes from this browser straight to Anthropic. */
export const browserClient = (apiKey: string) => new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
