export type Me = {
  id: string; name: string; email: string; emailVerified: boolean;
  persona: string | null; industry: string | null; goals: string[]; dailyMinutes: number | null;
  coach: 'maya' | 'alex' | null; timezone: string; onboarded: boolean;
  plan: 'free' | 'premium'; freeTopicId: string | null;
  planSource: 'subscription' | 'grant' | 'purchase' | 'test' | null; premiumUntil: string | null;
};
export type Category = { id: string; name: string; icon: string; sortOrder: number; topics: { id: string; name: string; unlocked: boolean; free: boolean }[] };
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
