import { useEffect, useState } from 'react';
import { api } from '../api';
import { Alert } from './ui';

type Settings = { enabled: boolean; time: string; subscribed: boolean; publicKey: string };
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

// Chrome/Android offers an install prompt; keep it so a button can trigger it later.
let deferred: InstallEvent | null = null;
if (typeof window !== 'undefined') window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallEvent; });

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function keyBytes(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function subscribe(publicKey: string) {
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
  await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  return existing ?? reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
}

/** Daily reminder: pick a time, allow notifications, done. Also offers to install Insight on the home screen. */
export function RemindersCard({ compact = false }: { compact?: boolean }) {
  const [s, setS] = useState<Settings | null>(null);
  const [time, setTime] = useState('08:30');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'error' | 'success' | 'info'; text: string } | null>(null);
  const [canInstall, setCanInstall] = useState(!!deferred);
  useEffect(() => {
    api<Settings>('/reminders').then((d) => { setS(d); setTime(d.time); }).catch(() => {});
    const on = () => setCanInstall(true);
    window.addEventListener('beforeinstallprompt', on);
    return () => window.removeEventListener('beforeinstallprompt', on);
  }, []);
  if (!s || (compact && s.enabled)) return null;

  const needsInstall = isIOS() && !standalone();
  const enable = async () => {
    setBusy(true); setMsg(null);
    try {
      if (!pushSupported()) throw new Error("This browser can't show reminders. Try Chrome, or add Insight to your Home Screen on iPhone.");
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error('Notifications are blocked. Allow them for Insight in your browser or phone settings.');
      const sub = await subscribe(s.publicKey);
      setS({ ...s, ...(await api<Settings>('/reminders', { method: 'PUT', body: { enabled: true, time, subscription: sub.toJSON() } })) });
      setMsg({ kind: 'success', text: `Done. We'll nudge you at ${time} on days you haven't learned yet.` });
    } catch (e) { setMsg({ kind: 'error', text: (e as Error).message }); } finally { setBusy(false); }
  };
  const save = async (enabled: boolean, t = time) => {
    setBusy(true); setMsg(null);
    try { setS({ ...s, ...(await api<Settings>('/reminders', { method: 'PUT', body: { enabled, time: t } })) }); }
    catch (e) { setMsg({ kind: 'error', text: (e as Error).message }); } finally { setBusy(false); }
  };
  const test = async () => {
    setMsg(null);
    try { await api('/reminders/test', { body: {} }); setMsg({ kind: 'info', text: 'Sent. It should appear in a few seconds.' }); }
    catch (e) { setMsg({ kind: 'error', text: (e as Error).message }); }
  };
  const install = async () => { if (!deferred) return; await deferred.prompt(); deferred = null; setCanInstall(false); };

  return (
    <section className="card p-5">
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden>🔔</span>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">Daily reminder</h2>
          {!compact && <p className="text-sm text-muted">One nudge a day, only if you haven't learned yet. Streaks stick when there's a cue.</p>}
        </div>
      </div>
      {needsInstall ? (
        <div className="mt-3 rounded-2xl bg-white/[0.05] p-3 text-sm leading-relaxed">
          On iPhone, reminders work once Insight is on your Home Screen: tap <span className="font-bold">Share</span> <span aria-hidden>⬆️</span>, then <span className="font-bold">Add to Home Screen</span>. Open Insight from there and turn reminders on.
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-3">
            <label htmlFor="rem-time" className="text-sm text-muted">Remind me at</label>
            <input id="rem-time" type="time" value={time} className="field w-auto min-h-[44px] py-2"
              onChange={(e) => { setTime(e.target.value); if (s.enabled && e.target.value) save(true, e.target.value); }} />
          </div>
          <div className="mt-3 flex gap-2">
            {s.enabled ? <>
              <button className="btn-ghost flex-1" onClick={() => save(false)} disabled={busy}>Turn off</button>
              <button className="btn-ghost flex-1" onClick={test}>Send a test</button>
            </> : <button className="btn-primary" onClick={enable} disabled={busy}>{busy ? 'Turning on…' : 'Turn on reminders'}</button>}
          </div>
        </>
      )}
      {canInstall && !standalone() && <button className="mt-3 w-full text-sm font-bold text-primary" onClick={install}>Install Insight on this device</button>}
      {msg && <div className="mt-3"><Alert kind={msg.kind}>{msg.text}</Alert></div>}
    </section>
  );
}
