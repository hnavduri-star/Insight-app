/**
 * Fixed option lists shared by client and server.
 * Industry and goal are fixed lists (not free text) because they form part of the
 * lesson cache key (section 7): free text would make every lesson a cache miss.
 */
/** Career level (mutually exclusive). Situations such as job hunting are goals, not personas. */
export const PERSONAS = [
  { value: 'early_career', label: 'Early-stage employee', hint: 'Individual contributor building core skills' },
  { value: 'manager', label: 'Manager', hint: 'Leading a team or managing managers' },
  { value: 'senior_executive', label: 'Senior executive', hint: 'Director, VP, C-suite or business owner' },
] as const;

export const INDUSTRIES = [
  'Technology', 'Finance and Banking', 'Consulting', 'Healthcare', 'Education',
  'Retail and Consumer', 'Manufacturing', 'Energy and Utilities',
  'Government and Nonprofit', 'Media and Creative', 'Other',
] as const;

/** Learners pick 1 to MAX_GOALS; the first one picked is their main goal. */
export const GOALS = [
  'Perform better in my role', 'Get promoted', 'Change jobs or careers', 'Lead and develop my team',
  'Communicate and influence with impact', 'Grow my business', 'Manage stress and balance', 'Grow personally',
] as const;
export const MAX_GOALS = 3;

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
  { value: 'senior_leader', label: 'Senior leader' },
  { value: 'colleague', label: 'Peer or colleague' },
  { value: 'direct_report', label: 'Team member' },
  { value: 'client', label: 'Client or customer' },
  { value: 'investor_board', label: 'Investor or board member' },
  { value: 'partner', label: 'Partner or spouse' },
  { value: 'family', label: 'Family member' },
  { value: 'friend', label: 'Friend' },
  { value: 'other', label: 'Someone else' },
] as const;

export const TRAITS = [
  'Direct', 'Demanding', 'Impatient', 'Skeptical', 'Analytical', 'Detail-oriented',
  'Busy', 'Competitive', 'Emotional', 'Quiet', 'Supportive', 'Warm',
] as const;

export const MAX_PEOPLE = 20;

/** Attributes a coachee can choose to develop with their coach (or write their own). */
export const COACHING_ATTRIBUTES = [
  'Confidence', 'Executive presence', 'Influence', 'Assertiveness', 'Clear communication', 'Listening',
  'Decision-making', 'Strategic thinking', 'Delegation', 'Accountability', 'Resilience', 'Emotional regulation',
  'Building relationships', 'Leading change', 'Work-life balance', 'Self-awareness',
] as const;
export const MAX_COACHING_ATTRIBUTES = 3;
