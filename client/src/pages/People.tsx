import { useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api, type Person } from '../api';
import { useAuth } from '../auth';
import { Alert, Field, Spinner, Submit } from '../components/ui';
import { Sheet } from '../components/Sheet';
import { CoachBubble } from '../components/Coach';
import { MAX_PEOPLE, RELATIONSHIPS, TRAITS } from '../options';
import { Paywall } from '../components/Paywall';

const REL_TINT: Record<string, string> = {
  boss: '#f5b971', senior_leader: '#fbbf24', colleague: '#5ec2ff', direct_report: '#2dd4bf', client: '#a78bfa', investor_board: '#7c9cff',
  partner: '#f2879b', family: '#fb923c', friend: '#86efac', other: '#9db3dc',
};
const relLabel = (v: string) => RELATIONSHIPS.find((r) => r.value === v)?.label ?? v;

export function PersonAvatar({ p, size = 52 }: { p: Pick<Person, 'name' | 'relationship'>; size?: number }) {
  const tint = REL_TINT[p.relationship] ?? '#9db3dc';
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-full font-display font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.4, color: tint,
        background: `linear-gradient(160deg, ${tint}38, ${tint}10)`, border: `1px solid ${tint}55` }}>
      {p.name.trim()[0]?.toUpperCase() ?? '?'}
    </span>
  );
}

const SUGGESTIONS = [
  { relationship: 'boss', label: 'Your boss' }, { relationship: 'client', label: 'A client' },
  { relationship: 'colleague', label: 'A peer' }, { relationship: 'direct_report', label: 'A team member' },
  { relationship: 'partner', label: 'Your partner' }, { relationship: 'friend', label: 'A friend' },
];

export default function People() {
  const { me } = useAuth();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Partial<Person> | null>(null);
  const [paywall, setPaywall] = useState(false);
  const premium = me?.plan === 'premium';

  const load = () => { setError(''); api<Person[]>('/people').then(setPeople).catch((e) => setError(e.message)); };
  useEffect(load, []);

  return (
    <main className="page page-with-nav">
      <p className="eyebrow">Practise for real life</p>
      <h1 className="mt-1.5 text-[28px] font-semibold leading-tight">Your people</h1>
      <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-[13px] leading-snug">
        <span aria-hidden>🔒</span>
        <span><span className="font-semibold">Private to you.</span> <span className="text-muted">Only you can see these notes. They're used only to tailor your practice, never shared with your team or anyone else, and you can edit or delete them at any time.</span></span>
      </div>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">
        Add the people you actually talk to. Then rehearse the conversations that matter, with them playing themselves.
      </p>

      {!premium && people && (
        <button onClick={() => setPaywall(true)} className="mt-5 flex w-full items-center gap-3 rounded-card border border-[#f5b971]/30 bg-[#f5b971]/[0.07] px-4 py-3 text-left">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#f5b971" strokeWidth="1.8" strokeLinejoin="round" className="shrink-0" aria-hidden><path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8Z" /></svg>
          <span className="flex-1 text-sm"><span className="font-medium text-ink">Practising is part of Premium.</span> <span className="text-muted">Add your people now so they're ready when you upgrade.</span></span>
          <span className="text-sm font-medium text-[#f5b971]">Upgrade</span>
        </button>
      )}

      {me?.coach && people?.length === 0 && (
        <div className="mt-6">
          <CoachBubble coach={me.coach}>Who's the conversation you keep putting off? Add them and we'll practise it together.</CoachBubble>
        </div>
      )}

      {error && <div className="mt-6 space-y-3"><Alert>{error}</Alert><button className="btn-ghost w-full" onClick={load}>Try again</button></div>}
      {!people && !error && <Spinner label="Loading your people" />}

      {people && people.length > 0 && (
        <ul className="mt-6 space-y-3">
          <AnimatePresence initial={false}>
            {people.map((p) => (
              <motion.li key={p.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }}>
                <button className="card flex w-full items-start gap-3.5 p-4 text-left" onClick={() => setEditing(p)}>
                  <PersonAvatar p={p} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="font-display text-lg font-semibold">{p.name}</span>
                      <span className="text-xs text-muted">{relLabel(p.relationship)}</span>
                    </span>
                    {p.traits.length > 0 && (
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        {p.traits.map((t) => <span key={t} className="surface rounded-full px-2.5 py-0.5 text-[11px] text-ink/85">{t}</span>)}
                      </span>
                    )}
                    {p.practiceGoal && <span className="mt-2 block text-sm text-muted">Practise: <span className="text-ink/90">{p.practiceGoal}</span></span>}
                  </span>
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {people && (
        <section className="mt-6">
          {people.length < MAX_PEOPLE ? (
            <>
              <p className="eyebrow mb-2.5">Add someone</p>
              <div className="grid grid-cols-3 gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s.relationship} onClick={() => setEditing({ relationship: s.relationship })}
                    className="surface flex flex-col items-center gap-1.5 rounded-card px-2 py-3 text-xs transition active:scale-[0.97] hover:border-primary/40">
                    <PersonAvatar p={{ name: '+', relationship: s.relationship }} size={36} />
                    {s.label}
                  </button>
                ))}
              </div>
              <button className="btn-ghost mt-3 w-full" onClick={() => setEditing({ relationship: 'other' })}>Add someone else</button>
            </>
          ) : <p className="text-center text-sm text-muted">You've added the maximum of {MAX_PEOPLE} people.</p>}
          <p className="mt-4 px-2 text-center text-xs leading-relaxed text-muted">
            Use a first name or nickname. Don't add surnames or sensitive details such as health or money. When you practise, what you write here is sent to our AI provider so the person can be played realistically.
          </p>
        </section>
      )}

      <Paywall open={paywall} onClose={() => setPaywall(false)} reason="Practise real conversations with the people in your life." />
      <PersonSheet person={editing} premium={premium} onUpgrade={() => { setEditing(null); setPaywall(true); }} onClose={() => setEditing(null)} onSaved={(p, deleted) => {
        setPeople((cur) => {
          const list = cur ?? [];
          if (deleted) return list.filter((x) => x.id !== p.id);
          return list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p];
        });
        setEditing(null);
      }} />
    </main>
  );
}

function PersonSheet({ person, premium, onUpgrade, onClose, onSaved }: {
  person: Partial<Person> | null; premium: boolean; onUpgrade: () => void; onClose: () => void; onSaved: (p: Person, deleted?: boolean) => void;
}) {
  const [f, setF] = useState({ name: '', relationship: 'other', traits: [] as string[], notes: '', practiceGoal: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (person) setF({ name: person.name ?? '', relationship: person.relationship ?? 'other', traits: person.traits ?? [], notes: person.notes ?? '', practiceGoal: person.practiceGoal ?? '' });
    setError('');
  }, [person]);
  const isEdit = !!person?.id;

  const toggleTrait = (t: string) => setF((s) => ({
    ...s, traits: s.traits.includes(t) ? s.traits.filter((x) => x !== t) : s.traits.length < 5 ? [...s.traits, t] : s.traits,
  }));

  const save = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const p = await api<Person>(isEdit ? `/people/${person!.id}` : '/people', { method: isEdit ? 'PUT' : 'POST', body: f });
      onSaved(p);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!confirm(`Remove ${person!.name}?`)) return;
    try { await api(`/people/${person!.id}`, { method: 'DELETE' }); onSaved(person as Person, true); }
    catch (err) { setError((err as Error).message); }
  };

  return (
    <Sheet open={!!person} onClose={onClose} title={isEdit ? `Edit ${person?.name}` : 'Add a person'}>
      <div className="mb-5 flex items-center gap-3">
        <PersonAvatar p={{ name: f.name || '?', relationship: f.relationship }} size={48} />
        <div>
          <p className="eyebrow">{relLabel(f.relationship)}</p>
          <h2 className="text-xl font-semibold">{isEdit ? `Edit ${person?.name}` : 'Add a person'}</h2>
        </div>
      </div>
      <form onSubmit={save} className="space-y-5">
        {error && <Alert>{error}</Alert>}
        <Field label="First name or nickname" maxLength={40} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Raj" />
        <div>
          <label htmlFor="rel" className="label">Who are they to you?</label>
          <select id="rel" className="field appearance-none" value={f.relationship} onChange={(e) => setF({ ...f, relationship: e.target.value })}>
            {RELATIONSHIPS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <fieldset>
          <legend className="label">What are they like? <span className="text-muted/70">(up to 5)</span></legend>
          <div className="flex flex-wrap gap-2">
            {TRAITS.map((t) => {
              const on = f.traits.includes(t);
              return <button key={t} type="button" aria-pressed={on} onClick={() => toggleTrait(t)} className={`chip min-h-[40px] ${on ? 'chip-on' : 'chip-off'}`}>{t}</button>;
            })}
          </div>
        </fieldset>
        <div>
          <label htmlFor="notes" className="label">How do they usually react? What do they care about?</label>
          <textarea id="notes" rows={3} maxLength={500} className="field py-3" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })}
            placeholder="e.g. Wants the numbers first. Gets defensive if surprised in meetings." />
          <p className="mt-1.5 text-xs text-muted">🔒 Only you see this. Deleting the person deletes these notes.</p>
        </div>
        <Field label="What do you want to practise with them?" maxLength={200} value={f.practiceGoal}
          onChange={(e) => setF({ ...f, practiceGoal: e.target.value })} placeholder="e.g. Ask for a raise" />
        <Submit busy={busy}>{isEdit ? 'Save changes' : 'Add to your people'}</Submit>
        {isEdit && (premium
          ? <button type="button" className="btn-ghost w-full" disabled title="Arrives with role-play">Practise a conversation · coming soon</button>
          : <button type="button" className="btn-ghost w-full" onClick={onUpgrade}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
              Practise with {person?.name} · Premium
            </button>)}
        {isEdit && <button type="button" onClick={remove} className="min-h-[44px] w-full text-sm text-error/90 hover:text-error">Remove {person?.name}</button>}
      </form>
    </Sheet>
  );
}
