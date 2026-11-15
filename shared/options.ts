/**
 * Fixed option lists shared by client and server.
 * Industry and goal are fixed lists (not free text) because they form part of the
 * lesson cache key (section 7): free text would make every lesson a cache miss.
 */
export const PERSONAS = [
  { value: 'student', label: 'Student' },
  { value: 'job_seeker', label: 'Job Seeker' },
  { value: 'professional', label: 'Professional' },
  { value: 'manager', label: 'Manager' },
  { value: 'leader', label: 'Leader' },
] as const;

export const INDUSTRIES = [
  'Technology', 'Finance and Banking', 'Consulting', 'Healthcare', 'Education',
  'Retail and Consumer', 'Manufacturing', 'Energy and Utilities',
  'Government and Nonprofit', 'Media and Creative', 'Other',
] as const;

export const GOALS = [
  'Get promoted', 'Land a new job', 'Lead my team better', 'Perform better in my role',
  'Grow my business', 'Personal growth',
] as const;

export const DAILY_MINUTES = [5, 10, 15, 20] as const;

export const COACHES = [
  { value: 'maya', name: 'Maya', blurb: 'Warm, upbeat and practical.' },
  { value: 'alex', name: 'Alex', blurb: 'Calm, steady and direct.' },
] as const;

export type Persona = (typeof PERSONAS)[number]['value'];
export type Coach = (typeof COACHES)[number]['value'];

/** Real-life people the learner can add and practise conversations with. */
export const RELATIONSHIPS = [
  { value: 'boss', label: 'Boss' },
  { value: 'colleague', label: 'Colleague' },
  { value: 'direct_report', label: 'Team member' },
  { value: 'client', label: 'Client' },
  { value: 'professor', label: 'Professor' },
  { value: 'partner', label: 'Partner or spouse' },
  { value: 'family', label: 'Family' },
  { value: 'friend', label: 'Friend' },
  { value: 'other', label: 'Someone else' },
] as const;

export const TRAITS = [
  'Direct', 'Demanding', 'Impatient', 'Skeptical', 'Analytical', 'Detail-oriented',
  'Busy', 'Competitive', 'Emotional', 'Quiet', 'Supportive', 'Warm',
] as const;

export const MAX_PEOPLE = 20;
