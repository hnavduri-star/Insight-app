/**
 * Line icons and a muted accent per heading. Matched by heading name; a heading
 * an admin adds later falls back to its emoji from the database.
 */
type Style = { tint: string; path: JSX.Element };

const s = (tint: string, path: JSX.Element): Style => ({ tint, path });

const STYLES: Record<string, Style> = {
  'Thinking and Problem Solving': s('#7c9cff', <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" /></>),
  'Personal Effectiveness': s('#a78bfa', <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9 2h6" /></>),
  'Communication': s('#5ec2ff', <><path d="M4 5h16v11H9l-5 4V5Z" /><path d="M8 10h8M8 13h5" /></>),
  'Presenting and Public Speaking': s('#38bdf8', <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>),
  'Influence, Negotiation and Sales': s('#f5b971', <><path d="m3 12 4-4 4 3 3-3 3 1 4 3" /><path d="m7 15 3 3 2-1 3 2 4-4" /></>),
  'Difficult Conversations and Conflict': s('#f2879b', <><path d="M4 5h11v8H8l-4 3V5Z" /><path d="M15 9h5v8l-3-2h-6v-2" /></>),
  'Leading People and Teams': s('#2dd4bf', <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" /></>),
  'Projects and Execution': s('#c084fc', <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 11l2 2 4-4M9 17h6" /></>),
  'Business Strategy and Growth': s('#4ade80', <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>),
  'Finance': s('#facc15', <><circle cx="12" cy="12" r="9" /><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.6-.6-3-1.6M12 6v2M12 16v2" /></>),
  'Wellbeing and Resilience': s('#86efac', <><path d="M12 21v-8" /><path d="M12 13c0-4 3-7 8-7 0 5-3 7-8 7ZM12 15c0-3-2.5-5-7-5 0 4 2.5 5 7 5Z" /></>),
  'Career Growth': s('#fb923c', <><path d="M5 19c2-6 6-11 14-14-1 8-6 12-12 14" /><path d="M9 15l-4 4M14 6l4 4" /></>),
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
