# App Week Together

A shared planner for New York App Week. Browse events, save your picks, and compare calendars with friends.

[Use the hosted app](https://appweek-together.vercel.app) · [Report a problem](https://github.com/Open-Brace/appweek-together/issues) · [Contribute](CONTRIBUTING.md)

## Features

- Event browsing, search, date navigation, and RevenueCat filters.
- Private groups with invite links and member colors.
- Shared calendars, a continuous agenda, and personal ICS exports.
- Custom events, cover photos, and automatic Luma imports.
- Full linked event descriptions with source attribution.
- Email/password accounts and one-time recovery codes.

Saving an event does not register you with its host. Follow the event's registration link to RSVP. All event times use `America/New_York`.

The schedule importer and date navigation currently target **October 19–22, 2026**. This is a working event planner, not yet a general-purpose conference platform. Other weeks require changing the dates in `src/lib/types.ts`, `src/lib/source.ts`, and the calendar UI.

## Run your own copy

Requires Node.js 22 or later, npm, and your own Neon PostgreSQL database. The app uses the Neon HTTP driver; a generic local PostgreSQL URL is not a drop-in runtime replacement.

1. Fork or clone this repository and run `npm ci`.
2. Create a Neon project or development branch. Copy its pooled connection URL and direct connection URL.
3. Copy `.env.example` to `.env.local` and fill in both database URLs. Generate independent values for `BETTER_AUTH_SECRET` and `CRON_SECRET` with `openssl rand -hex 32`. Keep `BETTER_AUTH_URL=http://localhost:3000` for local development.
4. Apply the checked-in schema migrations, then import the public schedule:

   ```sh
   npm run db:migrate
   npm run seed
   ```

5. Start the app with `npm run dev` and open http://localhost:3000.

Use a separate development database. This repository contains no production credentials, account records, private groups, saved picks, invite codes, or uploaded cover photos. A fork does not connect to the hosted app's database.

## Deploy to Vercel

Import **your fork** as a new Vercel project and connect your own Neon database. Set the five variables from `.env.example` in that project's environment. Set `BETTER_AUTH_URL` to your deployment's HTTPS origin. Apply migrations and seed the database you created, then deploy.

`vercel.json` schedules a daily source refresh at 10:00 UTC. The endpoint `/api/cron/sync` requires `Authorization: Bearer <CRON_SECRET>`. Importing public schedule data and refreshing linked descriptions write to the database configured for your deployment.

Do not pull environment variables from someone else's Vercel project. Keep production and test environments separate.

## Accounts and privacy

Accounts require a password of at least 10 characters. Email verification and email-based password reset are not configured. Email addresses are account identifiers, not verified identity claims. Users can generate a recovery code in account settings; the server stores its hash and consumes it when resetting a password.

Groups are private to their members. Anyone with a group invite link can join, so treat that link as private. Owners can rotate invite links and remove members. Each request checks group membership and event ownership on the server. The frontend refreshes shared plans every 15 seconds while visible.

## Development and tests

```sh
npm run typecheck
npm run test:unit
npm run build
```

The build reads environment configuration. Use your development `.env.local`; CI supplies placeholder values and does not connect to a database.

Browser integration tests require the app running at `http://localhost:3000` with a seeded, disposable development database:

```sh
npx playwright install chromium webkit
npm run test:e2e
npx playwright test --config=playwright.webkit.config.ts
node scripts/accessibility.mjs
```

Integration tests create accounts, groups, and events. Some checks fetch live source pages or depend on the current 2026 schedule. Run them only against a deployment and database you control for testing. `TEST_URL` can select that test deployment. Tests tagged `@parser` run offline; `@live` can fetch provider pages and `@writes` creates or changes test records. Generated artifacts stay in the ignored `.artifacts/` directory. `PLAYWRIGHT_EXECUTABLE_PATH` is an optional Chromium override.

## Project structure

- `src/components` contains the planner, event form, and shared dialogs.
- `src/app/api` contains authenticated plan, event, recovery, and import routes.
- `src/lib/schema.ts` and `drizzle/` define the database and migrations.
- `src/lib/source.ts` imports the official schedule.
- `src/lib/luma.ts` and `src/lib/linked-about*` import linked event details.

Built with Next.js, React, Drizzle, Neon, and Better Auth.

## License and event content

Application code is available under the [MIT license](LICENSE). Third-party event descriptions, cover photos, logos, names, and trademarks remain their owners' material and are not relicensed by this repository. Event content is fetched from the original sources at runtime; the parser fixture uses fictional sample content. Respect source-site terms and retain attribution when using imported content.

This is an independent planner, not an official App Week, Luma, Meetup, or RevenueCat product.
