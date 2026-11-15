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

Production: `npm run build && NODE_ENV=production npm start`. Express serves the built client, so it deploys as one service on Render, Railway or Fly.io.

## Look and feel

Matte finish: a fine film grain over every screen, low-sheen card surfaces with a hairline top highlight, and soft ambient light. Headings use Fraunces (serif), body text uses Inter. Each heading has its own line icon and muted accent colour (`client/src/components/CategoryIcon.tsx`).

## What works in milestone 1

- Sign up (name, email, 6+ character password), log in, log out, forgot and reset password (resetting signs out other devices), email verification with resend.
- New users go to onboarding; returning users go straight to Home.
- Onboarding in 3 steps: persona and industry, goal and daily minutes, coach (Maya or Alex).
- Home: avatar and greeting (tap for Profile), verify-email banner, all 8 headings as collapsible lists, and a topic sheet that shows its 3 source books.
- Profile: details, Edit profile, switch coach, log out, delete account (asks for the password and removes all of the user's data), privacy notice.
- Access control: every user query is scoped to the session's user id (the brief's "equivalent check" to RLS). Auth endpoints are rate-limited, inputs are validated and size-limited, and writes must be JSON.
- 12 API tests, including the milestone 1 acceptance check.

## Decisions made inside the brief's options

- **Drizzle** rather than Prisma, and **cookie sessions (signed JWT)** rather than bearer tokens.
- **Industry and goal are fixed lists, not free text.** They are part of the lesson cache key (section 7), so free text would mean no two users ever share a lesson.
- **Schema conflicts between the duplicate sections 16 to 21:** used the later definitions. `playbook_entries` and `playbook_integrations` replace `toolkit_items` and `toolkit_playbook`. `reminder_settings` replaces `notification_prefs`. `roleplay_sessions` combines both versions.
- Unverified users can use the app, with a banner, rather than being locked out.
- Added the tables auth and cost controls need: `auth_tokens` (verification and reset) and `ai_calls` (model, tokens and latency per call).
