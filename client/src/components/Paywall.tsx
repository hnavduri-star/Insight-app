import { Sheet } from './Sheet';

const PERKS = [
  { title: 'Every topic in the library', text: 'Go beyond your free topic, whenever you are ready.' },
  { title: 'A journey that adds up', text: 'Each topic builds on the last in your Playbook.' },
  { title: 'A plan built around your goal', text: 'Know what to learn next, week by week.' },
];

/** Upgrade sheet. Payments are not connected yet, so the button is disabled. */
export function Paywall({ open, onClose, topicName }: { open: boolean; onClose: () => void; topicName?: string }) {
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
          {topicName && <p className="mt-2 text-sm text-muted">{topicName} is part of Premium.</p>}
        </div>
        <ul className="mt-6 space-y-3">
          {PERKS.map((p) => (
            <li key={p.title} className="surface flex gap-3 rounded-input px-3.5 py-3">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#2dd4bf" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" aria-hidden><path d="m5 12 5 5 9-10" /></svg>
              <span><span className="block font-medium">{p.title}</span><span className="text-sm text-muted">{p.text}</span></span>
            </li>
          ))}
        </ul>
        <button className="btn-primary mt-6" disabled>Subscriptions open soon</button>
        <button className="btn-ghost mt-3 w-full" onClick={onClose}>Not now</button>
      </div>
    </Sheet>
  );
}
