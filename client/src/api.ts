export type Me = {
  id: string; name: string; email: string; emailVerified: boolean;
  persona: string | null; industry: string | null; goals: string[]; dailyMinutes: number | null;
  coach: 'maya' | 'alex' | null; timezone: string; onboarded: boolean;
  plan: 'free' | 'premium'; freeTopicId: string | null;
  planSource: 'subscription' | 'grant' | 'purchase' | 'test' | 'beta' | null; premiumUntil: string | null;
};
export type Category = { id: string; name: string; icon: string; sortOrder: number; topics: { id: string; name: string; description: string | null; unlocked: boolean; free: boolean }[] };
export type TopicDetail = { id: string; name: string; description: string | null; featured?: boolean; category: string; icon: string; books: { title: string; author: string | null; kind: 'fiction' | 'nonfiction'; buyUrl: string | null }[];
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
  toolkit: { done: boolean; toolsDone: boolean; quizDone: boolean; quizCorrect: number; bestScenario: number | null };
  reps: { done: number; goal: number; avgScore: number | null };
  roleplay: { available: boolean; unlocked: boolean; done: number; best: number | null; needsToolkit: boolean; needsReps: number };
  mastery: { unlocked: boolean; done: boolean; needsToolkit: boolean; needsReps: number };
};
export type Rep = { id: string; situation: string; ask: string; tools: string[]; with: string | null };
export type Plan = {
  title: string; summary: string; goal: string; topics: { name: string; why: string; id: string | null }[];
  steps: { tool: string; how: string }[]; openingLine: string; phrases: string[];
  anticipate: { theySay: string; youSay: string }[]; avoid: string[]; rehearsal: string;
};
export type Turn = { who: 'character' | 'learner' | 'coach'; text: string };
export type Debrief = {
  score: number; rubric: { clarity: number; empathy: number; structure: number; tools: number };
  wentWell: string; improve: string; betterMove: { yourLine: string; tryInstead: string }; toolsUsed: string[]; revealed: string;
};
export type Roleplay = {
  id: string; topicId: string; status: 'active' | 'finished' | 'debriefed'; difficulty: 'friendly' | 'realistic' | 'tough';
  character: string; personId: string | null; personName: string | null; maxTurns: number; turnsUsed: number; canDebrief: boolean;
  setup: { title: string; characterName: string; characterRole: string; situation: string; yourGoal: string; skills: string[]; opening: string };
  transcript: Turn[]; debrief: Debrief | null; score: number | null; paused?: boolean;
};
export type RoleplayOptions = {
  characters: { id: string; label: string; notes: string }[]; people: { id: string; name: string; relationship: string }[];
  difficulties: { value: Roleplay['difficulty']; label: string; hint: string }[]; maxTurns: number;
  recent: { id: string; title: string; status: Roleplay['status']; score: number | null }[]; track: Track;
};
export type Daily = {
  streak: number; freezes: number; activeToday: boolean; xp: number; today: string; dailyDone: boolean;
  reviews: { id: string; topicId: string; topic: string; category: string; q: string; options: string[]; answer: number; why: string; intervalDays: number }[];
  dueTotal: number; reviewItems: number; rep: { topicId: string; topic: string; category: string } | null;
};
export type Week = {
  from: string; to: string; streak: number; freezes: number; daysActive: number; days: { day: string; weekday: string; active: boolean }[];
  counts: { kind: string; label: string; n: number }[]; total: number; avgRep: number | null; avgRoleplay: number | null;
  reviewAccuracy: number | null; reviewsDone: number; wins: number; topics: { id: string; name: string; category: string; avg: number | null }[]; focus: string;
};
export type Checkin = { id: string; kind: 'roleplay' | 'situation'; title: string; withName: string | null; question: string; outcome: 'well' | 'mixed' | 'not_yet' | null };
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
