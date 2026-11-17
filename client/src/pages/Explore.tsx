import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api, type Category } from '../api';
import { Alert, Spinner } from '../components/ui';
import { CategoryGlyph, categoryTint, tileBackground } from '../components/CategoryIcon';
import { TopicSheet } from '../components/TopicSheet';

type ExploreData = {
  finder: { at: string; topics: { id: string; name: string; category: string; reason: string }[] } | null;
  picks: { id: string; name: string; description: string | null; category: string; unlocked: boolean }[];
  fiction: { id: string; name: string; category: string; book: string; author: string | null; unlocked: boolean }[];
};

function Row({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-[20px]">{title}</h2>
      <p className="text-xs text-muted">{sub}</p>
      <div className="-mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">{children}</div>
    </section>
  );
}

/** Explore: everything to learn. Your recommended skills, Editor's picks, lessons from fiction and all skills. */
export default function Explore() {
  const nav = useNavigate();
  const [cats, setCats] = useState<Category[] | null>(null);
  const [data, setData] = useState<ExploreData | null>(null);
  const [error, setError] = useState('');
  const [topicId, setTopicId] = useState<string | null>(null);
  const load = () => {
    setError('');
    api<Category[]>('/topics').then(setCats).catch((e) => setError(e.message));
    api<ExploreData>('/home').then(setData).catch(() => {});
  };
  useEffect(load, []);
  const total = cats?.reduce((n, c) => n + c.topics.length, 0) ?? 0;

  return (
    <main className="page page-with-nav">
      <h1 className="text-[34px] leading-none tracking-tight">Explore</h1>
      <p className="mt-2 text-sm text-muted">{total ? `${total} skills from the best books` : 'Skills from the best books'}</p>

      {data && (data.finder ? (
        <section className="mt-6">
          <div className="flex items-baseline justify-between"><h2 className="text-[20px]">For you</h2><Link to="/finder" className="text-xs font-bold text-primary">Retake the check</Link></div>
          <div className="-mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {data.finder.topics.map((t, i) => (
              <button key={t.id} onClick={() => setTopicId(t.id)} className="tile flex h-[150px] w-[230px] shrink-0 snap-start flex-col justify-between p-4 text-left" style={{ background: tileBackground(categoryTint(t.category)) }}>
                <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/25 text-sm font-extrabold">{i + 1}</span>
                <span className="relative"><span className="block text-[17px] font-extrabold leading-tight">{t.name}</span><span className="mt-1 block text-xs text-white/85">{t.reason}</span></span>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <Link to="/finder" className="tile hero-grad mt-6 flex items-center gap-4 p-5">
          <span className="relative flex-1">
            <span className="block text-[20px] font-extrabold leading-tight">Not sure where to start?</span>
            <span className="mt-1 block text-sm text-white/85">10 quick questions, 3 skills picked for you</span>
          </span>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" className="relative" aria-hidden><path d="m9 6 6 6-6 6" /></svg>
        </Link>
      ))}

      {data && data.picks.length > 0 && (
        <Row title="Editor's picks" sub="Hand-checked flagship topics">
          {data.picks.map((p) => (
            <button key={p.id} onClick={() => setTopicId(p.id)} className="card relative flex h-[132px] w-[150px] shrink-0 snap-start flex-col justify-between overflow-hidden p-3.5 text-left">
              <span className="absolute inset-x-0 top-0 h-1" style={{ background: categoryTint(p.category) }} aria-hidden />
              <CategoryGlyph name={p.category} size={22} className="mt-1" />
              <span className="text-[15px] font-extrabold leading-tight">{p.name}</span>
            </button>
          ))}
        </Row>
      )}

      {data && data.fiction.length > 0 && (
        <Row title="Lessons from fiction" sub="What great novels teach about work and life">
          {data.fiction.map((f) => {
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
        </Row>
      )}

      <h2 className="mb-3 mt-8 text-[20px]">All skills</h2>
      {error && <div className="space-y-3"><Alert>{error}</Alert><button className="btn-ghost w-full" onClick={load}>Try again</button></div>}
      {!cats && !error && <Spinner label="Loading skills" />}
      <ul className="grid grid-cols-2 gap-3">
        {cats?.map((c, i) => (
          <motion.li key={c.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
            <button onClick={() => nav(`/skills/${c.id}`)} className="tile flex h-[150px] w-full flex-col justify-between p-4 text-left transition active:scale-[0.97]"
              style={{ background: tileBackground(categoryTint(c.name)) }}>
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
        ))}
      </ul>
      <TopicSheet id={topicId} onClose={() => setTopicId(null)} onChanged={load} />
    </main>
  );
}
