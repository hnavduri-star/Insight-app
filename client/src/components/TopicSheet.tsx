import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Me, type TopicDetail } from '../api';
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
  useEffect(() => {
    setT(null); setError('');
    if (id) api<TopicDetail>(`/topics/${id}`).then(setT).catch((e) => setError(e.message));
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
            <ul className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              {[['Learn', '5–8 tools'], ['Check', '5 questions'], ['Practise', 'with your coach']].map(([a, b]) => (
                <li key={a} className="surface rounded-2xl px-2 py-3">
                  <span className="block text-sm font-bold" style={{ color: tint }}>{a}</span>
                  <span className="text-muted">{b}</span>
                </li>
              ))}
            </ul>
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
            <p className="mt-4 text-xs leading-relaxed text-muted">
              Each tool comes with the theory, how to use it, what to say, and a real case study.
            </p>
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
                  <button className="btn-primary" onClick={() => nav(`/bite/${t.id}`)}>Open your toolkit</button>
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
