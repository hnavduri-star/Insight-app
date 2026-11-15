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
import {
  pgTable, uuid, text, integer, boolean, timestamp, date, jsonb, real,
  primaryKey, uniqueIndex, index, pgEnum, time,
} from 'drizzle-orm/pg-core';

// ---------- Enums ----------
export const personaEnum = pgEnum('persona', ['student', 'job_seeker', 'professional', 'manager', 'leader']);
export const coachEnum = pgEnum('coach', ['maya', 'alex']);
export const ratingBandEnum = pgEnum('rating_band', ['foundation', 'core', 'advanced']);
export const difficultyEnum = pgEnum('difficulty', ['friendly', 'realistic', 'tough']);
export const tokenPurposeEnum = pgEnum('token_purpose', ['verify_email', 'reset_password']);

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
  createdAt: createdAt(),
}, (t) => [uniqueIndex('users_email_unique').on(t.email)]);

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
  goal: text('goal'),
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
  sortOrder: integer('sort_order').notNull(),
}, (t) => [uniqueIndex('topics_name_unique').on(t.name), index('topics_category_idx').on(t.categoryId)]);

export const books = pgTable('books', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  author: text('author'),
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
  bestScenarioScore: integer('best_scenario_score'),
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
}, (t) => [index('review_items_user_due_idx').on(t.userId, t.dueAt)]);

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
  difficulty: difficultyEnum('difficulty').notNull(),
  transcriptJson: jsonb('transcript_json').notNull().default([]),
  score: integer('score'),
  rubricScoresJson: jsonb('rubric_scores_json'),
  createdAt: createdAt(),
}, (t) => [index('roleplay_sessions_user_idx').on(t.userId)]);

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
