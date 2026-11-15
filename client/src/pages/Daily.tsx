import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { api, type Daily as DailyT, type Week as WeekT } from '../api';
import { useAuth } from '../auth';
import { Alert, Spinner } from '../components/ui';
import { CoachAvatar } from '../components/Coach';
import { categoryTint, tileBackground } from '../components/CategoryIcon';
import { COACHES } from '../options';

const FLAME = 'linear-gradient(155deg, #ff9f43 0%, #f0506e 100%)';

/** Streak badge: 🔥 count and freezes. */
export function StreakPill({ streak, freezes }: { streak: number; freezes: number }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-bold" aria-label={`${streak} day streak, ${freezes} freeze${freezes === 1 ? '' : 's'}`}>
      <span aria-hidden>🔥</span>{streak}
      <span className="text-xs font-semibold text-muted" aria-hidden>· ❄️ {freezes}</span>
    </span>
  );
}

/** The 5-minute daily session: spaced review questions, then one practice rep. */
export default function Daily() {
  const nav = useNavigate();
  const { me } = useAuth();
  const coach = me?.coach ?? 'maya';
  const coachName = COACHES.find((c) => c.value === coach)?.name ?? 'Your coach';
  const [d, setD] = useState<DailyT | null>(null);
  const [error, setError] = useState('');
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [right, setRight] = useState(0);
  const [done, setDone] = useState<{ streak: number; freezes: number; usedFreeze: boolean; earnedFreeze: boolean } | null>(null);
  useEffect(() => { api<DailyT>('/daily').then(setD).catch((e) => setError(e.message)); }, []);

  const finish = async () => {
    try { setDone(await api('/daily/complete', { body: {} })); } catch (e) { setError((e as Error).message); }
  };
  const answer = async (opt: number) => {
    if (!d || picked !== null) return;
    const q = d.reviews[i];
    setPicked(opt);
    const correct = opt === q.answer;
    if (correct) setRight((n) => n + 1);
    api(`/daily/review/${q.id}`, { body: { correct } }).catch(() => {});
  };
  const next = () => {
    if (!d) return;
    setPicked(null);
    if (i + 1 < d.reviews.length) setI(i + 1); else { setI(d.reviews.length); finish(); }
  };

  const q = d?.reviews[i];
  const tint = q ? categoryTint(q.category) : '#ff9f43';
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-app flex-col px-4 pb-6" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
      <div className="flex items-center gap-3 py-2">
        <button onClick={() => nav(-1)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10" aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <div className="flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Today's 5 minutes</p>
          {d && d.reviews.length > 0 && (
            <div className="mt-1 flex gap-1">{d.reviews.map((_, k) => <span key={k} className="h-1.5 flex-1 rounded-full" style={{ background: k < i || (k === i && picked !== null) ? tint : 'rgba(255,255,255,0.12)' }} />)}</div>
          )}
        </div>
        {d && <StreakPill streak={done?.streak ?? d.streak} freezes={done?.freezes ?? d.freezes} />}
      </div>
      {error && <Alert>{error}</Alert>}
      {!d && !error && <Spinner />}

      <AnimatePresence mode="wait">
        {d && q && (
          <motion.section key={q.id} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="flex flex-1 flex-col pt-3">
            <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: tint }}>Review · {q.topic}</p>
            <h1 className="mt-2 text-[22px] leading-snug">{q.q}</h1>
            <ul className="mt-5 space-y-2.5">
              {q.options.map((o, k) => {
                const state = picked === null ? '' : k === q.answer ? 'right' : k === picked ? 'wrong' : 'dim';
                return (
                  <li key={k}><button onClick={() => answer(k)} disabled={picked !== null}
                    className={`card w-full px-4 py-3.5 text-left text-[15px] font-medium transition ${state === 'dim' ? 'opacity-50' : ''}`}
                    style={state === 'right' ? { boxShadow: 'inset 0 0 0 2px #22c55e', background: 'rgba(34,197,94,0.14)' } : state === 'wrong' ? { boxShadow: 'inset 0 0 0 2px #f0506e', background: 'rgba(240,80,110,0.12)' } : undefined}>
                    {o}
                  </button></li>
                );
              })}
            </ul>
            {picked !== null && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
                <p className="text-sm font-bold" style={{ color: picked === q.answer ? '#22c55e' : '#f0506e' }}>
                  {picked === q.answer ? `Right. Next review in ${q.intervalDays >= 21 ? 21 : [1, 3, 7, 21].find((x) => x > q.intervalDays)} days.` : 'Not quite. This one comes back tomorrow.'}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{q.why}</p>
                <button className="btn-primary mt-5" onClick={next}>{i + 1 < d.reviews.length ? 'Next' : 'Finish review'}</button>
              </motion.div>
            )}
          </motion.section>
        )}

        {d && !q && (
          <motion.section key="done" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-1 flex-col pt-4">
            <div className="tile p-6 text-center" style={{ background: FLAME }}>
              <motion.p className="relative text-6xl" initial={{ scale: 0.6 }} animate={{ scale: [0.6, 1.15, 1] }} transition={{ duration: 0.6 }} aria-hidden>🔥</motion.p>
              <p className="relative mt-2 text-[34px] font-extrabold leading-none">{done?.streak ?? d.streak} day{(done?.streak ?? d.streak) === 1 ? '' : 's'}</p>
              <p className="relative mt-1 text-sm font-semibold text-white/85">
                {done?.earnedFreeze ? 'Streak milestone: you earned a freeze ❄️' : done?.usedFreeze ? 'A freeze saved your streak ❄️'
                  : done || d.activeToday ? 'Streak kept for today' : 'Do one practice rep to keep your streak today'}
              </p>
            </div>
            <div className="mt-4 flex items-start gap-3">
              <CoachAvatar coach={coach} size={40} />
              <p className="card px-4 py-3 text-sm leading-relaxed">
                <span className="font-bold">{coachName}:</span>{' '}
                {d.reviews.length ? `${right} of ${d.reviews.length} right. ${right === d.reviews.length ? 'Those tools are sticking.' : 'The ones you missed come back tomorrow.'}`
                  : d.reviewItems ? 'Nothing due for review today. Your next questions come back soon.' : 'Finish a toolkit quiz and its questions join your daily review.'}
                {d.dueTotal > d.reviews.length ? ` ${d.dueTotal - d.reviews.length} more ${d.dueTotal - d.reviews.length === 1 ? 'is' : 'are'} waiting for tomorrow.` : ''}
              </p>
            </div>
            {d.rep && (
              <Link to={`/practice/${d.rep.topicId}`} className="tile mt-4 flex items-center gap-4 p-4" style={{ background: tileBackground(categoryTint(d.rep.category)) }}>
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-xl" aria-hidden>🎯</span>
                <span className="relative flex-1"><span className="block font-extrabold">One practice rep</span><span className="block text-sm text-white/85">2 minutes on {d.rep.topic}</span></span>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" className="relative" aria-hidden><path d="m9 6 6 6-6 6" /></svg>
              </Link>
            )}
            <div className="mt-auto space-y-2 pt-6">
              <Link to="/week" className="btn-ghost flex w-full items-center justify-center">See your week</Link>
              <button className="btn-ghost w-full" onClick={() => nav('/')}>Done</button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}

/** The weekly summary: days active, what was done, scores and a focus for next week. */
export function Week() {
  const nav = useNavigate();
  const [w, setW] = useState<WeekT | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<WeekT>('/daily/week').then(setW).catch((e) => setError(e.message)); }, []);
  return (
    <main className="mx-auto w-full max-w-app px-4 pb-8" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
      <div className="flex items-center gap-3 py-2">
        <button onClick={() => nav(-1)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10" aria-label="Back">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d="m15 6-6 6 6 6" /></svg>
        </button>
        <h1 className="flex-1 text-[22px]">Your week</h1>
        {w && <StreakPill streak={w.streak} freezes={w.freezes} />}
      </div>
      {error && <Alert>{error}</Alert>}
      {!w && !error && <Spinner />}
      {w && (
        <>
          <section className="tile mt-2 p-5" style={{ background: tileBackground('#5ec2ff') }}>
            <p className="relative text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">Last 7 days</p>
            <p className="relative mt-1 text-[30px] font-extrabold leading-none">{w.daysActive}/7 <span className="text-base font-semibold text-white/85">days active</span></p>
            <div className="relative mt-4 grid grid-cols-7 gap-1.5">
              {w.days.map((d) => (
                <div key={d.day} className="flex flex-col items-center gap-1.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full text-sm" style={{ background: d.active ? '#fff' : 'rgba(0,0,0,0.2)', color: d.active ? '#f0506e' : 'rgba(255,255,255,0.5)' }}
                    aria-label={`${d.weekday}: ${d.active ? 'active' : 'not active'}`}>{d.active ? '🔥' : '·'}</span>
                  <span className="text-[11px] font-semibold text-white/80">{d.weekday.slice(0, 2)}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="mt-4 grid grid-cols-2 gap-2.5">
            {[['Real-world wins', w.wins], ['Reps avg', w.avgRep], ['Role-play avg', w.avgRoleplay], ['Review accuracy', w.reviewAccuracy != null ? `${w.reviewAccuracy}%` : null]].map(([label, v]) => (
              <div key={String(label)} className="card p-3 text-center"><p className="text-[22px] font-extrabold">{v ?? '–'}</p><p className="text-[11px] font-semibold text-muted">{label}</p></div>
            ))}
          </section>
          <section className="card mt-4 p-4">
            <p className="eyebrow">What you did</p>
            {w.counts.length ? (
              <ul className="mt-2 space-y-1.5">{w.counts.map((c) => <li key={c.kind} className="flex justify-between text-sm"><span>{c.label}</span><span className="font-bold">{c.n}</span></li>)}</ul>
            ) : <p className="mt-2 text-sm text-muted">Nothing yet this week.</p>}
          </section>
          {w.topics.length > 0 && (
            <section className="mt-4">
              <p className="eyebrow">Topics you worked on</p>
              <ul className="mt-2 space-y-2">
                {w.topics.map((t) => (
                  <li key={t.id} className="card flex items-center gap-3 px-4 py-3">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: categoryTint(t.category) }} aria-hidden />
                    <span className="flex-1 truncate font-semibold">{t.name}</span>
                    {t.avg != null && <span className="text-xs font-bold text-muted">avg {t.avg}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="mt-4 rounded-2xl border border-primary/30 bg-primary/10 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-primary">Focus for next week</p>
            <p className="mt-1 text-[15px] leading-relaxed">{w.focus}</p>
          </section>
          <Link to="/daily" className="btn-primary mt-5 flex items-center justify-center">Do today's 5 minutes</Link>
        </>
      )}
    </main>
  );
}
