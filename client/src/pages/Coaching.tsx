import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { api, ApiError, pollPost } from '../api';
import { useAuth } from '../auth';
import { Alert, Spinner } from '../components/ui';
import { CoachAvatar } from '../components/Coach';
import { appendSpoken, MicButton } from '../components/Mic';
import { speak, stopSpeaking, ttsSupported } from '../lib/speak';
import { COACHES } from '../options';

type Attr = { name: string; why: string | null };
type Commitment = { id: string; attribute: string; action: string; when: string | null; status: 'open' | 'done' | 'dropped'; note: string | null };
type Hub = { attributes: Attr[]; choices: string[]; max: number; commitments: Commitment[]; sessions: { id: string; attribute: string; status: string; createdAt: string; explored: string | null }[] };
type Line = { who: 'coach' | 'coachee'; text: string };
type Summary = { explored: string; insights: string[]; commitments: { action: string; when: string | null }[]; nextFocus: string };
type Session = { id: string; attribute: string; status: 'active' | 'closed'; stage: string; transcript: Line[]; turnsUsed: number; maxTurns: number; summary: Summary | null; paused?: boolean; adviceRequested?: boolean };

const STAGES: [string, string][] = [['goal', 'Goal'], ['reality', 'Reality'], ['options', 'Options'], ['will', 'Way forward']];

/** Coaching hub: choose what to develop, start sessions, review your own commitments. */
export default function Coaching() {
  const nav = useNavigate();
  const { me } = useAuth();
  const coach = me?.coach ?? 'maya';
  const coachName = COACHES.find((c) => c.value === coach)?.name ?? 'Your coach';
  const [hub, setHub] = useState<Hub | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState<string | null>(null);
  const load = () => api<Hub>('/coaching').then((h) => { setHub(h); if (!h.attributes.length) setEditing(true); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const start = async (attribute: string) => {
    setStarting(attribute); setError('');
    try { const s = await pollPost<Session>('/coaching/sessions', { attribute }); nav(`/coach/session/${s.id}`); }
    catch (e) { setError((e as Error).message); } finally { setStarting(null); }
  };
  const review = async (c: Commitment, status: 'done' | 'dropped') => {
    await api(`/coaching/commitments/${c.id}`, { body: { status } }).catch(() => {});
    setHub((h) => (h ? { ...h, commitments: h.commitments.filter((x) => x.id !== c.id) } : h));
  };

  return (
    <main className="page page-with-nav">
      <div className="flex items-center gap-3">
        <CoachAvatar coach={coach} size={52} />
        <div><p className="eyebrow">Your coach</p><h1 className="text-[26px] leading-tight">{coachName}</h1></div>
      </div>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        Coaching is different from learning. {coachName} won't tell you what to do. You bring what matters, {coachName} asks the questions, and you find your own way forward. Ask directly if you'd like ideas.
      </p>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      {!hub && !error && <Spinner />}

      {hub && editing && <PlanEditor hub={hub} onSaved={(attributes) => { setHub({ ...hub, attributes }); setEditing(false); }} onCancel={hub.attributes.length ? () => setEditing(false) : undefined} />}

      {hub && !editing && (
        <>
          <section className="mt-5">
            <div className="flex items-baseline justify-between"><p className="eyebrow">What you're developing</p><button className="text-xs font-bold text-primary" onClick={() => setEditing(true)}>Change</button></div>
            <ul className="mt-2 space-y-2.5">
              {hub.attributes.map((a) => (
                <li key={a.name} className="tile hero-grad p-4">
                  <p className="relative text-[20px] font-extrabold leading-tight">{a.name}</p>
                  {a.why && <p className="relative mt-1 text-sm text-white/85">“{a.why}”</p>}
                  <button className="relative mt-3 inline-flex min-h-[44px] items-center rounded-btn bg-white px-4 text-sm font-bold text-[#1e3a8a] disabled:opacity-60"
                    onClick={() => start(a.name)} disabled={!!starting}>{starting === a.name ? 'Opening…' : 'Start a session'}</button>
                </li>
              ))}
            </ul>
          </section>

          {hub.commitments.length > 0 && (
            <section className="mt-6">
              <p className="eyebrow">Your commitments</p>
              <ul className="mt-2 space-y-2">
                {hub.commitments.map((c) => (
                  <li key={c.id} className="card p-4">
                    <p className="font-semibold leading-snug">{c.action}</p>
                    <p className="mt-0.5 text-xs text-muted">{c.attribute}{c.when ? ` · ${c.when}` : ''}</p>
                    <div className="mt-2 flex gap-2">
                      <button className="rounded-full bg-success/15 px-3 py-1.5 text-xs font-bold text-success" onClick={() => review(c, 'done')}>✓ Done</button>
                      <button className="rounded-full bg-white/[0.07] px-3 py-1.5 text-xs font-bold text-muted" onClick={() => review(c, 'dropped')}>Let it go</button>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">{coachName} will ask about these at your next session.</p>
            </section>
          )}

          {hub.sessions.length > 0 && (
            <section className="mt-6">
              <p className="eyebrow">Sessions</p>
              <ul className="mt-2 space-y-2">
                {hub.sessions.map((s) => (
                  <li key={s.id}>
                    <Link to={`/coach/session/${s.id}`} className="card flex items-center gap-3 p-4">
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold">{s.attribute}</span>
                        <span className="block truncate text-xs text-muted">{s.status === 'active' ? 'In progress · continue' : s.explored ?? new Date(s.createdAt).toLocaleDateString()}</span>
                      </span>
                      <span className="text-xs text-muted">{new Date(s.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="mt-6 text-center text-xs leading-relaxed text-muted">Your sessions are private to you. This is coaching, not therapy or professional advice.</p>
        </>
      )}
    </main>
  );
}

function PlanEditor({ hub, onSaved, onCancel }: { hub: Hub; onSaved: (a: Attr[]) => void; onCancel?: () => void }) {
  const [picked, setPicked] = useState<Attr[]>(hub.attributes);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toggle = (name: string) => setPicked((p) => (p.some((x) => x.name === name) ? p.filter((x) => x.name !== name) : p.length >= hub.max ? p : [...p, { name, why: null }]));
  const save = async () => {
    setBusy(true); setError('');
    try { onSaved((await api<{ attributes: Attr[] }>('/coaching/plan', { method: 'PUT', body: { attributes: picked.map((p) => ({ name: p.name, why: p.why || undefined })) } })).attributes); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <section className="mt-5">
      <h2 className="text-[22px]">What do you want to develop?</h2>
      <p className="mt-1 text-sm text-muted">Choose up to {hub.max}. Pick what matters to you, not what you think you should.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {[...hub.choices, ...picked.map((p) => p.name).filter((n) => !hub.choices.includes(n))].map((c) => {
          const on = picked.some((p) => p.name === c);
          return <button key={c} type="button" aria-pressed={on} onClick={() => toggle(c)} className={`chip ${on ? 'chip-on' : 'chip-off'}`}>{c}</button>;
        })}
      </div>
      <div className="mt-3 flex gap-2">
        <label htmlFor="custom-attr" className="sr-only">Something else</label>
        <input id="custom-attr" className="field flex-1" placeholder="Something else? e.g. Speaking up" value={custom} onChange={(e) => setCustom(e.target.value.slice(0, 40))} />
        <button className="btn-ghost px-4" disabled={custom.trim().length < 2 || picked.length >= hub.max} onClick={() => { toggle(custom.trim()); setCustom(''); }}>Add</button>
      </div>
      {picked.length > 0 && (
        <div className="mt-4 space-y-3">
          {picked.map((p, i) => (
            <div key={p.name}>
              <label htmlFor={`why-${i}`} className="label">Why does {p.name.toLowerCase()} matter to you right now? (optional)</label>
              <input id={`why-${i}`} className="field" value={p.why ?? ''} maxLength={200}
                onChange={(e) => setPicked((all) => all.map((x) => (x.name === p.name ? { ...x, why: e.target.value } : x)))} placeholder="In your own words" />
            </div>
          ))}
        </div>
      )}
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <button className="btn-primary mt-4" disabled={busy || !picked.length} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
      {onCancel && <button className="btn-ghost mt-2 w-full" onClick={onCancel}>Cancel</button>}
    </section>
  );
}

/** One coaching session: a conversation the coachee leads, then notes and their own commitments. */
export function CoachingSession() {
  const { id } = useParams();
  const nav = useNavigate();
  const { me } = useAuth();
  const coach = me?.coach ?? 'maya';
  const coachName = COACHES.find((c) => c.value === coach)?.name ?? 'Your coach';
  const [s, setS] = useState<Session | null>(null);
  const [line, setLine] = useState('');
  const [busy, setBusy] = useState<'' | 'turn' | 'close'>('');
  const [error, setError] = useState('');
  const [voiceOn, setVoiceOn] = useState(false);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { api<Session>(`/coaching/sessions/${id}`).then(setS).catch((e) => setError(e.message)); return () => stopSpeaking(); }, [id]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [s?.transcript.length, busy]);

  const send = async () => {
    if (!s || !line.trim()) return;
    const text = line.trim();
    setBusy('turn'); setError(''); setLine('');
    setS({ ...s, transcript: [...s.transcript, { who: 'coachee', text }] });
    try {
      const r = await pollPost<Session>(`/coaching/sessions/${s.id}/message`, { text, turn: s.turnsUsed });
      setS(r);
      if (voiceOn) speak(r.transcript[r.transcript.length - 1].text, coachName);
    } catch (e) { setError((e as ApiError).message); setS(s); setLine(text); } finally { setBusy(''); }
  };
  const close = async () => {
    if (!s) return;
    setBusy('close'); setError('');
    try { const r = await pollPost<Session & { commitments?: Commitment[] }>(`/coaching/sessions/${s.id}/close`, {}); setS(r); setCommitments(r.commitments ?? []); }
    catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  const stageIdx = STAGES.findIndex(([k]) => k === s?.stage);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-app flex-col px-4 pb-6" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
      <div className="sticky top-0 z-10 -mx-4 flex items-center gap-3 px-4 py-2 backdrop-blur-md" style={{ background: 'rgba(10, 22, 64, 0.85)' }}>
        <button onClick={() => nav('/coach')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10" aria-label="Back to coaching">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d="m15 6-6 6 6 6" /></svg>
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Coaching · {s?.attribute ?? ''}</p>
          <div className="mt-1 flex gap-1" aria-label={`Stage: ${STAGES[stageIdx]?.[1] ?? 'Getting started'}`}>
            {STAGES.map(([k, l], i) => (
              <span key={k} className="flex-1 truncate rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold"
                style={{ background: i <= stageIdx ? 'rgba(62,230,207,0.2)' : 'rgba(255,255,255,0.06)', color: i <= stageIdx ? '#3ee6cf' : undefined }}>{l}</span>
            ))}
          </div>
        </div>
        {ttsSupported() && s?.status === 'active' && (
          <button onClick={() => { setVoiceOn((v) => !v); stopSpeaking(); }} aria-pressed={voiceOn} aria-label={voiceOn ? 'Mute coach voice' : 'Let the coach speak aloud'}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M11 5 6 9H3v6h3l5 4V5Z" />{voiceOn ? <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /> : <path d="m16 9 5 6M21 9l-5 6" />}
            </svg>
          </button>
        )}
      </div>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      {!s && !error && <Spinner />}

      {s && (
        <>
          <div className="flex-1 space-y-3 pt-3" aria-live="polite">
            {s.transcript.map((t, i) => t.who === 'coach' ? (
              <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-end gap-2 pr-8">
                <CoachAvatar coach={coach} size={32} idle={false} />
                <div className="card rounded-bl-md px-4 py-3 text-[15.5px] leading-relaxed">{t.text}</div>
              </motion.div>
            ) : (
              <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end pl-10">
                <div className="rounded-2xl rounded-br-md bg-[#11b39f] px-4 py-3 text-[15.5px] leading-relaxed text-white">{t.text}</div>
              </motion.div>
            ))}
            {busy === 'turn' && <div className="flex items-center gap-2 text-sm text-muted"><CoachAvatar coach={coach} size={32} idle={false} /><span className="card rounded-bl-md px-4 py-3">…</span></div>}
            <div ref={endRef} />
          </div>

          <AnimatePresence>
            {s.status === 'closed' && s.summary && (
              <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-5 space-y-3">
                <div className="tile hero-grad p-5">
                  <p className="relative text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">Session notes</p>
                  <p className="relative mt-2 text-[16px] font-semibold leading-relaxed">{s.summary.explored}</p>
                </div>
                {s.summary.insights.length > 0 && (
                  <div className="card p-4"><p className="eyebrow">What you realised</p>
                    <ul className="mt-2 space-y-1.5">{s.summary.insights.map((x) => <li key={x} className="flex gap-2 text-[15px]"><span className="text-accent" aria-hidden>✦</span>{x}</li>)}</ul></div>
                )}
                <div className="card p-4"><p className="eyebrow">You committed to</p>
                  {s.summary.commitments.length ? (
                    <ul className="mt-2 space-y-1.5">{s.summary.commitments.map((c) => <li key={c.action} className="text-[15px] font-semibold">→ {c.action}{c.when ? <span className="font-normal text-muted"> · {c.when}</span> : null}</li>)}</ul>
                  ) : <p className="mt-1 text-sm text-muted">No commitments this time, and that's fine. Sometimes clarity is the outcome.</p>}
                  {commitments.length > 0 && <p className="mt-2 text-xs text-muted">{coachName} will ask how it went next time.</p>}
                </div>
                <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4"><p className="text-xs font-bold uppercase tracking-wider text-primary">To think about before next time</p><p className="mt-1 text-[15px]">{s.summary.nextFocus}</p></div>
                <button className="btn-primary" onClick={() => nav('/coach')}>Done</button>
              </motion.section>
            )}
          </AnimatePresence>

          {s.status === 'active' && !s.paused && (
            <div className="sticky bottom-0 -mx-4 mt-4 px-4 pb-1 pt-3" style={{ background: 'linear-gradient(to bottom, rgba(10,22,64,0) 0%, #0a1640 18px)' }}>
              <div className="flex items-end gap-2">
                <label htmlFor="coach-line" className="sr-only">Your reply</label>
                <textarea id="coach-line" value={line} rows={2} onChange={(e) => setLine(e.target.value.slice(0, 1200))} placeholder="Take your time…"
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} className="field min-h-[52px] flex-1 py-3 leading-relaxed" />
                <MicButton onText={(t) => setLine((p) => appendSpoken(p, t, 1200))} onStart={stopSpeaking} label="Speak your reply" />
                <button className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-[#11b39f] text-white disabled:opacity-40" onClick={send} disabled={!!busy || !line.trim()} aria-label="Send">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
                <span>Private to you · sent to our AI provider to coach you</span>
                {s.turnsUsed >= 2 && <button className="font-bold text-ink/85" onClick={close} disabled={!!busy}>{busy === 'close' ? 'Writing your notes…' : 'End session'}</button>}
              </div>
            </div>
          )}
          {s.paused && <button className="btn-ghost mt-4 w-full" onClick={() => nav('/coach')}>Leave for now</button>}
        </>
      )}
    </main>
  );
}
