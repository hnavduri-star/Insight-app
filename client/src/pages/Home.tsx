import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { api, type Category, type TopicDetail } from '../api';
import { useAuth } from '../auth';
import { Alert, Avatar, Spinner } from '../components/ui';
import { Sheet } from '../components/Sheet';
import { personaLabel } from '../options';

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

  return (
    <main className="page page-with-nav">
      <Link to="/profile" className="mb-6 flex items-center gap-3 rounded-card p-1 -m-1" aria-label="Open profile">
        <Avatar name={me!.name} />
        <div>
          <p className="text-sm text-muted">{greeting()},</p>
          <p className="text-xl font-bold tracking-tight">{me!.name.split(' ')[0]}</p>
        </div>
        {me!.persona && <span className="ml-auto rounded-full border border-line px-3 py-1 text-xs text-muted">{personaLabel(me!.persona)}</span>}
      </Link>

      {!me!.emailVerified && <VerifyBanner />}

      <h2 className="mb-3 mt-2 text-lg font-semibold">All topics</h2>
      {error && <div className="space-y-3"><Alert>{error}</Alert><button className="btn-ghost w-full" onClick={load}>Try again</button></div>}
      {!cats && !error && <Spinner label="Loading topics" />}
      <ul className="space-y-3">
        {cats?.map((c) => {
          const isOpen = !!open[c.id];
          return (
            <li key={c.id} className="card overflow-hidden">
              <button className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left" aria-expanded={isOpen}
                onClick={() => setOpen({ ...open, [c.id]: !isOpen })}>
                <span className="text-2xl" aria-hidden>{c.icon}</span>
                <span className="flex-1">
                  <span className="block font-semibold leading-tight">{c.name}</span>
                  <span className="text-xs text-muted">{c.topics.length} topics</span>
                </span>
                <motion.svg animate={{ rotate: isOpen ? 180 : 0 }} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted" aria-hidden>
                  <path d="m6 9 6 6 6-6" />
                </motion.svg>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.ul initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
                    {c.topics.map((t) => (
                      <li key={t.id} className="border-t border-line/60">
                        <button onClick={() => setTopicId(t.id)} className="flex min-h-[48px] w-full items-center justify-between px-4 text-left text-[15px] hover:bg-bg/30">
                          {t.name}
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted" aria-hidden><path d="m9 6 6 6-6 6" /></svg>
                        </button>
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
      <TopicSheet id={topicId} onClose={() => setTopicId(null)} />
    </main>
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

function TopicSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [t, setT] = useState<TopicDetail | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setT(null); setError('');
    if (id) api<TopicDetail>(`/topics/${id}`).then(setT).catch((e) => setError(e.message));
  }, [id]);
  return (
    <Sheet open={!!id} onClose={onClose} title={t?.name ?? 'Topic'}>
      {error && <Alert>{error}</Alert>}
      {!t && !error && <Spinner />}
      {t && (
        <div>
          <p className="text-sm text-muted">{t.icon} {t.category}</p>
          <h3 className="mt-1 text-2xl font-bold tracking-tight">{t.name}</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Your lesson combines the key ideas of these three books into one Insight Framework, tailored to you.
          </p>
          <ul className="mt-4 space-y-2">
            {t.books.map((b) => (
              <li key={b.title} className="flex items-center gap-3 rounded-input border border-line bg-bg/40 px-3 py-2.5">
                <span className="text-lg" aria-hidden>📘</span>
                <span>
                  <span className="block font-medium leading-tight">{b.title}</span>
                  {b.author && <span className="text-xs text-muted">{b.author}</span>}
                </span>
              </li>
            ))}
          </ul>
          <button className="btn-primary mt-6" disabled>Lesson coming soon</button>
        </div>
      )}
    </Sheet>
  );
}
