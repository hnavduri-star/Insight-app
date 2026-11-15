import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { api, ApiError, type TopicDetail } from '../api';
import { useAuth } from '../auth';
import { Alert } from '../components/ui';
import { CoachAvatar } from '../components/Coach';
import { CategoryGlyph, categoryTint, tileBackground } from '../components/CategoryIcon';
import { Paywall } from '../components/Paywall';
import { COACHES, personaLabel } from '../options';

type Tool = {
  name: string; source: string; idea: string; steps: string[]; say: string[];
  caseStudy: { situation: string; action: string; result: string }; tryThis: string;
};
type BiteData = {
  title: string; framework: string; scenario: string; tools: Tool[];
  quiz: { q: string; options: string[]; answer: number; why: string }[];
};
type Started = { lessonId: string; topic: { id: string; name: string; category: string }; bite: BiteData; cached: boolean };
type Grade = { score: number; feedback: string; strength: string; improve: string; toolsUsed: string[]; modelAnswer: string };
type Phase = 'loading' | 'error' | 'intro' | 'tools' | 'quiz' | 'scenario' | 'done';

/** Wraps a phrase in curly quotes, without doubling quotes the AI already added. */
const quoted = (s: string) => `“${s.trim().replace(/^["“']+|["”']+$/g, '')}”`;

function Section({ label, color, children }: { label: string; color: string; children: ReactNode }) {
  return (
    <div className="mt-5">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.14em]" style={{ color }}>{label}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export default function Bite() {
  const { topicId } = useParams();
  const [params] = useSearchParams();
  const level = params.get('level') === 'mastery' ? 'mastery' : 'toolkit';
  const nav = useNavigate();
  const { me } = useAuth();
  const coach = me?.coach ?? 'maya';
  const coachName = COACHES.find((c) => c.value === coach)?.name ?? 'Your coach';

  const [phase, setPhase] = useState<Phase>('loading');
  const [topic, setTopic] = useState<TopicDetail | null>(null);
  const [data, setData] = useState<Started | null>(null);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [ti, setTi] = useState(0);
  const [dir, setDir] = useState(1);
  const [helpful, setHelpful] = useState<Record<number, boolean>>({});
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const [answer, setAnswer] = useState('');
  const [grading, setGrading] = useState(false);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [gradeErr, setGradeErr] = useState('');
  const started = useRef(false);

  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  /** Starts (or joins) building the toolkit, checking back every few seconds until it's ready. */
  const start = async () => {
    setPhase('loading'); setError(null);
    const began = Date.now();
    let blips = 0;
    try {
      while (alive.current) {
        let d: Started | { status: 'generating' };
        try {
          d = await api<Started | { status: 'generating' }>('/bites', { body: { topicId, level } });
          blips = 0;
        } catch (e) {
          // A brief network or hosting hiccup (no connection, 502/503/504) shouldn't end the wait:
          // the toolkit keeps building on the server, so just check again.
          const s = (e as ApiError).status;
          if ((s === 0 || (s >= 502 && s <= 504)) && blips < 8 && Date.now() - began < 6 * 60_000) {
            blips++;
            await new Promise((r) => setTimeout(r, 4000));
            continue;
          }
          throw e;
        }
        if ('status' in d) {
          if (Date.now() - began > 6 * 60_000) throw new ApiError(504, 'This is taking longer than usual. Please try again in a minute.');
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        if (!alive.current) return;
        setData(d); setPhase('intro');
        return;
      }
    } catch (e) {
      if (!alive.current) return;
      const err = e as ApiError;
      setError({ message: err.message, code: err.code }); setPhase('error');
    }
  };
  useEffect(() => {
    if (started.current) return; started.current = true;
    api<TopicDetail>(`/topics/${topicId}`).then(setTopic).catch(() => {});
    start();
  }, [topicId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { window.scrollTo(0, 0); }, [ti, phase, qi]);

  const category = data?.topic.category ?? topic?.category ?? '';
  const tint = categoryTint(category);
  const bite = data?.bite;
  const nT = bite?.tools.length ?? 6;
  const nQ = bite?.quiz.length ?? 5;
  const total = nT + nQ + 1;
  const step = { loading: 0, error: 0, intro: 0, tools: 1 + ti, quiz: 1 + nT + qi, scenario: total, done: total }[phase];
  const close = () => nav(-1);

  const goTool = (to: number) => {
    if (!bite) return;
    if (to >= nT) {
      api(`/bites/${data!.lessonId}/progress`, { body: { stage: 'cards' } }).catch(() => {});
      setPhase('quiz'); return;
    }
    if (to < 0) { setPhase('intro'); return; }
    setDir(to > ti ? 1 : -1); setTi(to);
  };
  const rate = (i: number, v: boolean) => {
    setHelpful((h) => ({ ...h, [i]: v }));
    api(`/bites/${data!.lessonId}/feedback`, { body: { cardIndex: i, helpful: v } }).catch(() => {});
  };
  const pick = (i: number) => {
    if (picked !== null || !bite) return;
    setPicked(i);
    if (i === bite.quiz[qi].answer) setCorrect((c) => c + 1);
  };
  const nextQuestion = () => {
    if (!bite) return;
    if (qi + 1 >= nQ) {
      api(`/bites/${data!.lessonId}/progress`, { body: { stage: 'quiz', correct } }).catch(() => {});
      setPhase('scenario'); return;
    }
    setQi(qi + 1); setPicked(null);
  };
  const submit = async () => {
    setGrading(true); setGradeErr('');
    try { setGrade(await api<Grade>(`/bites/${data!.lessonId}/scenario`, { body: { response: answer } })); }
    catch (e) { setGradeErr((e as Error).message); } finally { setGrading(false); }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-app flex-col px-4 pb-6" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
      {/* Top bar: close + segmented progress (tools, questions, practice) */}
      <div className="sticky top-0 z-10 -mx-4 flex items-center gap-3 px-4 py-2 backdrop-blur-md" style={{ background: 'rgba(10, 22, 64, 0.85)' }}>
        <button onClick={close} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-ink" aria-label="Close bite">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <div className="flex flex-1 gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={step} aria-label="Bite progress">
          {Array.from({ length: total }, (_, i) => (
            <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <motion.div className="h-full rounded-full" style={{ background: tint }} initial={false} animate={{ width: i < step ? '100%' : '0%' }} />
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {phase === 'loading' && (
          <motion.section key="loading" exit={{ opacity: 0 }} className="flex flex-1 flex-col items-center justify-center text-center">
            <Loading topic={topic} coach={coach} persona={personaLabel(me?.persona ?? null)} tint={tint} mastery={level === 'mastery'} />
          </motion.section>
        )}

        {phase === 'error' && error && (
          <motion.section key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-1 flex-col justify-center gap-4">
            <div className="flex items-end gap-3"><CoachAvatar coach={coach} size={56} />
              <p className="card px-4 py-3 text-sm">{error.code === 'ai_disabled' ? "Bites aren't switched on yet. Once the AI key is added, I'll build them for you." : error.code === 'daily_limit' ? "That's plenty of learning for today. Come back tomorrow!" : 'Something got in the way while I was building your toolkit.'}</p>
            </div>
            <Alert>{error.message}</Alert>
            {!['ai_disabled', 'premium_required', 'daily_limit'].includes(error.code ?? '') && <button className="btn-primary" onClick={start}>Try again</button>}
            <button className="btn-ghost w-full" onClick={close}>Back</button>
            <Paywall open={error.code === 'premium_required'} onClose={close} topicName={topic?.name} />
          </motion.section>
        )}

        {phase === 'intro' && bite && (
          <motion.section key="intro" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -30 }} className="flex flex-1 flex-col">
            <div className="tile mt-3 p-6" style={{ background: tileBackground(tint) }}>
              <CategoryGlyph name={category} size={200} className="absolute -right-10 -top-6 text-white/15" />
              <div className="relative">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/75">{data!.topic.name} · {level === 'mastery' ? 'mastery toolkit' : 'your toolkit'}</p>
                <h1 className="mt-3 text-[30px] leading-[1.08] text-white">{bite.title}</h1>
                <div className="mt-5 rounded-2xl bg-black/20 p-4 backdrop-blur-sm">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">Your Insight Framework</p>
                  <p className="mt-1.5 text-[16px] font-semibold leading-snug text-white">{bite.framework}</p>
                </div>
              </div>
            </div>
            <p className="eyebrow mt-6">{nT} tools you'll learn</p>
            <ol className="mt-2 space-y-2">
              {bite.tools.map((t, i) => (
                <li key={t.name} className="card flex items-center gap-3 px-4 py-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white" style={{ background: tileBackground(tint) }}>{i + 1}</span>
                  <span className="min-w-0"><span className="block font-bold leading-snug">{t.name}</span><span className="text-xs text-muted">{t.source}</span></span>
                </li>
              ))}
            </ol>
            <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs">
              {[['Learn', `${nT} tools`], ['Check', `${nQ} questions`], ['Practise', 'with your coach']].map(([a, b]) => (
                <div key={a} className="surface rounded-2xl px-2 py-3"><span className="block text-sm font-bold" style={{ color: tint }}>{a}</span><span className="text-muted">{b}</span></div>
              ))}
            </div>
            <p className="mt-3 text-center text-xs text-muted">An original synthesis written for you, not a book summary.</p>
            <button className="btn-primary mt-4" onClick={() => { setTi(0); setDir(1); setPhase('tools'); }}>Start learning</button>
          </motion.section>
        )}

        {phase === 'tools' && bite && (
          <motion.section key="tools" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col">
            <AnimatePresence mode="popLayout" custom={dir} initial={false}>
              <motion.article key={ti} custom={dir}
                initial={{ x: dir * 300, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -dir * 300, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.4} dragDirectionLock
                onDragEnd={(_, i) => { if (i.offset.x < -90) goTool(ti + 1); else if (i.offset.x > 90) goTool(ti - 1); }}
                className="mt-2 flex-1">
                <div className="tile p-5" style={{ background: tileBackground(tint) }}>
                  <div className="relative flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white/85">Tool {ti + 1} of {nT}</span>
                    <span className="max-w-[60%] truncate rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white">📘 {bite.tools[ti].source}</span>
                  </div>
                  <h2 className="relative mt-3 text-[26px] leading-tight text-white">{bite.tools[ti].name}</h2>
                  <p className="relative mt-3 text-[15.5px] leading-relaxed text-white/95">{bite.tools[ti].idea}</p>
                </div>

                <Section label="How to use it" color={tint}>
                  <ol className="space-y-2">
                    {bite.tools[ti].steps.map((s, i) => (
                      <li key={i} className="flex gap-3 text-[15px] leading-snug">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold"
                          style={{ background: `color-mix(in oklab, ${tint} 25%, transparent)`, color: tint }}>{i + 1}</span>
                        <span className="pt-0.5">{s}</span>
                      </li>
                    ))}
                  </ol>
                </Section>

                <Section label="What to say" color={tint}>
                  <div className="space-y-2">
                    {bite.tools[ti].say.map((s, i) => (
                      <p key={i} className="rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.06] px-4 py-3 text-[15px] font-semibold leading-snug">{quoted(s)}</p>
                    ))}
                  </div>
                </Section>

                <Section label="Case study" color={tint}>
                  <div className="card space-y-3 p-4">
                    <p className="text-[14.5px] leading-relaxed"><span className="font-bold">The situation. </span>{bite.tools[ti].caseStudy.situation}</p>
                    <p className="text-[14.5px] leading-relaxed"><span className="font-bold">What they did. </span>{bite.tools[ti].caseStudy.action}</p>
                    <p className="rounded-xl px-3 py-2.5 text-[14.5px] font-semibold leading-snug text-white" style={{ background: tileBackground(tint) }}>Result: {bite.tools[ti].caseStudy.result}</p>
                  </div>
                </Section>

                <div className="mt-5 rounded-2xl bg-white p-4 text-[#0b1640]">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.14em]" style={{ color: `color-mix(in oklab, ${tint} 60%, #0b1640)` }}>Try this today</p>
                  <p className="mt-1 text-[15px] font-semibold leading-snug">{bite.tools[ti].tryThis}</p>
                </div>
              </motion.article>
            </AnimatePresence>
            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted">
              Was this tool helpful?
              {[true, false].map((v) => (
                <button key={String(v)} onClick={() => rate(ti, v)} aria-pressed={helpful[ti] === v} aria-label={v ? 'Helpful' : 'Not helpful'}
                  className={`h-9 w-11 rounded-full border text-base transition ${helpful[ti] === v ? 'border-primary bg-primary/20' : 'border-white/15 bg-white/5'}`}>{v ? '👍' : '👎'}</button>
              ))}
            </div>
            <div className="sticky bottom-0 -mx-4 mt-3 flex items-center gap-3 px-4 pb-2 pt-3 backdrop-blur-md" style={{ background: 'rgba(10, 22, 64, 0.9)' }}>
              <button className="btn-ghost w-28" onClick={() => goTool(ti - 1)}>Back</button>
              <div className="flex flex-1 justify-center gap-1.5" aria-hidden>
                {bite.tools.map((_, i) => <span key={i} className="h-2 rounded-full transition-all" style={{ width: i === ti ? 18 : 7, background: i === ti ? tint : 'rgba(255,255,255,0.2)' }} />)}
              </div>
              <button className="btn-primary w-28" onClick={() => goTool(ti + 1)}>{ti === nT - 1 ? 'Quiz' : 'Next'}</button>
            </div>
          </motion.section>
        )}

        {phase === 'quiz' && bite && (
          <motion.section key={`quiz-${qi}`} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="flex flex-1 flex-col">
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em]" style={{ color: tint }}>Quick check · {qi + 1} of {nQ}</p>
            <h2 className="mt-2 text-[22px] leading-tight">{bite.quiz[qi].q}</h2>
            <div className="mt-5 space-y-2.5">
              {bite.quiz[qi].options.map((o, i) => {
                const isAnswer = i === bite.quiz[qi].answer;
                const state = picked === null ? 'idle' : isAnswer ? 'right' : picked === i ? 'wrong' : 'dim';
                return (
                  <motion.button key={i} onClick={() => pick(i)} disabled={picked !== null}
                    animate={state === 'wrong' ? { x: [0, -6, 6, -4, 0] } : {}}
                    className={`flex min-h-[56px] w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-[15px] font-medium transition ${
                      state === 'right' ? 'border-success bg-success/15' : state === 'wrong' ? 'border-error bg-error/15' : state === 'dim' ? 'border-white/10 opacity-50' : 'border-white/15 bg-white/5 active:scale-[0.99]'}`}>
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${state === 'right' ? 'bg-success text-bg' : state === 'wrong' ? 'bg-error text-bg' : 'bg-white/10'}`}>
                      {state === 'right' ? '✓' : state === 'wrong' ? '✕' : 'ABCD'[i]}
                    </span>
                    {o}
                  </motion.button>
                );
              })}
            </div>
            {picked !== null && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5 flex items-start gap-3">
                <CoachAvatar coach={coach} size={40} />
                <p className="card px-4 py-3 text-sm leading-relaxed">
                  <span className="font-bold">{picked === bite.quiz[qi].answer ? 'Exactly right. ' : 'Not quite, and that is how we learn. '}</span>
                  {bite.quiz[qi].why}
                </p>
              </motion.div>
            )}
            <button className="btn-primary mt-auto" disabled={picked === null} onClick={nextQuestion}>{qi === nQ - 1 ? 'Now practise with your coach' : 'Continue'}</button>
          </motion.section>
        )}

        {phase === 'scenario' && bite && !grade && (
          <motion.section key="scenario" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col">
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em]" style={{ color: tint }}>Practise with your coach</p>
            <div className="tile mt-2 p-5" style={{ background: tileBackground(tint) }}>
              <p className="relative text-[16px] font-semibold leading-relaxed text-white">{bite.scenario}</p>
            </div>
            <div className="mt-4 flex items-start gap-2.5">
              <CoachAvatar coach={coach} size={36} />
              <p className="text-sm text-muted"><span className="font-semibold text-ink">{coachName}:</span> Write exactly what you would say. Try to use at least two of your tools, and I'll tell you which ones I spotted.</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {bite.tools.map((t) => <span key={t.name} className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] font-semibold text-muted">{t.name}</span>)}
            </div>
            <label htmlFor="answer" className="sr-only">Your response</label>
            <textarea id="answer" value={answer} onChange={(e) => setAnswer(e.target.value.slice(0, 1500))} rows={7}
              placeholder="Type what you would say…" className="field mt-3 flex-1 py-3 leading-relaxed" />
            <div className="mt-1.5 flex justify-between text-xs text-muted"><span>Your answer is sent to our AI provider for feedback.</span><span>{answer.length}/1500</span></div>
            {gradeErr && <div className="mt-3"><Alert>{gradeErr}</Alert></div>}
            <button className="btn-primary mt-4" disabled={grading || answer.trim().length < 20} onClick={submit}>{grading ? `${coachName} is reading your answer…` : 'Get coaching'}</button>
            <button className="mt-2 min-h-[44px] text-sm text-muted" onClick={() => setPhase('done')}>Skip for now</button>
          </motion.section>
        )}

        {phase === 'scenario' && bite && grade && (
          <motion.section key="result" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-1 flex-col">
            <div className="mt-6 flex flex-col items-center text-center">
              <ScoreRing score={grade.score} tint={tint} />
              <p className="mt-3 text-lg font-bold">{grade.score >= 80 ? 'Excellent work' : grade.score >= 60 ? 'Solid. A step away from great' : 'A good start to build on'}</p>
            </div>
            <div className="mt-5 flex items-start gap-3">
              <CoachAvatar coach={coach} size={40} />
              <p className="card px-4 py-3 text-sm leading-relaxed">{grade.feedback}</p>
            </div>
            <Section label="Tools you used" color={tint}>
              <div className="flex flex-wrap gap-1.5">
                {bite.tools.map((t) => {
                  const used = grade.toolsUsed.includes(t.name);
                  return <span key={t.name} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${used ? 'bg-success/20 text-success' : 'border border-white/10 text-muted'}`}>{used ? '✓ ' : ''}{t.name}</span>;
                })}
              </div>
            </Section>
            <div className="mt-4 grid gap-2.5">
              <div className="rounded-2xl border border-success/30 bg-success/10 p-4"><p className="text-xs font-bold uppercase tracking-wider text-success">What worked</p><p className="mt-1 text-[15px]">{grade.strength}</p></div>
              <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4"><p className="text-xs font-bold uppercase tracking-wider text-primary">Next step</p><p className="mt-1 text-[15px]">{grade.improve}</p></div>
              <div className="rounded-2xl bg-white p-4 text-[#0b1640]">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.14em]" style={{ color: `color-mix(in oklab, ${tint} 60%, #0b1640)` }}>A stronger way to say it</p>
                <p className="mt-1 text-[15px] font-semibold leading-relaxed">{quoted(grade.modelAnswer)}</p>
              </div>
            </div>
            <div className="mt-auto space-y-2 pt-6">
              <button className="btn-primary" onClick={() => setPhase('done')}>Finish bite</button>
              <button className="btn-ghost w-full" onClick={() => setGrade(null)}>Try again with a better answer</button>
            </div>
          </motion.section>
        )}

        {phase === 'done' && bite && (
          <motion.section key="done" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-1 flex-col items-center text-center">
            <motion.div initial={{ scale: 0.6, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200 }}
              className="mt-8 flex h-20 w-20 items-center justify-center rounded-[26px] text-4xl" style={{ background: tileBackground(tint) }}>🎉</motion.div>
            <h1 className="mt-4 text-[28px]">Bite complete</h1>
            <p className="mt-2 max-w-[19rem] text-muted">{data!.topic.name}: {nT} tools learned, {correct} of {nQ} quiz answers right{grade ? `, practice score ${grade.score}/100` : ''}.</p>
            <div className="mt-6 w-full text-left">
              <p className="eyebrow">Your toolkit</p>
              <ul className="mt-2 space-y-2">
                {bite.tools.map((t) => (
                  <li key={t.name} className="card px-4 py-3">
                    <p className="font-bold">{t.name}</p>
                    <p className="mt-0.5 text-sm text-muted">{t.tryThis}</p>
                  </li>
                ))}
              </ul>
            </div>
            {level === 'toolkit' ? (
              <>
                <div className="mt-6 w-full rounded-2xl p-4 text-left text-white" style={{ background: tileBackground(tint) }}>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">Next: level 2</p>
                  <p className="mt-1 font-bold">Practice reps: 2-minute drills from your world, coached one at a time. Five unlock Mastery.</p>
                </div>
                <button className="btn-primary mt-4" onClick={() => nav(`/practice/${topicId}`, { replace: true })}>Start practice reps</button>
              </>
            ) : <p className="mt-6 text-sm font-semibold text-success">Mastery complete for {data!.topic.name}. Keep practising to stay sharp.</p>}
            <button className="btn-ghost mt-3 w-full" onClick={() => nav('/', { replace: true })}>Back to Home</button>
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}

function Loading({ topic, coach, persona, tint, mastery = false }: { topic: TopicDetail | null; coach: 'maya' | 'alex'; persona: string; tint: string; mastery?: boolean }) {
  const lines = [
    ...(topic?.books.map((b) => `Reading “${b.title}”…`) ?? ['Opening the books…']),
    'Pulling out the tools that matter most…',
    persona ? `Writing case studies for a ${persona.toLowerCase()}…` : 'Writing case studies for you…',
    'Preparing your practice scenario…',
  ];
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((x) => (x + 1) % lines.length), 2800); return () => clearInterval(t); }, [lines.length]);
  return (
    <>
      <div className="relative">
        <motion.div className="absolute -inset-6 rounded-full blur-2xl" style={{ background: tint }} animate={{ opacity: [0.25, 0.5, 0.25] }} transition={{ duration: 2.4, repeat: Infinity }} />
        <div className="relative"><CoachAvatar coach={coach} size={96} /></div>
      </div>
      <h1 className="mt-7 text-[24px]">{mastery ? 'Building your mastery toolkit' : 'Building your toolkit'}</h1>
      <p className="mt-1 text-sm text-muted">{topic?.name ?? ''}</p>
      <AnimatePresence mode="wait">
        <motion.p key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="mt-6 h-6 text-[15px] font-semibold" style={{ color: tint }}>
          {lines[i]}
        </motion.p>
      </AnimatePresence>
      <p className="mt-8 max-w-[17rem] text-xs text-muted">The first time a toolkit is made it can take a minute or two. After that it opens instantly.</p>
    </>
  );
}

function ScoreRing({ score, tint }: { score: number; tint: string }) {
  const r = 52, c = 2 * Math.PI * r;
  return (
    <div className="relative h-36 w-36">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="10" />
        <motion.circle cx="60" cy="60" r={r} fill="none" stroke={tint} strokeWidth="10" strokeLinecap="round" strokeDasharray={c}
          initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - score / 100) }} transition={{ duration: 1.1, ease: 'easeOut' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" role="img" aria-label={`Score ${score} out of 100`}>
        <span className="text-4xl font-extrabold">{score}</span><span className="text-xs text-muted">out of 100</span>
      </div>
    </div>
  );
}
