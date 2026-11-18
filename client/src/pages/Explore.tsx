import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, type Category } from '../api';
import { Alert, Spinner } from '../components/ui';
import { CategoryGlyph, categoryTint, tileBackground } from '../components/CategoryIcon';
import { TopicSheet } from '../components/TopicSheet';

type Started = { id: string; name: string; category: string; label: string; path: string; done: boolean; percent: number; stage: string };
type Mine = { started: Started[]; suggestions: { id: string; name: string; category: string; reason: string }[] };
type FinderResult = { at: string; topics: { id: string; name: string; category: string; reason: string }[] } | null;

type Tab = 'all' | 'find';
type Filter = 'all' | 'picks' | 'fiction' | 'mine';

/**
 * Explore has two tabs:
 * - All topics: every topic, grouped by heading, with the learner's progress on the ones they've started.
 *   They choose what interests them and take topics one by one, whenever they like.
 * - Find my topics: for "what should I do?": suggestions from their goals and the full questionnaire.
 */
export default function Explore() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'find' ? 'find' : 'all';
  const setTab = (t: Tab) => setParams(t === 'find' ? { tab: 'find' } : {}, { replace: true });
  const [cats, setCats] = useState<Category[] | null>(null);
  const [mine, setMine] = useState<Mine | null>(null);
  const [finder, setFinder] = useState<FinderResult>(null);
  const [error, setError] = useState('');
  const [topicId, setTopicId] = useState<string | null>(null);
  const load = () => {
    setError('');
    api<Category[]>('/topics').then(setCats).catch((e) => setError(e.message));
    api<Mine>('/topics/mine').then(setMine).catch(() => {});
    api<{ finder: FinderResult }>('/home').then((h) => setFinder(h.finder)).catch(() => {});
  };
  useEffect(load, []);

  return (
    <main className="page page-with-nav">
      <h1 className="text-[34px] leading-none tracking-tight">Explore</h1>
      <div className="mt-4 grid grid-cols-2 gap-1 rounded-full bg-white/[0.07] p-1" role="tablist" aria-label="Explore">
        {([['all', 'All topics'], ['find', 'Find my topics']] as const).map(([v, l]) => (
          <button key={v} role="tab" aria-selected={tab === v} onClick={() => setTab(v)}
            className={`min-h-[44px] rounded-full text-[15px] font-bold transition ${tab === v ? 'bg-white text-[#1e3a8a]' : 'text-muted'}`}>{l}</button>
        ))}
      </div>
      {error && <div className="mt-4 space-y-3"><Alert>{error}</Alert><button className="btn-ghost w-full" onClick={load}>Try again</button></div>}
      {tab === 'all'
        ? <AllTopics cats={cats} mine={mine} loading={!cats && !error} onOpen={setTopicId} />
        : <FindTopics mine={mine} finder={finder} onOpen={setTopicId} onBrowse={() => setTab('all')} />}
      <TopicSheet id={topicId} onClose={() => setTopicId(null)} onChanged={load} />
    </main>
  );
}

function ProgressBar({ percent, tint }: { percent: number; tint: string }) {
  return (
    <span className="block h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <span className="block h-full rounded-full" style={{ width: `${Math.max(4, percent)}%`, background: tint }} />
    </span>
  );
}

/** Every topic, with progress on the ones the learner has started. */
function AllTopics({ cats, mine, loading, onOpen }: { cats: Category[] | null; mine: Mine | null; loading: boolean; onOpen: (id: string) => void }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const started = useMemo(() => new Map((mine?.started ?? []).map((s) => [s.id, s])), [mine]);
  const total = cats?.reduce((n, c) => n + c.topics.length, 0) ?? 0;
  const term = q.trim().toLowerCase();
  const shown = (cats ?? []).map((c) => ({
    ...c,
    topics: c.topics.filter((t) => (!term || t.name.toLowerCase().includes(term) || c.name.toLowerCase().includes(term))
      && (filter === 'all' || (filter === 'picks' && t.featured) || (filter === 'fiction' && t.fiction) || (filter === 'mine' && started.has(t.id)))),
  })).filter((c) => c.topics.length);

  return (
    <>
      {mine && mine.started.length > 0 && !term && filter === 'all' && (
        <section className="mt-6">
          <h2 className="text-[20px]">Your topics</h2>
          <p className="text-xs text-muted">Pick up any of them, whenever you like.</p>
          <ul className="mt-3 space-y-2">
            {mine.started.slice(0, 4).map((s) => {
              const tint = categoryTint(s.category);
              return (
                <li key={s.id}>
                  <Link to={s.path} className="card flex items-center gap-3 p-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ background: tileBackground(tint) }}>
                      <CategoryGlyph name={s.category} size={20} className="text-white" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2"><span className="truncate font-bold">{s.name}</span><span className="shrink-0 text-xs font-bold" style={{ color: tint }}>{s.percent}%</span></span>
                      <span className="mt-1.5 block"><ProgressBar percent={s.percent} tint={tint} /></span>
                      <span className="mt-1.5 block truncate text-xs text-muted">{s.stage} · Next: {s.label}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {mine.started.length > 4 && <button className="mt-2 text-sm font-bold text-accent" onClick={() => setFilter('mine')}>See all {mine.started.length} of your topics</button>}
        </section>
      )}

      <section className="mt-7">
        <h2 className="text-[20px]">All topics</h2>
        <p className="text-xs text-muted">{total ? `${total} topics from the best books. Tap one to see what's inside.` : 'Topics from the best books.'}</p>
        <label htmlFor="topic-search" className="sr-only">Search topics</label>
        <input id="topic-search" className="field mt-3" type="search" placeholder="Search, e.g. feedback, negotiation" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="radiogroup" aria-label="Filter topics">
          {([['all', 'All'], ['mine', 'Started'], ['picks', "Editor's picks"], ['fiction', 'From fiction']] as const).map(([v, l]) => (
            <button key={v} role="radio" aria-checked={filter === v} onClick={() => setFilter(v)}
              className={`min-h-[40px] shrink-0 rounded-full px-4 text-[14px] font-semibold ${filter === v ? 'bg-accent text-[#0b1640]' : 'bg-white/[0.07]'}`}>{l}</button>
          ))}
        </div>
      </section>

      {loading && <Spinner label="Loading topics" />}
      {cats && shown.length === 0 && <p className="mt-6 text-center text-sm text-muted">No topics match. Try another word.</p>}
      {shown.map((c) => {
        const tint = categoryTint(c.name);
        return (
          <section key={c.id} className="mt-6">
            <button onClick={() => nav(`/skills/${c.id}`)} className="flex items-center gap-2.5 text-left">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: tileBackground(tint) }}><CategoryGlyph name={c.name} size={16} className="text-white" /></span>
              <span className="text-[16px] font-bold">{c.name}</span>
            </button>
            <ul className="mt-2 divide-y divide-white/[0.06] overflow-hidden rounded-[20px] bg-white/[0.04]">
              {c.topics.map((t) => {
                const s = started.get(t.id);
                return (
                  <li key={t.id}>
                    <button onClick={() => (s ? nav(s.path) : onOpen(t.id))} className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left">
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold leading-snug">{t.name}{t.fiction && <span className="ml-1.5 text-[10px] font-bold uppercase text-[#c4b5fd]">fiction</span>}</span>
                        {s && <span className="mt-1.5 block max-w-[12rem]"><ProgressBar percent={s.percent} tint={tint} /></span>}
                      </span>
                      <span className="shrink-0 text-xs font-bold" style={{ color: s ? tint : undefined }}>
                        {s ? (s.done ? `✓ ${s.percent}%` : `${s.percent}%`) : <span className="text-muted">Start ›</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </>
  );
}

/** "What should I learn?": the questionnaire, its results, and suggestions from the learner's goals. */
function FindTopics({ mine, finder, onOpen, onBrowse }: { mine: Mine | null; finder: FinderResult; onOpen: (id: string) => void; onBrowse: () => void }) {
  const started = new Set((mine?.started ?? []).map((s) => s.id));
  return (
    <>
      <section className="tile hero-grad mt-6 p-5">
        <p className="relative text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">Skills questionnaire · about 4 minutes</p>
        <h2 className="relative mt-1 text-[24px] leading-tight text-white">{finder ? 'Want a fresh view?' : 'Not sure what to learn?'}</h2>
        <p className="relative mt-1.5 text-sm text-white/85">About 10 questions about real moments at work: how you handle pushback, feedback, pressure and priorities. I'll recommend the topics that would help you most, and say why.</p>
        <Link to="/finder" className="relative mt-4 flex min-h-[50px] items-center justify-center rounded-[16px] bg-white font-bold text-[#1e3a8a]">{finder ? 'Retake the questionnaire' : 'Start the questionnaire'}</Link>
      </section>

      {finder && finder.topics.length > 0 && (
        <section className="mt-7">
          <h2 className="text-[20px]">From your answers</h2>
          <p className="text-xs text-muted">Answered {new Date(finder.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</p>
          <Suggestions items={finder.topics} started={started} onOpen={onOpen} numbered />
        </section>
      )}

      {mine && mine.suggestions.length > 0 && (
        <section className="mt-7">
          <h2 className="text-[20px]">Quick suggestions</h2>
          <p className="text-xs text-muted">Based on the goals you chose. The questionnaire gives a sharper answer.</p>
          <Suggestions items={mine.suggestions} started={started} onOpen={onOpen} />
        </section>
      )}

      <button className="btn-ghost mt-7 w-full" onClick={onBrowse}>Or browse all topics</button>
    </>
  );
}

function Suggestions({ items, started, onOpen, numbered = false }: { items: { id: string; name: string; category: string; reason: string }[]; started: Set<string>; onOpen: (id: string) => void; numbered?: boolean }) {
  return (
    <ul className="mt-3 space-y-2">
      {items.map((t, i) => {
        const tint = categoryTint(t.category);
        return (
          <li key={t.id}>
            <button onClick={() => onOpen(t.id)} className="card flex w-full items-start gap-3 p-4 text-left">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold text-white" style={{ background: tileBackground(tint) }}>
                {numbered ? i + 1 : <CategoryGlyph name={t.category} size={17} className="text-white" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold leading-snug">{t.name}{started.has(t.id) && <span className="ml-2 text-[11px] font-bold text-success">Started</span>}</span>
                <span className="mt-0.5 block text-[13px] text-muted">{t.reason}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
