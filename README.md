# Insight

A mobile-first learning tool: bite-size learning built around each learner's goals, drawn from the best fiction and non-fiction. Not a book-summary app. Each bite blends ideas from several books into one practical framework for that learner.

**Status: Milestone 1 (Foundation) complete.** Auth, profile, onboarding with coach choice, topic seed data, and the full database schema (including the Playbook, plan and reminder tables, which stay empty for now).

## Stack (Option B from the brief)

| Layer | Choice |
|---|---|
| Front end | React 18 + Vite + Tailwind 3 + Framer Motion (`client/`) |
| API | Node.js + Express 5, TypeScript run with `tsx` (`server/`) |
| Database | PostgreSQL + Drizzle ORM, SQL migrations in `server/drizzle/` |
| Auth | bcrypt password hashes, signed session in an httpOnly cookie, revocable via `token_version` |
| Shared | `shared/options.ts` holds personas, industries, goals, minutes and coaches for client and server |

## Run locally

```bash
npm install
cp server/.env.example server/.env        # set DATABASE_URL and JWT_SECRET
npm run db:migrate && npm run db:seed     # seed is idempotent; re-run after editing taxonomy
npm run dev                               # API :4000, app :5173 (proxies /api)
npm test                                  # API tests against insight_test DB
```

Email verification and password-reset links are **printed to the server log** until an email provider is chosen.

Production: `npm run build && NODE_ENV=production npm start`. Express serves the built client, so it deploys as one service.

### Deploy to Render (test mode)

`render.yaml` is a Render Blueprint. It creates the web service and a free Postgres database, generates `JWT_SECRET`, and runs migrations and the topic seed on every start.

1. Render dashboard → **New → Blueprint** (not Static Site or Web Service).
2. Connect GitHub and pick the `Insight-app` repository and its branch.
3. Optionally fill in `TEST_PRICE_MONTHLY_USD` and `TEST_PRICE_ANNUAL_USD`, then **Deploy Blueprint**.
4. The app is at `https://insight-<something>.onrender.com`. Verification and reset emails appear in the service's **Logs** until an email provider is added.

Free-tier notes: the service sleeps when idle (about 30 seconds to wake), and the free database is time-limited. Upgrade both before real users arrive.

## Topic and book catalogue

The catalogue lives in **[`data/insight-topics-and-books.xlsx`](data/insight-topics-and-books.xlsx)**. Edit it in Excel. It has 10 headings grouped by who the skill is about (you, you and others, work, money, your future) and 97 topics, each with a one-line *Scope* shown in the app and a *Suggested For* career stage (for planning; nothing is locked by it). Its sheets are *How to use*, *Topics and Books* (one row per book), *Summary* (counts per heading, calculated automatically) and *Changes* (old heading to new heading for every topic).

| Heading | Heading Icon | Topic | Scope | Book Title | Author | Book Type | Buy URL |
|---|---|---|---|---|---|---|---|
| Leading People and Teams | 🧭 | Building Trust | Earning and extending trust as a leader. | The Speed of Trust | Stephen M.R. Covey | non-fiction | |
| Leading People and Teams | | Building Trust | | The Lord of the Rings | J.R.R. Tolkien | fiction | |

- Row order sets display order. A topic can have any number of books. Book Type is a dropdown (`non-fiction` or `fiction`).
- Load it with `npm run db:seed` (the app also reloads it on every deploy). Another file: `npm run db:seed -- path/to/file.xlsx` (CSV also works).
- Problems are reported with line numbers, such as a missing column, a topic under two headings, or a bad book type.
- Topics removed from the file are deleted on the next load, unless a learner has history on them (those are kept and listed). `-- --prune` deletes them anyway.

## Free beta

`OPEN_ACCESS=true` (set in `render.yaml` and the local `.env`) unlocks every topic and practice for everyone, and hides the paywall. Set it to `false` to restore the free-topic-then-pay model below.

## Free taste, then pay

| | Free | Premium (monthly or annual) |
|---|---|---|
| Learn | One topic of their choice (changeable until started) | Every topic |
| Your people | Can add them | Can add them **and practise conversations** |

- Access is stored as entitlements: `all_access` (premium) or `topic` (free trial), with an optional expiry. The server enforces it: `requireTopicAccess()` and `requirePremium()` in `server/src/lib/access.ts` return 402.
- **Stripe** (`server/src/lib/billing.ts`): Stripe-hosted Checkout in subscription mode, the Customer Portal for managing or cancelling, and a signed webhook at `/api/billing/webhook` that keeps Premium in step (subscription created, updated, deleted, paused or resumed). Events are applied once. Premium lasts until the paid period ends, plus 2 days' grace. Deleting an account cancels its subscription.
- **Apple Pay and Google Pay** come with Stripe Checkout. Turn them on under Stripe Dashboard → Settings → Payment methods; there's no code to change.
- To switch checkout on, set in `server/.env`: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL` (Price ids from a Product with a monthly and an annual recurring price), and `STRIPE_WEBHOOK_SECRET`. The webhook should send `checkout.session.completed` and `customer.subscription.*` to `https://<your-domain>/api/billing/webhook`. Until then the paywall shows "Subscriptions open soon".
- **Test mode** (`BILLING_TEST_MODE=true`, on in development): while Stripe isn't configured, the paywall's button upgrades instantly with no payment, and Profile has **End test**. Display prices in USD come from `TEST_PRICE_MONTHLY_USD` and `TEST_PRICE_ANNUAL_USD`. Test mode switches itself off as soon as Stripe keys are set.
- Prices are in **USD**. Create the Stripe prices in USD.
- Testing without Stripe from the command line: `npm run grant -w server -- user@example.com` (add `--revoke` to undo).

## Your people

A **People** tab where learners add the real people in their life (boss, colleague, team member, client, professor, partner, family, friend) with a nickname, up to 5 traits, how that person tends to react, and what the learner wants to practise with them. Up to 20 people per learner, visible only to that learner. The role-play milestone uses these profiles so the AI plays that person (`roleplay_sessions.person_id`).

## Bites (milestone 2)

A bite is a practical toolkit in three steps:
1. **Learn:** 5–8 tools drawn from the topic's books. Each has the theory (what it is and why it works), 2–4 steps for using it, 1–3 example phrases of **what to say**, a **case study** (situation, what they did, result) and a try-this-today action.
2. **Check:** 5 scenario-based quiz questions where you pick the right tool or the right words.
3. **Practise with your coach:** a realistic scenario that needs several tools. The coach scores the written answer, shows **which tools were used**, gives one strength and one next step, and writes **a stronger way to say it**.

Bites saved in an older format are rebuilt automatically the next time someone opens them. `data/sample-bites.json` holds reference toolkits as a quality benchmark.

- **Model:** Claude Sonnet 5.5 (`claude-sonnet-5-5`), called only from the server (`server/src/lib/ai.ts`). Output is schema-validated JSON, with a retry if the shape is wrong. Refusals fall back automatically to another model (server-side `fallbacks: "default"`).
- **Cache:** one bite per topic, career stage, industry, main goal and rating band (`cached_lessons`), shared by every learner with the same key. Concurrent first requests share one AI call.
- **Originality guardrails in the prompt:** ideas in our own words; no passages, chapter structures or long lists; at most one short quote; our own framework name; sources named per card.
- **Safety:** learner text is wrapped and treated as data, never as instructions (prompt-injection guard). Answers are limited to 1,500 characters.
- **Cost controls:** 20 bite generations and 30 gradings per learner per day. Every call is logged to `ai_calls` (model, tokens, latency).
- **Quality signals:** a helpful / not helpful tap on every card (`feedback` table), plus quiz scores and scenario scores in `topic_progress`.
- **Switch it on:** set `ANTHROPIC_API_KEY` on the server (Render → insight → Environment). Without it, bites show "not switched on yet".

## Depth: the 4-level track, practice reps and situations

Each topic is a track with 4 levels (`GET /api/bites/track/:topicId`):
1. **Foundations:** the toolkit described above.
2. **Practice reps** (`/api/practice`): 2-minute coached drills that use the toolkit's tools. They're generated 5 at a time in one low-effort AI call, set in the learner's world, and some feature their saved people. A new batch avoids earlier situations. The goal is 10 reps per topic.
3. **Real conversations:** role-play (coming next).
4. **Mastery:** an advanced toolkit (edge cases, difficult people, combining tools, when tools fail), saved per profile like level 1. It unlocks after Foundations plus 5 reps.

Foundations count as complete only when every tool has been viewed **and** the 5-question quiz is finished (any score). Practice reps stay locked until then, enforced on the server (`requireFoundations`), so a direct link to practice is refused with a "Take the quiz" route back. The closing coached scenario stays optional.

**I have a situation** (`/api/situations`): the learner describes a real upcoming moment and gets a plan. The plan has a goal, an opening line, tool-based steps, phrases, likely pushback with replies, what to avoid, and links to the relevant topics. A coached rehearsal follows. The learner's text is treated as data, not instructions.

Slow AI work runs as background jobs (`server/src/lib/jobs.ts`): a request waits up to 8 seconds, then answers "generating", and the app polls through brief hosting errors. Daily limits: 20 toolkits, 15 rep batches, 10 situations and 40 gradings per learner.

## Look and feel

Wio-style vivid design: each heading has its own bright two-colour fill (`client/src/components/CategoryIcon.tsx`), shown as colour tiles on Home, a colour header on each heading page, and full-colour bite cards. There's a vivid gradient hero card for the learner's journey, a floating pill navigation, bold Plus Jakarta Sans type and a fine film grain over everything.

## What works in milestone 1

- Sign up (name, email, 6+ character password), log in, log out, forgot and reset password (resetting signs out other devices), email verification with resend.
- New users go to onboarding; returning users go straight to Home.
- Onboarding in 3 steps: career stage (Early-stage employee, Manager, Senior executive) and industry; up to 3 goals (the first is the main goal) and daily minutes; coach (Maya or Alex).
- Home: avatar and greeting (tap for Profile), verify-email banner, all 8 headings as collapsible lists, and a topic sheet that shows its 3 source books.
- Profile: details, Edit profile, switch coach, log out, delete account (asks for the password and removes all of the user's data), privacy notice.
- Access control: every user query is scoped to the session's user id (the brief's "equivalent check" to RLS). Auth endpoints are rate-limited, inputs are validated and size-limited, and writes must be JSON.
- 40 API tests, including the milestone 1 acceptance check, paid access, Stripe webhooks, people and catalogue import.

## Decisions made inside the brief's options

- **Drizzle** rather than Prisma, and **cookie sessions (signed JWT)** rather than bearer tokens.
- **Industry and goal are fixed lists, not free text.** They are part of the lesson cache key (section 7), so free text would mean no two users ever share a lesson.
- **Schema conflicts between the duplicate sections 16 to 21:** used the later definitions. `playbook_entries` and `playbook_integrations` replace `toolkit_items` and `toolkit_playbook`. `reminder_settings` replaces `notification_prefs`. `roleplay_sessions` combines both versions.
- Unverified users can use the app, with a banner, rather than being locked out.
- Added the tables auth and cost controls need: `auth_tokens` (verification and reset) and `ai_calls` (model, tokens and latency per call).
