import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api, type Me, type Plans } from '../api';
import { useAuth } from '../auth';
import { useToast } from './Toast';
import { Sheet } from './Sheet';
import { Alert } from './ui';

const PERKS = [
  { title: 'Every topic in the library', text: 'Go beyond your free topic, whenever you are ready.' },
  { title: 'Practise with your people', text: 'Rehearse real conversations with your boss, client or partner before they happen.' },
  { title: 'A journey that adds up', text: 'Each topic builds on the last in your Playbook.' },
];

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: amount % 100 ? 2 : 0 }).format(amount / 100);

/** Upgrade sheet: pick monthly or annual, then go to Stripe Checkout (card, Apple Pay, Google Pay). */
export function Paywall({ open, onClose, topicName, reason }: { open: boolean; onClose: () => void; topicName?: string; reason?: string }) {
  const { setMe } = useAuth();
  const toast = useToast();
  const [plans, setPlans] = useState<Plans | null>(null);
  const [interval, setInterval] = useState<'month' | 'year'>('year');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    api<Plans>('/billing/plans').then(setPlans).catch(() => setPlans({ enabled: false, plans: [] }));
  }, [open]);

  const monthly = plans?.plans.find((p) => p.interval === 'month');
  const annual = plans?.plans.find((p) => p.interval === 'year');
  const saving = monthly?.amount && annual?.amount ? Math.round((1 - annual.amount / (monthly.amount * 12)) * 100) : 0;

  const checkout = async () => {
    setBusy(true); setError('');
    try {
      const { url } = await api<{ url: string }>('/billing/checkout', { body: { interval } });
      window.location.assign(url);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };

  const testUpgrade = async () => {
    setBusy(true); setError('');
    try {
      setMe(await api<Me>('/billing/test-upgrade', { body: { interval } }));
      toast('Welcome to Insight Premium (test mode). Every topic is now open.', 'success');
      onClose();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const option = (iv: 'month' | 'year', title: string, plan?: Plans['plans'][number]) => {
    const on = interval === iv;
    return (
      <button type="button" role="radio" aria-checked={on} onClick={() => setInterval(iv)}
        className={`relative flex-1 rounded-card border p-4 text-left transition active:scale-[0.98] ${on ? 'border-primary bg-primary/10' : 'border-white/10 bg-bg/30 hover:border-white/20'}`}>
        {iv === 'year' && saving > 0 && (
          <span className="absolute -top-2.5 right-3 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-bg">Save {saving}%</span>
        )}
        <span className="block text-sm text-muted">{title}</span>
        {plan?.amount != null && plan.currency ? (
          <>
            <span className="mt-1 block font-display text-2xl font-semibold">{money(plan.amount, plan.currency)}</span>
            <span className="text-xs text-muted">{iv === 'year' ? `per year · ${money(Math.round(plan.amount / 12), plan.currency)}/mo` : 'per month'}</span>
          </>
        ) : <span className="mt-1 block font-display text-xl font-semibold text-muted">—</span>}
        <span className={`absolute right-3 top-4 h-5 w-5 rounded-full border-2 ${on ? 'border-primary bg-primary shadow-[inset_0_0_0_3px_#122b5e]' : 'border-muted/40'}`} aria-hidden />
      </button>
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title="Insight Premium">
      <div className="relative">
        <div className="pointer-events-none absolute -top-16 left-1/2 h-40 w-64 -translate-x-1/2 rounded-full bg-[#f5b971]/15 blur-3xl" aria-hidden />
        <div className="relative text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: 'linear-gradient(160deg, #f5b97140, #f5b97112)', border: '1px solid #f5b97150', color: '#f5b971' }} aria-hidden>
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8Z" /></svg>
          </span>
          <p className="eyebrow mt-4">Insight Premium</p>
          <h2 className="mt-1.5 text-[26px] font-semibold leading-tight">Unlock your whole learning journey</h2>
          {(reason || topicName) && <p className="mt-2 text-sm text-muted">{reason ?? `${topicName} is part of Premium.`}</p>}
        </div>

        <ul className="mt-5 space-y-2.5">
          {PERKS.map((p, i) => (
            <motion.li key={p.title} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}
              className="flex gap-3 px-1">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#2dd4bf" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" aria-hidden><path d="m5 12 5 5 9-10" /></svg>
              <span><span className="block font-medium">{p.title}</span><span className="text-sm text-muted">{p.text}</span></span>
            </motion.li>
          ))}
        </ul>

        <div className="mt-6 flex gap-3" role="radiogroup" aria-label="Billing period">
          {option('month', 'Monthly', monthly)}
          {option('year', 'Annual', annual)}
        </div>

        {error && <div className="mt-4"><Alert>{error}</Alert></div>}
        {plans?.testMode ? (
          <>
            <button className="btn-primary mt-5" onClick={testUpgrade} disabled={busy}>
              {busy ? 'Upgrading…' : `Upgrade to ${interval === 'year' ? 'annual' : 'monthly'} · test mode`}
            </button>
            <p className="mt-3 rounded-input border border-[#f5b971]/30 bg-[#f5b971]/[0.07] px-3 py-2 text-center text-xs text-[#f5d29e]">
              Test mode: no payment is taken. You can end the test plan from your Profile.
            </p>
          </>
        ) : plans?.enabled ? (
          <button className="btn-primary mt-5" onClick={checkout} disabled={busy}>
            {busy ? 'Opening secure checkout…' : `Continue with ${interval === 'year' ? 'annual' : 'monthly'}`}
          </button>
        ) : (
          <button className="btn-primary mt-5" disabled>{plans ? 'Subscriptions open soon' : 'Loading plans…'}</button>
        )}
        {!plans?.testMode && <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-muted">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
          Secure checkout by Stripe · Card, Apple Pay or Google Pay · Cancel anytime
        </p>}
        <button className="btn-ghost mt-4 w-full" onClick={onClose}>Not now</button>
      </div>
    </Sheet>
  );
}
