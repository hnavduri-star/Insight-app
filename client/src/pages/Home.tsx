import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api, type Category } from '../api';
import { useAuth } from '../auth';
import { Alert, Avatar, Spinner } from '../components/ui';
import { CoachAvatar } from '../components/Coach';
import { CategoryGlyph, categoryTint, tileBackground } from '../components/CategoryIcon';
import { TopicSheet } from '../components/TopicSheet';
import { COACHES, personaLabel } from '../options';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Home() {
  const { me } = useAuth();
  const nav = useNavigate();
  const [cats, setCats] = useState<Category[] | null>(null);
  const [error, setError] = useState('');
  const [topicId, setTopicId] = useState<string | null>(null);
  const load = () => { setError(''); api<Category[]>('/topics').then(setCats).catch((e) => setError(e.message)); };
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
        {me!.plan === 'premium' && <span className="rounded-full bg-[#f5b971]/15 px-3 py-1 text-xs font-bold text-[#f5b971]">Premium</span>}
      </div>

      {!me!.emailVerified && <VerifyBanner />}

      <JourneyCard cats={cats} onOpenTopic={setTopicId} />

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

/** The learner's journey: main goal as the headline, in a vivid hero card. */
function JourneyCard({ cats, onOpenTopic }: { cats: Category[] | null; onOpenTopic: (id: string) => void }) {
  const { me } = useAuth();
  const m = me!;
  const freeTopic = cats?.flatMap((c) => c.topics).find((t) => t.id === m.freeTopicId);
  const coachName = COACHES.find((c) => c.value === m.coach)?.name;
  return (
    <section className="tile hero-grad p-5">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full border-[18px] border-white/10" aria-hidden />
      <div className="pointer-events-none absolute -bottom-16 right-10 h-32 w-32 rounded-full bg-white/10" aria-hidden />
      <div className="relative">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/75">Your learning journey</p>
        <h2 className="mt-2 text-[28px] leading-[1.1]">{m.goals[0] ?? 'Set your goal'}</h2>
        {m.goals.length > 1 && <p className="mt-1.5 text-sm text-white/80">Also: {m.goals.slice(1).join(' · ')}</p>}
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
          {[personaLabel(m.persona), m.industry, m.dailyMinutes && `${m.dailyMinutes} min a day`].filter(Boolean).map((x) => (
            <span key={String(x)} className="rounded-full bg-white/15 px-3 py-1.5 backdrop-blur-sm">{x}</span>
          ))}
        </div>
        {m.coach && (
          <div className="mt-5 flex items-center gap-3 rounded-2xl bg-black/15 p-3 backdrop-blur-sm">
            <CoachAvatar coach={m.coach} size={42} />
            <p className="text-sm leading-snug text-white/90">
              <span className="font-bold text-white">{coachName}:</span>{' '}
              {m.plan === 'premium' ? `Every topic is open. Pick one that matters this week. About ${m.dailyMinutes ?? 5} minutes a bite.`
                : freeTopic ? `${freeTopic.name} is your free topic. Ready for your first bite?`
                : 'Your first topic is on us. Pick the skill that matters most right now.'}
            </p>
          </div>
        )}
        {m.plan === 'free' && freeTopic && (
          <button onClick={() => onOpenTopic(freeTopic.id)}
            className="mt-4 inline-flex min-h-[48px] w-full items-center justify-center rounded-btn bg-white font-bold text-[#1e3a8a] transition active:scale-[0.98]">
            Start {freeTopic.name}
          </button>
        )}
      </div>
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
