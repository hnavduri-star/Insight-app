import { useState } from 'react';
import type { Week } from '../api';

/** Draws "My week in Insight" as a 1080×1350 image (portrait, fits social feeds). */
async function drawWeek(w: Week, firstName: string): Promise<Blob> {
  const W = 1080, H = 1350;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  await document.fonts?.ready;
  const font = (wt: number, px: number) => `${wt} ${px}px ${wt >= 700 && px >= 60 ? "Fraunces, Georgia, serif" : "Inter, system-ui, sans-serif"}`;
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#2563eb'); bg.addColorStop(0.55, '#4f46e5'); bg.addColorStop(1, '#6d28d9');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.arc(W - 80, 120, 260, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff';
  g.font = font(700, 34); g.globalAlpha = 0.8; g.fillText('MY WEEK IN INSIGHT', 90, 150); g.globalAlpha = 1;
  g.font = font(800, 92); g.fillText(`${w.daysActive}/7 days`, 90, 270);
  g.font = font(600, 40); g.globalAlpha = 0.85; g.fillText(`${firstName} · 🔥 ${w.streak}-day streak`, 90, 340); g.globalAlpha = 1;
  // Day dots
  w.days.forEach((d, i) => {
    const x = 90 + i * 132 + 50, y = 470;
    g.fillStyle = d.active ? '#fff' : 'rgba(0,0,0,0.22)'; g.beginPath(); g.arc(x, y, 48, 0, Math.PI * 2); g.fill();
    if (d.active) { g.font = font(400, 44); g.textAlign = 'center'; g.fillText('🔥', x, y + 16); }
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = font(700, 28); g.textAlign = 'center'; g.fillText(d.weekday.slice(0, 2), x, y + 95);
  });
  g.textAlign = 'left';
  // Stat tiles
  const stats: [string, string][] = [
    ['Real-world wins', String(w.wins)], ['Practice reps', String(w.counts.find((c) => c.kind === 'rep')?.n ?? 0)],
    ['Role-play avg', w.avgRoleplay != null ? String(w.avgRoleplay) : '–'], ['Review accuracy', w.reviewAccuracy != null ? `${w.reviewAccuracy}%` : '–'],
  ];
  stats.forEach(([label, v], i) => {
    const x = 90 + (i % 2) * 460, y = 640 + Math.floor(i / 2) * 230;
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.roundRect(x, y, 440, 200, 36); g.fill();
    g.fillStyle = '#fff'; g.font = font(800, 84); g.fillText(v, x + 40, y + 110);
    g.font = font(600, 32); g.globalAlpha = 0.85; g.fillText(label, x + 40, y + 162); g.globalAlpha = 1;
  });
  const topics = w.topics.slice(0, 3).map((t) => t.name).join(' · ');
  if (topics) { g.font = font(700, 34); g.fillStyle = '#fff'; g.fillText(topics.length > 52 ? `${topics.slice(0, 50)}…` : topics, 90, 1150); }
  g.font = font(700, 30); g.globalAlpha = 0.75; g.fillText('Learning from the best books, practised for real.', 90, 1240); g.globalAlpha = 1;
  return new Promise((r) => cv.toBlob((b) => r(b!), 'image/png'));
}

export function ShareWeek({ week, firstName }: { week: Week; firstName: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const share = async () => {
    setBusy(true); setMsg('');
    try {
      const blob = await drawWeek(week, firstName);
      const file = new File([blob], 'my-insight-week.png', { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'My week in Insight' }).catch(() => {});
      } else {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        setMsg('Image saved. Share it wherever you like.');
      }
    } catch { setMsg("Couldn't create the image on this device."); }
    finally { setBusy(false); }
  };
  return (
    <div>
      <button className="btn-ghost flex w-full items-center justify-center gap-2" onClick={share} disabled={busy}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></svg>
        {busy ? 'Creating…' : 'Share my week'}
      </button>
      {msg && <p className="mt-1.5 text-center text-xs text-muted">{msg}</p>}
      <p className="mt-1 text-center text-[11px] text-muted">Shows only your totals, never what you wrote.</p>
    </div>
  );
}
