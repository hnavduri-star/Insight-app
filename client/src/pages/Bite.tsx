import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { api, ApiError, type TopicDetail } from '../api';
import { useAuth } from '../auth';
import { Alert } from '../components/ui';
import { CoachAvatar } from '../components/Coach';
import { CategoryGlyph, categoryTint, tileBackground } from '../components/CategoryIcon';
import { Paywall } from '../components/Paywall';
import { appendSpoken, VoiceRow } from '../components/Mic';
import { COACHES, personaLabel } from '../options';

type Question = { q: string; options: string[]; answer: number; why: string };
type Tool = {
  name: string; source: string; idea: string; why: string; whenToUse: string; pitfalls: string[]; steps: string[]; say: string[];
  caseStudy: { situation: string; action: string; result: string }; tryThis: string; checks: Question[]; practice: string;
};
type BiteData = { title: string; framework: string; outcomes: string[]; scenario: string; tools: Tool[]; quiz: Question[] };
type ToolFeedback = { score: number; feedback: string; tryInstead: string };
type ToolState = { checks: Record<string, number>; response: string | null; feedback: ToolFeedback | null; score: number | null; completed: boolean };
type ModuleState = { tools: ToolState[]; seconds: number; quizDone: boolean; scenarioScore: number | null; cpdId: string | null };
type Cert = { id: string; code: string; activeMinutes: number; plannedMinutes: number };

/** After a tool's theory: two questions (understand, then apply), then a short written practice with coaching. */
function ToolCheck({ tool, index, state, lessonId, tint, coach, onState }: {
  tool: Tool; index: number; state: ToolState | undefined; lessonId: string; tint: string; coach: 'maya' | 'alex'; onState: (s: ToolState[]) => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const checks = state?.checks ?? {};
  const answered = (k: number) => checks[k] !== undefined;
  const answer = async (k: number, picked: number) => {
    if (answered(k)) return;
    try { onState((await api<{ tools: ToolState[] }>(`/bites/${lessonId}/tool/${index}/check`, { body: { q: k, picked } })).tools); }
    catch (e) { setErr((e as Error).message); }
  };
  const submit = async () => {
    setBusy(true); setErr('');
    try {
      const r = await api<{ tools: ToolState[]; feedbackUnavailable?: boolean }>(`/bites/${lessonId}/tool/${index}/practice`, { body: { response: text } });
      setUnavailable(!!r.feedbackUnavailable); onState(r.tools);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const box = { borderColor: `color-mix(in oklab, ${tint} 45%, transparent)`, background: `color-mix(in oklab, ${tint} 8%, transparent)` };
  return (
    <div className="mt-6 space-y-4">
      {tool.checks.map((q, k) => (k === 0 || answered(k - 1)) && (
        <motion.section key={k} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-[22px] border p-4" style={box} aria-label={k === 0 ? 'Check your understanding' : 'What would you do?'}>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em]" style={{ color: tint }}>{k === 0 ? 'Check your understanding' : 'Your turn · what would you do?'} · {k + 1} of {tool.checks.length}</p>
          <p className="mt-1.5 text-[17px] font-bold leading-snug">{q.q}</p>
          <div className="mt-3"><Choices q={q} picked={answered(k) ? checks[k] : null} coach={coach} tint={tint} onPick={(p) => answer(k, p)} /></div>
        </motion.section>
      ))}
      {tool.checks.every((_, k) => answered(k)) && (
        <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-[22px] border p-4" style={box} aria-label="Apply it">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em]" style={{ color: tint }}>Apply it · write it</p>
          <p className="mt-1.5 text-[16px] font-semibold leading-snug">{tool.practice}</p>
          {state?.completed ? (
            <div className="mt-3 space-y-2.5">
              <p className="rounded-2xl rounded-br-md bg-white/[0.06] px-4 py-3 text-[15px] leading-relaxed">{state.response}</p>
              {state.feedback ? (
                <>
                  <div className="flex items-start gap-3">
                    <CoachAvatar coach={coach} size={36} />
                    <p className="card px-4 py-3 text-sm leading-relaxed"><span className="font-bold" style={{ color: tint }}>{state.feedback.score}/100 · </span>{state.feedback.feedback}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-3.5 text-[#0b1640]">
                    <p className="text-[11px] font-extrabold uppercase tracking-[0.14em]">A stronger version</p>
                    <p className="mt-1 text-[15px] font-semibold leading-snug">{quoted(state.feedback.tryInstead)}</p>
                  </div>
                </>
              ) : <p className="text-sm text-muted">{unavailable ? 'Saved. Coaching is busy right now, but this tool is complete.' : 'Saved.'}</p>}
            </div>
          ) : (
            <>
              <label htmlFor={`practice-${index}`} className="sr-only">Your answer</label>
              <textarea id={`practice-${index}`} rows={4} value={text} onChange={(e) => setText(e.target.value.slice(0, 800))}
                placeholder="Write what you would say, in 2 or 3 sentences…" className="field mt-3 py-3 leading-relaxed" />
              <div className="mt-1 flex justify-between text-xs text-muted"><span>Sent to our AI provider for coaching.</span><span>{text.length}/800</span></div>
              <VoiceRow onText={(t) => setText((p) => appendSpoken(p, t, 800))} />
              {err && <div className="mt-2"><Alert>{err}</Alert></div>}
              <button className="btn-primary mt-3" disabled={busy || text.trim().length < 15} onClick={submit}>{busy ? 'Your coach is reading…' : 'Get coaching'}</button>
            </>
          )}
        </motion.section>
      )}
      {err && !tool.checks.every((_, k) => answered(k)) && <Alert>{err}</Alert>}
    </div>
  );
}

/** A multiple-choice question with instant feedback from the coach. */
function Choices({ q, picked, onPick, coach, tint }: { q: Question; picked: number | null; onPick: (i: number) => void; coach: 'maya' | 'alex'; tint: string }) {
  return (
    <>
      <div className="space-y-2.5">
        {q.options.map((o, i) => {
          const state = picked === null ? 'idle' : i === q.answer ? 'right' : picked === i ? 'wrong' : 'dim';
          return (
            <motion.button key={i} onClick={() => onPick(i)} disabled={picked !== null}
              animate={state === 'wrong' ? { x: [0, -6, 6, -4, 0] } : {}}
              className={`flex min-h-[56px] w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-[15px] font-medium transition ${
                state === 'right' ? 'border-success bg-success/15' : state === 'wrong' ? 'border-error bg-error/15' : state === 'dim' ? 'border-white/10 opacity-50' : 'border-white/15 bg-white/5 active:scale-[0.99]'}`}>
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${state === 'right' ? 'bg-success text-bg' : state === 'wrong' ? 'bg-error text-bg' : 'bg-white/10'}`}
                style={state === 'idle' ? { color: tint } : undefined}>
                {state === 'right' ? '✓' : state === 'wrong' ? '✕' : 'ABCD'[i]}
              </span>
              {o}
            </motion.button>
          );
        })}
      </div>
      {picked !== null && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex items-start gap-3">
          <CoachAvatar coach={coach} size={40} />
          <p className="card px-4 py-3 text-sm leading-relaxed">
            <span className="font-bold">{picked === q.answer ? 'Exactly right. ' : 'Not quite, and that is how we learn. '}</span>{q.why}
          </p>
        </motion.div>
      )}
    </>
  );
}
type Started = { lessonId: string; topic: { id: string; name: string; category: string }; bite: BiteData; cached: boolean };
type Grade = { score: number; feedback: string; strength: string; improve: string; toolsUsed: string[]; modelAnswer: string };
type Phase = 'loading' | 'error' | 'intro' | 'tools' | 'quiz' | 'scenario' | 'reflect' | 'done';

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
  // Resume where the learner left off: tools done → quiz; quiz done → scenario.
  const startAt = level === 'toolkit' && (params.get('start') === 'quiz' || params.get('start') === 'scenario') ? params.get('start') as 'quiz' | 'scenario' : null;
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
  // Tool-by-tool progress is saved on the server, so a one-hour module can be finished over several sittings.
  const [mod, setMod] = useState<ModuleState | null>(null);
  const toolStates = mod?.tools ?? [];
  const setToolStates = (tools: ToolState[]) => { if (tools.length) setMod((m) => (m ? { ...m, tools } : m)); };
  const answeredCheck = (i: number) => !!toolStates[i]?.completed;
  const checkCorrect = (data?.bite.tools ?? []).reduce((n, t, i) => n + (t.checks ?? []).filter((q, k) => toolStates[i]?.checks[k] === q.answer).length, 0);
  const [cert, setCert] = useState<Cert | null>(null);
  const [reflection, setReflection] = useState('');
  const [applyPlan, setApplyPlan] = useState('');
  const [reflectBusy, setReflectBusy] = useState(false);
  const [reflectErr, setReflectErr] = useState('');
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
          if ((s === 0 || (s >= 502 && s <= 504)) && blips < 8 && Date.now() - began < 10 * 60_000) {
            blips++;
            await new Promise((r) => setTimeout(r, 4000));
            continue;
          }
          throw e;
        }
        if ('status' in d) {
          if (Date.now() - began > 10 * 60_000) throw new ApiError(504, 'This is taking longer than usual. Please try again in a minute.');
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        if (!alive.current) return;
        const st = await api<ModuleState>(`/bites/${d.lessonId}/state`).catch(() => null);
        if (!alive.current) return;
        setData(d); setMod(st);
        if (st?.cpdId) setCert({ id: st.cpdId, code: '', activeMinutes: 0, plannedMinutes: 60 });
        const firstOpen = st ? st.tools.findIndex((t) => !t.completed) : 0;
        setTi(Math.max(0, firstOpen));
        // Resume: straight to the next unfinished step.
        setPhase(startAt ?? (st && firstOpen === -1 && st.quizDone ? (st.scenarioScore == null ? 'scenario' : st.cpdId ? 'intro' : 'reflect') : 'intro'));
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
  const nQ = bite?.quiz.length ?? 3;
  const total = nT + nQ + 2;
  const step = { loading: 0, error: 0, intro: 0, tools: 1 + ti, quiz: 1 + nT + qi, scenario: nT + nQ + 1, reflect: total, done: total }[phase];
  const close = () => nav(-1);

  // CPD time: count active learning time (page visible and the learner interacted in the last 90 seconds).
  useEffect(() => {
    if (!data || phase === 'loading' || phase === 'error') return;
    let last = Date.now();
    const touch = () => { last = Date.now(); };
    const evs = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
    evs.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - last < 90_000) {
        api<{ seconds: number }>(`/bites/${data.lessonId}/time`, { body: { seconds: 30 } }).then((r) => setMod((m) => (m ? { ...m, seconds: r.seconds } : m))).catch(() => {});
      }
    }, 30_000);
    return () => { clearInterval(timer); evs.forEach((e) => window.removeEventListener(e, touch)); };
  }, [data, phase === 'loading' || phase === 'error']); // eslint-disable-line react-hooks/exhaustive-deps

  const complete = async () => {
    setReflectBusy(true); setReflectErr('');
    try {
      setCert(await api<Cert>('/cpd/complete', { body: { lessonId: data!.lessonId, reflection, applyPlan: applyPlan.trim() || undefined } }));
      setPhase('done');
    } catch (e) { setReflectErr((e as Error).message); } finally { setReflectBusy(false); }
  };

  const goTool = (to: number) => {
    if (!bite) return;
    if (to > ti && !answeredCheck(ti)) return; // progressive: answer this tool's question first
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
  const nextQuestion = async () => {
    if (!bite) return;
    if (qi + 1 >= nQ) {
      // Wait for the quiz result to be saved: it is what opens Practice for this topic.
      for (let attempt = 0; attempt < 3; attempt++) {
        try { await api(`/bites/${data!.lessonId}/progress`, { body: { stage: 'quiz', correct } }); break; }
        catch { await new Promise((r) => setTimeout(r, 1500)); }
      }
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
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold">
              <span className="rounded-full bg-accent/15 px-3 py-1.5 text-accent">🎓 1 CPD hour</span>
              <span className="rounded-full bg-white/[0.07] px-3 py-1.5">About 60 minutes</span>
              <span className="rounded-full bg-white/[0.07] px-3 py-1.5">Save and continue any time</span>
            </div>
            {bite.outcomes?.length > 0 && (
              <section className="card mt-4 p-4">
                <p className="eyebrow">By the end, you will be able to</p>
                <ul className="mt-2 space-y-1.5">{bite.outcomes.map((o) => <li key={o} className="flex gap-2 text-[15px] leading-snug"><span style={{ color: tint }} aria-hidden>✓</span>{o}</li>)}</ul>
              </section>
            )}
            <p className="eyebrow mt-6">{nT} tools, one at a time</p>
            <ol className="mt-2 space-y-2">
              {bite.tools.map((t, i) => {
                const done = toolStates[i]?.completed;
                return (
                  <li key={t.name} className="card flex items-center gap-3 px-4 py-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white" style={{ background: done ? '#22c55e' : tileBackground(tint) }}>{done ? '✓' : i + 1}</span>
                    <span className="min-w-0"><span className="block font-bold leading-snug">{t.name}</span><span className="text-xs text-muted">{t.source}</span></span>
                  </li>
                );
              })}
            </ol>
            <div className="mt-5 grid grid-cols-2 gap-2 text-center text-xs">
              {[['Learn', 'Theory, case study and what to say'], ['Check', '2 questions per tool'], ['Apply', 'Write it, get coaching'], ['Prove it', 'Mixed questions, a scenario and a reflection']].map(([a, b]) => (
                <div key={a} className="surface rounded-2xl px-2 py-3"><span className="block text-sm font-bold" style={{ color: tint }}>{a}</span><span className="text-muted">{b}</span></div>
              ))}
            </div>
            <p className="mt-3 text-center text-xs text-muted">An original synthesis written for you, not a book summary. Finish it to earn a CPD certificate.</p>
            {(() => {
              const next = toolStates.findIndex((t) => !t.completed);
              const allDone = toolStates.length > 0 && next === -1;
              const resumed = toolStates.some((t) => t.completed || Object.keys(t.checks).length);
              return allDone ? (
                <div className="mt-4 space-y-2">
                  {cert && <button className="btn-primary" onClick={() => nav(`/certificate/${cert.id}`)}>View your CPD certificate</button>}
                  {!mod?.quizDone && <button className={cert ? 'btn-ghost w-full' : 'btn-primary'} onClick={() => { setQi(0); setPicked(null); setPhase('quiz'); }}>Continue to the mixed questions</button>}
                  <button className="btn-ghost w-full" onClick={() => { setTi(0); setDir(1); setPhase('tools'); }}>Review the tools</button>
                </div>
              ) : (
                <button className="btn-primary mt-4" onClick={() => { setTi(Math.max(0, next)); setDir(1); setPhase('tools'); }}>
                  {resumed ? `Continue with tool ${Math.max(0, next) + 1}` : 'Start learning'}
                </button>
              );
            })()}
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

                {bite.tools[ti].why && (
                  <Section label="Why it works" color={tint}>
                    <p className="text-[15px] leading-relaxed text-ink/90">{bite.tools[ti].why}</p>
                  </Section>
                )}
                {bite.tools[ti].whenToUse && (
                  <Section label="When to use it" color={tint}>
                    <p className="text-[15px] leading-relaxed text-ink/90">{bite.tools[ti].whenToUse}</p>
                  </Section>
                )}
                {bite.tools[ti].pitfalls?.length > 0 && (
                  <Section label="Watch out for" color={tint}>
                    <ul className="space-y-1.5">{bite.tools[ti].pitfalls.map((p) => <li key={p} className="flex gap-2 text-[15px] leading-snug"><span className="text-error" aria-hidden>✕</span>{p}</li>)}</ul>
                  </Section>
                )}

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
            {/* Questions and practice sit outside the swipeable card, so tapping an answer can't start a swipe. */}
            <ToolCheck key={`check-${ti}`} tool={bite.tools[ti]} index={ti} state={toolStates[ti]} lessonId={data!.lessonId} tint={tint} coach={coach} onState={setToolStates} />
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
              <button className="btn-primary w-28" disabled={!answeredCheck(ti)} onClick={() => goTool(ti + 1)}
                title={answeredCheck(ti) ? undefined : 'Answer both questions and the practice to continue'}>{!answeredCheck(ti) ? 'Finish ↑' : ti === nT - 1 ? 'Quiz' : 'Next tool'}</button>
            </div>
          </motion.section>
        )}

        {phase === 'quiz' && bite && (
          <motion.section key={`quiz-${qi}`} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="flex flex-1 flex-col">
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em]" style={{ color: tint }}>Mixed check · {qi + 1} of {nQ}</p>
            <p className="mt-1 text-xs text-muted">Which tool fits? These mix everything you just learned.</p>
            <h2 className="mt-2 text-[22px] leading-tight">{bite.quiz[qi].q}</h2>
            <div className="mt-5"><Choices q={bite.quiz[qi]} picked={picked} onPick={pick} coach={coach} tint={tint} /></div>
            <button className="btn-primary mt-auto" disabled={picked === null} onClick={nextQuestion}>{qi === nQ - 1 ? 'Unlock the scenario' : 'Continue'}</button>
          </motion.section>
        )}

        {phase === 'scenario' && bite && !grade && (
          <motion.section key="scenario" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col">
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em]" style={{ color: tint }}>Scenario · practise with your coach</p>
            <p className="mt-1 text-xs text-muted">{level === 'toolkit' ? 'Answer it to finish Foundations and unlock practice reps.' : 'Answer it, then reflect, to complete the module.'}</p>
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
            <VoiceRow onText={(t) => setAnswer((p) => appendSpoken(p, t, 1500))} />
            {gradeErr && <div className="mt-3"><Alert>{gradeErr}</Alert></div>}
            <button className="btn-primary mt-4" disabled={grading || answer.trim().length < 20} onClick={submit}>{grading ? `${coachName} is reading your answer…` : 'Get coaching'}</button>
            <button className="mt-2 min-h-[44px] text-sm text-muted" onClick={close}>Save and finish later</button>
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
              <button className="btn-primary" onClick={() => setPhase(cert ? 'done' : 'reflect')}>{cert ? 'Finish' : 'Last step: reflect'}</button>
              <button className="btn-ghost w-full" onClick={() => setGrade(null)}>Try again with a better answer</button>
            </div>
          </motion.section>
        )}

        {phase === 'reflect' && bite && (
          <motion.section key="reflect" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col">
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em]" style={{ color: tint }}>Reflection · last step</p>
            <h1 className="mt-2 text-[24px] leading-snug">What will you take from this hour?</h1>
            <p className="mt-1.5 text-sm text-muted">Reflection is part of CPD. It goes on your CPD record (only you can see it) and completes your certificate.</p>
            <label htmlFor="reflection" className="label mt-5">What did you learn, and what will you do differently?</label>
            <textarea id="reflection" rows={5} value={reflection} onChange={(e) => setReflection(e.target.value.slice(0, 1500))} className="field py-3 leading-relaxed"
              placeholder="e.g. I tend to over-explain when challenged. I'll lead with the answer and keep detail for follow-up." />
            <div className="mt-1 flex justify-between text-xs text-muted"><span>At least a couple of sentences.</span><span>{reflection.length}/1500</span></div>
            <VoiceRow onText={(t) => setReflection((p) => appendSpoken(p, t, 1500))} />
            <label htmlFor="apply-plan" className="label mt-4">Where will you use it first? (optional)</label>
            <input id="apply-plan" className="field" value={applyPlan} onChange={(e) => setApplyPlan(e.target.value.slice(0, 400))} placeholder="e.g. Thursday's budget review with Raj" />
            {reflectErr && <div className="mt-3"><Alert>{reflectErr}</Alert></div>}
            <button className="btn-primary mt-auto" disabled={reflectBusy || reflection.trim().length < 40} onClick={complete}>{reflectBusy ? 'Saving…' : 'Complete and get my certificate'}</button>
          </motion.section>
        )}

        {phase === 'done' && bite && (
          <motion.section key="done" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-1 flex-col items-center text-center">
            <motion.div initial={{ scale: 0.6, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200 }}
              className="mt-8 flex h-20 w-20 items-center justify-center rounded-[26px] text-4xl" style={{ background: tileBackground(tint) }}>🎓</motion.div>
            <h1 className="mt-4 text-[28px]">Module complete</h1>
            <p className="mt-2 max-w-[19rem] text-muted">{data!.topic.name}: {nT} tools learned{startAt ? '' : `, ${correct + checkCorrect} of ${nT * 2 + nQ} questions right`}{grade ? `, scenario ${grade.score}/100` : ''}.</p>
            {cert && (
              <button className="btn-primary mt-5" onClick={() => nav(`/certificate/${cert.id}`)}>View your CPD certificate</button>
            )}
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
      <p className="mt-4 max-w-[17rem] text-xs text-muted">A full one-hour module takes a few minutes to write the first time. After that it opens instantly.</p>
      {topic && !mastery && <WhileYouWait topic={topic} tint={tint} />}
    </>
  );
}

/** Something useful while the toolkit is written: a confidence check-in and the books it draws on. */
function WhileYouWait({ topic, tint }: { topic: TopicDetail; tint: string }) {
  const [score, setScore] = useState<number | null>(null);
  const pick = (n: number) => { setScore(n); api('/bites/confidence', { body: { topicId: topic.id, score: n, when: 'before' } }).catch(() => {}); };
  return (
    <div className="mt-6 w-full space-y-3 text-left">
      <div className="card p-4">
        <p className="eyebrow">While you wait</p>
        <p className="mt-1 font-bold leading-snug">How confident are you at {topic.name.toLowerCase()} today?</p>
        <div className="mt-3 grid grid-cols-10 gap-1" role="radiogroup" aria-label="Confidence from 1 to 10">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button key={n} role="radio" aria-checked={score === n} onClick={() => pick(n)} className="h-9 rounded-lg text-sm font-bold"
              style={{ background: score === n ? tint : 'rgba(255,255,255,0.07)', color: score === n ? '#0b1640' : undefined }}>{n}</button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">{score ? "Saved. We'll ask again after you've practised, so you can see how far you've come." : '1 = not at all, 10 = very. Only you see this.'}</p>
      </div>
      <div className="card p-4">
        <p className="eyebrow">Drawing on</p>
        <ul className="mt-1.5 space-y-1 text-sm">{topic.books.map((b) => <li key={b.title}><span className="font-semibold">{b.title}</span>{b.author ? <span className="text-muted"> · {b.author}</span> : null}{b.kind === 'fiction' ? <span className="ml-1.5 text-[11px] font-bold uppercase text-[#c4b5fd]">fiction</span> : null}</li>)}</ul>
      </div>
    </div>
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
