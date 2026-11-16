import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

/* Browser speech-to-text (Chrome, Edge, Safari on iPhone and Mac). Audio is handled by the
   browser's own speech service; Insight only receives the text. */
type Rec = {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
};
const Recognition = (): (new () => Rec) | null =>
  (typeof window !== 'undefined' && ((window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition)) as (new () => Rec) | null;

export const speechSupported = () => !!Recognition();

/**
 * Hold a conversation out loud: tap to talk, tap again to stop. Final phrases are appended to the
 * text box (which stays editable); the live phrase shows underneath while speaking.
 */
export function MicButton({ onText, onStart, size = 52, label = 'Speak your answer' }: { onText: (t: string) => void; onStart?: () => void; size?: number; label?: string }) {
  const [on, setOn] = useState(false);
  const [live, setLive] = useState('');
  const [err, setErr] = useState('');
  const rec = useRef<Rec | null>(null);
  const cb = useRef(onText);
  cb.current = onText;
  useEffect(() => () => rec.current?.abort(), []);
  const R = Recognition();
  if (!R) return null;

  const toggle = () => {
    if (on) { rec.current?.stop(); return; }
    onStart?.(); // e.g. stop the character talking so the mic doesn't hear it
    setErr('');
    const r = new R();
    r.lang = navigator.language || 'en-US';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) cb.current(res[0].transcript.trim()); else interim += res[0].transcript;
      }
      setLive(interim);
    };
    r.onerror = (e) => setErr(e.error === 'not-allowed' ? 'Allow microphone access to speak your answer.' : e.error === 'no-speech' ? '' : "Couldn't hear that. Try again or type.");
    r.onend = () => { setOn(false); setLive(''); };
    rec.current = r;
    try { r.start(); setOn(true); } catch { setErr("Couldn't start the microphone."); }
  };

  return (
    <div className="relative shrink-0">
      <button type="button" onClick={toggle} aria-pressed={on} aria-label={on ? 'Stop speaking' : label}
        className="relative flex items-center justify-center rounded-2xl text-white transition active:scale-95"
        style={{ width: size, height: size, background: on ? '#f0506e' : 'rgba(255,255,255,0.1)' }}>
        {on && <motion.span className="absolute inset-0 rounded-2xl" style={{ boxShadow: '0 0 0 0 rgba(240,80,110,0.6)' }}
          animate={{ boxShadow: ['0 0 0 0 rgba(240,80,110,0.55)', '0 0 0 12px rgba(240,80,110,0)'] }} transition={{ duration: 1.2, repeat: Infinity }} />}
        {on ? <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
          : <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>}
      </button>
      {(live || err) && (
        <p className="absolute bottom-full right-0 mb-2 w-[min(80vw,22rem)] rounded-xl bg-[#0b1640] px-3 py-2 text-right text-xs shadow-lg ring-1 ring-white/10" role="status">
          {err || <span className="italic text-muted">{live}…</span>}
        </p>
      )}
    </div>
  );
}

/** Appends spoken text to existing text with a sensible space. */
export const appendSpoken = (prev: string, t: string, max: number) => (prev.trim() ? `${prev.trimEnd()} ${t}` : t).slice(0, max);

/** "Say it out loud" row under a text box; hidden where the browser can't do speech-to-text. */
export function VoiceRow({ onText }: { onText: (t: string) => void }) {
  if (!speechSupported()) return null;
  return (
    <div className="mt-2 flex items-center gap-3">
      <MicButton size={44} onText={onText} />
      <span className="text-xs text-muted">Say it out loud. Speaking it is closer to the real thing.</span>
    </div>
  );
}
