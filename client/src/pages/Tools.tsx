import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { Alert, Spinner } from '../components/ui';
import { categoryTint, tileBackground } from '../components/CategoryIcon';

type Tool = { name: string; source: string; idea: string; steps: string[]; say: string[]; tryThis: string };
type Library = { topic: { id: string; name: string; category: string }; sets: { level: 'toolkit' | 'mastery'; framework: string; tools: Tool[] }[] };

/** Quick reference: every tool on a topic at a glance, with steps and what to say. */
export default function Tools() {
  const { topicId } = useParams();
  const nav = useNavigate();
  const [lib, setLib] = useState<Library | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { api<Library>(`/bites/library/${topicId}`).then(setLib).catch((e) => setError(e.message)); }, [topicId]);
  const tint = categoryTint(lib?.topic.category ?? '');
  return (
    <main className="mx-auto w-full max-w-app px-4 pb-10" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
      <div className="flex items-center gap-3 py-2">
        <button onClick={() => nav(-1)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10" aria-label="Back">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d="m15 6-6 6 6 6" /></svg>
        </button>
        <div className="min-w-0"><p className="eyebrow">Quick reference</p><h1 className="truncate text-[20px]">{lib?.topic.name ?? ''}</h1></div>
      </div>
      {error && <Alert>{error}</Alert>}
      {!lib && !error && <Spinner />}
      {lib && !lib.sets.length && <Alert kind="info">Open the toolkit first. Your tools appear here once it's built.</Alert>}
      {lib?.sets.map((set) => (
        <section key={set.level} className="mt-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: tint }}>{set.level === 'mastery' ? 'Mastery tools' : 'Foundations tools'}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">{set.framework}</p>
          <ul className="mt-3 space-y-2">
            {set.tools.map((tool, i) => {
              const key = `${set.level}-${i}`;
              const isOpen = open === key;
              return (
                <li key={key} className="card overflow-hidden">
                  <button className="flex w-full items-center gap-3 p-4 text-left" onClick={() => setOpen(isOpen ? null : key)} aria-expanded={isOpen}>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white" style={{ background: tileBackground(tint) }}>{i + 1}</span>
                    <span className="min-w-0 flex-1"><span className="block font-bold">{tool.name}</span><span className="block truncate text-xs text-muted">{tool.source}</span></span>
                    <span className="text-muted" aria-hidden>{isOpen ? '−' : '+'}</span>
                  </button>
                  {isOpen && (
                    <div className="space-y-3 px-4 pb-4 text-[15px] leading-relaxed">
                      <p className="text-ink/90">{tool.idea}</p>
                      <ol className="list-decimal space-y-1 pl-5 text-sm">{tool.steps.map((s) => <li key={s}>{s}</li>)}</ol>
                      <div className="rounded-2xl bg-white p-3 text-[#0b1640]">
                        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em]">What to say</p>
                        {tool.say.map((s) => <p key={s} className="mt-1 text-sm font-semibold">“{s.replace(/^["“]|["”]$/g, '')}”</p>)}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </main>
  );
}
