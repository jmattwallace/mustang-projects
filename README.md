# Mustang Projects Review

A personal, multi-user project-status board based on the approved requirements. It uses Google-only sign-in, private user-created groups, read-only project sharing, and administrator impersonation/auditing.

## What is in this first build

- A responsive dark-board interface based on the supplied mockup.
- Default project stage allocations: Pre 15%, Production 25%, Post-production 50%, Confirm 10%.
- Search, status filtering, sort options, new-project setup, and a project-details pop-up.
- A Supabase database schema with row-level security, sharing permissions, notes, dates, basic expenses, saved arrangements, and admin audit records.
- Deployment instructions in [DEPLOYMENT.md](DEPLOYMENT.md).

## Local start

1. Copy `.env.example` to `.env.local` and add the Supabase URL and anonymous key.
2. Run `npm install`.
3. Run `npm run dev` and open `http://localhost:3000`.

The current screen uses representative data while the Supabase client and authenticated server actions are connected in the next implementation pass. Do not use it with real users until Google Auth, invite handling, and the database connection are configured.
