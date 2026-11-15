import { useState } from 'react';
import { api } from '../api';
import { Sheet } from './Sheet';
import { Alert } from './ui';

/** Three beta questions: what you used, what felt generic, would you pay. */
export function FeedbackSheet({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent?: () => void }) {
  const [used, setUsed] = useState('');
  const [generic, setGeneric] = useState('');
  const [pay, setPay] = useState<'yes' | 'maybe' | 'no' | null>(null);
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const send = async () => {
    setBusy(true); setError('');
    try {
      await api('/feedback', { body: { usedAtWork: used.trim() || undefined, feltGeneric: generic.trim() || undefined, wouldPay: pay ?? undefined, priceUsd: price ? Number(price) : null } });
      setSent(true); onSent?.();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Help shape Insight">
      {sent ? (
        <div className="py-6 text-center"><p className="text-4xl" aria-hidden>🙏</p><p className="mt-2 text-lg font-bold">Thank you</p><p className="mt-1 text-sm text-muted">This goes straight to the person building Insight.</p>
          <button className="btn-primary mt-5" onClick={onClose}>Done</button></div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">Three quick questions. Honest answers help most.</p>
          <div><label htmlFor="fb-used" className="label">What did you actually use at work or in life?</label>
            <textarea id="fb-used" rows={3} className="field py-2.5" value={used} onChange={(e) => setUsed(e.target.value.slice(0, 800))} placeholder="e.g. The 'answer first' line in my steering meeting" /></div>
          <div><label htmlFor="fb-generic" className="label">What felt generic or not for you?</label>
            <textarea id="fb-generic" rows={3} className="field py-2.5" value={generic} onChange={(e) => setGeneric(e.target.value.slice(0, 800))} placeholder="e.g. The case studies felt too junior" /></div>
          <fieldset><legend className="label">Would you pay for Insight?</legend>
            <div className="grid grid-cols-3 gap-2">{(['yes', 'maybe', 'no'] as const).map((v) => (
              <button key={v} type="button" aria-pressed={pay === v} onClick={() => setPay(v)} className={`chip ${pay === v ? 'chip-on' : 'chip-off'} justify-center capitalize`}>{v}</button>
            ))}</div></fieldset>
          {pay && pay !== 'no' && <div><label htmlFor="fb-price" className="label">What would feel fair per month (USD)?</label>
            <input id="fb-price" inputMode="numeric" className="field" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="e.g. 12" /></div>}
          {error && <Alert>{error}</Alert>}
          <button className="btn-primary" onClick={send} disabled={busy || (!used.trim() && !generic.trim() && !pay)}>{busy ? 'Sending…' : 'Send feedback'}</button>
        </div>
      )}
    </Sheet>
  );
}
