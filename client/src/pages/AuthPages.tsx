import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api, browserTimezone, type Me } from '../api';
import { useAuth } from '../auth';
import { Alert, Field, Logo, Submit } from '../components/ui';

function Shell({ title, subtitle, children, footer, hero }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode; hero?: ReactNode }) {
  return (
    <main className="page flex min-h-dvh flex-col justify-center pb-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="relative">
            <div className="absolute -inset-6 rounded-full bg-primary/20 blur-2xl" aria-hidden />
            <div className="relative"><Logo /></div>
          </div>
          <p className="eyebrow mt-5">Insight</p>
          <h1 className="mt-2 text-[28px] font-semibold leading-tight">{title}</h1>
          {subtitle && <p className="mt-2 max-w-[22rem] text-[15px] leading-relaxed text-muted">{subtitle}</p>}
        </div>
        {hero}
        <div className="card p-5">{children}</div>
        {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
      </motion.div>
    </main>
  );
}

const VALUES = [
  { icon: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9 2h6" /></>, title: 'Bite-size', text: '5 to 20 minutes a day' },
  { icon: <><path d="M4 19c4-1 6-5 8-9s4-6 8-6" /><circle cx="4" cy="19" r="1.6" /><circle cx="20" cy="4" r="1.6" /></>, title: 'Your journey', text: 'Built around your goals' },
  { icon: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" /><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" /></>, title: 'Great books', text: 'Fiction and non-fiction' },
];

function ValueStrip() {
  return (
    <ul className="mb-5 grid grid-cols-3 gap-2">
      {VALUES.map((v, i) => (
        <motion.li key={v.title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.08 }}
          className="surface flex flex-col items-center rounded-card px-2 py-3 text-center">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#5ec2ff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{v.icon}</svg>
          <span className="mt-1.5 text-[13px] font-semibold">{v.title}</span>
          <span className="text-[11px] leading-snug text-muted">{v.text}</span>
        </motion.li>
      ))}
    </ul>
  );
}

function useSubmit<T>(fn: () => Promise<T>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { return await fn(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return { busy, error, run };
}

export function Login() {
  const { setMe } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useSubmit(async () => {
    const me = await api<Me>('/auth/login', { body: { email, password } });
    setMe(me);
    nav(me.onboarded ? '/' : '/onboarding', { replace: true });
  });
  return (
    <Shell title="Learn something that sticks, every day" subtitle="Bite-size learning built around your goals, drawn from the best fiction and non-fiction." hero={<ValueStrip />}
      footer={<>New here? <Link to="/signup" className="link">Create an account</Link></>}>
      <form onSubmit={run} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label="Email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="text-right text-sm"><Link to="/forgot-password" className="link">Forgot password?</Link></div>
        <Submit busy={busy}>Log in</Submit>
      </form>
    </Shell>
  );
}

export function Signup() {
  const { setMe } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [localErr, setLocalErr] = useState('');
  const { busy, error, run } = useSubmit(async () => {
    const me = await api<Me>('/auth/signup', { body: { ...f, timezone: browserTimezone() } });
    setMe(me);
    nav('/onboarding', { replace: true });
  });
  const submit = (e: FormEvent) => {
    if (f.password.length < 6) { e.preventDefault(); setLocalErr('Password must be at least 6 characters'); return; }
    setLocalErr(''); run(e);
  };
  return (
    <Shell title="Start your learning journey" subtitle="Tell us where you're headed and every bite is shaped around you. Takes under a minute."
      footer={<>Already have an account? <Link to="/login" className="link">Log in</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {(localErr || error) && <Alert>{localErr || error}</Alert>}
        <Field label="Name" autoComplete="name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Field label="Email" type="email" autoComplete="email" inputMode="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <Field label="Password" type="password" autoComplete="new-password" required minLength={6} hint="At least 6 characters"
          value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        <Submit busy={busy}>Create account</Submit>
        <p className="text-xs leading-relaxed text-muted">
          <strong className="text-ink">Privacy:</strong> to personalize your learning and give you feedback, Insight sends your learning profile and the
          answers you write to an AI provider (Anthropic). We don't send your name, email or password. You can delete your account and all your data at any time.
        </p>
      </form>
    </Shell>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useSubmit(async () => { await api('/auth/forgot-password', { body: { email } }); setSent(true); });
  return (
    <Shell title="Reset your password" subtitle="We'll email you a link to choose a new one."
      footer={<Link to="/login" className="link">Back to log in</Link>}>
      {sent ? (
        <Alert kind="success">If an account exists for {email}, a reset link is on its way. It expires in 1 hour.</Alert>
      ) : (
        <form onSubmit={run} className="space-y-4" noValidate>
          {error && <Alert>{error}</Alert>}
          <Field label="Email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Submit busy={busy}>Send reset link</Submit>
        </form>
      )}
    </Shell>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const { setMe } = useAuth();
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const { busy, error, run } = useSubmit(async () => {
    if (password.length < 6) throw new Error('Password must be at least 6 characters');
    const me = await api<Me>('/auth/reset-password', { body: { token: params.get('token') ?? '', password } });
    setMe(me);
    nav(me.onboarded ? '/' : '/onboarding', { replace: true });
  });
  return (
    <Shell title="Choose a new password" footer={<Link to="/login" className="link">Back to log in</Link>}>
      <form onSubmit={run} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label="New password" type="password" autoComplete="new-password" hint="At least 6 characters. This signs you out on other devices."
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <Submit busy={busy}>Save password</Submit>
      </form>
    </Shell>
  );
}

export function VerifyEmail() {
  const [params] = useSearchParams();
  const { me, refresh } = useAuth();
  const [state, setState] = useState<'working' | 'ok' | 'error'>('working');
  const [msg, setMsg] = useState('');
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return; once.current = true;
    api('/auth/verify-email', { body: { token: params.get('token') ?? '' } })
      .then(() => { setState('ok'); refresh(); })
      .catch((e) => { setState('error'); setMsg(e.message); });
  }, [params, refresh]);
  return (
    <Shell title="Email verification">
      {state === 'working' && <p className="text-center text-muted">Checking your link…</p>}
      {state === 'ok' && <Alert kind="success">Your email is verified. Thanks!</Alert>}
      {state === 'error' && <Alert>{msg}</Alert>}
      <Link to={me ? '/' : '/login'} className="btn-primary mt-4">{me ? 'Continue' : 'Log in'}</Link>
    </Shell>
  );
}
