import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cpdRecords, teamMembers, teams, users } from '../db/schema.js';
import { toCsv } from './cpd.js';
import { requireAuth } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';

/**
 * Teams for companies: an owner creates a team and shares an invite code. The owner's dashboard
 * shows activity totals per member only. Never answers, transcripts, people or notes.
 */
export const teamRoutes = Router();
teamRoutes.use(requireAuth);

const code = () => Array.from(crypto.randomBytes(6), (b) => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[b % 31]).join('');

async function membership(userId: string) {
  const [m] = await db.select({ team: teams, role: teamMembers.role }).from(teamMembers).innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(eq(teamMembers.userId, userId));
  return m ?? null;
}

teamRoutes.get('/mine', async (req, res) => {
  const m = await membership(req.userId!);
  if (!m) return void res.json(null);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(teamMembers).where(eq(teamMembers.teamId, m.team.id));
  res.json({ id: m.team.id, name: m.team.name, role: m.role, members: n, inviteCode: m.role === 'owner' ? m.team.inviteCode : null });
});

teamRoutes.post('/', async (req, res) => {
  const { name } = z.object({ name: z.string().trim().min(2, 'Give the team a name').max(60) }).parse(req.body);
  if (await membership(req.userId!)) throw new HttpError(409, "You're already in a team. Leave it first.", 'already_in_team');
  const team = await db.transaction(async (tx) => {
    const [t] = await tx.insert(teams).values({ name, ownerId: req.userId!, inviteCode: code() }).returning();
    await tx.insert(teamMembers).values({ teamId: t.id, userId: req.userId!, role: 'owner' });
    return t;
  });
  res.json({ id: team.id, name: team.name, role: 'owner', members: 1, inviteCode: team.inviteCode });
});

teamRoutes.post('/join', async (req, res) => {
  const { code: c } = z.object({ code: z.string().trim().min(4).max(12) }).parse(req.body);
  if (await membership(req.userId!)) throw new HttpError(409, "You're already in a team. Leave it first.", 'already_in_team');
  const [t] = await db.select().from(teams).where(eq(teams.inviteCode, c.toUpperCase()));
  if (!t) throw new HttpError(404, "That invite code didn't match a team. Check it with your team lead.", 'bad_code');
  await db.insert(teamMembers).values({ teamId: t.id, userId: req.userId!, role: 'member' }).onConflictDoNothing();
  res.json({ id: t.id, name: t.name, role: 'member' });
});

teamRoutes.post('/leave', async (req, res) => {
  const m = await membership(req.userId!);
  if (!m) return void res.json({ ok: true });
  if (m.role === 'owner') {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(teamMembers).where(eq(teamMembers.teamId, m.team.id));
    if (n > 1) throw new HttpError(409, 'Remove the other members first, or ask us to transfer the team.', 'owner_has_members');
    await db.delete(teams).where(eq(teams.id, m.team.id));
  } else await db.delete(teamMembers).where(and(eq(teamMembers.teamId, m.team.id), eq(teamMembers.userId, req.userId!)));
  res.json({ ok: true });
});

/** Owner only: totals per member. */
teamRoutes.get('/dashboard', async (req, res) => {
  const m = await membership(req.userId!);
  if (!m || m.role !== 'owner') throw new HttpError(403, 'Only the team owner can see the dashboard.', 'forbidden');
  const members = await db.select({ id: users.id, name: users.name, role: teamMembers.role, joinedAt: teamMembers.joinedAt }).from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId)).where(eq(teamMembers.teamId, m.team.id)).orderBy(asc(users.name));
  const ids = members.map((x) => x.id);
  const { rows } = await db.execute<Record<string, number | string | null> & { user_id: string }>(sql`
    select u.id as user_id,
      (select count(distinct local_day)::int from activity_events a where a.user_id = u.id and a.local_day > current_date - 7) as days7,
      (select count(distinct local_day)::int from activity_events a where a.user_id = u.id and a.local_day > current_date - 30) as days30,
      (select max(local_day)::text from activity_events a where a.user_id = u.id) as last_active,
      (select count(*)::int from topic_progress tp where tp.user_id = u.id and tp.cards_completed_at is not null and tp.quiz_completed_at is not null) as foundations,
      (select count(*)::int from practice_reps r where r.user_id = u.id and r.answered_at is not null) as reps,
      (select count(*)::int from roleplay_sessions s where s.user_id = u.id and s.status = 'debriefed') as roleplays,
      (select round(avg(score))::int from roleplay_sessions s where s.user_id = u.id and s.status = 'debriefed') as roleplay_avg,
      (select count(*)::int from checkins c where c.user_id = u.id and c.outcome in ('well','mixed')) as wins,
      (select count(*)::int from cpd_records r where r.user_id = u.id) as cpd_modules,
      (select coalesce(sum(planned_minutes), 0)::int from cpd_records r where r.user_id = u.id) as cpd_minutes
    from users u where u.id in ${ids.length ? ids : ['00000000-0000-0000-0000-000000000000']}`);
  const by = new Map(rows.map((r) => [r.user_id, r]));
  const out = members.map((x) => {
    const r = by.get(x.id)!;
    return { name: x.name, role: x.role, joinedAt: x.joinedAt, days7: r.days7, days30: r.days30, lastActive: r.last_active, foundations: r.foundations,
      reps: r.reps, roleplays: r.roleplays, roleplayAvg: r.roleplay_avg, wins: r.wins, cpdModules: r.cpd_modules, cpdHours: Number(r.cpd_minutes) / 60 };
  });
  const sum = (k: keyof (typeof out)[number]) => out.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  res.json({
    team: { name: m.team.name, inviteCode: m.team.inviteCode, members: out.length },
    totals: { activeThisWeek: out.filter((r) => Number(r.days7) > 0).length, foundations: sum('foundations'), reps: sum('reps'), roleplays: sum('roleplays'), wins: sum('wins'),
      cpdModules: sum('cpdModules'), cpdHours: sum('cpdHours') },
    members: out,
  });
});

/** Owner only: every member's completed CPD modules as a CSV for HR (no answers, reflections or notes). */
teamRoutes.get('/cpd.csv', async (req, res) => {
  const m = await membership(req.userId!);
  if (!m || m.role !== 'owner') throw new HttpError(403, 'Only the team owner can export CPD records.', 'forbidden');
  const rows = await db.select({ r: cpdRecords }).from(teamMembers).innerJoin(cpdRecords, eq(cpdRecords.userId, teamMembers.userId))
    .where(eq(teamMembers.teamId, m.team.id)).orderBy(asc(cpdRecords.learnerName), asc(cpdRecords.completedAt));
  const csv = toCsv([
    ['Learner', 'Date completed', 'Topic', 'Level', 'Module', 'CPD hours (planned)', 'Active minutes recorded', 'Questions correct', 'Scenario score', 'Verification code'],
    ...rows.map(({ r }) => [r.learnerName, new Date(r.completedAt).toISOString().slice(0, 10), r.topicName, r.level, r.title, (r.plannedMinutes / 60).toFixed(1),
      r.activeMinutes, `${r.questionsCorrect}/${r.questionsTotal}`, r.scenarioScore ?? '', r.code]),
  ]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${m.team.name.replace(/[^\w -]/g, '').trim() || 'team'}-cpd.csv"`);
  res.send('﻿' + csv);
});
