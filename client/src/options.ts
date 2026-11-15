export * from '../../shared/options';
import { PERSONAS } from '../../shared/options';
export const personaLabel = (v: string | null) => PERSONAS.find((p) => p.value === v)?.label ?? '';
/** "an early-stage employee", "a manager", "a senior executive" */
export const personaPhrase = (v: string | null) => {
  const l = personaLabel(v).toLowerCase();
  return l ? `${/^[aeiou]/.test(l) ? 'an' : 'a'} ${l}` : '';
};
