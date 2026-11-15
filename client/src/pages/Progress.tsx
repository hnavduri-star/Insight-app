import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../api';
import { Alert, Spinner } from '../components/ui';
import { categoryTint } from '../components/CategoryIcon';

type Rubric = { clarity: number; empathy: number; structure: number; tools: number };
export type ProgressData = {
  level: { n: number; name: string; xp: number; floor: number; next: { name: string; at: number } | null };
  streak: number; longestStreak: number; wins: number;
  topics: { id: string; name: string; category: string; level: string; step: number; reps: number; bestRoleplay: number | null; confidence: { before: number | null; now: number | null } }[];
  skills: { sessions: number; current: Rubric | null; first: Rubric | null; history: (Rubric & { at: string; score: number })[] };
  badges: { key: string; name: string; emoji: string; description: string; earned: boolean }[];
};

const AXES: [keyof Rubric, string][] = [['clarity', 'Clarity'], ['empathy', 'Empathy'], ['structure', 'Structure'], ['tools', 'Tools']];

/** A 4-axis skill chart: your latest role-plays against your first ones. */
export function SkillChart({ current, first, size = 260 }: { current: Rubric; first: Rubric | null; size?: number }) {
  const c = size / 2, R = size / 2 - 58;
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 2;
    return [c + Math.cos(a) * R * (v / 100), c + Math.sin(a) * R * (v / 100)];
  };
  const poly = (r: Rubric) => AXES.map(([k], i) => pt(i, r[k]).join(',')).join(' ');
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size }} className="mx-auto block" role="img"
      aria-label={`Skill chart. ${AXES.map(([k, l]) => `${l} ${current[k]}`).join(', ')}${first ? `. First sessions: ${AXES.map(([k, l]) => `${l} ${first[k]}`).join(', ')}` : ''}`}>
      {[25, 50, 75, 100].map((g) => <polygon key={g} points={AXES.map((_, i) => pt(i, g).join(',')).join(' ')} fill="none" stroke="rgba(255,255,255,0.1)" />)}
      {AXES.map((_, i) => { const [x, y] = pt(i, 100); return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="rgba(255,255,255,0.1)" />; })}
      {first && <polygon points={poly(first)} fill="rgba(157,179,220,0.12)" stroke="#9db3dc" strokeDasharray="4 4" strokeWidth="1.5" />}
      <motion.polygon points={poly(current)} fill="rgba(94,194,255,0.28)" stroke="#5ec2ff" strokeWidth="2.5" strokeLinejoin="round"
        initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} style={{ transformOrigin: `${c}px ${c}px` }} />
      {AXES.map(([k, l], i) => {
        const [x, y] = pt(i, i % 2 ? 140 : 124);
        return (
          <text key={k} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="fill-current text-[12px] font-bold">
            <tspan x={x} dy="-0.5em">{l}</tspan><tspan x={x} dy="1.25em" fill="#5ec2ff">{current[k]}</tspan>
          </text>
        );
      })}
    </svg>
  );
}

export function LevelBar({ level }: { level: ProgressData['level'] }) {
  const pct = level.next ? Math.min(100, ((level.xp - level.floor) / (level.next.at - level.floor)) * 100) : 100;
  return (
    <div>
      <div className="flex items-baseline justify-between"><p className="text-[22px] font-extrabold">Level {level.n} · {level.name}</p><p className="text-sm font-bold text-muted">{level.xp} XP</p></div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.9 }} /></div>
      <p className="mt-1.5 text-xs text-muted">{level.next ? `${level.next.at - level.xp} XP to ${level.next.name}` : 'Top level reached'}</p>
    </div>
  );
}

/** "How confident are you now?" (1-10), stored for the before/after view. */
export function ConfidenceNow({ topicId, topicName, onSaved }: { topicId: string; topicName: string; onSaved?: (n: number) => void }) {
  const [v, setV] = useState<number | null>(null);
  const pick = (n: number) => { setV(n); api('/bites/confidence', { body: { topicId, score: n, when: 'now' } }).then(() => onSaved?.(n)).catch(() => {}); };
  return (
    <div>
      <p className="text-sm font-bold">How confident do you feel at {topicName.toLowerCase()} now?</p>
      <div className="mt-2 grid grid-cols-10 gap-1" role="radiogroup" aria-label="Confidence from 1 to 10">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button key={n} role="radio" aria-checked={v === n} onClick={() => pick(n)} className="h-9 rounded-lg text-sm font-bold"
            style={{ background: v === n ? '#5ec2ff' : 'rgba(255,255,255,0.07)', color: v === n ? '#0b1640' : undefined }}>{n}</button>
        ))}
      </div>
      {v && <p className="mt-1.5 text-xs text-muted">Saved to your progress.</p>}
    </div>
  );
}

export default function Progress() {
  const nav = useNavigate();
  const [p, setP] = useState<ProgressData | null>(null);
  const [error, setError] = useState('');
  const [rating, setRating] = useState<string | null>(null);
  const load = () => api<ProgressData>('/progress').then(setP).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  const earned = p?.badges.filter((b) => b.earned).length ?? 0;
  return (
    <main className="mx-auto w-full max-w-app px-4 pb-10" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
      <div className="flex items-center gap-3 py-2">
        <button onClick={() => nav(-1)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10" aria-label="Back">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d="m15 6-6 6 6 6" /></svg>
        </button>
        <h1 className="text-[22px]">Your progress</h1>
      </div>
      {error && <Alert>{error}</Alert>}
      {!p && !error && <Spinner />}
      {p && (
        <>
          <section className="card mt-2 p-5"><LevelBar level={p.level} />
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[['🔥', p.streak, 'day streak'], ['📅', p.longestStreak, 'longest'], ['🏆', p.wins, 'real-world wins']].map(([e, n, l]) => (
                <div key={String(l)} className="rounded-2xl bg-white/[0.05] p-2.5"><p className="text-lg font-extrabold"><span aria-hidden>{e}</span> {n}</p><p className="text-[11px] text-muted">{l}</p></div>
              ))}
            </div>
          </section>

          <section className="card mt-4 p-5">
            <p className="eyebrow">Your conversation skills</p>
            {p.skills.current ? (
              <>
                <SkillChart current={p.skills.current} first={p.skills.first} />
                <p className="mt-1 text-center text-xs text-muted">
                  {p.skills.first ? <>Solid line: your last 3 role-plays · dashed: your first 3</> : `From ${p.skills.sessions} role-play${p.skills.sessions === 1 ? '' : 's'}. After 4, you'll see how far you've come.`}
                </p>
              </>
            ) : <p className="mt-2 text-sm text-muted">Finish a role-play to see your clarity, empathy, structure and use of tools here. It grows as you practise.</p>}
          </section>

          {p.topics.length > 0 && (
            <section className="mt-4">
              <p className="eyebrow">Your topics</p>
              <ul className="mt-2 space-y-2">
                {p.topics.map((t) => {
                  const tint = categoryTint(t.category);
                  return (
                    <li key={t.id} className="card p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate font-bold">{t.name}</p>
                        <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: `color-mix(in oklab, ${tint} 22%, transparent)`, color: tint }}>{t.level}</span>
                      </div>
                      <div className="mt-2 flex gap-1" aria-label={`${t.level}: step ${t.step + 1} of 5`}>
                        {[0, 1, 2, 3, 4].map((i) => <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i <= t.step ? tint : 'rgba(255,255,255,0.1)' }} />)}
                      </div>
                      <p className="mt-2 text-xs text-muted">
                        {t.reps} rep{t.reps === 1 ? '' : 's'}{t.bestRoleplay != null ? ` · best role-play ${t.bestRoleplay}` : ''}
                        {t.confidence.before != null && <> · confidence {t.confidence.before}{t.confidence.now != null ? <> → <span className="font-bold text-ink">{t.confidence.now}</span></> : ''}/10</>}
                      </p>
                      {t.reps >= 3 && (rating === t.id
                        ? <div className="mt-3"><ConfidenceNow topicId={t.id} topicName={t.name} onSaved={() => { setTimeout(() => setRating(null), 900); load(); }} /></div>
                        : <button className="mt-2 text-xs font-bold text-primary" onClick={() => setRating(t.id)}>Rate your confidence now</button>)}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-xs text-muted">Levels: Started → Foundations → Practitioner (10 reps) → Advanced (role-play 70+) → Expert (Mastery).</p>
            </section>
          )}

          <section className="mt-5">
            <div className="flex items-baseline justify-between"><p className="eyebrow">Badges</p><p className="text-xs text-muted">{earned}/{p.badges.length}</p></div>
            <ul className="mt-2 grid grid-cols-3 gap-2">
              {p.badges.map((b) => (
                <li key={b.key} className={`card flex flex-col items-center p-3 text-center ${b.earned ? '' : 'opacity-45'}`} title={b.description}>
                  <span className={`text-2xl ${b.earned ? '' : 'grayscale'}`} aria-hidden>{b.emoji}</span>
                  <span className="mt-1 text-[12px] font-bold leading-tight">{b.name}</span>
                  <span className="mt-0.5 text-[10px] leading-snug text-muted">{b.earned ? 'Earned' : b.description}</span>
                </li>
              ))}
            </ul>
          </section>
          <Link to="/week" className="btn-ghost mt-5 flex w-full items-center justify-center">See your week</Link>
        </>
      )}
    </main>
  );
}
