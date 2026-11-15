import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { api, ApiError, type TopicDetail } from '../api';
import { useAuth } from '../auth';
import { Alert } from '../components/ui';
import { CoachAvatar } from '../components/Coach';
import { CategoryGlyph, categoryTint, tileBackground } from '../components/CategoryIcon';
import { Paywall } from '../components/Paywall';
import { COACHES, personaLabel } from '../options';

type BiteData = {
  title: string; framework: string; scenario: string;
  cards: { source: string; concept: string; application: string; tryThis: string }[];
  quiz: { q: string; options: string[]; answer: number; why: string }[];
};
type Started = { lessonId: string; topic: { id: string; name: string; category: string }; bite: BiteData; cached: boolean };
type Grade = { score: number; feedback: string; strength: string; improve: string };
type Phase = 'loading' | 'error' | 'intro' | 'cards' | 'quiz' | 'scenario' | 'done';

const CARD_COACH = [
  'Start here: the core idea everything else builds on.',
  'Now a second angle on the same skill.',
  'This is where it gets practical.',
  'Watch for this one: it is where most people slip.',
  'Last card: bring it all together.',
];

export default function Bite() {
  const { topicId } = useParams();
  const nav = useNavigate();
  const { me } = useAuth();
  const coach = me?.coach ?? 'maya';
  const coachName = COACHES.find((c) => c.value === coach)?.name ?? 'Your coach';

  const [phase, setPhase] = useState<Phase>('loading');
  const [topic, setTopic] = useState<TopicDetail | null>(null);
  const [data, setData] = useState<Started | null>(null);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [card, setCard] = useState(0);
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

  const start = () => {
    setPhase('loading'); setError(null);
    api<Started>('/bites', { body: { topicId } })
      .then((d) => { setData(d); setPhase('intro'); })
      .catch((e: ApiError) => { setError({ message: e.message, code: e.code }); setPhase('error'); });
  };
  useEffect(() => {
    if (started.current) return; started.current = true;
    api<TopicDetail>(`/topics/${topicId}`).then(setTopic).catch(() => {});
    start();
  }, [topicId]); // eslint-disable-line react-hooks/exhaustive-deps

  const tint = categoryTint(data?.topic.category ?? topic?.category ?? '');
  const bite = data?.bite;
  const step = { loading: 0, error: 0, intro: 0, cards: 1 + card, quiz: 6 + qi, scenario: 9, done: 10 }[phase];
  const close = () => nav(-1);

  const goCard = (to: number) => {
    if (!bite) return;
    if (to >= bite.cards.length) {
      api(`/bites/${data!.lessonId}/progress`, { body: { stage: 'cards' } }).catch(() => {});
      setPhase('quiz'); return;
    }
    if (to < 0) { setPhase('intro'); return; }
    setDir(to > card ? 1 : -1); setCard(to);
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
    if (qi + 1 >= bite.quiz.length) {
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
      {/* Top bar: close + segmented progress */}
      <div className="flex items-center gap-3 py-2">
        <button onClick={close} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-ink" aria-label="Close bite">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <div className="flex flex-1 gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={10} aria-valuenow={step} aria-label="Bite progress">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <motion.div className="h-full rounded-full" style={{ background: tint }} initial={false} animate={{ width: i < step ? '100%' : '0%' }} />
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {phase === 'loading' && (
          <motion.section key="loading" exit={{ opacity: 0 }} className="flex flex-1 flex-col items-center justify-center text-center">
            <Loading topic={topic} coach={coach} persona={personaLabel(me?.persona ?? null)} tint={tint} />
          </motion.section>
        )}

        {phase === 'error' && error && (
          <motion.section key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-1 flex-col justify-center gap-4">
            <div className="flex items-end gap-3"><CoachAvatar coach={coach} size={56} />
              <p className="card px-4 py-3 text-sm">{error.code === 'ai_disabled' ? "Bites aren't switched on yet. Once the AI key is added, I'll build them for you." : error.code === 'daily_limit' ? "That's plenty of learning for today. Come back tomorrow!" : "Something got in the way while I was building your bite."}</p>
            </div>
            <Alert>{error.message}</Alert>
            {error.code !== 'ai_disabled' && error.code !== 'premium_required' && error.code !== 'daily_limit' && <button className="btn-primary" onClick={start}>Try again</button>}
            <button className="btn-ghost w-full" onClick={close}>Back</button>
            <Paywall open={error.code === 'premium_required'} onClose={close} topicName={topic?.name} />
          </motion.section>
        )}

        {phase === 'intro' && bite && (
          <motion.section key="intro" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -30 }} className="flex flex-1 flex-col">
            <div className="tile mt-3 flex-1 p-6" style={{ background: tileBackground(tint) }}>
              <CategoryGlyph name={data!.topic.category} size={200} className="absolute -right-10 -top-6 text-white/15" />
              <div className="relative flex h-full flex-col">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/75">{data!.topic.name} · your bite</p>
                <h1 className="mt-3 text-[32px] leading-[1.08] text-white">{bite.title}</h1>
                <div className="mt-6 rounded-2xl bg-black/20 p-4 backdrop-blur-sm">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">Your Insight Framework</p>
                  <p className="mt-1.5 text-[17px] font-semibold leading-snug text-white">{bite.framework}</p>
                </div>
                <div className="mt-auto pt-6">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">Blended from</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[...new Set(bite.cards.map((c) => c.source))].map((s) => <span key={s} className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-white">{s}</span>)}
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-3 text-center text-xs text-muted">An original synthesis written for you, not a book summary.</p>
            <button className="btn-primary mt-3" onClick={() => { setCard(0); setDir(1); setPhase('cards'); }}>Start · 5 cards</button>
          </motion.section>
        )}

        {phase === 'cards' && bite && (
          <motion.section key="cards" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col">
            <div className="mt-2 flex items-center gap-2.5">
              <CoachAvatar coach={coach} size={36} />
              <p className="text-sm text-muted"><span className="font-semibold text-ink">{coachName}:</span> {CARD_COACH[card]}</p>
            </div>
            <div className="relative mt-3 flex-1">
              <AnimatePresence mode="popLayout" custom={dir} initial={false}>
                <motion.article key={card} custom={dir}
                  initial={{ x: dir * 320, opacity: 0, rotate: dir * 4 }} animate={{ x: 0, opacity: 1, rotate: 0 }} exit={{ x: -dir * 320, opacity: 0, rotate: -dir * 4 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 28 }}
                  drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.6}
                  onDragEnd={(_, i) => { if (i.offset.x < -80) goCard(card + 1); else if (i.offset.x > 80) goCard(card - 1); }}
                  className="tile flex h-full min-h-[440px] cursor-grab flex-col p-5 active:cursor-grabbing" style={{ background: tileBackground(tint) }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white/80">Card {card + 1} of 5</span>
                    <span className="max-w-[60%] truncate rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white">📘 {bite.cards[card].source}</span>
                  </div>
                  <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">The idea</p>
                  <p className="mt-1 text-[19px] font-bold leading-snug text-white">{bite.cards[card].concept}</p>
                  <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">In your work</p>
                  <p className="mt-1 text-[15px] leading-relaxed text-white/90">{bite.cards[card].application}</p>
                  <div className="mt-auto rounded-2xl bg-white p-4 text-[#0b1640]">
                    <p className="text-[11px] font-extrabold uppercase tracking-[0.14em]" style={{ color: `color-mix(in oklab, ${tint} 70%, #0b1640)` }}>Try this today</p>
                    <p className="mt-1 text-[15px] font-semibold leading-snug">{bite.cards[card].tryThis}</p>
                  </div>
                </motion.article>
              </AnimatePresence>
            </div>
            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted">
              Was this helpful?
              {[true, false].map((v) => (
                <button key={String(v)} onClick={() => rate(card, v)} aria-pressed={helpful[card] === v}
                  className={`h-9 w-11 rounded-full border text-base transition ${helpful[card] === v ? 'border-primary bg-primary/20' : 'border-white/15 bg-white/5'}`}
                  aria-label={v ? 'Helpful' : 'Not helpful'}>{v ? '👍' : '👎'}</button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button className="btn-ghost w-28" onClick={() => goCard(card - 1)}>Back</button>
              <div className="flex flex-1 justify-center gap-1.5" aria-hidden>
                {bite.cards.map((_, i) => <span key={i} className="h-2 rounded-full transition-all" style={{ width: i === card ? 20 : 8, background: i === card ? tint : 'rgba(255,255,255,0.2)' }} />)}
              </div>
              <button className="btn-primary w-28" onClick={() => goCard(card + 1)}>{card === 4 ? 'Quiz' : 'Next'}</button>
            </div>
          </motion.section>
        )}

        {phase === 'quiz' && bite && (
          <motion.section key={`quiz-${qi}`} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="flex flex-1 flex-col">
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em]" style={{ color: tint }}>Quick check · {qi + 1} of 3</p>
            <h2 className="mt-2 text-[24px] leading-tight">{bite.quiz[qi].q}</h2>
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
            <button className="btn-primary mt-auto" disabled={picked === null} onClick={nextQuestion}>{qi === 2 ? 'Last step: practise it' : 'Continue'}</button>
          </motion.section>
        )}

        {phase === 'scenario' && bite && !grade && (
          <motion.section key="scenario" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col">
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em]" style={{ color: tint }}>Apply it · scenario</p>
            <div className="tile mt-2 p-5" style={{ background: tileBackground(tint) }}>
              <p className="relative text-[16px] font-semibold leading-relaxed text-white">{bite.scenario}</p>
            </div>
            <div className="mt-4 flex items-center gap-2.5">
              <CoachAvatar coach={coach} size={36} />
              <p className="text-sm text-muted"><span className="font-semibold text-ink">{coachName}:</span> No pressure. Write it the way you would actually say it.</p>
            </div>
            <label htmlFor="answer" className="sr-only">Your response</label>
            <textarea id="answer" value={answer} onChange={(e) => setAnswer(e.target.value.slice(0, 1500))} rows={7}
              placeholder="Type your response…" className="field mt-3 flex-1 py-3 leading-relaxed" />
            <div className="mt-1.5 flex justify-between text-xs text-muted"><span>Your answer is sent to our AI provider for feedback.</span><span>{answer.length}/1500</span></div>
            {gradeErr && <div className="mt-3"><Alert>{gradeErr}</Alert></div>}
            <button className="btn-primary mt-4" disabled={grading || answer.trim().length < 20} onClick={submit}>{grading ? `${coachName} is reading your answer…` : 'Get feedback'}</button>
            <button className="mt-2 min-h-[44px] text-sm text-muted" onClick={() => setPhase('done')}>Skip for now</button>
          </motion.section>
        )}

        {phase === 'scenario' && grade && (
          <motion.section key="result" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-1 flex-col">
            <div className="mt-6 flex flex-col items-center text-center">
              <ScoreRing score={grade.score} tint={tint} />
              <p className="mt-3 text-lg font-bold">{grade.score >= 80 ? 'Excellent work' : grade.score >= 60 ? 'Solid. A step away from great' : 'A good start to build on'}</p>
            </div>
            <div className="mt-5 flex items-start gap-3">
              <CoachAvatar coach={coach} size={40} />
              <p className="card px-4 py-3 text-sm leading-relaxed">{grade.feedback}</p>
            </div>
            <div className="mt-4 grid gap-2.5">
              <div className="rounded-2xl border border-success/30 bg-success/10 p-4"><p className="text-xs font-bold uppercase tracking-wider text-success">What worked</p><p className="mt-1 text-[15px]">{grade.strength}</p></div>
              <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4"><p className="text-xs font-bold uppercase tracking-wider text-primary">Next step</p><p className="mt-1 text-[15px]">{grade.improve}</p></div>
            </div>
            <div className="mt-auto space-y-2 pt-6">
              <button className="btn-primary" onClick={() => setPhase('done')}>Finish bite</button>
              <button className="btn-ghost w-full" onClick={() => { setGrade(null); }}>Try a better answer</button>
            </div>
          </motion.section>
        )}

        {phase === 'done' && bite && (
          <motion.section key="done" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-1 flex-col items-center justify-center text-center">
            <motion.div initial={{ scale: 0.6, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200 }}
              className="flex h-24 w-24 items-center justify-center rounded-[28px] text-5xl" style={{ background: tileBackground(tint) }}>🎉</motion.div>
            <h1 className="mt-5 text-[30px]">Bite complete</h1>
            <p className="mt-2 max-w-[18rem] text-muted">{data!.topic.name}: 5 ideas learned, {correct} of 3 quiz answers right{grade ? `, scenario ${grade.score}/100` : ''}.</p>
            <div className="mt-6 w-full rounded-2xl bg-white p-4 text-left text-[#0b1640]">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#4f46e5]">Try one thing today</p>
              <p className="mt-1 font-semibold">{bite.cards[0].tryThis}</p>
            </div>
            <button className="btn-primary mt-8" onClick={() => nav('/', { replace: true })}>Back to Home</button>
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}

function Loading({ topic, coach, persona, tint }: { topic: TopicDetail | null; coach: 'maya' | 'alex'; persona: string; tint: string }) {
  const lines = [
    ...(topic?.books.map((b) => `Reading “${b.title}”…`) ?? ['Opening the books…']),
    'Connecting the best ideas across all three…',
    persona ? `Shaping it for a ${persona.toLowerCase()}…` : 'Shaping it for you…',
    'Writing your Insight Framework…',
  ];
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((x) => (x + 1) % lines.length), 2600); return () => clearInterval(t); }, [lines.length]);
  return (
    <>
      <div className="relative">
        <motion.div className="absolute -inset-6 rounded-full blur-2xl" style={{ background: tint }} animate={{ opacity: [0.25, 0.5, 0.25] }} transition={{ duration: 2.4, repeat: Infinity }} />
        <div className="relative"><CoachAvatar coach={coach} size={96} /></div>
      </div>
      <h1 className="mt-7 text-[24px]">Building your bite</h1>
      <p className="mt-1 text-sm text-muted">{topic?.name ?? ''}</p>
      <AnimatePresence mode="wait">
        <motion.p key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="mt-6 h-6 text-[15px] font-semibold" style={{ color: tint }}>
          {lines[i]}
        </motion.p>
      </AnimatePresence>
      <p className="mt-8 max-w-[17rem] text-xs text-muted">The first time a bite is made it takes up to a minute. After that it opens instantly.</p>
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
