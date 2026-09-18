# Securo

A calm, paycheck-aware budgeting app built on the 50/30/20 rule.

Securo takes the parts of budgeting that work for beginners and leaves out the rest: every dollar of take-home pay is planned into **Needs**, **Wants**, and **Savings & Debt**, transactions arrive from your bank or a CSV, and you sort them with a quick swipe-style review instead of maintaining a spreadsheet. The dashboard answers one question first: *how much is safe to spend before my next paycheck?*

## Features

- **50/30/20 plan** with adjustable percentages, computed from your paycheck and pay frequency.
- **Bank sync through [SimpleFIN](https://www.simplefin.org/)**, a read-only open protocol. Paste a setup token from the SimpleFIN Bridge and Securo pulls accounts and transactions. No API keys, no screen scraping, credentials encrypted at rest.
- **Manual accounts and CSV import** for anything a bank connection does not cover, with duplicate detection.
- **Review queue**: sort each transaction into a bucket and category with a swipe, tap, or keyboard shortcut. Suggestions learn from what you pick.
- **Budget month view**: targets versus spending per bucket and category, pace hints, and "safe to spend until payday".
- **Goals** for savings and debt payoff with contribution history and a suggested monthly amount.
- **Dashboard and insights**: over/under status, cash flow, top categories, recurring charges, and plain-language nudges. Rule-based, no AI.
- Works on a phone (bottom tab bar) and a desktop (sidebar). Light and dark mode.

## Stack

Next.js 15 (App Router, server actions), React 19, TypeScript, Tailwind CSS v4, Prisma 6, Auth.js v5 (email + password), Vitest. SQLite for development; switch the Prisma datasource to PostgreSQL for production.

## Getting started

```bash
cp .env.example .env          # set AUTH_SECRET (openssl rand -base64 32)
npm install                   # also runs prisma generate
npm run db:migrate            # creates prisma/dev.db
npm run db:seed               # optional demo data: demo@securo.app / password123
npm run dev                   # http://localhost:3000
```

### Connecting a bank

1. Create an account at [bridge.simplefin.org](https://bridge.simplefin.org/) and link your bank there.
2. In Securo, open **Accounts → Connect a bank**, paste a setup token, and connect. Each token works once.
3. Use **Sync now** to pull new transactions. New ones land in **Review**.

To try the sync without a real bank, grab a demo token from the [SimpleFIN developer page](https://beta-bridge.simplefin.org/info/developers) and run:

```bash
SIMPLEFIN_TOKEN=<token> npm run simplefin:demo -- demo@securo.app
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests (pure budget, date, CSV, SimpleFIN, and insight logic) |
| `npm run db:migrate` | Apply migrations in development |
| `npm run db:deploy` | Apply migrations in production |
| `npm run db:seed` | Seed the demo user |
| `npm run db:studio` | Prisma Studio |

## Project layout

```
prisma/               schema, migrations, seed
src/app/(auth)/       login and signup
src/app/onboarding/   first-run wizard
src/app/(app)/        the signed-in app: dashboard, review, budget, transactions, goals, accounts, categories, settings
src/lib/              pure domain logic (budget math, dates, money, categorizer, SimpleFIN client, insights) with tests
src/server/           session helpers, shared queries, server actions, sync service
src/components/       UI primitives and shared components
```

Money is stored as integer cents everywhere. Transaction amounts are signed: negative is money out.

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Prisma connection string |
| `AUTH_SECRET` | Signs sessions; also the fallback key for encrypting bank credentials |
| `ENCRYPTION_KEY` | Optional dedicated key for encrypting bank access URLs |
| `AUTH_TRUST_HOST` | Set to `true` behind a proxy or on hosts like Vercel |
