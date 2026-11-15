import { motion } from 'framer-motion';
import type { Grade } from '../api';
import { CoachAvatar } from './Coach';

const quoted = (s: string) => `“${s.trim().replace(/^["“']+|["”']+$/g, '')}”`;

export function ScoreRing({ score, tint, size = 128 }: { score: number; tint: string; size?: number }) {
  const r = 52, c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="10" />
        <motion.circle cx="60" cy="60" r={r} fill="none" stroke={tint} strokeWidth="10" strokeLinecap="round" strokeDasharray={c}
          initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - score / 100) }} transition={{ duration: 1.1, ease: 'easeOut' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" role="img" aria-label={`Score ${score} out of 100`}>
        <span className="text-4xl font-extrabold">{score}</span><span className="text-xs text-muted">out of 100</span>
      </div>
    </div>
  );
}

/** Coach feedback: score, the tools spotted, what worked, next step and a stronger way to say it. */
export function GradeResult({ grade, tools, tint, coach }: { grade: Grade; tools: string[]; tint: string; coach: 'maya' | 'alex' }) {
  return (
    <div>
      <div className="flex flex-col items-center text-center">
        <ScoreRing score={grade.score} tint={tint} />
        <p className="mt-3 text-lg font-bold">{grade.score >= 80 ? 'Excellent work' : grade.score >= 60 ? 'Solid. A step away from great' : 'A good start to build on'}</p>
      </div>
      <div className="mt-5 flex items-start gap-3">
        <CoachAvatar coach={coach} size={40} />
        <p className="card px-4 py-3 text-sm leading-relaxed">{grade.feedback}</p>
      </div>
      {tools.length > 0 && (
        <div className="mt-5">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em]" style={{ color: tint }}>Tools you used</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {tools.map((t) => {
              const used = grade.toolsUsed.includes(t);
              return <span key={t} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${used ? 'bg-success/20 text-success' : 'border border-white/10 text-muted'}`}>{used ? '✓ ' : ''}{t}</span>;
            })}
          </div>
        </div>
      )}
      <div className="mt-4 grid gap-2.5">
        <div className="rounded-2xl border border-success/30 bg-success/10 p-4"><p className="text-xs font-bold uppercase tracking-wider text-success">What worked</p><p className="mt-1 text-[15px]">{grade.strength}</p></div>
        <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4"><p className="text-xs font-bold uppercase tracking-wider text-primary">Next step</p><p className="mt-1 text-[15px]">{grade.improve}</p></div>
        <div className="rounded-2xl bg-white p-4 text-[#0b1640]">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em]" style={{ color: `color-mix(in oklab, ${tint} 60%, #0b1640)` }}>A stronger way to say it</p>
          <p className="mt-1 text-[15px] font-semibold leading-relaxed">{quoted(grade.modelAnswer)}</p>
        </div>
      </div>
    </div>
  );
}
