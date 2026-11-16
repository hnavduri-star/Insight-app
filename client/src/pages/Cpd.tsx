import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { Alert, Logo, Spinner } from '../components/ui';

export type CpdRecord = {
  id: string; code: string; learnerName: string; topicId: string | null; topicName: string; level: 'foundations' | 'mastery'; title: string;
  outcomes: string[]; tools: string[]; plannedMinutes: number; activeMinutes: number; questionsCorrect: number; questionsTotal: number;
  practiceAvg: number | null; scenarioScore: number | null; reflection: string; applyPlan: string | null; completedAt: string;
};
type Log = { records: CpdRecord[]; totals: { modules: number; plannedHours: number; activeMinutes: number; thisYear: { year: number; modules: number; plannedHours: number } } };

const date = (d: string) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
const hours = (h: number) => (Number.isInteger(h) ? String(h) : h.toFixed(1));
const verifyUrl = (code: string) => `${window.location.origin}/verify/${code}`;

function BackBar({ title, eyebrow }: { title: string; eyebrow?: string }) {
  const nav = useNavigate();
  return (
    <div className="flex items-center gap-3 py-2 print:hidden">
      <button onClick={() => nav(-1)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10" aria-label="Back">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d="m15 6-6 6 6 6" /></svg>
      </button>
      <div className="min-w-0">{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1 className="truncate text-[22px]">{title}</h1></div>
    </div>
  );
}

/** The learner's CPD log: completed modules, hours this year and in total, CSV export. */
export default function CpdLog() {
  const [log, setLog] = useState<Log | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<Log>('/cpd').then(setLog).catch((e) => setError(e.message)); }, []);
  return (
    <main className="mx-auto w-full max-w-app px-4 pb-10" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
      <BackBar title="Your CPD record" />
      {error && <Alert>{error}</Alert>}
      {!log && !error && <Spinner />}
      {log && (
        <>
          <section className="tile hero-grad mt-2 p-5">
            <p className="relative text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">{log.totals.thisYear.year}</p>
            <p className="relative mt-1 text-[34px] font-extrabold leading-none">{hours(log.totals.thisYear.plannedHours)} <span className="text-lg font-bold text-white/85">CPD hour{log.totals.thisYear.plannedHours === 1 ? '' : 's'}</span></p>
            <p className="relative mt-2 text-sm text-white/85">{log.totals.modules} module{log.totals.modules === 1 ? '' : 's'} in total · {log.totals.activeMinutes} active minutes recorded</p>
          </section>
          {log.records.length ? (
            <ul className="mt-4 space-y-2">
              {log.records.map((r) => (
                <li key={r.id}>
                  <Link to={`/certificate/${r.id}`} className="card flex items-center gap-3 p-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-lg" aria-hidden>🎓</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{r.topicName}{r.level === 'mastery' ? ' · Mastery' : ''}</span>
                      <span className="block text-xs text-muted">{date(r.completedAt)} · {hours(r.plannedMinutes / 60)} CPD hour · {r.questionsCorrect}/{r.questionsTotal} questions</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="card mt-4 p-4 text-sm text-muted">Complete a module (every tool, the questions, the scenario and a reflection) to earn your first CPD hour.</p>}
          {log.records.length > 0 && <a href="/api/cpd/export.csv" className="btn-ghost mt-5 flex w-full items-center justify-center" download>Download CPD log (CSV)</a>}
          <p className="mt-3 text-center text-xs leading-relaxed text-muted">Each module is a structured, assessed hour of learning with written practice and reflection. Check your professional body's rules for how it counts towards your CPD requirement.</p>
        </>
      )}
    </main>
  );
}

/** One certificate: printable (save as PDF) and shareable with a verification link. */
export function Certificate() {
  const { id } = useParams();
  const [r, setR] = useState<CpdRecord | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => { api<CpdRecord>(`/cpd/${id}`).then(setR).catch((e) => setError(e.message)); }, [id]);
  return (
    <main className="mx-auto w-full max-w-app px-4 pb-10 print:max-w-none print:p-0" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
      <BackBar title="CPD certificate" />
      {error && <Alert>{error}</Alert>}
      {!r && !error && <Spinner />}
      {r && (
        <>
          <CertificateCard r={r} />
          <div className="mt-4 space-y-2 print:hidden">
            <button className="btn-primary" onClick={() => window.print()}>Save as PDF or print</button>
            <button className="btn-ghost w-full" onClick={() => navigator.clipboard?.writeText(verifyUrl(r.code)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>
              {copied ? 'Verification link copied' : 'Copy verification link'}
            </button>
          </div>
          <section className="card mt-4 p-4 print:hidden">
            <p className="eyebrow">Your reflection (private)</p>
            <p className="mt-1.5 text-[15px] leading-relaxed">{r.reflection}</p>
            {r.applyPlan && <p className="mt-2 text-sm text-muted">First use: {r.applyPlan}</p>}
          </section>
          <Link to="/cpd" className="mt-3 flex min-h-[44px] items-center justify-center text-sm font-semibold text-primary print:hidden">Your CPD record</Link>
        </>
      )}
    </main>
  );
}

/** The certificate itself, on white so it prints cleanly. */
function CertificateCard({ r }: { r: Pick<CpdRecord, 'code' | 'learnerName' | 'topicName' | 'level' | 'title' | 'outcomes' | 'plannedMinutes' | 'activeMinutes' | 'completedAt'> & Partial<CpdRecord> }) {
  return (
    <article className="mt-2 rounded-[24px] bg-white p-6 text-[#0b1640] shadow-matte print:rounded-none print:shadow-none" aria-label="Certificate">
      <div className="rounded-[18px] border-2 border-[#1e3a8a]/20 p-5 text-center">
        <div className="flex justify-center"><Logo size={44} /></div>
        <p className="mt-3 text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#1e3a8a]/70">Certificate of continuing professional development</p>
        <p className="mt-4 text-sm text-[#0b1640]/70">This certifies that</p>
        <p className="mt-1 font-display text-[28px] font-extrabold leading-tight">{r.learnerName}</p>
        <p className="mt-2 text-sm text-[#0b1640]/70">completed the structured learning module</p>
        <p className="mt-1 text-[19px] font-bold leading-snug">{r.topicName}{r.level === 'mastery' ? ': Mastery' : ''}</p>
        <p className="text-sm italic text-[#0b1640]/70">{r.title}</p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-[#eef2ff] p-2"><p className="text-lg font-extrabold">{(r.plannedMinutes / 60).toFixed(r.plannedMinutes % 60 ? 1 : 0)}</p><p className="text-[10px] font-bold uppercase tracking-wider text-[#0b1640]/60">CPD hour</p></div>
          <div className="rounded-xl bg-[#eef2ff] p-2"><p className="text-lg font-extrabold">{r.activeMinutes}</p><p className="text-[10px] font-bold uppercase tracking-wider text-[#0b1640]/60">Active min</p></div>
          <div className="rounded-xl bg-[#eef2ff] p-2"><p className="text-lg font-extrabold">{new Date(r.completedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</p><p className="text-[10px] font-bold uppercase tracking-wider text-[#0b1640]/60">{new Date(r.completedAt).getFullYear()}</p></div>
        </div>
        {r.outcomes?.length > 0 && (
          <div className="mt-4 text-left">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#1e3a8a]/70">Learning outcomes</p>
            <ul className="mt-1 space-y-0.5 text-[13px]">{r.outcomes.map((o) => <li key={o}>• {o}</li>)}</ul>
          </div>
        )}
        {r.questionsTotal != null && (
          <p className="mt-3 text-left text-[12px] text-[#0b1640]/70">
            Assessment: {r.questionsCorrect}/{r.questionsTotal} questions{r.practiceAvg != null ? ` · written practice average ${r.practiceAvg}/100` : ''}{r.scenarioScore != null ? ` · scenario ${r.scenarioScore}/100` : ''} · reflection completed
          </p>
        )}
        <p className="mt-4 border-t border-[#0b1640]/10 pt-3 text-[11px] text-[#0b1640]/60">
          Verify at {window.location.host}/verify/{r.code} · Code <span className="font-mono font-bold tracking-wider">{r.code}</span>
        </p>
      </div>
    </article>
  );
}

/** Public page: anyone (e.g. an employer) can check a certificate is genuine. */
export function Verify() {
  const { code } = useParams();
  const [r, setR] = useState<Parameters<typeof CertificateCard>[0]['r'] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<NonNullable<typeof r>>(`/verify/${code}`).then(setR).catch((e) => setError(e.message)); }, [code]);
  return (
    <main className="mx-auto w-full max-w-app px-4 pb-10 pt-6">
      <p className="eyebrow text-center">Insight certificate check</p>
      {error && <div className="mt-4"><Alert>{error}</Alert></div>}
      {!r && !error && <Spinner />}
      {r && (
        <>
          <div className="mt-3"><Alert kind="success">✓ Genuine certificate, issued {date(r.completedAt)}.</Alert></div>
          <CertificateCard r={r} />
        </>
      )}
    </main>
  );
}
