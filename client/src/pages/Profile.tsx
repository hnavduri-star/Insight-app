import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Me } from '../api';
import { useAuth } from '../auth';
import { Alert, Avatar, Field, Submit } from '../components/ui';
import { CoachPicker, GoalPicker, IndustryPicker, MinutesPicker, PersonaPicker } from '../components/Pickers';
import { Sheet } from '../components/Sheet';
import { COACHES, personaLabel } from '../options';

export default function Profile() {
  const { me, setMe, logout } = useAuth();
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [coachErr, setCoachErr] = useState('');
  const m = me!;

  const switchCoach = async (coach: 'maya' | 'alex') => {
    const prev = m; setMe({ ...m, coach }); setCoachErr('');
    try { setMe(await api<Me>('/me/profile', { method: 'PUT', body: { coach } })); }
    catch (e) { setMe(prev); setCoachErr((e as Error).message); }
  };

  return (
    <main className="page page-with-nav space-y-5">
      <section className="card flex flex-col items-center p-6 text-center">
        <Avatar name={m.name} size={84} />
        <h1 className="mt-3 text-xl font-bold tracking-tight">{m.name}</h1>
        <p className="text-sm text-muted">{m.email}</p>
        {!m.emailVerified && <p className="mt-1 text-xs text-error">Email not verified</p>}
      </section>

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Your learning profile</h2>
          <button className="btn-ghost min-h-[40px] px-3 text-sm" onClick={() => setEditing(true)}>Edit profile</button>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          {[['Persona', personaLabel(m.persona)], ['Industry', m.industry], ['Goal', m.goal], ['Daily time', m.dailyMinutes ? `${m.dailyMinutes} min` : '']].map(([k, v]) => (
            <div key={k} className="rounded-input bg-bg/40 px-3 py-2.5">
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="font-medium">{v || '—'}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="card p-5">
        <CoachPicker value={m.coach} onChange={switchCoach} />
        {coachErr && <div className="mt-3"><Alert>{coachErr}</Alert></div>}
        {m.coach && <p className="mt-3 text-xs text-muted">{COACHES.find((c) => c.value === m.coach)?.name} is your coach.</p>}
      </section>

      <section className="space-y-3">
        <button className="btn-ghost w-full" onClick={async () => { await logout(); nav('/login', { replace: true }); }}>Log out</button>
        <button className="min-h-[44px] w-full text-sm text-error/90 hover:text-error" onClick={() => setDeleting(true)}>Delete account</button>
        <p className="px-2 text-center text-xs leading-relaxed text-muted">
          Privacy: your learning profile and written answers are sent to an AI provider (Anthropic) to create lessons and feedback. Your name, email and password are never sent.
        </p>
      </section>

      <EditSheet open={editing} onClose={() => setEditing(false)} />
      <DeleteSheet open={deleting} onClose={() => setDeleting(false)} />
    </main>
  );
}

function EditSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me, setMe } = useAuth();
  const m = me!;
  const [f, setF] = useState({ name: m.name, persona: m.persona, industry: m.industry, goal: m.goal, dailyMinutes: m.dailyMinutes });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    const body = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== null && v !== ''));
    try { setMe(await api<Me>('/me/profile', { method: 'PUT', body })); onClose(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Edit profile">
      <h2 className="mb-4 text-xl font-bold">Edit profile</h2>
      <form onSubmit={save} className="space-y-5">
        {error && <Alert>{error}</Alert>}
        <Field label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" />
        <PersonaPicker value={f.persona} onChange={(persona) => setF({ ...f, persona })} />
        <IndustryPicker value={f.industry} onChange={(industry) => setF({ ...f, industry })} />
        <GoalPicker value={f.goal} onChange={(goal) => setF({ ...f, goal })} />
        <MinutesPicker value={f.dailyMinutes} onChange={(dailyMinutes) => setF({ ...f, dailyMinutes })} />
        <Submit busy={busy}>Save changes</Submit>
      </form>
    </Sheet>
  );
}

function DeleteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { setMe } = useAuth();
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const del = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api('/me/account', { method: 'DELETE', body: { password } }); setMe(null); nav('/login', { replace: true }); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Delete account">
      <h2 className="text-xl font-bold">Delete your account?</h2>
      <p className="mt-2 text-sm text-muted">This permanently removes your profile, progress and everything you've saved. It can't be undone.</p>
      <form onSubmit={del} className="mt-5 space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Confirm with your password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit" disabled={busy || !password} className="inline-flex min-h-[48px] w-full items-center justify-center rounded-btn bg-error font-semibold text-bg disabled:opacity-60">
          {busy ? 'Deleting…' : 'Delete permanently'}
        </button>
        <button type="button" className="btn-ghost w-full" onClick={onClose}>Cancel</button>
      </form>
    </Sheet>
  );
}
