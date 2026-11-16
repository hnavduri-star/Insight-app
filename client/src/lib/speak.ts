/**
 * Text-to-speech with the device's built-in voices (free, works offline on most phones).
 * Quality depends on the device: iPhones and Macs with "Enhanced" voices sound best.
 */
export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

let cached: SpeechSynthesisVoice[] = [];
function voices() {
  if (!ttsSupported()) return [];
  const v = window.speechSynthesis.getVoices();
  if (v.length) cached = v;
  return cached;
}
if (ttsSupported()) window.speechSynthesis.onvoiceschanged = () => { voices(); };

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** A consistent voice per character: same name, same voice. Prefers higher-quality voices in the learner's language. */
export function voiceFor(seed: string) {
  const lang = (navigator.language || 'en-US').slice(0, 2).toLowerCase();
  const all = voices();
  let pool = all.filter((v) => v.lang.toLowerCase().startsWith(lang));
  if (!pool.length) pool = all.filter((v) => v.lang.toLowerCase().startsWith('en'));
  const good = pool.filter((v) => /natural|neural|premium|enhanced|google|siri/i.test(v.name));
  const list = good.length >= 2 ? good : pool;
  return list.length ? list[hash(seed) % list.length] : null;
}

export function speak(text: string, seed: string, opts: { rate?: number; onEnd?: () => void } = {}) {
  if (!ttsSupported() || !text.trim()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = voiceFor(seed);
  if (v) { u.voice = v; u.lang = v.lang; }
  u.rate = opts.rate ?? 1;
  u.pitch = 0.9 + (hash(seed) % 30) / 100; // small per-character difference
  if (opts.onEnd) { u.onend = opts.onEnd; u.onerror = opts.onEnd; }
  synth.speak(u);
}

export const stopSpeaking = () => { if (ttsSupported()) window.speechSynthesis.cancel(); };

const KEY = 'insight.voiceOn';
export const voicePref = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } };
export const setVoicePref = (on: boolean) => { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode */ } };
