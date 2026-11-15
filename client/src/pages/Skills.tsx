import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api, type Category } from '../api';
import { useAuth } from '../auth';
import { Alert, Spinner } from '../components/ui';
import { CategoryGlyph, categoryTint, tileBackground } from '../components/CategoryIcon';
import { LockIcon, TopicSheet } from '../components/TopicSheet';

/** One heading: a colour header and its topics, each with its one-line scope. */
export default function Skills() {
  const { id } = useParams();
  const { me } = useAuth();
  const [cats, setCats] = useState<Category[] | null>(null);
  const [error, setError] = useState('');
  const [topicId, setTopicId] = useState<string | null>(null);
  const load = () => { api<Category[]>('/topics').then(setCats).catch((e) => setError(e.message)); };
  useEffect(load, []);
  const c = cats?.find((x) => x.id === id);
  const tint = c ? categoryTint(c.name) : '#5ec2ff';

  return (
    <main className="page-with-nav mx-auto w-full max-w-app">
      {error && <div className="page"><Alert>{error}</Alert></div>}
      {!cats && !error && <div className="page"><Spinner /></div>}
      {cats && !c && <div className="page"><Alert>Heading not found.</Alert></div>}
      {c && (
        <>
          <header className="relative overflow-hidden rounded-b-[32px] px-4 pb-7" style={{ background: tileBackground(tint), paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
            <CategoryGlyph name={c.name} size={190} className="absolute -right-8 top-4 text-white/15" />
            <Link to="/" className="relative inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/20 text-white backdrop-blur-sm" aria-label="Back">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M15 18l-6-6 6-6" /></svg>
            </Link>
            <h1 className="relative mt-8 text-[32px] leading-[1.05] text-white">{c.name}</h1>
            <p className="relative mt-2 text-sm font-medium text-white/80">{c.topics.length} topics · each one a distinct skill</p>
          </header>
          <ul className="mt-4 space-y-2.5 px-4">
            {c.topics.map((t, i) => (
              <motion.li key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.025 }}>
                <button onClick={() => setTopicId(t.id)} className="card flex w-full items-center gap-3.5 p-4 text-left transition active:scale-[0.99]">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-extrabold"
                    style={{ background: `color-mix(in oklab, ${tint} 22%, transparent)`, color: tint }}>{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-bold leading-snug">{t.name}</span>
                      {t.free && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase text-accent">Free</span>}
                      {!t.unlocked && me!.freeTopicId && <LockIcon />}
                    </span>
                    {t.description && <span className="mt-0.5 block text-[13px] leading-snug text-muted">{t.description}</span>}
                  </span>
                </button>
              </motion.li>
            ))}
          </ul>
        </>
      )}
      <TopicSheet id={topicId} onClose={() => setTopicId(null)} onChanged={load} />
    </main>
  );
}
