/**
 * Line icons and a muted accent per heading. Matched by heading name; a heading
 * an admin adds later falls back to its emoji from the database.
 */
type Style = { tint: string; path: JSX.Element };

const s = (tint: string, path: JSX.Element): Style => ({ tint, path });

const STYLES: Record<string, Style> = {
  'Thinking and Learning': s('#7c9cff', <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" /></>),
  'Communication and Public Speaking': s('#5ec2ff', <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>),
  'Influence, Negotiation and Sales': s('#f5b971', <><path d="m3 12 4-4 4 3 3-3 3 1 4 3" /><path d="m7 15 3 3 2-1 3 2 4-4" /></>),
  'Difficult Conversations and Conflict': s('#f2879b', <><path d="M4 5h11v8H8l-4 3V5Z" /><path d="M15 9h5v8l-3-2h-6v-2" /></>),
  'Leadership and Teams': s('#2dd4bf', <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" /></>),
  'Productivity and Project Management': s('#a78bfa', <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9 2h6" /></>),
  'Business, Strategy and Finance': s('#4ade80', <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>),
  'Wellbeing, Career and Growth': s('#86efac', <><path d="M12 21v-8" /><path d="M12 13c0-4 3-7 8-7 0 5-3 7-8 7ZM12 15c0-3-2.5-5-7-5 0 4 2.5 5 7 5Z" /></>),
};

export function categoryTint(name: string) { return STYLES[name]?.tint ?? '#5ec2ff'; }

export function CategoryIcon({ name, emoji, size = 44 }: { name: string; emoji?: string; size?: number }) {
  const st = STYLES[name];
  const tint = st?.tint ?? '#5ec2ff';
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-[14px]"
      style={{
        width: size, height: size, color: tint,
        background: `linear-gradient(160deg, ${tint}2e, ${tint}12)`,
        border: `1px solid ${tint}38`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
      }}>
      {st ? (
        <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{st.path}</svg>
      ) : <span style={{ fontSize: size * 0.45 }}>{emoji}</span>}
    </span>
  );
}
