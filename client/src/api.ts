export type Me = {
  id: string; name: string; email: string; emailVerified: boolean;
  persona: string | null; industry: string | null; goal: string | null; dailyMinutes: number | null;
  coach: 'maya' | 'alex' | null; timezone: string; onboarded: boolean;
};
export type Category = { id: string; name: string; icon: string; sortOrder: number; topics: { id: string; name: string }[] };
export type TopicDetail = { id: string; name: string; category: string; icon: string; books: { title: string; author: string | null; buyUrl: string | null }[] };

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
