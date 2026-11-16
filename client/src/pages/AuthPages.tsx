import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api, browserTimezone, type Me } from '../api';
import { useAuth } from '../auth';
import { Alert, Field, Logo, Submit } from '../components/ui';

/** Log in | Register switch on the second screen (after the welcome page). */
function AuthTabs({ active }: { active: 'login' | 'signup' }) {
  return (
    <div className="mb-5 grid grid-cols-2 rounded-full bg-white/[0.07] p-1" role="tablist" aria-label="Log in or register">
      {([['login', 'Log in', '/login'], ['signup', 'Register', '/signup']] as const).map(([k, label, to]) => (
        <Link key={k} to={to} replace role="tab" aria-selected={active === k}
          className={`flex min-h-[46px] items-center justify-center rounded-full text-[15px] font-bold transition ${active === k ? 'bg-white text-[#1e3a8a]' : 'text-muted'}`}>{label}</Link>
      ))}
    </div>
  );
}

function Shell({ title, subtitle, children, footer, hero }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode; hero?: ReactNode }) {
  return (
    <main className="page flex min-h-dvh flex-col justify-center pb-10">
      <Link to="/welcome" className="absolute left-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10" style={{ top: 'max(1rem, env(safe-area-inset-top))' }} aria-label="Back to the Insight welcome page">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d="m15 6-6 6 6 6" /></svg>
      </Link>
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
    <Shell title="Welcome back" subtitle="Log in to continue your development." hero={<AuthTabs active="login" />}
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
    <Shell title="Create your account" subtitle="Tell us where you're headed and everything is shaped around you. Takes under a minute." hero={<AuthTabs active="signup" />}
      footer={<>Already have an account? <Link to="/login" className="link">Log in</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {(localErr || error) && <Alert>{localErr || error}</Alert>}
        <Field label="Name" autoComplete="name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Field label="Email" type="email" autoComplete="email" inputMode="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <Field label="Password" type="password" autoComplete="new-password" required minLength={6} hint="At least 6 characters"
          value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        <Submit busy={busy}>Create account</Submit>
        <p className="text-xs leading-relaxed text-muted">
          <strong className="text-ink">Privacy:</strong> to personalize your learning and give you feedback, Insight sends your learning profile, the details of people you add and the
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
