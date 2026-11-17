import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '../api';
import { useAuth } from '../auth';
import { CoachAvatar } from '../components/Coach';
import { TopicSheet } from '../components/TopicSheet';
import { COACHES } from '../options';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

type HomeData = {
  streak: number;
  coach: { kind: string; text: string; checkin?: { id: string } };
  next: { topic: { id: string; name: string; category: string }; label: string; sub: string; minutes: number; path: string; started: boolean } | null;
};

/**
 * Home, coach-led: the coach speaks one line about your journey, one big next step, three shortcuts.
 * Everything else lives in Explore, On my mind, Coach and Me.
 */
export default function Home() {
  const { me } = useAuth();
  const nav = useNavigate();
  const [home, setHome] = useState<HomeData | null>(null);
  const [topicId, setTopicId] = useState<string | null>(null);
  const load = () => { api<HomeData>('/home').then(setHome).catch(() => {}); };
  useEffect(load, []);
  // Arrived from a friend's invite link and just signed up: take them to the league to connect.
  useEffect(() => { try { if (localStorage.getItem('insight.invite')) nav('/friends'); } catch { /* storage blocked */ } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const m = me!;
  const coach = m.coach ?? 'maya';
  const coachName = COACHES.find((c) => c.value === coach)?.name ?? 'Your coach';
  const n = home?.next;

  return (
    <main className="page page-with-nav relative overflow-hidden">
      <div className="pointer-events-none absolute -right-28 -top-28 h-80 w-80 rounded-full bg-[#7c3aed]/35 blur-3xl" aria-hidden />

      <div className="relative flex items-center justify-between">
        <p className="text-[15px] text-muted">{greeting()}, {m.name.split(' ')[0]}</p>
        {home && home.streak > 0 && (
          <Link to="/daily" className="flex items-center gap-1.5 rounded-full bg-[#ffb36b]/15 px-3 py-1.5 text-sm font-extrabold text-[#ffb36b]" aria-label={`${home.streak} day streak. Open today's 5 minutes`}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9Z" /></svg>
            {home.streak} day{home.streak === 1 ? '' : 's'}
          </Link>
        )}
      </div>


      {/* The coach speaks */}
      <section className="relative mt-5 flex flex-col items-center text-center" aria-live="polite">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-full p-1.5"
          style={{ background: 'linear-gradient(150deg, #5ec2ff, #7c3aed)', boxShadow: '0 0 0 10px rgba(94,194,255,0.10), 0 24px 50px -18px rgba(124,58,237,0.8)' }}>
          <CoachAvatar coach={coach} size={92} />
        </motion.div>
        <Link to="/coach" className="mt-4 text-[13px] font-bold uppercase tracking-[0.14em] text-accent">{coachName}</Link>
        <AnimatePresence mode="wait">
          {home ? (
            <motion.p key={home.coach.text} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="mt-1.5 max-w-[22rem] text-[24px] font-extrabold leading-[1.2] tracking-[-0.02em]">{home.coach.text}</motion.p>
          ) : <div className="mt-3 h-16 w-64 animate-pulse rounded-2xl bg-white/[0.06]" aria-hidden />}
        </AnimatePresence>
        {home?.coach.checkin && <CheckinAnswers id={home.coach.checkin.id} onDone={load} />}
      </section>

      {/* One next step */}
      {n && (
        <button onClick={() => (n.started || m.plan === 'premium' ? nav(n.path) : setTopicId(n.topic.id))}
          className="relative mt-7 flex w-full items-center gap-4 rounded-[28px] p-4 text-left text-white transition active:scale-[0.99]"
          style={{ background: 'linear-gradient(135deg, #fb7b1c, #d9480f)', boxShadow: '0 22px 44px -20px rgba(251,123,28,0.9)' }}>
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-white/20">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7 5v14l11-7Z" /></svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[19px] font-extrabold leading-tight">{n.started ? n.label : `Start ${n.topic.name}`}</span>
            <span className="block truncate text-sm text-white/90">{n.started ? `${n.topic.name} · ${n.minutes} min` : `Your first module · ${n.minutes} min`}</span>
          </span>
        </button>
      )}

      {/* Three shortcuts */}
      <nav aria-label="Shortcuts" className="relative mt-5 grid grid-cols-3 gap-3">
        <Shortcut to="/explore" label="Learn" tint="#5ec2ff" icon={<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" />} />
        <Shortcut to={n?.started ? `/roleplay/${n.topic.id}` : '/explore'} label="Practise" tint="#ffb36b" icon={<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M16 11l2 2 4-4" /></>} />
        <Shortcut to="/daily" label="5-min review" tint="#3ee6cf" icon={<><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9 2h6" /></>} />
      </nav>

      <TopicSheet id={topicId} onClose={() => setTopicId(null)} onChanged={load} />
    </main>
  );
}

function Shortcut({ to, label, tint, icon }: { to: string; label: string; tint: string; icon: ReactNode }) {
  return (
    <Link to={to} className="flex flex-col items-center gap-2 rounded-2xl py-1 transition active:scale-[0.97]">
      <span className="flex h-16 w-16 items-center justify-center rounded-[22px]" style={{ background: `color-mix(in oklab, ${tint} 16%, transparent)` }}>
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke={tint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{icon}</svg>
      </span>
      <span className="text-sm font-bold">{label}</span>
    </Link>
  );
}

/** The coach asked "did it happen?": answer in one tap, right under the question. */
function CheckinAnswers({ id, onDone }: { id: string; onDone: () => void }) {
  const [done, setDone] = useState<string | null>(null);
  const answer = async (outcome: 'well' | 'mixed' | 'not_yet') => {
    setDone(outcome === 'not_yet' ? "No problem. I'll ask again in a couple of days." : outcome === 'well' ? 'Brilliant. Real-world win logged.' : 'Thanks for trying it. Every try builds the skill.');
    await api(`/checkins/${id}`, { body: { outcome } }).catch(() => {});
    setTimeout(onDone, 2200);
  };
  if (done) return <p className="mt-4 text-sm font-semibold text-accent">{done}</p>;
  return (
    <div className="mt-5 flex flex-wrap justify-center gap-2">
      {([['well', 'Went well'], ['mixed', 'Mixed'], ['not_yet', 'Not yet']] as const).map(([v, l]) => (
        <button key={v} onClick={() => answer(v)} className="min-h-[44px] rounded-full bg-white/[0.08] px-4 text-sm font-bold">{l}</button>
      ))}
    </div>
  );
}
