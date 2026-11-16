/**
 * Insight database schema (PostgreSQL, Drizzle ORM).
 *
 * The full schema is created in milestone 1 so later milestones only add
 * behaviour, not tables. Tables used from milestone 2 onwards stay empty for now.
 *
 * Access control: the API scopes every query on a user table by the
 * authenticated user's id (req.userId, set by requireAuth in src/lib/auth.ts). That is the "equivalent
 * check" to Row Level Security that the brief allows for a non-Supabase build.
 */
import { sql } from 'drizzle-orm';
import {
  pgTable, uuid, text, integer, boolean, timestamp, date, jsonb, real,
  primaryKey, uniqueIndex, index, pgEnum, time,
} from 'drizzle-orm/pg-core';

// ---------- Enums ----------
export const personaEnum = pgEnum('persona', ['early_career', 'manager', 'senior_executive']);
export const coachEnum = pgEnum('coach', ['maya', 'alex']);
export const ratingBandEnum = pgEnum('rating_band', ['foundation', 'core', 'advanced', 'mastery']); // mastery = level 4 toolkit
export const difficultyEnum = pgEnum('difficulty', ['friendly', 'realistic', 'tough']);
export const tokenPurposeEnum = pgEnum('token_purpose', ['verify_email', 'reset_password']);
export const bookKindEnum = pgEnum('book_kind', ['nonfiction', 'fiction']);
export const relationshipEnum = pgEnum('relationship', [
  'boss', 'senior_leader', 'colleague', 'direct_report', 'client', 'investor_board', 'partner', 'family', 'friend', 'other',
]);
export const entitlementKindEnum = pgEnum('entitlement_kind', ['all_access', 'topic']);
export const entitlementSourceEnum = pgEnum('entitlement_source', ['free_trial', 'subscription', 'purchase', 'grant']);

const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts('created_at').notNull().defaultNow();
const userRef = () =>
  uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' });

// ---------- Accounts ----------
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  emailVerifiedAt: ts('email_verified_at'),
  isAdmin: boolean('is_admin').notNull().default(false),
  // Bumped on password reset / logout-everywhere to invalidate issued tokens.
  tokenVersion: integer('token_version').notNull().default(0),
  friendCode: text('friend_code'), // shared to add friends; generated on first use
  createdAt: createdAt(),
}, (t) => [uniqueIndex('users_email_unique').on(t.email), uniqueIndex('users_friend_code_unique').on(t.friendCode)]);

export const authTokens = pgTable('auth_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userRef(),
  purpose: tokenPurposeEnum('purpose').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('auth_tokens_hash_unique').on(t.tokenHash)]);

export const profiles = pgTable('profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  persona: personaEnum('persona'),
  industry: text('industry'),
  goals: jsonb('goals').notNull().default([]), // 1-3 objectives, first = main goal
  dailyMinutes: integer('daily_minutes'),
  coach: coachEnum('coach'),
  timezone: text('timezone').notNull().default('UTC'),
  onboardedAt: ts('onboarded_at'),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

// ---------- Content (admin-managed, readable by everyone signed in) ----------
export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  icon: text('icon').notNull(),
  sortOrder: integer('sort_order').notNull(),
}, (t) => [uniqueIndex('categories_name_unique').on(t.name)]);

export const topics = pgTable('topics', {
  id: uuid('id').primaryKey().defaultRandom(),
  categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  description: text('description'), // one-line scope, keeps topics mutually exclusive
  sortOrder: integer('sort_order').notNull(),
  featured: boolean('featured').notNull().default(false), // Editor's pick: hand-checked flagship topic
}, (t) => [uniqueIndex('topics_name_unique').on(t.name), index('topics_category_idx').on(t.categoryId)]);

export const books = pgTable('books', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  author: text('author'),
  kind: bookKindEnum('kind').notNull().default('nonfiction'),
  buyUrl: text('buy_url'),
}, (t) => [uniqueIndex('books_title_unique').on(t.title)]);

export const topicBooks = pgTable('topic_books', {
  topicId: uuid('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
  bookId: uuid('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.topicId, t.bookId] })]);

export const badges = pgTable('badges', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull(),
  name: text('name').notNull(),
  description: text('description'),
}, (t) => [uniqueIndex('badges_key_unique').on(t.key)]);

// ---------- Lessons (shared cache across users) ----------
export const cachedLessons = pgTable('cached_lessons', {
  id: uuid('id').primaryKey().defaultRandom(),
  topicId: uuid('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
  persona: personaEnum('persona').notNull(),
  industry: text('industry').notNull(),
  goal: text('goal').notNull(),
  ratingBand: ratingBandEnum('rating_band').notNull(),
  contentJson: jsonb('content_json').notNull(),
  model: text('model').notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('cached_lessons_key_unique').on(t.topicId, t.persona, t.industry, t.goal, t.ratingBand)]);

// ---------- Per-user learning state ----------
export const assessments = pgTable('assessments', {
  userId: userRef(),
  topicId: uuid('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
  score: integer('score').notNull(), // 1..10; a missing row means skipped
  phase: text('phase').notNull().default('baseline'), // baseline | after_plan (before/after comparison)
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.topicId, t.phase] })]);

export const userProgress = pgTable('user_progress', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  xp: integer('xp').notNull().default(0),
  streak: integer('streak').notNull().default(0),
  lastActiveDate: date('last_active_date'), // learner's local date
  freezes: integer('freezes').notNull().default(1),
  level: integer('level').notNull().default(1),
});

export const topicProgress = pgTable('topic_progress', {
  userId: userRef(),
  topicId: uuid('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
  xp: integer('xp').notNull().default(0),
  cardsCompletedAt: ts('cards_completed_at'),
  quizCorrect: integer('quiz_correct').notNull().default(0),
  quizTotal: integer('quiz_total').notNull().default(5), // per-tool checks + mixed quiz (older toolkits: 5)
  bestScenarioScore: integer('best_scenario_score'),
  quizCompletedAt: ts('quiz_completed_at'), // set when the 5-question quiz is finished (any score)
  masteryCompletedAt: ts('mastery_completed_at'),
}, (t) => [primaryKey({ columns: [t.userId, t.topicId] })]);

export const scenarios = pgTable('scenarios', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userRef(),
  topicId: uuid('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
  lessonId: uuid('lesson_id').notNull().references(() => cachedLessons.id, { onDelete: 'cascade' }),
  responseText: text('response_text').notNull(),
  inputMode: text('input_mode').notNull().default('text'), // text | voice (transcript only)
  score: integer('score'),
  feedbackJson: jsonb('feedback_json'),
  createdAt: createdAt(),
}, (t) => [index('scenarios_user_idx').on(t.userId)]);

export const userBadges = pgTable('user_badges', {
  userId: userRef(),
  badgeId: uuid('badge_id').notNull().references(() => badges.id, { onDelete: 'cascade' }),
  earnedAt: ts('earned_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.badgeId] })]);

// ---------- Cumulative Playbook (sections 16 / 22) ----------
export const playbookEntries = pgTable('playbook_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userRef(),
  topicId: uuid('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
  lessonId: uuid('lesson_id').references(() => cachedLessons.id, { onDelete: 'set null' }),
  framework: text('framework').notNull(),
  keyActionsJson: jsonb('key_actions_json').notNull(),
  actionPlan: text('action_plan'),
  bestScenarioId: uuid('best_scenario_id').references(() => scenarios.id, { onDelete: 'set null' }),
  completedAt: ts('completed_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('playbook_entries_user_topic_unique').on(t.userId, t.topicId)]);

export const playbookIntegrations = pgTable('playbook_integrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userRef(),
  version: integer('version').notNull(),
  integratedJson: jsonb('integrated_json').notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('playbook_integrations_user_version_unique').on(t.userId, t.version)]);

// ---------- Spaced review, commitments, feedback ----------
export const reviewItems = pgTable('review_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userRef(),
  topicId: uuid('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
  questionJson: jsonb('question_json').notNull(),
  dueAt: ts('due_at').notNull(),
  intervalDays: integer('interval_days').notNull().default(1), // 1 → 3 → 7 → 21
  ease: real('ease').notNull().default(2.5),
  lastResult: boolean('last_result'),
  sourceKey: text('source_key'), // `${lessonId}:${questionIndex}`, so a quiz question is only added once
  lastReviewedAt: ts('last_reviewed_at'),
}, (t) => [index('review_items_user_due_idx').on(t.userId, t.dueAt), uniqueIndex('review_items_user_source_unique').on(t.userId, t.sourceKey)]);

export const commitments = pgTable('commitments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userRef(),
  topicId: uuid('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
  actionText: text('action_text').notNull(),
  dueAt: ts('due_at').notNull(),
  checkedInAt: ts('checked_in_at'),
  outcome: text('outcome'),
});

export const cardFeedback = pgTable('feedback', {
  userId: userRef(),
  lessonId: uuid('lesson_id').notNull().references(() => cachedLessons.id, { onDelete: 'cascade' }),
  cardIndex: integer('card_index').notNull(),
  helpful: boolean('helpful').notNull(),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.userId, t.lessonId, t.cardIndex] })]);

// ---------- Learning paths (templates) ----------
export const paths = pgTable('paths', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  weeks: integer('weeks').notNull(),
}, (t) => [uniqueIndex('paths_key_unique').on(t.key)]);

export const pathTopics = pgTable('path_topics', {
  pathId: uuid('path_id').notNull().references(() => paths.id, { onDelete: 'cascade' }),
  topicId: uuid('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull(),
}, (t) => [primaryKey({ columns: [t.pathId, t.topicId] })]);

export const userPaths = pgTable('user_paths', {
  userId: userRef(),
  pathId: uuid('path_id').notNull().references(() => paths.id, { onDelete: 'cascade' }),
  startedAt: ts('started_at').notNull().defaultNow(),
  completedAt: ts('completed_at'),
}, (t) => [primaryKey({ columns: [t.userId, t.pathId] })]);

// ---------- Career / improvement plan (section 17) ----------
export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userRef(),
  pathId: uuid('path_id').references(() => paths.id, { onDelete: 'set null' }), // template used, if any
  goal: text('goal').notNull(),
  targetDate: date('target_date'),
  status: text('status').notNull().default('active'), // active | completed | archived
  daysJson: jsonb('days_json'), // e.g. ["mon","wed","fri"]
  minutesPerSession: integer('minutes_per_session'),
  createdAt: createdAt(),
});

export const planTopics = pgTable('plan_topics', {
  planId: uuid('plan_id').notNull().references(() => plans.id, { onDelete: 'cascade' }),
  topicId: uuid('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull(),
}, (t) => [primaryKey({ columns: [t.planId, t.topicId] })]);

export const planSchedule = pgTable('plan_schedule', {
  id: uuid('id').primaryKey().defaultRandom(),
  planId: uuid('plan_id').notNull().references(() => plans.id, { onDelete: 'cascade' }),
  topicId: uuid('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
  activityType: text('activity_type').notNull(), // lesson | review | roleplay | scenario
  dueDate: date('due_date').notNull(),
  completedAt: ts('completed_at'),
}, (t) => [index('plan_schedule_plan_due_idx').on(t.planId, t.dueDate)]);

export const planCheckins = pgTable('plan_checkins', {
  planId: uuid('plan_id').notNull().references(() => plans.id, { onDelete: 'cascade' }),
  weekStart: date('week_start').notNull(),
  plannedCount: integer('planned_count').notNull(),
  doneCount: integer('done_count').notNull(),
  note: text('note'),
}, (t) => [primaryKey({ columns: [t.planId, t.weekStart] })]);

// ---------- Role-play (sections 18 / 20) ----------
export const roleplaySessions = pgTable('roleplay_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userRef(),
  topicId: uuid('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
  character: text('character').notNull(),
  // Set when the learner practises with one of their own people rather than a stock character.
  personId: uuid('person_id').references(() => people.id, { onDelete: 'set null' }),
  difficulty: difficultyEnum('difficulty').notNull(),
  transcriptJson: jsonb('transcript_json').notNull().default([]),
  score: integer('score'),
  rubricScoresJson: jsonb('rubric_scores_json'),
  // Level 3: setup (incl. the character's hidden objective, never sent to the client), turn cap, status, debrief.
  setupJson: jsonb('setup_json'),
  maxTurns: integer('max_turns').notNull().default(6),
  status: text('status').notNull().default('active'), // active | finished | debriefed
  debriefJson: jsonb('debrief_json'),
  createdAt: createdAt(),
  endedAt: ts('ended_at'),
}, (t) => [index('roleplay_sessions_user_idx').on(t.userId), index('roleplay_sessions_user_topic_idx').on(t.userId, t.topicId)]);

// ---------- Reminders (section 18) ----------
export const reminderSettings = pgTable('reminder_settings', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  reminderTime: time('reminder_time'),
  timezone: text('timezone').notNull().default('UTC'),
  channelsJson: jsonb('channels_json').notNull().default([]), // ["push","email"]
  quietStart: time('quiet_start'),
  quietEnd: time('quiet_end'),
  frequency: text('frequency').notNull().default('normal'), // light | normal | intense
  maxPerDay: integer('max_per_day').notNull().default(2),
  paused: boolean('paused').notNull().default(false),
  consentAt: ts('consent_at'), // opt-in required before any reminder is sent
  pushSubscriptionJson: jsonb('push_subscription_json'),
});

export const reminderLog = pgTable('reminder_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userRef(),
  type: text('type').notNull(),
  channel: text('channel').notNull(),
  sentAt: ts('sent_at').notNull().defaultNow(),
  openedAt: ts('opened_at'),
  actedAt: ts('acted_at'),
}, (t) => [index('reminder_log_user_sent_idx').on(t.userId, t.sentAt)]);

// ---------- AI call log (cost and safety controls) ----------
export const aiCalls = pgTable('ai_calls', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  endpoint: text('endpoint').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  latencyMs: integer('latency_ms'),
  ok: boolean('ok').notNull(),
  createdAt: createdAt(),
}, (t) => [index('ai_calls_user_created_idx').on(t.userId, t.createdAt)]);

// ---------- The learner's real-life people (role-play partners) ----------
// Details are written by the learner about someone else, so we keep them minimal:
// a first name or nickname, the relationship, a few traits and free-text notes.
export const people = pgTable('people', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userRef(),
  name: text('name').notNull(),
  relationship: relationshipEnum('relationship').notNull(),
  traitsJson: jsonb('traits_json').notNull().default([]),
  notes: text('notes'),            // how they tend to react, what they care about
  practiceGoal: text('practice_goal'), // what the learner wants to practise with them
  createdAt: createdAt(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [index('people_user_idx').on(t.userId)]);

// ---------- Paid access ----------
// Access to a topic = an active all_access entitlement, or a topic entitlement for it.
// The free taste is a topic entitlement with source free_trial (one per user).
// Works for subscriptions and per-topic purchases alike, whichever pricing is chosen.
export const entitlements = pgTable('entitlements', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userRef(),
  kind: entitlementKindEnum('kind').notNull(),
  topicId: uuid('topic_id').references(() => topics.id, { onDelete: 'cascade' }),
  source: entitlementSourceEnum('source').notNull(),
  providerRef: text('provider_ref'), // payment provider's subscription / order id
  startsAt: ts('starts_at').notNull().defaultNow(),
  expiresAt: ts('expires_at'),       // null = no expiry
  createdAt: createdAt(),
}, (t) => [
  index('entitlements_user_idx').on(t.userId),
  uniqueIndex('entitlements_provider_ref_unique').on(t.providerRef),
  uniqueIndex('entitlements_one_free_trial').on(t.userId).where(sql`${t.source} = 'free_trial'`),
]);

// ---------- Stripe billing ----------
export const billingCustomers = pgTable('billing_customers', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  stripeCustomerId: text('stripe_customer_id').notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('billing_customers_stripe_unique').on(t.stripeCustomerId)]);

/** Processed webhook event ids, so a retried delivery is applied once. */
export const stripeEvents = pgTable('stripe_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  receivedAt: ts('received_at').notNull().defaultNow(),
});

// ---------- Practice reps (level 2) ----------
// Short coached drills, generated in batches of 5 per learner and topic, answered one at a time.
export const practiceReps = pgTable('practice_reps', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userRef(),
  topicId: uuid('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
  lessonId: uuid('lesson_id').references(() => cachedLessons.id, { onDelete: 'set null' }),
  personId: uuid('person_id').references(() => people.id, { onDelete: 'set null' }),
  repJson: jsonb('rep_json').notNull(), // { situation, ask, tools[], with }
  responseText: text('response_text'),
  gradeJson: jsonb('grade_json'),
  score: integer('score'),
  createdAt: createdAt(),
  answeredAt: ts('answered_at'),
}, (t) => [index('practice_reps_user_topic_idx').on(t.userId, t.topicId)]);

// ---------- "I have a situation" ----------
export const situations = pgTable('situations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userRef(),
  inputText: text('input_text').notNull(),
  planJson: jsonb('plan_json').notNull(),
  bestScore: integer('best_score'),
  createdAt: createdAt(),
}, (t) => [index('situations_user_idx').on(t.userId)]);

// ---------- Activity (streaks and weekly summary) ----------
// One row per learning action, stamped with the learner's local day (their time zone), not UTC.
export const activityEvents = pgTable('activity_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userRef(),
  kind: text('kind').notNull(), // tools | quiz | scenario | rep | roleplay | review | situation | daily
  topicId: uuid('topic_id').references(() => topics.id, { onDelete: 'set null' }),
  score: integer('score'),
  xp: integer('xp').notNull().default(0), // XP earned by this action (weekly league)
  localDay: date('local_day').notNull(),
  createdAt: createdAt(),
}, (t) => [index('activity_events_user_day_idx').on(t.userId, t.localDay)]);

// ---------- Real-world check-ins ("did you use it?") ----------
// Created after a role-play debrief or a situation plan; asked a day or two later.
export const checkins = pgTable('checkins', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userRef(),
  kind: text('kind').notNull(), // roleplay | situation
  sourceId: uuid('source_id').notNull(),
  topicId: uuid('topic_id').references(() => topics.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  withName: text('with_name'),
  dueAt: ts('due_at').notNull(),
  outcome: text('outcome'), // well | mixed | not_yet
  note: text('note'),
  answeredAt: ts('answered_at'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('checkins_user_source_unique').on(t.userId, t.kind, t.sourceId), index('checkins_user_due_idx').on(t.userId, t.dueAt)]);

// ---------- Beta feedback ----------
export const betaFeedback = pgTable('beta_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userRef(),
  usedAtWork: text('used_at_work'),
  feltGeneric: text('felt_generic'),
  wouldPay: text('would_pay'), // yes | maybe | no
  priceUsd: integer('price_usd'),
  createdAt: createdAt(),
}, (t) => [index('beta_feedback_user_idx').on(t.userId)]);

// ---------- Teams (companies) ----------
// A team owner sees aggregate practice per member, never transcripts or notes.
export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  inviteCode: text('invite_code').notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('teams_invite_code_unique').on(t.inviteCode)]);

export const teamMembers = pgTable('team_members', {
  teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  userId: userRef(),
  role: text('role').notNull().default('member'), // owner | member
  joinedAt: ts('joined_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.teamId, t.userId] }), uniqueIndex('team_members_user_unique').on(t.userId)]);

// ---------- App settings (e.g. generated web-push keys) ----------
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
});

// ---------- CPD module: tool-by-tool progress, time and records ----------
// One row per tool the learner has worked on in a module (answers to its 2 questions, written practice, feedback).
export const toolProgress = pgTable('tool_progress', {
  userId: userRef(),
  lessonId: uuid('lesson_id').notNull().references(() => cachedLessons.id, { onDelete: 'cascade' }),
  toolIndex: integer('tool_index').notNull(),
  checksJson: jsonb('checks_json').notNull().default({}), // { "0": picked, "1": picked }
  response: text('response'),
  feedbackJson: jsonb('feedback_json'),
  score: integer('score'),
  completedAt: ts('completed_at'),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.lessonId, t.toolIndex] })]);

// Active learning time per module (seconds), from the app's heartbeat while the learner is on the page.
export const lessonTime = pgTable('lesson_time', {
  userId: userRef(),
  lessonId: uuid('lesson_id').notNull().references(() => cachedLessons.id, { onDelete: 'cascade' }),
  seconds: integer('seconds').notNull().default(0),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.lessonId] })]);

// A completed CPD module: the evidence behind a certificate. Kept even if the cached module is later rebuilt.
export const cpdRecords = pgTable('cpd_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userRef(),
  topicId: uuid('topic_id').references(() => topics.id, { onDelete: 'set null' }),
  lessonId: uuid('lesson_id').references(() => cachedLessons.id, { onDelete: 'set null' }),
  code: text('code').notNull(),                // public verification code
  learnerName: text('learner_name').notNull(),
  topicName: text('topic_name').notNull(),
  level: text('level').notNull(),              // foundations | mastery
  title: text('title').notNull(),
  outcomesJson: jsonb('outcomes_json').notNull(),
  toolsJson: jsonb('tools_json').notNull(),    // tool names covered
  plannedMinutes: integer('planned_minutes').notNull().default(60),
  activeMinutes: integer('active_minutes').notNull(),
  questionsCorrect: integer('questions_correct').notNull(),
  questionsTotal: integer('questions_total').notNull(),
  practiceAvg: integer('practice_avg'),
  scenarioScore: integer('scenario_score'),
  reflection: text('reflection').notNull(),
  applyPlan: text('apply_plan'),
  completedAt: createdAt(),
}, (t) => [uniqueIndex('cpd_records_code_unique').on(t.code), uniqueIndex('cpd_records_user_lesson_unique').on(t.userId, t.lessonId), index('cpd_records_user_idx').on(t.userId)]);

// ---------- Find my skills (diagnostic) ----------
export const finderResults = pgTable('finder_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userRef(),
  answersJson: jsonb('answers_json').notNull(),   // { questionId: answerKey }
  headingScoresJson: jsonb('heading_scores_json').notNull(), // { heading: gap score }
  topicsJson: jsonb('topics_json').notNull(),     // [{ name, reason }] in order
  note: text('note'),                             // optional "anything specific?" text
  createdAt: createdAt(),
}, (t) => [index('finder_results_user_idx').on(t.userId, t.createdAt)]);

// ---------- Friends (weekly league) ----------
// Stored both ways (a→b and b→a) when two people connect with a friend code.
export const friendships = pgTable('friendships', {
  userId: userRef(),
  friendId: uuid('friend_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.userId, t.friendId] })]);
