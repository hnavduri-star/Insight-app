import { COACHES, DAILY_MINUTES, GOALS, INDUSTRIES, MAX_GOALS, PERSONAS } from '../options';
import { CoachAvatar } from './Coach';

function Chips<T extends string | number>({ label, options, value, onChange }: {
  label: string; options: readonly { value: T; label: string }[]; value: T | null; onChange: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup">
        {options.map((o) => (
          <button key={String(o.value)} type="button" role="radio" aria-checked={value === o.value}
            onClick={() => onChange(o.value)} className={`chip ${value === o.value ? 'chip-on' : 'chip-off'}`}>{o.label}</button>
        ))}
      </div>
    </fieldset>
  );
}

export function PersonaPicker({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  return (
    <fieldset>
      <legend className="label">Your career stage</legend>
      <div className="space-y-2" role="radiogroup">
        {PERSONAS.map((p) => {
          const on = value === p.value;
          return (
            <button key={p.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(p.value)}
              className={`flex min-h-[60px] w-full items-center gap-3 rounded-card border px-4 py-3 text-left transition active:scale-[0.99] ${on ? 'border-primary bg-primary/10' : 'border-white/10 bg-card/50 hover:border-white/20'}`}>
              <span className="flex-1">
                <span className="block font-medium">{p.label}</span>
                <span className="text-xs text-muted">{p.hint}</span>
              </span>
              <span className={`h-5 w-5 shrink-0 rounded-full border-2 ${on ? 'border-primary bg-primary shadow-[inset_0_0_0_3px_#122b5e]' : 'border-muted/40'}`} aria-hidden />
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Multi-select, up to MAX_GOALS; the first one picked is the main goal. */
export function GoalPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (g: string) =>
    onChange(value.includes(g) ? value.filter((x) => x !== g) : value.length < MAX_GOALS ? [...value, g] : value);
  return (
    <fieldset>
      <legend className="label">Your goals <span className="text-muted/70">(pick up to {MAX_GOALS}; your first is your main goal)</span></legend>
      <div className="flex flex-wrap gap-2">
        {GOALS.map((g) => {
          const i = value.indexOf(g);
          const full = i < 0 && value.length >= MAX_GOALS;
          return (
            <button key={g} type="button" aria-pressed={i >= 0} onClick={() => toggle(g)} disabled={full}
              className={`chip inline-flex items-center gap-2 ${i >= 0 ? 'chip-on' : 'chip-off'} ${full ? 'opacity-40' : ''}`}>
              {g}
              {i === 0 && <span className="rounded-full bg-accent/20 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-accent">Main</span>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export const MinutesPicker = (p: { value: number | null; onChange: (v: number) => void }) =>
  <Chips label="Minutes per day" options={DAILY_MINUTES.map((m) => ({ value: m, label: `${m} min` }))} {...p} />;

export function IndustryPicker({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor="industry" className="label">Your industry</label>
      <select id="industry" className="field appearance-none" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>Choose your industry</option>
        {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
      </select>
    </div>
  );
}

export function CoachPicker({ value, onChange }: { value: string | null; onChange: (v: 'maya' | 'alex') => void }) {
  return (
    <fieldset>
      <legend className="label">Choose your coach</legend>
      <div className="grid grid-cols-2 gap-3" role="radiogroup">
        {COACHES.map((c) => {
          const on = value === c.value;
          return (
            <button key={c.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(c.value)}
              className={`flex flex-col items-center gap-2 rounded-card border p-4 text-center transition active:scale-[0.98] ${on ? 'border-primary bg-primary/10' : 'border-line bg-card/50 hover:border-muted'}`}>
              <CoachAvatar coach={c.value} size={76} idle={on} />
              <span className="font-semibold">{c.name}</span>
              <span className="text-xs text-muted">{c.blurb}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
