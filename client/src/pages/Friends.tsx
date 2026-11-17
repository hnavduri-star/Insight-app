import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../api';
import { Alert, Avatar, Spinner } from '../components/ui';

export type LeagueRow = { id: string; firstName: string; me: boolean; weekMinutes: number; streak: number; rank: number };
type FriendsData = { code: string; weekStart: string; daysLeft: number; friends: number; league: LeagueRow[] };

const MEDAL = ['🥇', '🥈', '🥉'];

/** 95 → "1h 35m", 12 → "12 min". */
export const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m} min`);

/** One league row: rank, name, streak and this week's learning time. */
export function LeagueLine({ r, max, onRemove }: { r: LeagueRow; max: number; onRemove?: () => void }) {
  return (
    <li className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${r.me ? 'bg-accent/10 ring-1 ring-accent/40' : 'bg-white/[0.04]'}`}>
      <span className="w-7 text-center text-lg font-extrabold">{r.rank <= 3 && r.weekMinutes > 0 ? MEDAL[r.rank - 1] : r.rank}</span>
      <Avatar name={r.firstName} size={34} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{r.me ? 'You' : r.firstName}</span>
        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-white/10">
          <motion.span className="block h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${max ? (r.weekMinutes / max) * 100 : 0}%` }} />
        </span>
      </span>
      <span className="text-right">
        <span className="block text-sm font-extrabold">{fmtMin(r.weekMinutes)}</span>
        <span className="block text-[11px] text-muted">🔥 {r.streak}</span>
      </span>
      {onRemove && !r.me && <button onClick={onRemove} className="ml-1 text-xs text-muted hover:text-error" aria-label={`Remove ${r.firstName}`}>✕</button>}
    </li>
  );
}

/** Friends and the weekly league. */
export default function Friends() {
  const nav = useNavigate();
  const [search, setSearch] = useSearchParams();
  const [d, setD] = useState<FriendsData | null>(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const add = async (c: string) => {
    setBusy(true); setMsg(null);
    try {
      const r = await api<FriendsData & { added: string }>('/friends/add', { body: { code: c } });
      setD((prev) => (prev ? { ...prev, ...r } : prev));
      setMsg({ kind: 'success', text: `${r.added} is in your league. Game on!` }); setCode('');
    } catch (e) { setMsg({ kind: 'error', text: (e as Error).message }); } finally { setBusy(false); }
  };
  useEffect(() => {
    api<FriendsData>('/friends').then((x) => {
      setD(x);
      let saved: string | null = null;
      try { saved = localStorage.getItem('insight.invite'); localStorage.removeItem('insight.invite'); } catch { /* storage blocked */ }
      const inviteCode = search.get('add') ?? saved;
      if (inviteCode && inviteCode !== x.code) add(inviteCode);
      if (search.get('add')) setSearch({}, { replace: true });
    }).catch((e) => setMsg({ kind: 'error', text: e.message }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const link = d ? `${window.location.origin}/friends?add=${d.code}` : '';
  const invite = async () => {
    const text = `Join me on Insight: let's see who spends more time learning this week. ${link}`;
    if (navigator.share) { await navigator.share({ title: 'Insight weekly league', text, url: link }).catch(() => {}); }
    else { await navigator.clipboard?.writeText(text); setMsg({ kind: 'success', text: 'Invite link copied. Send it to a friend.' }); }
  };
  const remove = async (id: string) => {
    if (!confirm('Remove this friend from your league?')) return;
    const r = await api<Omit<FriendsData, 'code'>>(`/friends/${id}`, { method: 'DELETE' }).catch(() => null);
    if (r && d) setD({ ...d, ...r });
  };
  const max = Math.max(0, ...(d?.league.map((r) => r.weekMinutes) ?? [0]));
  const me = d?.league.find((r) => r.me);

  return (
    <main className="mx-auto w-full max-w-app px-4 pb-10" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
      <div className="flex items-center gap-3 py-2">
        <button onClick={() => nav(-1)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10" aria-label="Back">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d="m15 6-6 6 6 6" /></svg>
        </button>
        <h1 className="flex-1 text-[22px]">Weekly league</h1>
        {d && d.friends > 0 && <button className="text-sm font-semibold text-muted" onClick={() => setEditing((x) => !x)}>{editing ? 'Done' : 'Edit'}</button>}
      </div>
      {!d && !msg && <Spinner />}
      {msg && <div className="mb-3"><Alert kind={msg.kind}>{msg.text}</Alert></div>}
      {d && (
        <>
          <section className="tile hero-grad p-5">
            <p className="relative text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">This week · {d.daysLeft === 0 ? 'ends tonight' : `${d.daysLeft} day${d.daysLeft === 1 ? '' : 's'} left`}</p>
            <p className="relative mt-1 text-[30px] font-extrabold leading-tight">{d.friends === 0 ? 'Bring a friend' : !me?.weekMinutes ? 'Your move: start the clock' : me.rank === 1 ? "You're top 🏆" : `You're #${me.rank}`}</p>
            <p className="relative mt-1 text-sm text-white/85">{d.friends === 0 ? 'Learning sticks better with a little friendly competition.' : 'Ranked by time spent learning, whatever each of you is studying. Resets every Monday.'}</p>
          </section>

          <ol className="mt-4 space-y-2" aria-label="League table">
            {d.league.map((r) => <LeagueLine key={r.id} r={r} max={max} onRemove={editing ? () => remove(r.id) : undefined} />)}
          </ol>

          <section className="card mt-5 p-5">
            <p className="eyebrow">Invite friends</p>
            <div className="mt-2 flex items-center justify-between rounded-2xl bg-white/[0.05] px-4 py-3">
              <span><span className="block text-xs text-muted">Your friend code</span><span className="font-mono text-lg font-bold tracking-[0.2em]">{d.code}</span></span>
              <button className="btn-primary w-auto px-4" onClick={invite}>Invite</button>
            </div>
            <label htmlFor="friend-code" className="label mt-4">Got a friend's code?</label>
            <div className="flex gap-2">
              <input id="friend-code" className="field flex-1" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 12))} placeholder="e.g. 7KQ2MX" />
              <button className="btn-ghost px-4" disabled={busy || code.trim().length < 4} onClick={() => add(code.trim())}>Add</button>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">🔒 Friends see only your first name, weekly learning time and streak. Never your topics, answers, conversations, people or notes.</p>
          </section>
          <Link to="/progress" className="mt-4 flex min-h-[44px] items-center justify-center text-sm font-semibold text-primary">See your badges</Link>
        </>
      )}
    </main>
  );
}
