import { z } from 'zod';
import { PERSONAS, INDUSTRIES, GOALS, DAILY_MINUTES, COACHES } from '../../../shared/options.js';

export const email = z.string().trim().toLowerCase().max(254).email('Enter a valid email');
export const password = z.string().min(6, 'Password must be at least 6 characters').max(128);
export const name = z.string().trim().min(1, 'Enter your name').max(80);

const values = <T extends readonly { value: string }[]>(xs: T) => xs.map((x) => x.value) as [T[number]['value'], ...T[number]['value'][]];

export const isValidTimezone = (tz: string) => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
};

export const profileInput = z.object({
  name: name.optional(),
  persona: z.enum(values(PERSONAS)).optional(),
  industry: z.enum(INDUSTRIES as unknown as [string, ...string[]]).optional(),
  goal: z.enum(GOALS as unknown as [string, ...string[]]).optional(),
  dailyMinutes: z.number().int().refine((n) => (DAILY_MINUTES as readonly number[]).includes(n), 'Choose 5, 10, 15 or 20').optional(),
  coach: z.enum(values(COACHES)).optional(),
  timezone: z.string().max(64).refine(isValidTimezone, 'Unknown time zone').optional(),
}).strict();
