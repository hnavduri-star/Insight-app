import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { api, ApiError, pollPost, type Roleplay, type RoleplayOptions, type TopicDetail } from '../api';
import { useAuth } from '../auth';
import { Alert, Avatar, Spinner } from '../components/ui';
import { CoachAvatar } from '../components/Coach';
import { categoryTint, tileBackground } from '../components/CategoryIcon';
import { ScoreRing } from '../components/GradeResult';
import { COACHES } from '../options';

type Phase = 'choose' | 'setting-up' | 'brief' | 'chat' | 'debriefing' | 'debrief' | 'error';
const quoted = (s: string) => `“${s.trim().replace(/^["“']+|["”']+$/g, '')}”`;

/** Level 3: a real conversation with a character or one of your people, then a debrief. */
export default function RolePlay() {
  const { topicId } = useParams();
  const [search, setSearch] = useSearchParams();
  const nav = useNavigate();
  const { me } = useAuth();
  const coach = me?.coach ?? 'maya';
  const coachName = COACHES.find((c) => c.value === coach)?.name ?? 'Your coach';
  const [topic, setTopic] = useState<TopicDetail | null>(null);
  const [opts, setOpts] = useState<RoleplayOptions | null>(null);
  const [phase, setPhase] = useState<Phase>('choose');
  const [who, setWho] = useState<{ personId?: string; character?: string } | null>(null);
  const [difficulty, setDifficulty] = useState<Roleplay['difficulty']>('realistic');
  const [rp, setRp] = useState<Roleplay | null>(null);
  const [line, setLine] = useState('');
  const [busy, setBusy] = useState<'' | 'turn' | 'hint'>('');
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const alive = useRef(true);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => () => { alive.current = false; }, []);

  const fail = (e: unknown) => { const err = e as ApiError; setError({ message: err.message, code: err.code }); };
  const show = (r: Roleplay) => {
    setRp(r);
    setSearch({ id: r.id }, { replace: true });
    setPhase(r.status === 'debriefed' ? 'debrief' : r.turnsUsed === 0 && r.status === 'active' ? 'brief' : 'chat');
  };

  useEffect(() => {
    api<TopicDetail>(`/topics/${topicId}`).then(setTopic).catch(() => {});
    api<RoleplayOptions>(`/roleplay/options/${topicId}`).then(setOpts).catch((e) => { fail(e); setPhase('error'); });
    const id = search.get('id');
    if (id) api<Roleplay>(`/roleplay/${id}`).then(show).catch(() => setSearch({}, { replace: true }));
  }, [topicId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (phase !== 'chat') window.scrollTo(0, 0); }, [phase]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [rp?.transcript.length, busy]);

  const start = async (body: object) => {
    setPhase('setting-up'); setError(null);
    try { const r = await pollPost<Roleplay>('/roleplay/start', body, () => alive.current); if (alive.current) show(r); }
    catch (e) { if (alive.current) { fail(e); setPhase('error'); } }
  };

  const send = async () => {
    if (!rp || line.trim().length < 2) return;
    const text = line.trim();
    setBusy('turn'); setError(null);
    // Show the learner's line straight away while the character replies.
    setRp({ ...rp, transcript: [...rp.transcript, { who: 'learner', text }] });
    setLine('');
    try {
      const r = await pollPost<Roleplay>(`/roleplay/${rp.id}/turn`, { message: text, turn: rp.turnsUsed }, () => alive.current);
      if (alive.current) setRp(r);
    } catch (e) { if (alive.current) { fail(e); setRp(rp); setLine(text); } }
    finally { if (alive.current) setBusy(''); }
  };

  const hint = async () => {
    if (!rp) return;
    setBusy('hint'); setError(null);
    try {
      const { hint: h } = await api<{ hint: string }>(`/roleplay/${rp.id}/hint`, { body: {} });
      setRp({ ...rp, transcript: [...rp.transcript, { who: 'coach', text: h }] });
    } catch (e) { fail(e); } finally { setBusy(''); }
  };

  const debrief = async () => {
    if (!rp) return;
    setPhase('debriefing'); setError(null);
    try { const r = await pollPost<Roleplay>(`/roleplay/${rp.id}/debrief`, {}, () => alive.current); if (alive.current) { setRp(r); setPhase('debrief'); } }
    catch (e) { if (alive.current) { fail(e); setPhase('chat'); } }
  };

  const tint = categoryTint(topic?.category ?? '');
  const name = rp?.personName ?? rp?.setup.characterName ?? '';
  const turnsLeft = rp ? rp.maxTurns - rp.turnsUsed : 0;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-app flex-col px-4 pb-6" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
      <div className="sticky top-0 z-10 -mx-4 flex items-center gap-3 px-4 py-2 backdrop-blur-md" style={{ background: 'rgba(10, 22, 64, 0.85)' }}>
        <button onClick={() => nav(-1)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-ink" aria-label="Close role-play">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Real conversation · {topic?.name ?? ''}</p>
          {rp && phase === 'chat' ? (
            <div className="mt-1 flex items-center gap-1" aria-label={`${rp.turnsUsed} of ${rp.maxTurns} turns used`}>
              {Array.from({ length: rp.maxTurns }, (_, i) => (
                <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < rp.turnsUsed ? tint : 'rgba(255,255,255,0.12)' }} />
              ))}
            </div>
          ) : <p className="truncate font-bold">{rp?.setup.title ?? 'Role-play'}</p>}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {phase === 'choose' && (
          <motion.section key="choose" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col pt-4">
            {!opts ? <Spinner /> : !opts.track.roleplay.unlocked ? (
              <div className="space-y-4">
                <Alert kind="info">{opts.track.roleplay.needsToolkit ? 'Role-play opens after you finish Foundations: the tools and the quiz.'
                  : `Role-play opens after ${opts.track.roleplay.needsReps} more practice rep${opts.track.roleplay.needsReps === 1 ? '' : 's'}.`}</Alert>
                <button className="btn-primary" onClick={() => nav(opts.track.roleplay.needsToolkit ? `/bite/${topicId}` : `/practice/${topicId}`, { replace: true })}>
                  {opts.track.roleplay.needsToolkit ? 'Go to Foundations' : 'Do practice reps'}
                </button>
              </div>
            ) : (
              <>
                <h1 className="text-[26px] leading-tight">Who do you want to practise with?</h1>
                <p className="mt-1.5 text-sm text-muted">A short conversation of up to {opts.maxTurns} turns. {coachName} debriefs you at the end.</p>
                {opts.people.length > 0 && <>
                  <p className="eyebrow mt-5">Your people</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {opts.people.map((p) => (
                      <Choice key={p.id} active={who?.personId === p.id} tint={tint} onClick={() => setWho({ personId: p.id })}>
                        <span className="flex items-center gap-2"><Avatar name={p.name} size={30} /><span className="min-w-0"><span className="block truncate font-bold">{p.name}</span><span className="block truncate text-xs text-muted">{p.relationship}</span></span></span>
                      </Choice>
                    ))}
                  </div>
                </>}
                <p className="eyebrow mt-5">Characters</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {opts.characters.map((c) => (
                    <Choice key={c.id} active={who?.character === c.id} tint={tint} onClick={() => setWho({ character: c.id })}>
                      <span className="block font-bold leading-snug">{c.label}</span><span className="mt-0.5 block text-xs leading-snug text-muted">{c.notes}</span>
                    </Choice>
                  ))}
                </div>
                <p className="eyebrow mt-5">Difficulty</p>
                <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Difficulty">
                  {opts.difficulties.map((d) => (
                    <Choice key={d.value} active={difficulty === d.value} tint={tint} onClick={() => setDifficulty(d.value)} role="radio">
                      <span className="block text-center font-bold">{d.label}</span><span className="mt-0.5 block text-center text-[11px] leading-snug text-muted">{d.hint}</span>
                    </Choice>
                  ))}
                </div>
                {opts.recent.length > 0 && <>
                  <p className="eyebrow mt-5">Earlier conversations</p>
                  <ul className="mt-2 space-y-2">
                    {opts.recent.slice(0, 4).map((r) => (
                      <li key={r.id}><button className="card flex w-full items-center justify-between gap-3 px-4 py-3 text-left" onClick={() => api<Roleplay>(`/roleplay/${r.id}`).then(show).catch(fail)}>
                        <span className="truncate font-semibold">{r.title}</span>
                        <span className="shrink-0 text-xs font-bold" style={{ color: r.score != null ? tint : undefined }}>{r.score != null ? `${r.score}/100` : r.status === 'active' ? 'Continue' : 'Debrief'}</span>
                      </button></li>
                    ))}
                  </ul>
                </>}
                {error && <div className="mt-4"><Alert>{error.message}</Alert></div>}
                <div className="sticky bottom-0 -mx-4 mt-auto px-4 pb-1 pt-6" style={{ background: 'linear-gradient(to bottom, rgba(10,22,64,0) 0%, #0a1640 30%)' }}>
                  <button className="btn-primary" disabled={!who} onClick={() => start({ topicId, difficulty, ...who })}>Set up the conversation</button>
                </div>
              </>
            )}
          </motion.section>
        )}

        {(phase === 'setting-up' || phase === 'debriefing') && (
          <motion.section key={phase} exit={{ opacity: 0 }} className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="relative">
              <motion.div className="absolute -inset-6 rounded-full blur-2xl" style={{ background: tint }} animate={{ opacity: [0.2, 0.45, 0.2] }} transition={{ duration: 2.4, repeat: Infinity }} />
              <div className="relative"><CoachAvatar coach={coach} size={84} /></div>
            </div>
            <h1 className="mt-6 text-[22px]">{phase === 'setting-up' ? 'Setting the scene' : `${coachName} is reviewing your conversation`}</h1>
            <p className="mt-2 max-w-[17rem] text-sm text-muted">{phase === 'setting-up' ? 'Writing a situation from your world. This takes a few seconds.' : 'Scoring clarity, empathy, structure and your use of the tools.'}</p>
          </motion.section>
        )}

        {phase === 'error' && error && (
          <motion.section key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-1 flex-col justify-center gap-4">
            <Alert>{error.message}</Alert>
            {error.code === 'foundations_first' ? <button className="btn-primary" onClick={() => nav(`/bite/${topicId}`, { replace: true })}>Go to Foundations</button>
              : error.code === 'locked' ? <button className="btn-primary" onClick={() => nav(`/practice/${topicId}`, { replace: true })}>Do practice reps</button>
              : error.code !== 'daily_limit' && error.code !== 'premium_required' && <button className="btn-primary" onClick={() => { setError(null); setPhase('choose'); }}>Try again</button>}
            <button className="btn-ghost w-full" onClick={() => nav(-1)}>Back</button>
          </motion.section>
        )}

        {phase === 'brief' && rp && (
          <motion.section key="brief" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col pt-4">
            <div className="tile p-5" style={{ background: tileBackground(tint) }}>
              <p className="relative text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">The setup · {rp.difficulty}</p>
              <h1 className="relative mt-2 text-[26px] leading-tight">{rp.setup.title}</h1>
              <div className="relative mt-4 flex items-center gap-3 rounded-2xl bg-black/20 p-3">
                <Avatar name={name} size={40} />
                <div><p className="font-bold">{name}</p><p className="text-xs text-white/80">{rp.setup.characterRole}</p></div>
              </div>
              <p className="relative mt-4 text-[15px] leading-relaxed text-white/95">{rp.setup.situation}</p>
            </div>
            <div className="card mt-3 p-4">
              <p className="eyebrow">Your goal</p>
              <p className="mt-1 font-semibold leading-snug">{rp.setup.yourGoal}</p>
              {rp.setup.skills.length > 0 && <>
                <p className="eyebrow mt-4">Tools to use</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">{rp.setup.skills.map((s) => <span key={s} className="rounded-full border border-white/15 px-2.5 py-1 text-xs font-semibold">{s}</span>)}</div>
              </>}
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {name} has something on their mind they won't say straight away. Up to {rp.maxTurns} turns. Stuck? Tap Hint and {coachName} steps in.
            </p>
            <button className="btn-primary mt-auto" onClick={() => setPhase('chat')}>Start the conversation</button>
          </motion.section>
        )}

        {phase === 'chat' && rp && (
          <motion.section key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col pt-3">
            <div className="flex-1 space-y-3" aria-live="polite">
              {rp.transcript.map((t, i) => t.who === 'coach' ? (
                <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-2.5 rounded-2xl border border-primary/30 bg-primary/10 p-3">
                  <CoachAvatar coach={coach} size={30} idle={false} />
                  <p className="text-sm leading-relaxed"><span className="font-bold">{coachName}, stepping out:</span> {t.text}</p>
                </motion.div>
              ) : t.who === 'character' ? (
                <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-end gap-2 pr-10">
                  <Avatar name={name} size={30} />
                  <div className="card rounded-bl-md px-4 py-2.5 text-[15px] leading-relaxed"><p className="mb-0.5 text-[11px] font-bold text-muted">{name}</p>{t.text}</div>
                </motion.div>
              ) : (
                <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end pl-10">
                  <div className="rounded-2xl rounded-br-md px-4 py-2.5 text-[15px] leading-relaxed text-white" style={{ background: tileBackground(tint) }}>{t.text}</div>
                </motion.div>
              ))}
              {busy === 'turn' && <div className="flex items-center gap-2 text-sm text-muted"><Avatar name={name} size={30} /><TypingDots /></div>}
              <div ref={endRef} />
            </div>

            {error && <div className="mt-3"><Alert>{error.message}</Alert></div>}
            {rp.paused ? (
              <div className="mt-4 space-y-2">
                <button className="btn-ghost w-full" onClick={() => nav(-1)}>Leave for now</button>
              </div>
            ) : rp.status === 'active' ? (
              <div className="sticky bottom-0 -mx-4 mt-4 px-4 pb-1 pt-3" style={{ background: 'linear-gradient(to bottom, rgba(10,22,64,0) 0%, #0a1640 18px)' }}>
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>{turnsLeft} turn{turnsLeft === 1 ? '' : 's'} left</span>
                  <span className="flex gap-3">
                    <button className="font-bold text-primary disabled:opacity-50" onClick={hint} disabled={!!busy}>{busy === 'hint' ? 'Thinking…' : '💡 Hint'}</button>
                    {rp.canDebrief && <button className="font-bold text-ink/80" onClick={debrief} disabled={!!busy}>End and debrief</button>}
                  </span>
                </div>
                <div className="mt-2 flex items-end gap-2">
                  <label htmlFor="rp-line" className="sr-only">Your reply</label>
                  <textarea id="rp-line" value={line} rows={2} onChange={(e) => setLine(e.target.value.slice(0, 600))} placeholder={`Reply to ${name}…`}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} className="field min-h-[52px] flex-1 py-3 leading-relaxed" />
                  <button className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl text-white disabled:opacity-40" style={{ background: tileBackground(tint) }}
                    onClick={send} disabled={!!busy || line.trim().length < 2} aria-label="Send">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-muted">Sent to our AI provider to play the character.</p>
              </div>
            ) : (
              <div className="mt-5 space-y-2">
                <p className="text-center text-sm text-muted">The conversation is over.</p>
                <button className="btn-primary" onClick={debrief}>Get your debrief</button>
              </div>
            )}
          </motion.section>
        )}

        {phase === 'debrief' && rp?.debrief && (
          <motion.section key="debrief" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-1 flex-col pt-5">
            <DebriefView rp={rp} tint={tint} coach={coach} coachName={coachName} name={name} />
            <div className="mt-6 space-y-2">
              <button className="btn-primary" onClick={() => start({ replayOf: rp.id })}>Replay with a better move</button>
              <button className="btn-ghost w-full" onClick={() => { setRp(null); setSearch({}, { replace: true }); setWho(null); setPhase('choose'); api<RoleplayOptions>(`/roleplay/options/${topicId}`).then(setOpts).catch(() => {}); }}>
                New conversation
              </button>
              <button className="btn-ghost w-full" onClick={() => nav(-1)}>Back to the topic</button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}

function Choice({ active, tint, onClick, children, role }: { active: boolean; tint: string; onClick: () => void; children: React.ReactNode; role?: string }) {
  return (
    <button type="button" onClick={onClick} role={role} aria-checked={role ? active : undefined} aria-pressed={role ? undefined : active}
      className="card w-full p-3 text-left transition active:scale-[0.98]"
      style={active ? { boxShadow: `inset 0 0 0 2px ${tint}`, background: `color-mix(in oklab, ${tint} 16%, rgba(18,43,94,0.7))` } : undefined}>
      {children}
    </button>
  );
}

function TypingDots() {
  return (
    <span className="card inline-flex gap-1 rounded-bl-md px-4 py-3" aria-label="Typing">
      {[0, 1, 2].map((i) => <motion.span key={i} className="h-1.5 w-1.5 rounded-full bg-muted" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }} />)}
    </span>
  );
}

function DebriefView({ rp, tint, coach, coachName, name }: { rp: Roleplay; tint: string; coach: 'maya' | 'alex'; coachName: string; name: string }) {
  const d = rp.debrief!;
  const rubric = [['Clarity', d.rubric.clarity], ['Empathy', d.rubric.empathy], ['Structure', d.rubric.structure], ['Use of tools', d.rubric.tools]] as const;
  return (
    <div>
      <div className="flex flex-col items-center text-center">
        <ScoreRing score={d.score} tint={tint} />
        <p className="mt-3 text-lg font-bold">{d.score >= 80 ? 'A strong conversation' : d.score >= 60 ? 'Solid. A step away from great' : 'A good start to build on'}</p>
        <p className="text-sm text-muted">With {name} · {rp.difficulty}</p>
      </div>
      <div className="card mt-5 space-y-3 p-4">
        {rubric.map(([label, v]) => (
          <div key={label}>
            <div className="flex justify-between text-sm"><span className="font-semibold">{label}</span><span className="font-bold">{v}</span></div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full" style={{ background: tint }} initial={{ width: 0 }} animate={{ width: `${v}%` }} transition={{ duration: 0.9 }} /></div>
          </div>
        ))}
      </div>
      {d.toolsUsed.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{d.toolsUsed.map((t) => <span key={t} className="rounded-full bg-success/20 px-2.5 py-1 text-xs font-semibold text-success">✓ {t}</span>)}</div>}
      <div className="mt-4 grid gap-2.5">
        <div className="rounded-2xl border border-success/30 bg-success/10 p-4"><p className="text-xs font-bold uppercase tracking-wider text-success">What went well</p><p className="mt-1 text-[15px]">{d.wentWell}</p></div>
        <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4"><p className="text-xs font-bold uppercase tracking-wider text-primary">One thing to improve</p><p className="mt-1 text-[15px]">{d.improve}</p></div>
        <div className="rounded-2xl bg-white p-4 text-[#0b1640]">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em]" style={{ color: `color-mix(in oklab, ${tint} 60%, #0b1640)` }}>A better move</p>
          <p className="mt-1.5 text-sm text-[#0b1640]/70">You said {quoted(d.betterMove.yourLine)}</p>
          <p className="mt-1 text-[15px] font-semibold leading-relaxed">Try: {quoted(d.betterMove.tryInstead)}</p>
        </div>
        <div className="flex items-start gap-3 pt-1">
          <CoachAvatar coach={coach} size={40} />
          <p className="card px-4 py-3 text-sm leading-relaxed"><span className="font-bold">{coachName}:</span> What {name} wanted: {d.revealed}</p>
        </div>
      </div>
    </div>
  );
}
