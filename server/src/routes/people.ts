import { Router } from 'express';
import { z } from 'zod';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { people } from '../db/schema.js';
import { requireAuth } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';
import { RELATIONSHIPS, TRAITS, MAX_PEOPLE } from '../../../shared/options.js';

export const peopleRoutes = Router();
peopleRoutes.use(requireAuth);

const personInput = z.object({
  name: z.string().trim().min(1, 'Enter a first name or nickname').max(40),
  relationship: z.enum(RELATIONSHIPS.map((r) => r.value) as [string, ...string[]]),
  traits: z.array(z.enum(TRAITS as unknown as [string, ...string[]])).max(5, 'Pick up to 5 traits').default([]),
  notes: z.string().trim().max(500).optional().nullable(),
  practiceGoal: z.string().trim().max(200).optional().nullable(),
}).strict();

const view = (p: typeof people.$inferSelect) => ({
  id: p.id, name: p.name, relationship: p.relationship, traits: p.traitsJson as string[],
  notes: p.notes, practiceGoal: p.practiceGoal, createdAt: p.createdAt,
});
const own = (userId: string, id: string) => and(eq(people.userId, userId), eq(people.id, id));
const idParam = (id: string) => {
  const r = z.string().uuid().safeParse(id);
  if (!r.success) throw new HttpError(404, 'Person not found');
  return r.data;
};

peopleRoutes.get('/', async (req, res) => {
  const rows = await db.select().from(people).where(eq(people.userId, req.userId!)).orderBy(asc(people.createdAt));
  res.json(rows.map(view));
});

peopleRoutes.post('/', async (req, res) => {
  const b = personInput.parse(req.body);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(people).where(eq(people.userId, req.userId!));
  if (n >= MAX_PEOPLE) throw new HttpError(409, `You can add up to ${MAX_PEOPLE} people.`, 'people_limit');
  const [p] = await db.insert(people).values({
    userId: req.userId!, name: b.name, relationship: b.relationship as any, traitsJson: b.traits,
    notes: b.notes || null, practiceGoal: b.practiceGoal || null,
  }).returning();
  res.status(201).json(view(p));
});

peopleRoutes.put('/:id', async (req, res) => {
  const b = personInput.parse(req.body);
  const [p] = await db.update(people).set({
    name: b.name, relationship: b.relationship as any, traitsJson: b.traits,
    notes: b.notes || null, practiceGoal: b.practiceGoal || null, updatedAt: new Date(),
  }).where(own(req.userId!, idParam(req.params.id))).returning();
  if (!p) throw new HttpError(404, 'Person not found');
  res.json(view(p));
});

peopleRoutes.delete('/:id', async (req, res) => {
  const [p] = await db.delete(people).where(own(req.userId!, idParam(req.params.id))).returning({ id: people.id });
  if (!p) throw new HttpError(404, 'Person not found');
  res.json({ ok: true });
});
