import { COACHES, DAILY_MINUTES, GOALS, INDUSTRIES, PERSONAS } from '../options';
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

export const PersonaPicker = (p: { value: string | null; onChange: (v: string) => void }) =>
  <Chips label="Which best describes you?" options={PERSONAS} {...p} />;

export const GoalPicker = (p: { value: string | null; onChange: (v: string) => void }) =>
  <Chips label="Your main goal" options={GOALS.map((g) => ({ value: g, label: g }))} {...p} />;

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
