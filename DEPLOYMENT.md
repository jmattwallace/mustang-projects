# Publish Mustang Projects with Cloudflare Workers

This application is a full Next.js application with sign-in, server routes, and Supabase access. It is configured for **Cloudflare Workers** (not static Cloudflare Pages).

## Who controls publication

Use the Cloudflare account signed in as **j.matt.wallace@gmail.com**. Keep the GitHub repository private and give no other person write access to its `main` branch. Only a change pushed to `main` will publish a new production version.

## One-time Cloudflare setup

1. Sign in to [Cloudflare](https://dash.cloudflare.com/) as `j.matt.wallace@gmail.com`.
2. Open **Workers & Pages** and create a new **Worker** from the `jmattwallace/mustang-projects` GitHub repository. Choose `main` as the production branch.
3. In the build settings, use:
   - Build command: `npm run cf:build`
   - Deploy command: `npx wrangler deploy`
   - Non-production branch deploy command: `npx wrangler versions upload`
   - Node version: `22`
4. In **Settings → Variables and Secrets**, add these values for both Production and Preview. Add them in both places: **Build Variables and secrets** (so Next.js can build the browser bundle) and **Runtime Variables and Secrets** (so the Worker can authenticate requests):
   - `NEXT_PUBLIC_SUPABASE_URL` — the existing Supabase Project URL (ending in `.supabase.co`, not `/rest/v1/`)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the existing Supabase publishable/anon key
5. Run the first deployment. Cloudflare will provide a `*.workers.dev` address.
6. Add that exact address followed by `/auth/callback` to **Supabase → Authentication → URL Configuration → Redirect URLs**. Also set the Site URL to the new Worker address.
7. In Google Cloud, keep only Supabase’s provider callback as the Google OAuth redirect URI. Google returns to Supabase, and Supabase returns to the Worker app URL configured in the preceding step.

## Publishing changes

1. Work and test locally with `npm run dev`.
2. Commit changes and push to the GitHub `main` branch using the GitHub account you control. Cloudflare's GitHub connection should be granted access only to this repository.
3. Cloudflare builds and publishes the new version automatically. Use the Workers deployment page to see progress and roll back if necessary.

## Before sharing the live URL

1. Sign in as `j.matt.wallace@gmail.com` and confirm the normal dashboard shows only that account’s projects.
2. Sign in as an invited standard user and confirm they see only their projects.
3. Confirm Google sign-in, new-project creation, group editing, drag ordering, notes, and the account-name editor.
4. Test the callback URL on the public Worker domain, not `localhost`.

## Security reminders

- Never commit `.env.local`, Google client secrets, or a Supabase service-role key.
- The Supabase publishable key is expected in the browser; Row Level Security protects the data.
- Invitations currently authorize access to the application; they do not send a separate email until an email delivery provider is configured.
