export * from '../../shared/options';
import { PERSONAS } from '../../shared/options';
export const personaLabel = (v: string | null) => PERSONAS.find((p) => p.value === v)?.label ?? '';
