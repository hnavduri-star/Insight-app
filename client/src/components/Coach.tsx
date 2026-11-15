import { motion } from 'framer-motion';

/**
 * Illustrated coach avatars (placeholder SVG art; the brief calls for custom
 * illustrations or Lottie in the real build). Gentle idle bob via Framer Motion.
 */
export function CoachAvatar({ coach, size = 72, idle = true }: { coach: 'maya' | 'alex'; size?: number; idle?: boolean }) {
  return (
    <motion.div
      animate={idle ? { y: [0, -3, 0] } : undefined}
      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      style={{ width: size, height: size }}
      className="shrink-0 overflow-hidden rounded-full border-2 border-primary/50 bg-gradient-to-b from-[#1b3b7a] to-card shadow-soft"
      role="img" aria-label={coach === 'maya' ? 'Maya, your coach' : 'Alex, your coach'}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
        {coach === 'maya' ? (
          <g>
            <path d="M22 62c-4-30 10-46 28-46s32 16 28 46c-2 10-8 14-8 14H30s-6-4-8-14Z" fill="#3b2314" />
            <rect x="42" y="64" width="16" height="14" rx="6" fill="#e0a77e" />
            <path d="M18 100c2-16 16-24 32-24s30 8 32 24Z" fill="#2dd4bf" />
            <ellipse cx="50" cy="48" rx="20" ry="22" fill="#eab48a" />
            <path d="M29 44c2-14 12-20 22-20 11 0 19 7 21 18-10-2-20-8-24-14-4 8-12 14-19 16Z" fill="#3b2314" />
            <circle cx="42" cy="50" r="2.4" fill="#1d1d2b" /><circle cx="58" cy="50" r="2.4" fill="#1d1d2b" />
            <path d="M43 59c4 4 10 4 14 0" stroke="#a5523a" strokeWidth="2.4" fill="none" strokeLinecap="round" />
            <circle cx="37" cy="56" r="3" fill="#f59e9e" opacity=".5" /><circle cx="63" cy="56" r="3" fill="#f59e9e" opacity=".5" />
          </g>
        ) : (
          <g>
            <rect x="42" y="64" width="16" height="14" rx="6" fill="#b47a52" />
            <path d="M18 100c2-16 16-24 32-24s30 8 32 24Z" fill="#5ec2ff" />
            <path d="M44 78l6 8 6-8" fill="#e8f0ff" />
            <ellipse cx="50" cy="48" rx="19" ry="22" fill="#c68b5f" />
            <path d="M30 44c-1-15 9-22 20-22s21 6 20 22c-3-6-6-9-9-10-6 3-16 4-25 1-3 2-5 5-6 9Z" fill="#1f1a17" />
            <path d="M33 56c2 12 9 16 17 16s15-4 17-16c-3 4-8 6-17 6s-14-2-17-6Z" fill="#1f1a17" opacity=".85" />
            <circle cx="42" cy="49" r="2.4" fill="#1d1d2b" /><circle cx="58" cy="49" r="2.4" fill="#1d1d2b" />
            <path d="M44 60c4 3 8 3 12 0" stroke="#5a2e1e" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          </g>
        )}
      </svg>
    </motion.div>
  );
}

export function CoachBubble({ coach, children }: { coach: 'maya' | 'alex'; children: React.ReactNode }) {
  return (
    <div className="flex items-end gap-3">
      <CoachAvatar coach={coach} size={56} />
      <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
        className="relative rounded-card rounded-bl-md border border-line bg-card px-4 py-3 text-sm leading-relaxed shadow-soft" aria-live="polite">
        {children}
      </motion.div>
    </div>
  );
}
