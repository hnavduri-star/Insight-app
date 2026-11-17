import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { api, ApiError, pollPost, type Grade, type Situation as SituationT } from '../api';
import { useAuth } from '../auth';
import { Alert, Spinner } from '../components/ui';
import { CoachAvatar } from '../components/Coach';
import { GradeResult } from '../components/GradeResult';
import { appendSpoken, VoiceRow } from '../components/Mic';
import { COACHES } from '../options';

const TINT = '#ffb36b';
const GRAD = 'radial-gradient(90% 70% at 100% 0%, rgba(255,255,255,0.22) 0%, transparent 60%), linear-gradient(155deg, #f05a7e 0%, #7c3aed 100%)';
const EXAMPLES = ['Asking for a raise on Friday', 'Telling my team about a reorganisation', 'A client wants a discount we can\'t give', 'Setting boundaries with a family member'];
const quoted = (s: string) => `“${s.trim().replace(/^["“']+|["”']+$/g, '')}”`;

function TopBar({ title }: { title: string }) {
  const nav = useNavigate();
  return (
    <div className="sticky top-0 z-10 -mx-4 flex items-center gap-3 px-4 py-2 backdrop-blur-md" style={{ background: 'rgba(10, 22, 64, 0.85)' }}>
      <button onClick={() => nav(-1)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-ink" aria-label="Back">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M15 18l-6-6 6-6" /></svg>
      </button>
      <p className="font-bold">{title}</p>
    </div>
  );
}

/** Describe a real upcoming moment; get a prep plan. Also lists recent situations. */
export function NewSituation({ asTab = false }: { asTab?: boolean }) {
  const nav = useNavigate();
  const { me } = useAuth();
  const coach = me?.coach ?? 'maya';
  const coachName = COACHES.find((c) => c.value === coach)?.name ?? 'Your coach';
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recent, setRecent] = useState<{ id: string; title: string; text: string; bestScore: number | null }[] | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  useEffect(() => { api<typeof recent>('/situations').then(setRecent).catch(() => setRecent([])); }, []);

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const s = await pollPost<SituationT>('/situations', { text }, () => alive.current, 4 * 60_000);
      if (alive.current) nav(`/situation/${s.id}`, { replace: true });
    } catch (e) { if (alive.current) { setError((e as ApiError).message); setBusy(false); } }
  };

  return (
    <main className={asTab ? 'page page-with-nav flex min-h-dvh flex-col' : 'mx-auto flex min-h-dvh w-full max-w-app flex-col px-4 pb-8'} style={asTab ? undefined : { paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
      {asTab ? (
        <>
          <h1 className="text-[34px] leading-[1.05] tracking-tight">What’s on your mind?</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">A conversation coming up, a decision, a tricky person. Tell {coachName} and get a plan, the words to use, and a rehearsal.</p>
        </>
      ) : (
        <>
          <TopBar title="I have a situation" />
          <div className="tile mt-3 p-5" style={{ background: GRAD }}>
            <p className="relative text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">Prepare for a real moment</p>
            <h1 className="relative mt-2 text-[26px] leading-tight text-white">What's coming up?</h1>
            <p className="relative mt-2 text-sm text-white/90">Describe it in a sentence or two. You'll get a plan, the words to use, replies to likely pushback, and a rehearsal with {coachName}.</p>
          </div>
        </>
      )}
      {busy ? (
        <div className="mt-10 flex flex-col items-center text-center">
          <CoachAvatar coach={coach} size={80} />
          <p className="mt-5 font-bold">{coachName} is preparing your plan…</p>
          <p className="mt-1 text-sm text-muted">This usually takes under a minute.</p>
        </div>
      ) : (
        <>
          <label htmlFor="situation" className={asTab ? 'sr-only' : 'label mt-5'}>Your situation</label>
          <textarea id="situation" rows={asTab ? 5 : 4} value={text} onChange={(e) => setText(e.target.value.slice(0, 600))} className="field py-3 leading-relaxed"
            placeholder="e.g. My boss Raj wants to cut my team's budget at Thursday's review, and I need to keep two roles." />
          <div className="mt-1.5 flex justify-between text-xs text-muted"><span>Sent to our AI provider to build your plan.</span><span>{text.length}/600</span></div>
          <VoiceRow onText={(t) => setText((p) => appendSpoken(p, t, 600))} />
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((x) => <button key={x} type="button" onClick={() => setText(x)} className="chip chip-off min-h-[36px] text-xs">{x}</button>)}
          </div>
          {error && <div className="mt-4"><Alert>{error}</Alert></div>}
          <button className="btn-primary mt-5" disabled={text.trim().length < 15} onClick={submit}>Build my plan</button>
          {recent && recent.length > 0 && (
            <section className="mt-8">
              <p className="eyebrow">Your recent situations</p>
              <ul className="mt-2 space-y-2">
                {recent.map((r) => (
                  <li key={r.id}>
                    <Link to={`/situation/${r.id}`} className="card flex items-center gap-3 px-4 py-3">
                      <span className="min-w-0 flex-1"><span className="block font-bold">{r.title}</span><span className="block truncate text-xs text-muted">{r.text}</span></span>
                      {r.bestScore != null && <span className="text-xs font-bold text-success">{r.bestScore}/100</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.14em]" style={{ color: TINT }}>{label}</p>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** The prep plan for one situation, with a coached rehearsal. */
export function SituationPlan() {
  const { id } = useParams();
  const { me } = useAuth();
  const coach = me?.coach ?? 'maya';
  const coachName = COACHES.find((c) => c.value === coach)?.name ?? 'Your coach';
  const [s, setS] = useState<SituationT | null>(null);
  const [error, setError] = useState('');
  const [rehearsing, setRehearsing] = useState(false);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [grade, setGrade] = useState<Grade | null>(null);
  useEffect(() => { api<SituationT>(`/situations/${id}`).then(setS).catch((e) => setError(e.message)); }, [id]);

  const submit = async () => {
    setBusy(true); setError('');
    try { setGrade(await api<Grade>(`/situations/${id}/rehearse`, { body: { response: answer } })); }
    catch (e) { setError((e as ApiError).message); } finally { setBusy(false); }
  };

  if (!s) return <main className="mx-auto w-full max-w-app px-4 pt-6">{error ? <Alert>{error}</Alert> : <Spinner label="Loading your plan" />}</main>;
  const p = s.plan;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-app flex-col px-4 pb-10" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
      <TopBar title="Your plan" />
      <AnimatePresence mode="wait">
        {!rehearsing ? (
          <motion.div key="plan" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="tile mt-3 p-5" style={{ background: GRAD }}>
              <p className="relative text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">Your situation</p>
              <h1 className="relative mt-2 text-[26px] leading-tight text-white">{p.title}</h1>
              <p className="relative mt-2 text-[15px] leading-relaxed text-white/95">{p.summary}</p>
              <p className="relative mt-3 rounded-xl bg-black/20 px-3 py-2 text-sm text-white"><span className="font-bold">Aim for: </span>{p.goal}</p>
            </div>

            <Block label="Your opening line">
              <p className="rounded-2xl rounded-bl-md bg-white px-4 py-3 text-[16px] font-bold leading-snug text-[#0b1640]">{quoted(p.openingLine)}</p>
            </Block>

            <Block label="Your plan, step by step">
              <ol className="space-y-2.5">
                {p.steps.map((x, i) => (
                  <li key={i} className="card flex gap-3 p-4">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white" style={{ background: GRAD }}>{i + 1}</span>
                    <span><span className="block font-bold">{x.tool}</span><span className="text-[14.5px] leading-relaxed text-ink/90">{x.how}</span></span>
                  </li>
                ))}
              </ol>
            </Block>

            <Block label="More things you can say">
              <div className="space-y-2">{p.phrases.map((x, i) => <p key={i} className="rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.06] px-4 py-3 text-[15px] font-semibold">{quoted(x)}</p>)}</div>
            </Block>

            <Block label="If they push back">
              <div className="space-y-2.5">
                {p.anticipate.map((x, i) => (
                  <div key={i} className="card p-4 text-[14.5px]">
                    <p className="text-muted"><span className="font-bold text-ink">They say: </span>{quoted(x.theySay)}</p>
                    <p className="mt-2"><span className="font-bold" style={{ color: TINT }}>You say: </span>{quoted(x.youSay)}</p>
                  </div>
                ))}
              </div>
            </Block>

            <Block label="Avoid">
              <ul className="space-y-1.5">{p.avoid.map((x, i) => <li key={i} className="flex gap-2 text-[14.5px]"><span className="text-error">✕</span>{x}</li>)}</ul>
            </Block>

            {p.topics.some((t) => t.id) && (
              <Block label="Go deeper">
                <div className="space-y-2">
                  {p.topics.filter((t) => t.id).map((t) => (
                    <Link key={t.name} to={`/bite/${t.id}`} className="card flex items-center gap-3 px-4 py-3">
                      <span className="flex-1"><span className="block font-bold">{t.name}</span><span className="text-xs text-muted">{t.why}</span></span>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted" aria-hidden><path d="m9 6 6 6-6 6" /></svg>
                    </Link>
                  ))}
                </div>
              </Block>
            )}

            <button className="btn-primary mt-8" onClick={() => setRehearsing(true)}>Rehearse it with {coachName}</button>
          </motion.div>
        ) : (
          <motion.div key="rehearse" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} className="flex flex-1 flex-col">
            {!grade ? (
              <>
                <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em]" style={{ color: TINT }}>Rehearsal</p>
                <div className="tile mt-2 p-5" style={{ background: GRAD }}><p className="relative text-[16px] font-semibold leading-relaxed text-white">{p.rehearsal}</p></div>
                <label htmlFor="rehearse" className="sr-only">Your response</label>
                <textarea id="rehearse" rows={6} value={answer} onChange={(e) => setAnswer(e.target.value.slice(0, 1500))} className="field mt-4 flex-1 py-3 leading-relaxed" placeholder="Type exactly what you would say…" />
                <VoiceRow onText={(t) => setAnswer((p) => appendSpoken(p, t, 1500))} />
                {error && <div className="mt-3"><Alert>{error}</Alert></div>}
                <button className="btn-primary mt-4" disabled={busy || answer.trim().length < 20} onClick={submit}>{busy ? `${coachName} is reading…` : 'Get coaching'}</button>
                <button className="mt-2 min-h-[44px] text-sm text-muted" onClick={() => setRehearsing(false)}>Back to the plan</button>
              </>
            ) : (
              <div className="pt-5">
                <GradeResult grade={grade} tools={p.steps.map((x) => x.tool)} tint={TINT} coach={coach} />
                <div className="mt-6 space-y-2">
                  <button className="btn-primary" onClick={() => { setGrade(null); }}>Try again</button>
                  <button className="btn-ghost w-full" onClick={() => { setGrade(null); setRehearsing(false); }}>Back to the plan</button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
