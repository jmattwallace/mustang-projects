# Mustang Projects Requirements Audit

Status as of the Cloudflare Workers preparation.

## Implemented in the current application

- Google sign-in limited to administrator-invited accounts.
- Standard/admin roles and an editable user display name.
- Private, owner-only everyday project boards; another browser or computer does not merge projects.
- Simple projects by default, with one overall completion percentage.
- Optional four-stage projects with editable stage names, target percentages, completion percentages, and a required 100% stage-target total.
- Default stage plan: Pre-Production 15%, Production 25%, Post-production 50%, Confirm 10%.
- Project group creation, selection of multiple groups, private per-user group catalogs, and group colors.
- Group-color project progress strips; muted-green stage bars with distinct complete/incomplete portions.
- Editable gross and net estimates.
- Clickable editable overall/stage notes.
- Search across project, group, and note text.
- Hidden-by-default completed/archived projects, with a show toggle.
- Manual project ordering, standard completion/gross/net/group sorting, and three saved custom views.
- Drag placement cues, including a drop target after the final project.
- CSV and print report controls, plus report type and archive options.
- Separate Reports and admin-only Admin controls; admin invitation creation and an identity selector that shows display name plus email.
- Cloudflare Workers/OpenNext configuration with GitHub-driven deployment support.

## Deliberately not claimed as complete yet

- **Working admin impersonation:** the selector is visible, but it does not yet apply a secure server-side "view as" session.
- **Admin reports across all people:** the report dialog currently creates reports from the signed-in person’s loaded projects. The scope selector is present but not yet connected to a server-side all-users/specific-user report query.
- **Structured dates, expenses, and travel records:** the database schema supports project dates and expenses, but the project editor currently exposes only general text notes plus gross/net estimates. The dedicated entry forms and properly sorted report outputs still need to be finished.
- **Real invitation emails:** an invitation currently grants future Google access; it does not email the person. This needs a mail provider (for example, Supabase custom SMTP) and a send-invitation action.
- **Read-only project sharing:** the schema and access model support it, but the owner-facing share-management screen is not yet built.
- **Right-click collapse control:** this original interaction is not currently implemented; project editing remains the primary interaction.
- **Stage-progress proportional reconciliation:** targets are constrained to 100%, but completion edits are not yet automatically proportionally adjusted across stages.

## Deployment prerequisites outside the repository

- Create/connect the Cloudflare Worker in the Cloudflare account owned by `j.matt.wallace@gmail.com`.
- Add the two Supabase public environment values in Cloudflare.
- Add the final Worker URL to Supabase Authentication redirect URLs and Site URL.
- Test sign-in at the Worker URL before sharing it.
