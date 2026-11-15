import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Alert, Spinner } from '../components/ui';

type Metrics = {
  signups: number; signups7: number;
  funnel: { step: string; n: number; pct: number | null }[];
  retention: { d1: number | null; d1Base: number; d7: number | null; d7Base: number };
  roleplayByWeek: { week: string; avg: number; n: number }[];
  topicsRated: { name: string; up: number; down: number }[];
  ai: { calls: number; input: number; output: number; failed: number };
  feedback: { name: string; at: string; usedAtWork: string | null; feltGeneric: string | null; wouldPay: string | null; priceUsd: number | null }[];
  wouldPay: { yes: number; maybe: number; no: number; medianPrice: number | null };
};

/** Beta metrics for the app owner. */
export default function Admin() {
  const nav = useNavigate();
  const [m, setM] = useState<Metrics | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<Metrics>('/admin/metrics').then(setM).catch((e) => setError(e.message)); }, []);
  const Stat = ({ v, l, sub }: { v: string | number; l: string; sub?: string }) => (
    <div className="card p-3 text-center"><p className="text-[22px] font-extrabold">{v}</p><p className="text-[11px] text-muted">{l}</p>{sub && <p className="text-[10px] text-muted/70">{sub}</p>}</div>
  );
  return (
    <main className="mx-auto w-full max-w-app px-4 pb-10" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
      <div className="flex items-center gap-3 py-2">
        <button onClick={() => nav(-1)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10" aria-label="Back">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d="m15 6-6 6 6 6" /></svg>
        </button>
        <h1 className="text-[22px]">Beta metrics</h1>
      </div>
      {error && <Alert>{error}</Alert>}
      {!m && !error && <Spinner />}
      {m && (
        <>
          <section className="mt-2 grid grid-cols-2 gap-2">
            <Stat v={m.signups} l="Sign-ups" sub={`${m.signups7} in the last 7 days`} />
            <Stat v={m.funnel[3].pct != null ? `${m.funnel[3].pct}%` : '–'} l="Finished Foundations" />
            <Stat v={m.retention.d1 != null ? `${m.retention.d1}%` : '–'} l="Came back next day" sub={`of ${m.retention.d1Base} users`} />
            <Stat v={m.retention.d7 != null ? `${m.retention.d7}%` : '–'} l="Active after a week" sub={`of ${m.retention.d7Base} users`} />
          </section>

          <section className="card mt-4 p-4">
            <p className="eyebrow">Funnel</p>
            <ul className="mt-2 space-y-2">
              {m.funnel.map((f) => (
                <li key={f.step}>
                  <div className="flex justify-between text-sm"><span>{f.step}</span><span className="font-bold">{f.n} <span className="font-normal text-muted">· {f.pct ?? 0}%</span></span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-primary" style={{ width: `${f.pct ?? 0}%` }} /></div>
                </li>
              ))}
            </ul>
          </section>

          <section className="card mt-4 p-4">
            <p className="eyebrow">Average role-play score by week</p>
            {m.roleplayByWeek.length ? (
              <div className="mt-3 flex h-32 items-end gap-2">
                {m.roleplayByWeek.map((w) => (
                  <div key={w.week} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                    <span className="text-xs font-bold">{w.avg}</span>
                    <div className="w-full max-w-[44px] rounded-t-md bg-primary" style={{ height: `${Math.max(4, w.avg * 0.8)}px` }} title={`${w.n} role-plays`} />
                    <span className="text-[10px] text-muted">{w.week.slice(5)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="mt-2 text-sm text-muted">No role-plays yet.</p>}
          </section>

          <section className="card mt-4 p-4">
            <p className="eyebrow">Would pay</p>
            <p className="mt-1 text-sm">Yes {m.wouldPay.yes} · Maybe {m.wouldPay.maybe} · No {m.wouldPay.no}{m.wouldPay.medianPrice != null ? ` · median fair price $${m.wouldPay.medianPrice}/month` : ''}</p>
            <p className="eyebrow mt-4">Feedback</p>
            {m.feedback.length ? (
              <ul className="mt-2 space-y-3">
                {m.feedback.map((f, i) => (
                  <li key={i} className="rounded-2xl bg-white/[0.04] p-3 text-sm">
                    <p className="text-xs text-muted">{f.name} · {new Date(f.at).toLocaleDateString()}{f.wouldPay ? ` · would pay: ${f.wouldPay}` : ''}{f.priceUsd != null ? ` ($${f.priceUsd})` : ''}</p>
                    {f.usedAtWork && <p className="mt-1"><span className="font-semibold">Used:</span> {f.usedAtWork}</p>}
                    {f.feltGeneric && <p className="mt-1"><span className="font-semibold">Felt generic:</span> {f.feltGeneric}</p>}
                  </li>
                ))}
              </ul>
            ) : <p className="mt-1 text-sm text-muted">No feedback yet.</p>}
          </section>

          <section className="card mt-4 p-4">
            <p className="eyebrow">Content: tools rated least helpful</p>
            {m.topicsRated.length ? (
              <ul className="mt-2 space-y-1 text-sm">{m.topicsRated.map((t) => <li key={t.name} className="flex justify-between"><span>{t.name}</span><span className="text-muted">👍 {t.up} · 👎 {t.down}</span></li>)}</ul>
            ) : <p className="mt-1 text-sm text-muted">No ratings yet.</p>}
          </section>

          <section className="card mt-4 p-4">
            <p className="eyebrow">AI use, last 7 days</p>
            <p className="mt-1 text-sm">{m.ai.calls} calls · {(m.ai.input / 1000).toFixed(0)}k input and {(m.ai.output / 1000).toFixed(0)}k output tokens · {m.ai.failed} failed</p>
          </section>
        </>
      )}
    </main>
  );
}
