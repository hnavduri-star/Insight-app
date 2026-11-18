import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '../api';
import { useAuth } from '../auth';
import { CoachAvatar } from '../components/Coach';
import { TopicSheet } from '../components/TopicSheet';
import { COACHES } from '../options';
import { fmtMin } from './Friends';

type HomeData = {
  streak: number;
  reviewsDue: number;
  coach: { kind: string; text: string; checkin?: { id: string } };
  next: { topic: { id: string; name: string; category: string }; label: string; sub: string; minutes: number; path: string; started: boolean } | null;
  league: { friends: number; size: number; me: { rank: number; weekMinutes: number }; ahead: { firstName: string; gap: number } | null };
  myTopics: { id: string; name: string; category: string; label: string; path: string; done: boolean }[];
};

type Card = {
  key: string; eyebrow: string; text: string; coach: boolean; bg: string;
  action?: { label: string; go: () => void }; checkin?: string; choices?: boolean;
};

const BLUE = 'linear-gradient(160deg, #2563eb 0%, #4f46e5 55%, #6d28d9 100%)';
const ORANGE = 'linear-gradient(160deg, #fb7b1c 0%, #d9480f 100%)';
const TEAL = 'linear-gradient(160deg, #11b39f 0%, #0b7a72 100%)';

/**
 * Home: "Today". The coach brings up to 3 cards, one at a time (a check-in or encouragement, the next step,
 * reviews due), swiped through like a short conversation. Below: the 5-minute review and the weekly league.
 */
export default function Home() {
  const { me } = useAuth();
  const nav = useNavigate();
  const [home, setHome] = useState<HomeData | null>(null);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [adding, setAdding] = useState(false);
  const load = () => { api<HomeData>('/home').then((h) => { setHome(h); setI(0); }).catch(() => {}); };
  useEffect(load, []);
  // Arrived from a friend's invite link and just signed up: take them to the league to connect.
  useEffect(() => { try { if (localStorage.getItem('insight.invite')) nav('/friends'); } catch { /* storage blocked */ } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const m = me!;
  const coach = m.coach ?? 'maya';
  const coachName = COACHES.find((c) => c.value === coach)?.name ?? 'Your coach';

  const cards = useMemo<Card[]>(() => {
    if (!home) return [];
    const n = home.next;
    const goNext = n ? () => (n.started || m.plan === 'premium' ? nav(n.path) : setTopicId(n.topic.id)) : () => nav('/explore');
    const nextLabel = n ? (n.started ? n.label : `Start ${n.topic.name}`) : 'Explore skills';
    const list: Card[] = [];
    const k = home.coach.kind;
    if (k === 'start') list.push({ key: 'start', eyebrow: coachName, text: home.coach.text, coach: true, bg: BLUE, choices: true });
    else if (k === 'checkin') list.push({ key: 'checkin', eyebrow: coachName, text: home.coach.text, coach: true, bg: BLUE, checkin: home.coach.checkin!.id });
    else if (k === 'commitment') list.push({ key: 'commit', eyebrow: coachName, text: home.coach.text, coach: true, bg: BLUE, action: { label: 'Talk it through', go: () => nav('/coach') } });
    else list.push({ key: 'coach', eyebrow: coachName, text: home.coach.text, coach: true, bg: BLUE, action: { label: nextLabel, go: goNext } });
    if (list[0].key !== 'coach' && list[0].key !== 'start' && n) {
      list.push({ key: 'next', eyebrow: n.started ? `Continue · ${n.topic.name}` : 'Your first module', text: nextLabel, coach: false, bg: ORANGE,
        action: { label: n.started ? `Go · ${n.minutes} min` : 'Start', go: goNext } });
    }
    if (home.reviewsDue > 0 && list.length < 3) {
      list.push({ key: 'review', eyebrow: 'Keep it fresh', text: `${home.reviewsDue} question${home.reviewsDue === 1 ? ' is' : 's are'} due. Five minutes keeps your tools sharp.`, coach: false, bg: TEAL,
        action: { label: 'Start review', go: () => nav('/daily') } });
    }
    return list.slice(0, 3);
  }, [home, m.plan, coachName, nav]);

  const go = (to: number) => setI(Math.max(0, Math.min(cards.length - 1, to)));
  const card = cards[i];

  return (
    <main className="page page-with-nav flex min-h-dvh flex-col">
      <div className="flex items-center justify-between">
        <h1 className="text-[36px] leading-none">Today</h1>
        {home && home.streak > 0 && (
          <Link to="/daily" className="flex items-center gap-1.5 rounded-full bg-[#ffb36b]/15 px-3 py-1.5 text-sm font-bold text-[#ffb36b]" aria-label={`${home.streak} day streak`}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9Z" /></svg>
            {home.streak} day{home.streak === 1 ? '' : 's'}
          </Link>
        )}
      </div>

      {cards.length > 1 && (
        <div className="mt-4" aria-hidden>
          <div className="flex gap-1.5">{cards.map((c, k) => <span key={c.key} className="h-1.5 flex-1 rounded-full transition" style={{ background: k <= i ? '#3ee6cf' : 'rgba(255,255,255,0.14)' }} />)}</div>
          <div className="mt-2 flex items-center justify-between text-[13px] text-muted">
            <span>{i + 1} of {cards.length} · swipe for more</span>
            {i < cards.length - 1 && <button onClick={() => go(i + 1)} className="-my-2 min-h-[40px] px-1 font-semibold text-ink/85">Next ›</button>}
          </div>
        </div>
      )}

      {/* The coach's cards, one at a time */}
      <div className="relative mt-3 flex min-h-[260px] flex-1 flex-col">
        {cards.length > i + 2 && <div className="absolute inset-0 translate-x-4 translate-y-4 rounded-[32px] bg-white/[0.05]" aria-hidden />}
        {cards.length > i + 1 && <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-[32px] bg-white/[0.08]" aria-hidden />}
        {!home && <div className="absolute inset-0 animate-pulse rounded-[32px] bg-white/[0.06]" aria-hidden />}
        <AnimatePresence mode="popLayout" initial={false}>
          {card && (
            <motion.article key={card.key} aria-roledescription="card" aria-label={`${i + 1} of ${cards.length}`}
              initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -80 }} transition={{ type: 'spring', stiffness: 260, damping: 30 }}
              drag={cards.length > 1 ? 'x' : false} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.5}
              onDragEnd={(_, info) => { if (info.offset.x < -70) go(i + 1); else if (info.offset.x > 70) go(i - 1); }}
              className="relative flex flex-1 flex-col rounded-[32px] p-6 text-white" style={{ background: card.bg, boxShadow: '0 30px 60px -24px rgba(79,70,229,0.8)' }}>
              <div className="flex items-center gap-3">
                {card.coach ? <span className="rounded-full bg-white/20 p-1"><CoachAvatar coach={coach} size={36} idle={false} /></span> : null}
                <span className="text-[14px] font-semibold text-white/85">{card.eyebrow}</span>
              </div>
              <p className={`mt-4 font-display font-medium leading-[1.16] ${card.choices || card.text.length > 70 ? 'text-[clamp(1.35rem,6.2vw,1.7rem)]' : 'text-[clamp(1.55rem,7.4vw,2rem)]'}`}>{card.text}</p>
              <div className="mt-auto space-y-2 pt-4">
                {card.choices ? <StartChoices onPick={(to) => nav(to)} /> : card.checkin ? <CheckinAnswers id={card.checkin} onDone={load} /> : card.action && (
                  <button onClick={card.action.go} className="flex min-h-[54px] w-full items-center justify-center rounded-[18px] bg-white px-4 text-[17px] font-bold text-[#1e3a8a] transition active:scale-[0.98]">
                    <span className="truncate">{card.action.label}</span>
                  </button>
                )}
              </div>
            </motion.article>
          )}
        </AnimatePresence>
      </div>

      {/* Your topics: go back to any course, any time, or add another */}
      {home && home.myTopics.length > 0 && (
        <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="Your topics">
          {home.myTopics.map((t) => (
            <Link key={t.id} to={t.path} className="flex min-h-[44px] shrink-0 items-center gap-2 rounded-full bg-white/[0.07] px-4 text-[14px] font-semibold">
              {t.done && <span className="text-success" aria-label="Foundations done">✓</span>}{t.name}
            </Link>
          ))}
          <button onClick={() => setAdding(true)} className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border border-dashed border-white/30 px-4 text-[14px] font-semibold text-muted">
            <span aria-hidden className="text-lg leading-none">+</span> Add a topic
          </button>
        </div>
      )}

      {/* Two tiles */}
      {home && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Tile to="/daily" bg="rgba(62,230,207,0.12)" icon={<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#3ee6cf" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9 2h6" /></svg>}
            title="5-min review" sub={home.reviewsDue ? `${home.reviewsDue} question${home.reviewsDue === 1 ? '' : 's'} due` : 'Nothing due today'} />
          <Tile to="/friends" bg="rgba(196,181,253,0.14)"
            icon={home.league.friends && (home.league.me.weekMinutes > 0 || home.league.ahead) ? <span className="flex items-baseline gap-1.5"><span className="font-display text-[34px] font-bold leading-none text-[#c4b5fd]">#{home.league.me.rank}</span><span className="text-[13px] font-semibold text-muted">of {home.league.size}</span></span>
              : <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#c4b5fd" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M19 8v6M16 11h6" /></svg>}
            title="Weekly league" sub={!home.league.friends ? 'Invite a friend' : home.league.ahead ? `${fmtMin(home.league.ahead.gap)} behind ${home.league.ahead.firstName}` : home.league.me.weekMinutes ? `Top · ${fmtMin(home.league.me.weekMinutes)} this week` : 'Most time learning wins'} />
        </div>
      )}

      <TopicSheet id={topicId} onClose={() => setTopicId(null)} onChanged={load} />
      <AnimatePresence>
        {adding && (
          <motion.div className="fixed inset-0 z-40 flex items-end bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setAdding(false)}>
            <motion.div role="dialog" aria-label="Add a topic" initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }} onClick={(e) => e.stopPropagation()}
              className="mx-auto w-full max-w-app rounded-t-[28px] bg-[#13235a] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              <p className="font-display text-[22px] font-semibold">Add a topic</p>
              <div className="mt-4"><StartChoices dark onPick={(to) => nav(to)} /></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

/** The two ways to begin: choose a topic yourself, or answer a few questions and get recommendations. */
function StartChoices({ onPick, dark = false }: { onPick: (to: string) => void; dark?: boolean }) {
  const opts = [
    { to: '/explore', title: 'I know what I want', sub: 'Choose any topic and take it at your pace' },
    { to: '/finder', title: 'Help me find out', sub: 'About 10 quick questions, then my recommendations' },
  ];
  return (
    <div className="space-y-2.5">
      {opts.map((o) => (
        <button key={o.to} onClick={() => onPick(o.to)}
          className={`flex min-h-[64px] w-full items-center gap-3 rounded-[18px] px-4 py-3 text-left transition active:scale-[0.98] ${dark ? 'bg-white/[0.08]' : 'bg-white text-[#1e3a8a]'}`}>
          <span className="min-w-0 flex-1"><span className="block text-[16px] font-bold">{o.title}</span><span className={`block text-[13px] ${dark ? 'text-muted' : 'text-[#1e3a8a]/70'}`}>{o.sub}</span></span>
          <span aria-hidden className="text-xl">›</span>
        </button>
      ))}
    </div>
  );
}

function Tile({ to, bg, icon, title, sub }: { to: string; bg: string; icon: ReactNode; title: string; sub: string }) {
  return (
    <Link to={to} className="flex h-[112px] flex-col justify-between rounded-[26px] p-4 transition active:scale-[0.98]" style={{ background: bg }}>
      {icon}
      <span><span className="block text-[16px] font-bold">{title}</span><span className="block truncate text-[13px] text-muted">{sub}</span></span>
    </Link>
  );
}

/** The coach asked "did it happen?": answer in one tap, right on the card. */
function CheckinAnswers({ id, onDone }: { id: string; onDone: () => void }) {
  const [done, setDone] = useState<string | null>(null);
  const answer = async (outcome: 'well' | 'mixed' | 'not_yet') => {
    setDone(outcome === 'not_yet' ? "No problem. I'll ask again in a couple of days." : outcome === 'well' ? 'Brilliant. Real-world win logged.' : 'Thanks for trying it. Every try builds the skill.');
    await api(`/checkins/${id}`, { body: { outcome } }).catch(() => {});
    setTimeout(onDone, 2200);
  };
  if (done) return <p className="text-[15px] font-semibold">{done}</p>;
  return (
    <div className="grid grid-cols-3 gap-2">
      {([['well', 'Went well'], ['mixed', 'Mixed'], ['not_yet', 'Not yet']] as const).map(([v, l]) => (
        <button key={v} onClick={() => answer(v)} className="min-h-[50px] rounded-[16px] bg-white/20 text-[14px] font-bold">{l}</button>
      ))}
    </div>
  );
}
