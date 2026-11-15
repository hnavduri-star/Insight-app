import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { api, type Category, type TopicDetail } from '../api';
import { useAuth } from '../auth';
import { Alert, Avatar, Spinner } from '../components/ui';
import { Sheet } from '../components/Sheet';
import { CoachAvatar } from '../components/Coach';
import { CategoryIcon, categoryTint } from '../components/CategoryIcon';
import { COACHES, personaLabel } from '../options';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Home() {
  const { me } = useAuth();
  const [cats, setCats] = useState<Category[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [topicId, setTopicId] = useState<string | null>(null);

  const load = () => { setError(''); api<Category[]>('/topics').then(setCats).catch((e) => setError(e.message)); };
  useEffect(load, []);
  const total = cats?.reduce((n, c) => n + c.topics.length, 0) ?? 0;

  return (
    <main className="page page-with-nav">
      <Link to="/profile" className="-m-1 mb-5 flex items-center gap-3 rounded-card p-1" aria-label="Open profile">
        <Avatar name={me!.name} />
        <div>
          <p className="text-sm text-muted">{greeting()},</p>
          <p className="font-display text-[22px] font-semibold leading-tight">{me!.name.split(' ')[0]}</p>
        </div>
      </Link>

      {!me!.emailVerified && <VerifyBanner />}

      <JourneyCard />

      <div className="mb-3 mt-8 flex items-end justify-between">
        <div>
          <p className="eyebrow">Explore</p>
          <h2 className="mt-1 text-xl font-semibold">Skills to build</h2>
        </div>
        {cats && <span className="text-xs text-muted">{total} topics</span>}
      </div>

      {error && <div className="space-y-3"><Alert>{error}</Alert><button className="btn-ghost w-full" onClick={load}>Try again</button></div>}
      {!cats && !error && <Spinner label="Loading topics" />}
      <ul className="space-y-3">
        {cats?.map((c, ci) => {
          const isOpen = !!open[c.id];
          const tint = categoryTint(c.name);
          return (
            <motion.li key={c.id} className="card overflow-hidden" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: ci * 0.035 }}>
              <button className="flex min-h-[72px] w-full items-center gap-3.5 px-4 py-3.5 text-left" aria-expanded={isOpen}
                onClick={() => setOpen({ ...open, [c.id]: !isOpen })}>
                <CategoryIcon name={c.name} emoji={c.icon} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-snug">{c.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {c.topics.slice(0, 2).map((t) => t.name).join(' · ')}{c.topics.length > 2 && ` · +${c.topics.length - 2}`}
                  </span>
                </span>
                <motion.svg animate={{ rotate: isOpen ? 180 : 0 }} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-muted" aria-hidden>
                  <path d="m6 9 6 6 6-6" />
                </motion.svg>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.ul initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.22 }}
                    className="overflow-hidden" style={{ background: 'rgba(6,16,42,0.25)' }}>
                    {c.topics.map((t) => (
                      <li key={t.id} className="border-t border-white/[0.05]">
                        <button onClick={() => setTopicId(t.id)} className="flex min-h-[50px] w-full items-center gap-3 px-4 text-left text-[15px] transition hover:bg-white/[0.03]">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tint }} aria-hidden />
                          <span className="flex-1">{t.name}</span>
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted/70" aria-hidden><path d="m9 6 6 6-6 6" /></svg>
                        </button>
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </motion.li>
          );
        })}
      </ul>
      <TopicSheet id={topicId} onClose={() => setTopicId(null)} />
    </main>
  );
}

/** The learner's own journey: what they're working towards and how much time they have. */
function JourneyCard() {
  const { me } = useAuth();
  const m = me!;
  const coachName = COACHES.find((c) => c.value === m.coach)?.name;
  return (
    <section className="card relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary/15 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-24 -left-10 h-48 w-48 rounded-full bg-accent/10 blur-3xl" aria-hidden />
      <div className="relative">
        <p className="eyebrow">Your learning journey</p>
        <h2 className="mt-1.5 text-[24px] font-semibold leading-tight">{m.goal ?? 'Set your goal'}</h2>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {[personaLabel(m.persona), m.industry, m.dailyMinutes && `${m.dailyMinutes} min a day`].filter(Boolean).map((x) => (
            <span key={String(x)} className="surface rounded-full px-3 py-1.5 text-ink/90">{x}</span>
          ))}
        </div>
        {m.coach && (
          <div className="mt-5 flex items-center gap-3 border-t border-white/[0.06] pt-4">
            <CoachAvatar coach={m.coach} size={44} />
            <p className="text-sm leading-relaxed text-muted">
              <span className="font-medium text-ink">{coachName}:</span> Pick a skill that matters this week. Each bite takes about {m.dailyMinutes ?? 5} minutes and is shaped around your goal.
            </p>
          </div>
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

/** A matte "book" tile: a coloured cover with a spine, so sources read as books, not a list. */
function BookCover({ title, tint }: { title: string; tint: string }) {
  return (
    <span aria-hidden className="relative flex h-14 w-10 shrink-0 items-end overflow-hidden rounded-[4px] rounded-r-[6px] p-1"
      style={{ background: `linear-gradient(150deg, ${tint}cc, ${tint}55)`, boxShadow: 'inset 3px 0 0 rgba(0,0,0,0.25), 0 4px 10px -4px rgba(0,0,0,0.6)' }}>
      <span className="font-display text-[11px] font-semibold leading-none text-white/90">{title.replace(/^(The|A) /, '')[0]}</span>
    </span>
  );
}

function TopicSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { me } = useAuth();
  const [t, setT] = useState<TopicDetail | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setT(null); setError('');
    if (id) api<TopicDetail>(`/topics/${id}`).then(setT).catch((e) => setError(e.message));
  }, [id]);
  const tint = t ? categoryTint(t.category) : '#5ec2ff';
  return (
    <Sheet open={!!id} onClose={onClose} title={t?.name ?? 'Topic'}>
      {error && <Alert>{error}</Alert>}
      {!t && !error && <Spinner />}
      {t && (
        <div>
          <div className="flex items-center gap-3">
            <CategoryIcon name={t.category} emoji={t.icon} size={40} />
            <p className="eyebrow">{t.category}</p>
          </div>
          <h3 className="mt-3 text-[28px] font-semibold leading-tight">{t.name}</h3>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            Not a summary. Your bite blends the best ideas from these books into one practical framework,
            shaped for {me?.persona ? `a ${personaLabel(me.persona).toLowerCase()}` : 'you'}
            {me?.goal ? ` who wants to ${me.goal.charAt(0).toLowerCase()}${me.goal.slice(1)}` : ''}.
          </p>

          <ul className="mt-5 grid grid-cols-3 gap-2 text-center text-xs">
            {[['Learn', 'Key ideas'], ['Practise', 'Quick quiz'], ['Apply', 'Real scenario']].map(([a, b], i) => (
              <li key={a} className="surface rounded-input px-2 py-2.5">
                <span className="block font-semibold" style={{ color: i === 0 ? tint : undefined }}>{a}</span>
                <span className="text-muted">{b}</span>
              </li>
            ))}
          </ul>

          <p className="eyebrow mt-6">Drawn from</p>
          <ul className="mt-2.5 space-y-2.5">
            {t.books.map((b) => (
              <li key={b.title} className="flex items-center gap-3.5">
                <BookCover title={b.title} tint={tint} />
                <span>
                  <span className="block font-medium leading-snug">{b.title}</span>
                  {b.author && <span className="text-xs text-muted">{b.author}</span>}
                </span>
              </li>
            ))}
          </ul>
          <button className="btn-primary mt-7" disabled>Your first bite is coming soon</button>
        </div>
      )}
    </Sheet>
  );
}
