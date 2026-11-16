import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Alert, Spinner } from '../components/ui';

type Mine = { id: string; name: string; role: 'owner' | 'member'; members: number; inviteCode: string | null } | null;
type Dash = {
  team: { name: string; inviteCode: string; members: number };
  totals: { activeThisWeek: number; foundations: number; reps: number; roleplays: number; wins: number; cpdModules: number; cpdHours: number };
  members: { name: string; role: string; cpdModules: number; cpdHours: number; days7: number; days30: number; lastActive: string | null; foundations: number; reps: number; roleplays: number; roleplayAvg: number | null; wins: number }[];
};

/** Profile section: create a team, join with a code, or see your team. */
export function TeamCard() {
  const [mine, setMine] = useState<Mine | undefined>(undefined);
  const [mode, setMode] = useState<'' | 'create' | 'join'>('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => { api<Mine>('/teams/mine').then(setMine).catch(() => setMine(null)); }, []);
  if (mine === undefined) return null;
  const go = async () => {
    setBusy(true); setError('');
    try {
      if (mode === 'create') setMine(await api<Mine>('/teams', { body: { name: value } }));
      else { await api('/teams/join', { body: { code: value } }); setMine(await api<Mine>('/teams/mine')); }
      setMode(''); setValue('');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const leave = async () => {
    if (!confirm(mine?.role === 'owner' ? 'Delete this team?' : 'Leave this team?')) return;
    try { await api('/teams/leave', { body: {} }); setMine(null); } catch (e) { setError((e as Error).message); }
  };
  return (
    <section className="card p-5">
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden>👥</span>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">{mine ? mine.name : 'Learn with your team'}</h2>
          <p className="text-sm text-muted">{mine ? `${mine.members} member${mine.members === 1 ? '' : 's'} · ${mine.role === 'owner' ? 'you own this team' : 'member'}`
            : 'For managers and companies: invite your team and see who is practising.'}</p>
        </div>
      </div>
      {mine?.role === 'owner' && mine.inviteCode && (
        <div className="mt-3 flex items-center justify-between rounded-2xl bg-white/[0.05] px-4 py-3">
          <span><span className="block text-xs text-muted">Invite code</span><span className="font-mono text-lg font-bold tracking-[0.2em]">{mine.inviteCode}</span></span>
          <button className="text-sm font-bold text-primary" onClick={() => navigator.clipboard?.writeText(mine.inviteCode!).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>{copied ? 'Copied' : 'Copy'}</button>
        </div>
      )}
      {mine?.role === 'member' && <p className="mt-3 text-xs leading-relaxed text-muted">🔒 Your team owner sees only totals (days active, reps, role-plays, scores, wins). Never your answers, conversations, people or notes.</p>}
      {mine ? (
        <div className="mt-3 flex gap-2">
          {mine.role === 'owner' && <Link to="/team" className="btn-primary flex flex-1 items-center justify-center">Team dashboard</Link>}
          <button className="btn-ghost px-4 text-sm" onClick={leave}>{mine.role === 'owner' ? 'Delete' : 'Leave'}</button>
        </div>
      ) : mode ? (
        <div className="mt-3 space-y-2">
          <label htmlFor="team-input" className="sr-only">{mode === 'create' ? 'Team name' : 'Invite code'}</label>
          <input id="team-input" className="field" autoFocus value={value} onChange={(e) => setValue(mode === 'join' ? e.target.value.toUpperCase().slice(0, 12) : e.target.value.slice(0, 60))}
            placeholder={mode === 'create' ? 'e.g. Acme Strategy Team' : 'Invite code, e.g. 7KQ2MX'} />
          {mode === 'join' && <p className="text-xs text-muted">Your team owner will see your totals only, never your answers or notes.</p>}
          <div className="flex gap-2"><button className="btn-primary flex-1" onClick={go} disabled={busy || value.trim().length < 2}>{mode === 'create' ? 'Create team' : 'Join team'}</button>
            <button className="btn-ghost px-4" onClick={() => { setMode(''); setError(''); }}>Cancel</button></div>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className="btn-ghost" onClick={() => setMode('join')}>Join with a code</button>
          <button className="btn-ghost" onClick={() => setMode('create')}>Create a team</button>
        </div>
      )}
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
    </section>
  );
}

const ago = (d: string | null) => {
  if (!d) return 'Not yet';
  const days = Math.round((Date.now() - Date.parse(`${d}T12:00:00`)) / 86_400_000);
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`;
};

/** Team owner's dashboard: totals per member, never content. */
export default function TeamDashboard() {
  const nav = useNavigate();
  const [d, setD] = useState<Dash | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<Dash>('/teams/dashboard').then(setD).catch((e) => setError(e.message)); }, []);
  return (
    <main className="mx-auto w-full max-w-app px-4 pb-10" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
      <div className="flex items-center gap-3 py-2">
        <button onClick={() => nav(-1)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10" aria-label="Back">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d="m15 6-6 6 6 6" /></svg>
        </button>
        <div className="min-w-0"><p className="eyebrow">Team dashboard</p><h1 className="truncate text-[20px]">{d?.team.name ?? ''}</h1></div>
      </div>
      {error && <Alert>{error}</Alert>}
      {!d && !error && <Spinner />}
      {d && (
        <>
          <section className="mt-2 grid grid-cols-3 gap-2">
            {[['CPD hours', d.totals.cpdHours], ['Active this week', `${d.totals.activeThisWeek}/${d.team.members}`], ['Role-plays', d.totals.roleplays], ['Real-world wins', d.totals.wins],
              ['Foundations done', d.totals.foundations], ['Invite code', d.team.inviteCode]].map(([l, v]) => (
              <div key={String(l)} className="card p-3 text-center"><p className="text-[19px] font-extrabold">{v}</p><p className="text-[11px] leading-tight text-muted">{l}</p></div>
            ))}
          </section>
          <ul className="mt-4 space-y-2">
            {d.members.map((m) => (
              <li key={m.name + m.role} className="card p-4">
                <div className="flex items-center justify-between"><p className="font-bold">{m.name}{m.role === 'owner' && <span className="ml-2 text-xs text-muted">owner</span>}</p>
                  <span className="text-xs text-muted">Last active: {ago(m.lastActive)}</span></div>
                <div className="mt-2 grid grid-cols-4 gap-1 text-center text-xs">
                  {[['Days (7d)', m.days7], ['Reps', m.reps], ['Role-plays', m.roleplays], ['Wins', m.wins]].map(([l, v]) => (
                    <div key={String(l)} className="rounded-xl bg-white/[0.05] py-1.5"><p className="text-[15px] font-extrabold">{v}</p><p className="text-[10px] text-muted">{l}</p></div>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-muted">🎓 {m.cpdHours} CPD hour{m.cpdHours === 1 ? '' : 's'} · {m.foundations} topic{m.foundations === 1 ? '' : 's'} with Foundations{m.roleplayAvg != null ? ` · role-play average ${m.roleplayAvg}` : ''}</p>
              </li>
            ))}
          </ul>
          <a href="/api/teams/cpd.csv" download className="btn-ghost mt-4 flex w-full items-center justify-center">Download team CPD records (CSV)</a>
          <p className="mt-4 text-center text-xs leading-relaxed text-muted">Members' answers, conversations, people and notes stay private. You see totals only.</p>
        </>
      )}
    </main>
  );
}
