import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '../api';
import { useAuth } from '../auth';
import { Alert, Spinner } from '../components/ui';
import { CoachAvatar } from '../components/Coach';
import { CategoryGlyph, categoryTint, tileBackground } from '../components/CategoryIcon';
import { COACHES } from '../options';

type Q = { id: string; heading: string | null; text: string; answers: { key: string; text: string }[] };
export type FinderResult = {
  id: string; createdAt: string; note: string | null;
  topics: { id: string; name: string; category: string; reason: string }[];
  headings: { name: string; score: number }[];
};
type Phase = 'intro' | 'round1' | 'round2' | 'note' | 'working' | 'result';

/** "Find my skills": 7 situational questions, 3 follow-ups, then 3 recommended topics with reasons. */
export default function Finder() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const welcome = params.get('welcome') === '1';
  const { me } = useAuth();
  const coach = me?.coach ?? 'maya';
  const coachName = COACHES.find((c) => c.value === coach)?.name ?? 'Your coach';
  const [round1, setRound1] = useState<Q[] | null>(null);
  const [round2, setRound2] = useState<Q[]>([]);
  const [prev, setPrev] = useState<FinderResult | null>(null);
  const [phase, setPhase] = useState<Phase>('intro');
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [result, setResult] = useState<FinderResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ round1: Q[]; latest: FinderResult | null }>('/finder').then((d) => { setRound1(d.round1); setPrev(d.latest); }).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [phase, i]);

  const qs = phase === 'round2' ? round2 : round1 ?? [];
  const q = qs[i];
  const total = (round1?.length ?? 7) + 3;
  const done = phase === 'round1' ? i : phase === 'round2' ? (round1?.length ?? 7) + i : phase === 'intro' ? 0 : total;

  const choose = async (key: string) => {
    const next = { ...answers, [q.id]: key };
    setAnswers(next);
    await new Promise((r) => setTimeout(r, 220)); // let the tap register visually
    if (i + 1 < qs.length) { setI(i + 1); return; }
    if (phase === 'round1') {
      setPhase('working'); setError('');
      try {
        const d = await api<{ round2: Q[] }>('/finder/round2', { body: { answers: next } });
        setRound2(d.round2); setI(0); setPhase(d.round2.length ? 'round2' : 'note');
      } catch (e) { setError((e as Error).message); setPhase('round1'); }
    } else setPhase('note');
  };
  const finish = async () => {
    setPhase('working'); setError('');
    try { setResult(await api<FinderResult>('/finder/result', { body: { answers, note: note.trim() || undefined } })); setPhase('result'); }
    catch (e) { setError((e as Error).message); setPhase('note'); }
  };
  const back = () => {
    if (i > 0) setI(i - 1);
    else if (phase === 'round2') { setPhase('round1'); setI((round1?.length ?? 1) - 1); }
    else if (phase === 'round1') setPhase('intro');
  };
  const leave = () => (welcome ? nav('/', { replace: true }) : nav(-1));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-app flex-col px-4 pb-6" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
      <div className="flex items-center gap-3 py-2">
        <button onClick={phase === 'round1' || phase === 'round2' ? back : leave} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10"
          aria-label={phase === 'round1' || phase === 'round2' ? 'Previous question' : 'Close'}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d="m15 6-6 6 6 6" /></svg>
        </button>
        <div className="flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Find my skills</p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
            <motion.div className="h-full rounded-full bg-accent" animate={{ width: `${(done / total) * 100}%` }} />
          </div>
        </div>
        {welcome && phase !== 'result' && <button className="text-sm font-semibold text-muted" onClick={() => nav('/', { replace: true })}>Skip</button>}
      </div>
      {error && <div className="mt-2"><Alert>{error}</Alert></div>}
      {!round1 && !error && <Spinner />}

      <AnimatePresence mode="wait">
        {phase === 'intro' && round1 && (
          <motion.section key="intro" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col pt-4">
            <div className="tile hero-grad p-6">
              <p className="relative text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">About 2 minutes · 10 questions</p>
              <h1 className="relative mt-2 text-[30px] leading-[1.1]">How would you react?</h1>
              <p className="relative mt-3 text-[15px] leading-relaxed text-white/90">Short moments from work. Pick what you'd most likely do, not what you think is right. There are no wrong answers. Then we'll recommend the 3 skills that will help you most.</p>
            </div>
            <div className="mt-4 flex items-start gap-3">
              <CoachAvatar coach={coach} size={40} />
              <p className="card px-4 py-3 text-sm leading-relaxed"><span className="font-bold">{coachName}:</span> Your answers stay private. They only shape your recommendations.</p>
            </div>
            {prev && (
              <div className="card mt-4 p-4">
                <p className="eyebrow">Last time we recommended</p>
                <p className="mt-1 text-sm font-semibold">{prev.topics.map((t) => t.name).join(' · ')}</p>
                <button className="mt-2 text-sm font-bold text-primary" onClick={() => { setResult(prev); setPhase('result'); }}>See those again</button>
              </div>
            )}
            <button className="btn-primary mt-auto" onClick={() => { setI(0); setPhase('round1'); }}>{prev ? 'Retake the check' : 'Start'}</button>
          </motion.section>
        )}

        {(phase === 'round1' || phase === 'round2') && q && (
          <motion.section key={q.id} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="flex flex-1 flex-col pt-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent">{phase === 'round1' ? `Question ${i + 1} of ${round1!.length}` : `A little more · ${i + 1} of ${round2.length}`}</p>
            {phase === 'round2' && q.heading && <p className="mt-1 text-xs text-muted">About {q.heading.toLowerCase()}</p>}
            <h1 className="mt-2 text-[24px] leading-snug">{q.text}</h1>
            <ul className="mt-6 space-y-2.5">
              {q.answers.map((a) => {
                const on = answers[q.id] === a.key;
                return (
                  <li key={a.key}>
                    <button onClick={() => choose(a.key)} aria-pressed={on}
                      className={`flex min-h-[60px] w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-[15.5px] font-medium transition active:scale-[0.99] ${on ? 'border-accent bg-accent/15' : 'border-white/15 bg-white/5'}`}>
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${on ? 'bg-accent text-[#0b1640]' : 'bg-white/10'}`}>{a.key}</span>
                      {a.text}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-auto pt-6 text-center text-xs text-muted">Go with your first instinct.</p>
          </motion.section>
        )}

        {phase === 'note' && (
          <motion.section key="note" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col pt-4">
            <h1 className="text-[24px] leading-snug">Anything specific you're facing?</h1>
            <p className="mt-1.5 text-sm text-muted">Optional. A sentence helps us fine-tune your picks, e.g. "I have a pay review next month" or "I've just started managing my former peers".</p>
            <label htmlFor="finder-note" className="sr-only">Anything specific you're facing</label>
            <textarea id="finder-note" rows={4} value={note} onChange={(e) => setNote(e.target.value.slice(0, 400))} className="field mt-4 py-3 leading-relaxed" placeholder="Optional" />
            <p className="mt-1.5 text-xs text-muted">{note.trim() ? 'Sent to our AI provider to fine-tune your recommendations.' : 'Leave it blank for instant results.'}</p>
            <button className="btn-primary mt-auto" onClick={finish}>{note.trim() ? 'See my skills' : 'Skip and see my skills'}</button>
          </motion.section>
        )}

        {phase === 'working' && (
          <motion.section key="working" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col items-center justify-center text-center">
            <CoachAvatar coach={coach} size={84} />
            <p className="mt-5 text-lg font-bold">Reading your answers…</p>
          </motion.section>
        )}

        {phase === 'result' && result && (
          <motion.section key="result" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-1 flex-col pt-2">
            <h1 className="text-[26px] leading-tight">Your 3 skills to build</h1>
            <p className="mt-1 text-sm text-muted">Based on how you said you'd react{result.note ? ' and what you told us' : ''}. Start with number one.</p>
            <ol className="mt-4 space-y-3">
              {result.topics.map((t, n) => {
                const tint = categoryTint(t.category);
                return (
                  <motion.li key={t.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: n * 0.12 }}>
                    <button onClick={() => nav(`/bite/${t.id}`)} className={`w-full text-left ${n === 0 ? 'tile p-5' : 'card p-4'}`} style={n === 0 ? { background: tileBackground(tint) } : undefined}>
                      {n === 0 && <CategoryGlyph name={t.category} size={110} className="absolute -right-4 -top-3 text-white/15" />}
                      <span className="relative flex items-center gap-3">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${n === 0 ? 'bg-white text-[#1e3a8a]' : ''}`}
                          style={n === 0 ? undefined : { background: `color-mix(in oklab, ${tint} 22%, transparent)`, color: tint }}>{n + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className={`block font-extrabold leading-tight ${n === 0 ? 'text-[20px]' : 'text-[16px]'}`}>{t.name}</span>
                          <span className={`mt-0.5 block text-[13px] ${n === 0 ? 'text-white/90' : 'text-muted'}`}>{t.reason}</span>
                        </span>
                      </span>
                      {n === 0 && <span className="relative mt-4 flex min-h-[46px] items-center justify-center rounded-btn bg-white font-bold text-[#1e3a8a]">Start {t.name}</span>}
                    </button>
                  </motion.li>
                );
              })}
            </ol>
            {result.headings.some((h) => h.score > 0) && (
              <section className="card mt-5 p-4">
                <p className="eyebrow">Where you have most room to grow</p>
                <ul className="mt-2 space-y-2">
                  {result.headings.filter((h) => h.score > 0).slice(0, 4).map((h) => {
                    const max = result.headings[0].score || 1;
                    return (
                      <li key={h.name}>
                        <p className="text-sm">{h.name}</p>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full" style={{ background: categoryTint(h.name) }} initial={{ width: 0 }} animate={{ width: `${(h.score / max) * 100}%` }} /></div>
                      </li>
                    );
                  })}
                </ul>
                {prev && prev.id !== result.id && <p className="mt-3 text-xs text-muted">Last time your top area was {prev.headings[0]?.name ?? '–'}.</p>}
              </section>
            )}
            <button className="btn-ghost mt-5 w-full" onClick={() => nav('/', { replace: true })}>Go to Home</button>
            <button className="mt-1 min-h-[44px] text-sm text-muted" onClick={() => { setAnswers({}); setNote(''); setI(0); setPhase('round1'); }}>Retake</button>
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}
