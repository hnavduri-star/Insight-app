import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { motion } from 'framer-motion';

export function Logo({ size = 56 }: { size?: number }) {
  return <img src="/logo.svg" width={size} height={size} alt="" className="rounded-2xl shadow-soft" />;
}

export const Field = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }>(
  function Field({ label, hint, type, ...rest }, ref) {
    const id = useId();
    const [show, setShow] = useState(false);
    const isPw = type === 'password';
    return (
      <div>
        <label htmlFor={id} className="label">{label}</label>
        <div className="relative">
          <input id={id} ref={ref} type={isPw && show ? 'text' : type} className={`field ${isPw ? 'pr-16' : ''}`} {...rest} />
          {isPw && (
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-1 my-auto h-10 rounded-lg px-3 text-sm text-muted hover:text-ink"
              aria-label={show ? 'Hide password' : 'Show password'}>{show ? 'Hide' : 'Show'}</button>
          )}
        </div>
        {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
      </div>
    );
  });

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'success' | 'info'; children: ReactNode }) {
  const styles = { error: 'border-error/40 bg-error/10 text-error', success: 'border-success/40 bg-success/10 text-success', info: 'border-primary/40 bg-primary/10 text-ink' }[kind];
  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} role={kind === 'error' ? 'alert' : 'status'}
      className={`rounded-input border px-3.5 py-3 text-sm ${styles}`}>{children}</motion.div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-muted" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

export function Submit({ busy, children }: { busy?: boolean; children: ReactNode }) {
  return (
    <button type="submit" className="btn-primary" disabled={busy}>
      {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
      {children}
    </button>
  );
}

export function Avatar({ name, size = 48 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
  return (
    <span style={{ width: size, height: size, fontSize: size * 0.38 }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2563eb] via-[#1d74d8] to-[#14a89a] font-display font-semibold text-white shadow-soft ring-1 ring-white/10">
      {initials}
    </span>
  );
}
