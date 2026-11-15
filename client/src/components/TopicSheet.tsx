import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Me, type TopicDetail, type Track } from '../api';
import { useAuth } from '../auth';
import { Alert, Spinner } from './ui';
import { Sheet } from './Sheet';
import { CategoryGlyph, categoryTint, tileBackground } from './CategoryIcon';
import { Paywall } from './Paywall';
import { personaPhrase } from '../options';

export function LockIcon({ className = 'text-muted/60' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-label="Premium">
      <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/** A matte "book" tile: a coloured cover with a spine, so sources read as books. */
function BookCover({ title, tint }: { title: string; tint: string }) {
  return (
    <span aria-hidden className="relative flex h-14 w-10 shrink-0 items-end overflow-hidden rounded-[4px] rounded-r-[6px] p-1"
      style={{ background: `linear-gradient(150deg, ${tint}, color-mix(in oklab, ${tint} 45%, #0b1640))`, boxShadow: 'inset 3px 0 0 rgba(0,0,0,0.25), 0 4px 10px -4px rgba(0,0,0,0.6)' }}>
      <span className="text-[11px] font-extrabold leading-none text-white/95">{title.replace(/^(The|A) /, '')[0]}</span>
    </span>
  );
}

export function TopicSheet({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged?: () => void }) {
  const { me, setMe } = useAuth();
  const nav = useNavigate();
  const [t, setT] = useState<TopicDetail | null>(null);
  const [error, setError] = useState('');
  const [paywall, setPaywall] = useState(false);
  const [busy, setBusy] = useState(false);
  const [track, setTrack] = useState<Track | null>(null);
  useEffect(() => {
    setT(null); setError(''); setTrack(null);
    if (id) api<TopicDetail>(`/topics/${id}`).then((d) => {
      setT(d);
      if (d.unlocked) api<Track>(`/bites/track/${id}`).then(setTrack).catch(() => {});
    }).catch((e) => setError(e.message));
  }, [id]);
  const chooseFree = async () => {
    if (!t) return;
    setBusy(true); setError('');
    try {
      setMe(await api<Me>('/me/free-topic', { body: { topicId: t.id } }));
      setT({ ...t, unlocked: true, free: true });
      onChanged?.();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const tint = t ? categoryTint(t.category) : '#5ec2ff';
  return (
    <>
      <Sheet open={!!id && !paywall} onClose={onClose} title={t?.name ?? 'Topic'}>
        {error && <Alert>{error}</Alert>}
        {!t && !error && <Spinner />}
        {t && (
          <div>
            <div className="tile -mx-1 p-5" style={{ background: tileBackground(tint) }}>
              <CategoryGlyph name={t.category} size={120} className="absolute -right-5 -top-4 text-white/15" />
              <p className="relative text-[11px] font-bold uppercase tracking-[0.14em] text-white/75">{t.category}</p>
              <h3 className="relative mt-2 text-[28px] leading-tight">{t.name}</h3>
              {t.description && <p className="relative mt-2 text-[15px] leading-relaxed text-white/90">{t.description}</p>}
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Not a summary. Your toolkit turns the best ideas from these books into practical tools you can use straight away,
              shaped for {me?.persona ? personaPhrase(me.persona) : 'you'}{me?.industry && me.industry !== 'Other' ? ` in ${me.industry.toLowerCase()}` : ''}
              {me?.goals?.[0] ? <> and your goal: <span className="text-ink/90">{me.goals[0].toLowerCase()}</span></> : null}.
            </p>
            <TrackLevels t={t} track={track} tint={tint} go={(path) => nav(path)} />
            <p className="eyebrow mt-6">Drawn from</p>
            <ul className="mt-2.5 space-y-2.5">
              {t.books.map((b) => (
                <li key={b.title} className="flex items-center gap-3.5">
                  <BookCover title={b.title} tint={tint} />
                  <span>
                    <span className="block font-semibold leading-snug">{b.title}</span>
                    <span className="text-xs text-muted">
                      {b.author}{b.kind === 'fiction' && <span className="ml-2 rounded-full border border-[#a78bfa]/40 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-[#c4b5fd]">Fiction</span>}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="sticky -mx-5 mt-5 space-y-3 px-5 pt-6"
              style={{
                bottom: 'calc(-1.5rem - env(safe-area-inset-bottom))',
                marginBottom: 'calc(-1.5rem - env(safe-area-inset-bottom))',
                paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))',
                background: 'linear-gradient(to bottom, rgba(16,39,90,0) 0%, #10275a 24px)',
              }}>
              {t.unlocked ? (
                <>
                  {t.free && <p className="text-center text-sm font-medium text-accent">This is your free topic.</p>}
                  <NextStep t={t} track={track} go={(path) => nav(path)} />
                </>
              ) : !me?.freeTopicId ? (
                <>
                  <button className="btn-primary" onClick={chooseFree} disabled={busy}>{busy ? 'Saving…' : 'Make this my free topic'}</button>
                  <p className="text-center text-xs text-muted">Your first topic is free. You can change it until you start it.</p>
                </>
              ) : (
                <>
                  <button className="btn-primary" onClick={() => setPaywall(true)}><LockIcon className="" /> Unlock with Premium</button>
                  <button className="btn-ghost w-full text-sm" onClick={chooseFree} disabled={busy}>Switch my free topic to this one</button>
                </>
              )}
            </div>
          </div>
        )}
      </Sheet>
      <Paywall open={paywall} onClose={() => setPaywall(false)} topicName={t?.name} />
    </>
  );
}

/** The single best next step on this topic's track. */
function NextStep({ t, track, go }: { t: TopicDetail; track: Track | null; go: (path: string) => void }) {
  if (track?.toolkit.toolsDone && !track.toolkit.quizDone) return <button className="btn-primary" onClick={() => go(`/bite/${t.id}?start=quiz`)}>Take the quiz to finish Foundations</button>;
  if (!track || !track.toolkit.done) return <button className="btn-primary" onClick={() => go(`/bite/${t.id}`)}>Open your toolkit</button>;
  if (track.roleplay.unlocked && track.roleplay.done === 0) return <button className="btn-primary" onClick={() => go(`/roleplay/${t.id}`)}>Try a real conversation</button>;
  if (track.mastery.unlocked && !track.mastery.done && track.reps.done >= track.reps.goal) {
    return <button className="btn-primary" onClick={() => go(`/bite/${t.id}?level=mastery`)}>Open Mastery</button>;
  }
  return <button className="btn-primary" onClick={() => go(`/practice/${t.id}`)}>Practise · rep {Math.min(track.reps.done + 1, 999)}</button>;
}

/** The topic as a 4-level track: Foundations, Practice reps, Real conversations, Mastery. */
function TrackLevels({ t, track, tint, go }: { t: TopicDetail; track: Track | null; tint: string; go: (path: string) => void }) {
  const unlocked = t.unlocked;
  const levels = [
    {
      n: 1, title: 'Foundations', sub: '5–8 tools with theory, what to say and case studies, a 5-question quiz and a coached scenario',
      status: track?.toolkit.done ? 'done' : 'open', progress: track?.toolkit.done ? 1 : 0,
      note: track?.toolkit.done ? `Quiz ${track.toolkit.quizCorrect}/5${track.toolkit.bestScenario != null ? ` · scenario ${track.toolkit.bestScenario}/100` : ''}`
        : track?.toolkit.toolsDone ? 'Tools ✓ · take the quiz to finish' : 'Go through the tools, then the quiz · about 15 minutes',
      action: unlocked ? (track?.toolkit.toolsDone && !track.toolkit.quizDone
        ? { label: 'Take quiz', path: `/bite/${t.id}?start=quiz` }
        : { label: track?.toolkit.done ? 'Review' : 'Start', path: `/bite/${t.id}` }) : null,
    },
    {
      n: 2, title: 'Practice reps', sub: '2-minute drills set in your world, some with your own people, each coached',
      status: !track?.toolkit.done ? 'locked' : (track.reps.done >= track.reps.goal ? 'done' : 'open'),
      progress: track ? Math.min(1, track.reps.done / track.reps.goal) : 0,
      note: !track?.toolkit.done ? 'Opens after you finish the tools and the quiz' : `${track.reps.done}/${track.reps.goal} reps${track.reps.avgScore != null ? ` · average ${track.reps.avgScore}/100` : ''}`,
      action: unlocked && track?.toolkit.done ? { label: track.reps.done ? 'Continue' : 'Start', path: `/practice/${t.id}` } : null,
    },
    {
      n: 3, title: 'Real conversations', sub: 'Role-play with a character or one of your people, then a debrief',
      status: track?.roleplay.unlocked ? (track.roleplay.done > 0 ? 'done' : 'open') : 'locked', progress: 0,
      note: !track ? 'Opens after Foundations and 3 practice reps'
        : track.roleplay.unlocked ? (track.roleplay.done ? `${track.roleplay.done} conversation${track.roleplay.done === 1 ? '' : 's'} · best ${track.roleplay.best}/100` : 'Unlocked · about 5 minutes')
        : track.roleplay.needsToolkit ? 'Opens after Foundations and 3 practice reps' : `${track.roleplay.needsReps} more rep${track.roleplay.needsReps === 1 ? '' : 's'} to unlock`,
      action: unlocked && track?.roleplay.unlocked ? { label: track.roleplay.done ? 'Again' : 'Start', path: `/roleplay/${t.id}` } : null,
    },
    {
      n: 4, title: 'Mastery', sub: 'Advanced tools: edge cases, difficult people, combining tools, and when they fail',
      status: track?.mastery.done ? 'done' : track?.mastery.unlocked ? 'open' : 'locked', progress: track?.mastery.done ? 1 : 0,
      note: track?.mastery.done ? 'Completed' : track?.mastery.unlocked ? 'Unlocked' : track?.mastery.needsToolkit !== false ? 'Opens after Foundations (tools and quiz) and 5 practice reps' : `${track.mastery.needsReps} more rep${track.mastery.needsReps === 1 ? '' : 's'} to unlock`,
      action: unlocked && track?.mastery.unlocked ? { label: track.mastery.done ? 'Review' : 'Start', path: `/bite/${t.id}?level=mastery` } : null,
    },
  ] as const;
  return (
    <section className="mt-5">
      <p className="eyebrow">Your track · 4 levels</p>
      <ol className="mt-2.5 space-y-2.5">
        {levels.map((l) => (
          <li key={l.n} className={`card p-4 ${l.status === 'locked' ? 'opacity-70' : ''}`}>
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold"
                style={l.status === 'done' ? { background: '#22c55e', color: '#0a1640' } : l.status === 'open' ? { background: tileBackground(tint), color: '#fff' } : { background: 'rgba(255,255,255,0.08)', color: '#9db3dc' }}>
                {l.status === 'done' ? '✓' : l.status === 'locked' ? <LockIcon className="text-muted" /> : l.n}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold">{l.title}</p>
                  {l.action && <button onClick={() => go(l.action!.path)} className="rounded-full px-3 py-1.5 text-xs font-bold"
                    style={{ background: `color-mix(in oklab, ${tint} 22%, transparent)`, color: tint }}>{l.action.label}</button>}
                </div>
                <p className="mt-0.5 text-[13px] leading-snug text-muted">{l.sub}</p>
                {l.n === 2 && track?.toolkit.done && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${l.progress * 100}%`, background: tint }} /></div>
                )}
                <p className="mt-1.5 text-xs font-semibold" style={{ color: l.status === 'done' ? '#22c55e' : undefined }}>{l.note}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
