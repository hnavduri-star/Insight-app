export type Me = {
  id: string; name: string; email: string; emailVerified: boolean;
  persona: string | null; industry: string | null; goals: string[]; dailyMinutes: number | null;
  coach: 'maya' | 'alex' | null; timezone: string; onboarded: boolean;
  plan: 'free' | 'premium'; freeTopicId: string | null;
  planSource: 'subscription' | 'grant' | 'purchase' | 'test' | 'beta' | null; premiumUntil: string | null;
};
export type Category = { id: string; name: string; icon: string; sortOrder: number; topics: { id: string; name: string; description: string | null; unlocked: boolean; free: boolean }[] };
export type TopicDetail = { id: string; name: string; description: string | null; category: string; icon: string; books: { title: string; author: string | null; kind: 'fiction' | 'nonfiction'; buyUrl: string | null }[];
  unlocked: boolean; free: boolean };
export type Person = { id: string; name: string; relationship: string; traits: string[]; notes: string | null; practiceGoal: string | null };

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? (opts.body ? 'POST' : 'GET'),
      headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, "Can't reach Insight. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Something went wrong. Please try again.', data.code);
  return data as T;
}

export const browserTimezone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
};

export type Plans = { enabled: boolean; testMode?: boolean; plans: { interval: 'month' | 'year'; amount: number | null; currency: string | null }[] };

export type Grade = { score: number; feedback: string; strength: string; improve: string; toolsUsed: string[]; modelAnswer: string };
export type Track = {
  toolkit: { done: boolean; quizCorrect: number; bestScenario: number | null };
  reps: { done: number; goal: number; avgScore: number | null };
  roleplay: { available: boolean };
  mastery: { unlocked: boolean; done: boolean; needsToolkit: boolean; needsReps: number };
};
export type Rep = { id: string; situation: string; ask: string; tools: string[]; with: string | null };
export type Plan = {
  title: string; summary: string; goal: string; topics: { name: string; why: string; id: string | null }[];
  steps: { tool: string; how: string }[]; openingLine: string; phrases: string[];
  anticipate: { theySay: string; youSay: string }[]; avoid: string[]; rehearsal: string;
};
export type Situation = { id: string; text: string; createdAt: string; bestScore: number | null; plan: Plan };

/** POSTs until the server stops answering "generating", riding out brief hosting hiccups. */
export async function pollPost<T>(path: string, body: unknown, alive: () => boolean = () => true, maxMs = 6 * 60_000): Promise<T> {
  const began = Date.now();
  let blips = 0;
  for (;;) {
    if (!alive()) throw new ApiError(0, 'Cancelled');
    let d: T | { status: 'generating' };
    try { d = await api<T | { status: 'generating' }>(path, { body }); blips = 0; }
    catch (e) {
      const s = (e as ApiError).status;
      if ((s === 0 || (s >= 502 && s <= 504)) && blips < 8 && Date.now() - began < maxMs) { blips++; await new Promise((r) => setTimeout(r, 4000)); continue; }
      throw e;
    }
    if (d && typeof d === 'object' && 'status' in d && (d as { status: string }).status === 'generating') {
      if (Date.now() - began > maxMs) throw new ApiError(504, 'This is taking longer than usual. Please try again in a minute.');
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    return d as T;
  }
}
