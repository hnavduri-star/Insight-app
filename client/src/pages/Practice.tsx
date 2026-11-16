import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { api, ApiError, pollPost, type Grade, type Rep, type TopicDetail, type Track } from '../api';
import { useAuth } from '../auth';
import { Alert } from '../components/ui';
import { CoachAvatar } from '../components/Coach';
import { categoryTint, tileBackground } from '../components/CategoryIcon';
import { GradeResult } from '../components/GradeResult';
import { appendSpoken, VoiceRow } from '../components/Mic';
import { COACHES } from '../options';

type Phase = 'loading' | 'rep' | 'result' | 'error';

/** Level 2: practice reps. One short situation at a time, coached, then the next. */
export default function Practice() {
  const { topicId } = useParams();
  const nav = useNavigate();
  const { me } = useAuth();
  const coach = me?.coach ?? 'maya';
  const coachName = COACHES.find((c) => c.value === coach)?.name ?? 'Your coach';
  const [topic, setTopic] = useState<TopicDetail | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [rep, setRep] = useState<Rep | null>(null);
  const [track, setTrack] = useState<Track | null>(null);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const next = async () => {
    setPhase('loading'); setError(null); setGrade(null); setAnswer('');
    try {
      const d = await pollPost<{ rep: Rep; track: Track }>('/practice/next', { topicId }, () => alive.current);
      if (!alive.current) return;
      setRep(d.rep); setTrack(d.track); setPhase('rep');
    } catch (e) {
      if (!alive.current) return;
      const err = e as ApiError; setError({ message: err.message, code: err.code }); setPhase('error');
    }
  };
  useEffect(() => { api<TopicDetail>(`/topics/${topicId}`).then(setTopic).catch(() => {}); next(); }, [topicId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { window.scrollTo(0, 0); }, [phase]);

  const submit = async () => {
    if (!rep) return;
    setBusy(true); setError(null);
    try {
      const d = await api<{ grade: Grade; track: Track }>(`/practice/${rep.id}/answer`, { body: { response: answer } });
      setGrade(d.grade); setTrack(d.track); setPhase('result');
    } catch (e) { const err = e as ApiError; setError({ message: err.message, code: err.code }); }
    finally { setBusy(false); }
  };

  const tint = categoryTint(topic?.category ?? '');
  const done = track?.reps.done ?? 0;
  const goal = track?.reps.goal ?? 10;
  const repNumber = done + (phase === 'result' ? 0 : 1);
  const justUnlocked = phase === 'result' && track?.mastery.unlocked && done === 5;
  const roleplayUnlocked = phase === 'result' && track?.roleplay.unlocked && done === 3;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-app flex-col px-4 pb-6" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
      <div className="sticky top-0 z-10 -mx-4 flex items-center gap-3 px-4 py-2 backdrop-blur-md" style={{ background: 'rgba(10, 22, 64, 0.85)' }}>
        <button onClick={() => nav(-1)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-ink" aria-label="Close practice">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <div className="flex-1">
          <div className="flex justify-between text-[11px] font-bold text-muted"><span>Practice reps · {topic?.name ?? ''}</span><span>{Math.min(done, goal)}/{goal}</span></div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={done}>
            <motion.div className="h-full rounded-full" style={{ background: tint }} animate={{ width: `${Math.min(100, (done / goal) * 100)}%` }} />
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {phase === 'loading' && (
          <motion.section key="loading" exit={{ opacity: 0 }} className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="relative">
              <motion.div className="absolute -inset-6 rounded-full blur-2xl" style={{ background: tint }} animate={{ opacity: [0.2, 0.45, 0.2] }} transition={{ duration: 2.4, repeat: Infinity }} />
              <div className="relative"><CoachAvatar coach={coach} size={84} /></div>
            </div>
            <h1 className="mt-6 text-[22px]">Setting up your next rep</h1>
            <p className="mt-2 max-w-[17rem] text-sm text-muted">{coachName} is writing fresh situations from your world. New sets take a few seconds.</p>
          </motion.section>
        )}

        {phase === 'error' && error && (
          <motion.section key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-1 flex-col justify-center gap-4">
            <Alert>{error.message}</Alert>
            {error.code === 'foundations_first'
              ? <button className="btn-primary" onClick={() => nav(`/bite/${topicId}${/quiz first/.test(error.message) ? '?start=quiz' : /scenario first/.test(error.message) ? '?start=scenario' : ''}`, { replace: true })}>
                  {/quiz first/.test(error.message) ? 'Take the quiz' : /scenario first/.test(error.message) ? 'Answer the scenario' : 'Go to Foundations'}
                </button>
              : error.code !== 'daily_limit' && <button className="btn-primary" onClick={next}>Try again</button>}
            <button className="btn-ghost w-full" onClick={() => nav(-1)}>Back</button>
          </motion.section>
        )}

        {phase === 'rep' && rep && (
          <motion.section key={`rep-${rep.id}`} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="flex flex-1 flex-col">
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em]" style={{ color: tint }}>Rep {repNumber}</p>
            <div className="tile mt-2 p-5" style={{ background: tileBackground(tint) }}>
              {rep.with && <span className="relative mb-2 inline-block rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-bold text-white">With {rep.with}</span>}
              <p className="relative text-[16px] font-semibold leading-relaxed text-white">{rep.situation}</p>
              <p className="relative mt-3 rounded-xl bg-black/20 px-3 py-2 text-sm font-bold text-white">{rep.ask}</p>
            </div>
            {rep.tools.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                Try: {rep.tools.map((t) => <span key={t} className="rounded-full border border-white/15 px-2.5 py-1 font-semibold">{t}</span>)}
              </div>
            )}
            <label htmlFor="rep-answer" className="sr-only">Your response</label>
            <textarea id="rep-answer" value={answer} onChange={(e) => setAnswer(e.target.value.slice(0, 1500))} rows={6}
              placeholder="Type exactly what you would say…" className="field mt-4 flex-1 py-3 leading-relaxed" />
            <div className="mt-1.5 flex justify-between text-xs text-muted"><span>Sent to our AI provider for feedback.</span><span>{answer.length}/1500</span></div>
            <VoiceRow onText={(t) => setAnswer((p) => appendSpoken(p, t, 1500))} />
            {error && <div className="mt-3"><Alert>{error.message}</Alert></div>}
            <button className="btn-primary mt-4" disabled={busy || answer.trim().length < 20} onClick={submit}>{busy ? `${coachName} is reading…` : 'Get coaching'}</button>
          </motion.section>
        )}

        {phase === 'result' && grade && rep && (
          <motion.section key="result" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-1 flex-col pt-5">
            {justUnlocked && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-5 rounded-2xl p-4 text-white" style={{ background: tileBackground(tint) }}>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">Unlocked</p>
                <p className="mt-1 font-bold">Mastery is open for {topic?.name}: advanced tools, edge cases and harder cases.</p>
              </motion.div>
            )}
            {roleplayUnlocked && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-5 rounded-2xl p-4 text-white" style={{ background: tileBackground(tint) }}>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">Unlocked</p>
                <p className="mt-1 font-bold">Real conversations: role-play {topic?.name} with a character or one of your people.</p>
                <button className="mt-3 rounded-full bg-white px-4 py-2 text-sm font-bold text-[#0b1640]" onClick={() => nav(`/roleplay/${topicId}`)}>Try a role-play</button>
              </motion.div>
            )}
            <GradeResult grade={grade} tools={rep.tools.length ? rep.tools : grade.toolsUsed} tint={tint} coach={coach} />
            <div className="mt-6 space-y-2">
              <button className="btn-primary" onClick={next}>Next rep</button>
              <button className="btn-ghost w-full" onClick={() => nav(-1)}>{done >= goal ? 'Back to the topic' : `Stop here (${done}/${goal} done)`}</button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}
