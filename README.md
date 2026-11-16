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
3. **Real conversations** (`/api/roleplay`): a multi-turn role-play with a stock character (boss, difficult client, skeptical investor, team member who missed a deadline, interviewer, negotiation counterpart, colleague in conflict) or one of the learner's saved people, at Friendly, Realistic or Tough. A setup card gives the situation, the learner's goal and the tools to use. The character has a hidden objective that stays on the server. It speaks 1–2 sentences per turn and stays in character, up to 6 learner turns. **Hint** has the coach step out with one tip. The **debrief** gives a score, a rubric (clarity, empathy, structure, use of tools), what went well, one improvement, a better move for one of the learner's actual lines, and what the character wanted. **Replay** reuses the same setup. Unlocks after Foundations plus 3 reps, and requires Premium (open to everyone in the free beta). If the learner shows real distress, the character steps out with a caring note and the session pauses. Learner lines are wrapped in tags and treated as data, not instructions. Retries of a turn are idempotent.
4. **Mastery:** an advanced toolkit (edge cases, difficult people, combining tools, when tools fail), saved per profile like level 1. It unlocks after Foundations plus 5 reps.

Foundations count as complete only when every tool has been viewed **and** the 5-question quiz is finished (any score). Practice reps stay locked until then, enforced on the server (`requireFoundations`), so a direct link to practice is refused with a "Take the quiz" route back. The closing coached scenario stays optional.

**I have a situation** (`/api/situations`): the learner describes a real upcoming moment and gets a plan. The plan has a goal, an opening line, tool-based steps, phrases, likely pushback with replies, what to avoid, and links to the relevant topics. A coached rehearsal follows. The learner's text is treated as data, not instructions.

Slow AI work runs as background jobs (`server/src/lib/jobs.ts`): a request waits up to 8 seconds, then answers "generating", and the app polls through brief hosting errors. Daily limits: 20 toolkits, 15 rep batches, 10 situations, 40 gradings and 8 new role-plays per learner.

## Daily return: review, streaks and the week

- **Today's 5 minutes** (`/daily`, `GET /api/daily`): up to 4 spaced-review questions, then one practice rep on the learner's latest topic. Each toolkit quiz adds its 5 questions to review (once each), first due the next day. A right answer moves a question up the 1 → 3 → 7 → 21 day ladder; a wrong one resets it to 1 day.
- **Streaks** (`server/src/lib/activity.ts`): every learning action is logged with the learner's local date (their time zone). The first action of a day counts. Active yesterday → +1. One missed day with a freeze → the freeze is spent and the streak continues. Otherwise it restarts at 1. Learners start with 1 freeze and earn one at every 7-day milestone.
- **Your week** (`/week`, `GET /api/daily/week`): days active over the last 7 local days, counts by activity, average rep and role-play scores, review accuracy, topics worked on, and a rule-based focus for next week.

## Welcome page and coaching

- **Welcome page** (`/welcome`): what signed-out visitors see first. Big type telling the Insight story, and one button, "Log in or register", that leads to the login page (with a Log in | Register switch).
- **Coaching** (`/coach`, `/api/coaching`, a Coach tab in the bottom navigation): the coachee chooses up to 3 attributes to develop (from a list or their own words) and why each matters. In each session the coach (Maya or Alex) asks one open question at a time, reflects back the coachee's words, follows a light GROW flow (goal, reality, options, way forward) and **gives no advice unless asked**. If asked, it first asks what they think, then offers 2–3 options and hands the choice back. Closing a session writes notes in the coachee's words: what they explored, what they realised, the commitments they made, and a question for next time. The next session on that attribute opens by asking how the commitments went. Coachees mark commitments done or let them go. Sessions are private; coachee text is wrapped in tags and treated as data; signs of real distress pause the session with a caring note. Optional coach voice and spoken replies.

## CPD modules (one hour each)

Each Foundations toolkit (and each Mastery toolkit) is a **one-hour CPD module**, learned tool by tool:
- **Intro:** learning outcomes (3–4), "1 CPD hour · about 60 minutes", the tools in order, and progress so far.
- **Each tool (about 8 minutes):** deeper theory (what it is, why it works, when to use it and when not, common mistakes, steps, what to say, a case study, try this today), then **2 questions** (understanding, then "what would you do?"; the first answer counts), then a short **written practice** with quick coaching (score, feedback, a stronger version). The next tool opens only when this one is complete. Progress is saved on the server (`tool_progress`), so a module can be finished over several sittings.
- **Then:** 3 mixed questions, the coached scenario, and a **reflection** (what I learned and will do differently, plus where I'll use it first).
- **Evidence:** active learning time is recorded from a heartbeat while the page is visible and the learner is active (`lesson_time`, capped at real time). Completing a module creates a **CPD record** (`cpd_records`): name, topic, module, outcomes, tools, planned CPD hours (1.0), active minutes, questions correct, practice average, scenario score, reflection and a verification code.
- **Certificate** (`/certificate/:id`): printable or saved as PDF, with a public check at `/verify/CODE` (shows the certificate details, never answers or reflections). **CPD record** (`/cpd`): hours this year and in total, all certificates, CSV export. **Team owners** see CPD hours per member and can download a team CPD CSV for HR (no reflections or answers).
- Modules built in an older format are rebuilt once in the CPD format the first time they're opened.

## Progressive Foundations and "Find my skills"

- **A question after every tool.** Each tool in a toolkit ends with a "What would you do?" question applying that tool to a realistic moment from the learner's world, with instant feedback. **Next** stays locked until it's answered. After the last tool come **3 mixed questions** (which tool fits), then the **coached scenario**.
- **Each step unlocks the next, enforced on the server:** quiz after the tools (`tools_first`), scenario after the quiz (`quiz_first`), practice reps after the scenario (`foundations_first`). Learners who had already started reps before the scenario became required keep their access. All questions (per-tool and mixed) join spaced review.
- Toolkits saved in the older format (5-question quiz, no per-tool questions) are rebuilt once, the first time someone opens them; learners' progress is kept.
- **Find my skills** (`/finder`, `/api/finder`): the last step of onboarding (skippable) and a Home card. 7 indirect "How would you react?" questions, written per career stage, score the 10 skill areas; the learner's goals add weight. 3 follow-up questions on the 2 weakest areas pick topics. The result is 3 topics in order, each with a one-line reason from their own answers. It's rule-based and instant; an optional "Anything specific?" note lets the AI fine-tune the picks. Results are kept, so a retake shows the previous one, and Home's first suggestion uses them.
- The questions, answers, what each answer points to and the insight lines live in the **Skill Finder** sheet of the Excel file; `npm run db:seed` loads them and checks every heading and topic name.

## Growth features

- **Home** leads with one vivid card: the single best next step (`GET /api/home`), e.g. "Continue · Executive Presence · Practise rep 4 · 2 min". New learners get the flagship topic for their main goal. Below it: a due real-world check-in, the streak, "I have a situation", **Editor's picks** and **Lessons from fiction**, then the skill tiles.
- **Faster first toolkit:** after onboarding, the suggested topic's toolkit starts building in the background. Reading a topic for 5 seconds starts its toolkit too (`POST /api/bites/prewarm`). While a toolkit is written, the learner rates their confidence (1–10) and sees the books it draws on.
- **Content:** the Excel file has an **Editor's Pick** column (12 flagship topics marked Yes) and 18 novels (Book Type "fiction"). When a topic has a novel, its toolkit includes at least one tool drawn from it. Prompts carry a career-stage focus (early-stage, manager, senior executive). **Quick reference** (`/tools/:topicId`) lists every tool with its steps and what to say.
- **Voice:** a microphone button turns speech into text in role-play, reps, scenarios and situations (browser speech recognition; shown only where supported).
- **Did you use it?** (`/api/checkins`): 20 hours after a role-play, or 44 hours after a situation plan, Home asks how the real conversation went. "Went well" or "Mixed" logs a real-world win (+25 XP); "Not yet" asks once more two days later.
- **Progress** (`/progress`): XP levels (Explorer → Master), a skill chart of role-play clarity, empathy, structure and tools (your last 3 against your first 3), each topic's level (Started → Foundations → Practitioner → Advanced → Expert), confidence before and now, and 15 badges computed from real activity. **Share my week** makes a 1080×1350 image with totals only.
- **Reminders:** Insight is installable (manifest and service worker). Learners pick a time and allow notifications; a reminder is sent once a day only if they haven't learned yet. On iPhone this works after "Add to Home Screen". Keys are generated once and saved (or set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`). On Render's free plan the server sleeps when idle, so reminders can be late or missed; a paid instance keeps them on time.
- **Beta feedback:** three questions (what you used, what felt generic, would you pay and how much), from Profile or a Home prompt after 3 active days.
- **Beta metrics** (`/admin`, for emails in `ADMIN_EMAILS` or `npm run admin -w server -- you@example.com`): sign-ups, funnel, next-day and week-later retention, role-play score by week, feedback, least helpful tools and AI use.
- **Teams** (`/api/teams`): a manager creates a team and shares a 6-character invite code. The owner's dashboard shows totals per member (days active, reps, role-plays, average score, wins); members' answers, conversations, people and notes are never shown.
- **The character speaks:** in role-play, each character line is read aloud with the device's built-in voice (a consistent voice per character; mute in the header, replay any line with 🔈). Tapping the mic stops the character so it doesn't hear itself. Voice quality depends on the phone; a paid text-to-speech service would sound more natural.
- **Weekly league with friends** (`/api/friends`, `/friends`): each learner has a 6-character friend code and an invite link (`/friends?add=CODE`, which survives sign-up). Friends are ranked by XP earned Monday to Sunday; friends see only first name, weekly XP and streak. Home shows the top 3; a "Better together" badge rewards adding a friend.
- **Privacy notes** on People, and "practice coaching, not therapy" on role-play and Profile.

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
