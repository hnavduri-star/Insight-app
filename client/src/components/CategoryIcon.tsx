/**
 * Line icons and a muted accent per heading. Matched by heading name; a heading
 * an admin adds later falls back to its emoji from the database.
 */
type Style = { tint: string; pair: [string, string]; path: JSX.Element };

/** tint: light accent for text on dark; pair: the vivid two-colour fill for tiles and cards. */
const s = (tint: string, pair: [string, string], path: JSX.Element): Style => ({ tint, pair, path });

const STYLES: Record<string, Style> = {
  'Thinking and Problem Solving': s('#8b9cff', ['#5b5bf0', '#7c3aed'], <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" /></>),
  'Personal Effectiveness': s('#e08bff', ['#a23ce8', '#d0369a'], <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9 2h6" /></>),
  'Communication': s('#5ec2ff', ['#0b8fe0', '#2457e6'], <><path d="M4 5h16v11H9l-5 4V5Z" /><path d="M8 10h8M8 13h5" /></>),
  'Presenting and Public Speaking': s('#3ee0f0', ['#08a9c4', '#0b6f9e'], <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>),
  'Influence, Negotiation and Sales': s('#ffb36b', ['#fb7b1c', '#d9480f'], <><path d="m3 12 4-4 4 3 3-3 3 1 4 3" /><path d="m7 15 3 3 2-1 3 2 4-4" /></>),
  'Difficult Conversations and Conflict': s('#ff8aa3', ['#ef3e62', '#b0174a'], <><path d="M4 5h11v8H8l-4 3V5Z" /><path d="M15 9h5v8l-3-2h-6v-2" /></>),
  'Leading People and Teams': s('#3ee6cf', ['#11b39f', '#0b7a72'], <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" /></>),
  'Projects and Execution': s('#b79bff', ['#7a4cf4', '#4b2bc2'], <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 11l2 2 4-4M9 17h6" /></>),
  'Business Strategy and Growth': s('#7aa7ff', ['#2f6bff', '#1d3fb8'], <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>),
  'Finance': s('#c6f04a', ['#5fb81a', '#2f7d1c'], <><circle cx="12" cy="12" r="9" /><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.6-.6-3-1.6M12 6v2M12 16v2" /></>),
  'Wellbeing and Resilience': s('#5eeaa8', ['#16b878', '#0b7f5c'], <><path d="M12 21v-8" /><path d="M12 13c0-4 3-7 8-7 0 5-3 7-8 7ZM12 15c0-3-2.5-5-7-5 0 4 2.5 5 7 5Z" /></>),
  'Career Growth': s('#ff8fd0', ['#f0469c', '#b81f78'], <><path d="M5 19c2-6 6-11 14-14-1 8-6 12-12 14" /><path d="M9 15l-4 4M14 6l4 4" /></>),
};

export function categoryTint(name: string) { return STYLES[name]?.tint ?? '#5ec2ff'; }

const PAIR_BY_TINT = Object.fromEntries(Object.values(STYLES).map((x) => [x.tint, x.pair]));

/** Vivid tile background (Wio-style): a bright two-colour fill with a soft light in the top corner. */
export const tileBackground = (tint: string) => {
  const [a, b] = PAIR_BY_TINT[tint] ?? [tint, `color-mix(in oklab, ${tint} 45%, #0b1640)`];
  return `radial-gradient(90% 70% at 100% 0%, rgba(255,255,255,0.22) 0%, transparent 60%), linear-gradient(155deg, ${a} 0%, ${b} 100%)`;
};

/** Large line icon on its own, for decorating tiles and headers. */
export function CategoryGlyph({ name, size = 24, className = '' }: { name: string; size?: number; className?: string }) {
  const st = STYLES[name];
  if (!st) return null;
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>{st.path}</svg>;
}

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
