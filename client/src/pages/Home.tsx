import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api, type Category, type Checkin, type Daily } from '../api';
import { useAuth } from '../auth';
import { Alert, Avatar, Spinner } from '../components/ui';
import { CoachAvatar } from '../components/Coach';
import { CategoryGlyph, categoryTint, tileBackground } from '../components/CategoryIcon';
import { TopicSheet } from '../components/TopicSheet';
import { FeedbackSheet } from '../components/Feedback';
import { COACHES, personaLabel } from '../options';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

type HomeData = {
  askFeedback: boolean;
  level: { n: number; name: string; xp: number };
  next: { topic: { id: string; name: string; category: string }; label: string; sub: string; minutes: number; path: string; started: boolean } | null;
  picks: { id: string; name: string; description: string | null; category: string; unlocked: boolean }[];
  fiction: { id: string; name: string; category: string; book: string; author: string | null; unlocked: boolean }[];
};

export default function Home() {
  const { me } = useAuth();
  const nav = useNavigate();
  const [cats, setCats] = useState<Category[] | null>(null);
  const [home, setHome] = useState<HomeData | null>(null);
  const [error, setError] = useState('');
  const [topicId, setTopicId] = useState<string | null>(null);
  const [fb, setFb] = useState(false);
  const [fbDone, setFbDone] = useState(false);
  const load = () => {
    setError('');
    api<Category[]>('/topics').then(setCats).catch((e) => setError(e.message));
    api<HomeData>('/home').then(setHome).catch(() => {});
  };
  useEffect(load, []);
  const total = cats?.reduce((n, c) => n + c.topics.length, 0) ?? 0;

  return (
    <main className="page page-with-nav">
      <div className="mb-5 flex items-center justify-between">
        <Link to="/profile" className="-m-1 flex items-center gap-3 rounded-card p-1" aria-label="Open profile">
          <Avatar name={me!.name} />
          <div>
            <p className="text-sm text-muted">{greeting()},</p>
            <p className="font-display text-[22px] leading-tight">{me!.name.split(' ')[0]}</p>
          </div>
        </Link>
        {home && <Link to="/progress" className="ml-auto mr-2 rounded-full bg-white/[0.07] px-3 py-1 text-xs font-bold" aria-label={`Level ${home.level.n}, ${home.level.name}, ${home.level.xp} XP. Open your progress`}>Lv {home.level.n} · {home.level.xp} XP</Link>}
        {me!.planSource === 'beta' ? <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-bold text-accent">Free beta</span>
          : me!.plan === 'premium' && <span className="rounded-full bg-[#f5b971]/15 px-3 py-1 text-xs font-bold text-[#f5b971]">Premium</span>}
      </div>

      {!me!.emailVerified && <VerifyBanner />}

      <NextStepCard home={home} onOpenTopic={setTopicId} />
      {home?.askFeedback && !fbDone && (
        <button onClick={() => setFb(true)} className="card mt-3 flex w-full items-center gap-3 p-4 text-left">
          <span className="text-2xl" aria-hidden>💬</span>
          <span className="flex-1"><span className="block font-bold">You've been learning for a few days</span><span className="block text-sm text-muted">Tell us what's working: 3 quick questions</span></span>
          <Chevron />
        </button>
      )}
      <FeedbackSheet open={fb} onClose={() => setFb(false)} onSent={() => setFbDone(true)} />
      <CheckinCard />
      <DailyCard />

      <Link to="/situation" className="card mt-3 flex items-center gap-4 p-4 transition active:scale-[0.99]">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl" style={{ background: 'rgba(240,90,126,0.18)' }} aria-hidden>⚡</span>
        <span className="flex-1">
          <span className="block font-extrabold">I have a situation</span>
          <span className="block text-sm text-muted">A tough talk coming up? Get a plan, the words and a rehearsal.</span>
        </span>
        <Chevron />
      </Link>

      {home && home.picks.length > 0 && (
        <TopicRow title="Editor's picks" sub="Hand-checked flagship topics">
          {home.picks.map((p) => {
            const tint = categoryTint(p.category);
            return (
              <button key={p.id} onClick={() => setTopicId(p.id)} className="card relative flex h-[132px] w-[150px] shrink-0 snap-start flex-col justify-between overflow-hidden p-3.5 text-left">
                <span className="absolute inset-x-0 top-0 h-1" style={{ background: tint }} aria-hidden />
                <CategoryGlyph name={p.category} size={22} className="mt-1" />
                <span className="text-[15px] font-extrabold leading-tight">{p.name}</span>
              </button>
            );
          })}
        </TopicRow>
      )}

      {home && home.fiction.length > 0 && (
        <TopicRow title="Lessons from fiction" sub="What great novels teach about work and life">
          {home.fiction.map((f) => {
            const tint = categoryTint(f.category);
            return (
              <button key={f.id} onClick={() => setTopicId(f.id)} className="flex w-[118px] shrink-0 snap-start flex-col text-left">
                <span className="relative flex h-[150px] w-full items-end overflow-hidden rounded-[6px] rounded-r-[10px] p-2.5"
                  style={{ background: `linear-gradient(150deg, color-mix(in oklab, ${tint} 70%, #0b1640), #0b1640)`, boxShadow: 'inset 4px 0 0 rgba(0,0,0,0.3), 0 8px 18px -8px rgba(0,0,0,0.7)' }}>
                  <span className="text-[13px] font-extrabold leading-tight text-white">{f.book}</span>
                </span>
                <span className="mt-1.5 text-xs font-bold leading-snug" style={{ color: tint }}>{f.name}</span>
              </button>
            );
          })}
        </TopicRow>
      )}

      <div className="mb-3 mt-8 flex items-end justify-between">
        <h2 className="text-[22px]">Skills to build</h2>
        {cats && <span className="text-xs font-medium text-muted">{total} topics</span>}
      </div>

      {error && <div className="space-y-3"><Alert>{error}</Alert><button className="btn-ghost w-full" onClick={load}>Try again</button></div>}
      {!cats && !error && <Spinner label="Loading topics" />}
      <ul className="grid grid-cols-2 gap-3">
        {cats?.map((c, i) => {
          const tint = categoryTint(c.name);
          return (
            <motion.li key={c.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <button onClick={() => nav(`/skills/${c.id}`)} className="tile flex h-[150px] w-full flex-col justify-between p-4 text-left transition active:scale-[0.97]"
                style={{ background: tileBackground(tint) }}>
                <CategoryGlyph name={c.name} size={96} className="absolute -right-4 -top-3 text-white/15" />
                <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
                  <CategoryGlyph name={c.name} size={21} className="text-white" />
                </span>
                <span className="relative">
                  <span className="block text-[15px] font-extrabold leading-tight">{c.name}</span>
                  <span className="mt-1 block text-xs font-medium text-white/75">{c.topics.length} topics</span>
                </span>
              </button>
            </motion.li>
          );
        })}
      </ul>
      <TopicSheet id={topicId} onClose={() => setTopicId(null)} onChanged={load} />
    </main>
  );
}

const Chevron = () => <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" className="shrink-0 text-muted" aria-hidden><path d="m9 6 6 6-6 6" /></svg>;

function TopicRow({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="text-[20px]">{title}</h2>
      <p className="text-xs text-muted">{sub}</p>
      <div className="-mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">{children}</div>
    </section>
  );
}

/** The one vivid card on Home: the single best next step. */
function NextStepCard({ home, onOpenTopic }: { home: HomeData | null; onOpenTopic: (id: string) => void }) {
  const { me } = useAuth();
  const nav = useNavigate();
  const m = me!;
  const coachName = COACHES.find((c) => c.value === m.coach)?.name;
  const n = home?.next;
  if (!home) return <section className="tile hero-grad h-[210px] animate-pulse" aria-hidden />;
  return (
    <section className="tile hero-grad p-5">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full border-[18px] border-white/10" aria-hidden />
      <div className="relative">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">{n?.started ? `Continue · ${n.topic.name}` : 'Your next step'}</p>
        <h2 className="mt-2 text-[28px] leading-[1.1]">{n ? n.label : 'Pick a skill to start'}</h2>
        <p className="mt-1.5 text-sm text-white/85">{n ? `${n.sub} · ${n.minutes} min` : 'Choose a topic below.'}</p>
        {m.goals[0] && <p className="mt-3 inline-block rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold">For your goal: {m.goals[0]}</p>}
        {n && (
          <button onClick={() => (n.started || m.plan === 'premium' ? nav(n.path) : onOpenTopic(n.topic.id))}
            className="mt-4 inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-btn bg-white font-bold text-[#1e3a8a] transition active:scale-[0.98]">
            {n.started ? 'Continue' : 'Start'} <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>
        )}
        {m.coach && !n?.started && (
          <div className="mt-4 flex items-center gap-3">
            <CoachAvatar coach={m.coach} size={34} />
            <p className="text-[13px] leading-snug text-white/90"><span className="font-bold text-white">{coachName}:</span> {n ? `${n.topic.name} is the best place to start for your goal.` : 'Your first topic is on us.'}</p>
          </div>
        )}
      </div>
    </section>
  );
}

/** "Did you use it?": a real-world check-in that's due. */
function CheckinCard() {
  const [c, setC] = useState<Checkin | null>(null);
  const [step, setStep] = useState<'ask' | 'note' | 'done'>('ask');
  const [outcome, setOutcome] = useState<Checkin['outcome']>(null);
  const [note, setNote] = useState('');
  useEffect(() => { api<Checkin[]>('/checkins/due').then((d) => setC(d[0] ?? null)).catch(() => {}); }, []);
  if (!c) return null;
  const send = (o: NonNullable<Checkin['outcome']>, n?: string) => api(`/checkins/${c.id}`, { body: { outcome: o, note: n || undefined } }).catch(() => {});
  const answer = (o: NonNullable<Checkin['outcome']>) => {
    setOutcome(o);
    if (o === 'not_yet') { setStep('done'); send(o); } else setStep('note');
  };
  const saveNote = () => { setStep('done'); send(outcome!, note.trim()); };
  return (
    <section className="card mt-3 p-4">
      {step === 'ask' && <>
        <p className="eyebrow">Did you use it?</p>
        <p className="mt-1 font-bold leading-snug">{c.question}</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {([['well', 'Went well', '🙌'], ['mixed', 'Mixed', '🤔'], ['not_yet', 'Not yet', '⏳']] as const).map(([v, l, e]) => (
            <button key={v} onClick={() => answer(v)} className="rounded-2xl bg-white/[0.06] px-2 py-2.5 text-sm font-bold"><span className="block text-lg" aria-hidden>{e}</span>{l}</button>
          ))}
        </div>
      </>}
      {step === 'note' && <>
        <p className="font-bold">{outcome === 'well' ? 'Brilliant. What happened?' : 'Thanks for trying it. What happened?'}</p>
        <label htmlFor="checkin-note" className="sr-only">What happened</label>
        <textarea id="checkin-note" rows={2} value={note} onChange={(e) => setNote(e.target.value.slice(0, 400))} placeholder="Optional: one line for your own record" className="field mt-2 py-2.5" />
        <button className="btn-primary mt-2" onClick={saveNote}>{note.trim() ? 'Save' : 'Skip and save'}</button>
      </>}
      {step === 'done' && <p className="text-sm font-semibold">{outcome === 'not_yet' ? "No problem. I'll ask again in a couple of days." : outcome === 'well' ? '🎉 Real-world win logged. +25 XP' : 'Logged. Every try builds the skill. +25 XP'}</p>}
    </section>
  );
}

/** Daily return: streak, today's 5 minutes and the week. Orange always means the daily habit. */
function DailyCard() {
  const [d, setD] = useState<Daily | null>(null);
  useEffect(() => { api<Daily>('/daily').then(setD).catch(() => {}); }, []);
  if (!d) return null;
  const due = d.dueTotal;
  return (
    <section className="mt-3 grid grid-cols-[1fr_auto] gap-3">
      <Link to="/daily" className="card flex items-center gap-3 p-4 transition active:scale-[0.99]" style={{ boxShadow: 'inset 3px 0 0 #ff9f43' }}>
        <span className="text-[28px]" aria-hidden>🔥</span>
        <span className="min-w-0">
          <span className="block text-[17px] font-extrabold leading-tight text-[#ffb36b]">{d.streak} day streak</span>
          <span className="block truncate text-sm text-muted">
            {d.dailyDone ? "Today's 5 minutes done ✓" : due ? `${Math.min(due, 4)} review${due === 1 ? '' : 's'} due today` : d.activeToday ? 'Kept for today' : "Today's 5 minutes"}
          </span>
        </span>
      </Link>
      <Link to="/week" className="card flex w-[92px] flex-col items-center justify-center p-3 text-center transition active:scale-[0.98]">
        <span className="text-lg" aria-hidden>📈</span>
        <span className="mt-0.5 text-xs font-bold">Your week</span>
        <span className="text-[11px] text-muted">❄️ {d.freezes} freeze{d.freezes === 1 ? '' : 's'}</span>
      </Link>
    </section>
  );
}

function VerifyBanner() {
  const [sent, setSent] = useState(false);
  return (
    <div className="mb-5">
      <Alert kind="info">
        Please verify your email.{' '}
        {sent ? <span className="text-muted">Link sent. Check your inbox.</span> : (
          <button className="link" onClick={() => api('/auth/resend-verification', { body: {} }).then(() => setSent(true)).catch(() => {})}>Resend link</button>
        )}
      </Alert>
    </div>
  );
}
