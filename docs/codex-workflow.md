# Codex Workflow

This document explains how to use Codex safely on Laria.

## Principle

The repo is the source of truth.

Codex context will compact or reset, so important product and engineering knowledge must live in:
- `/docs`
- migration files
- README
- code where necessary

Do not rely on conversation history.

## Starting a New Codex Session

Use this first prompt:

```text
Read all files in /docs before making changes.

Summarize:
- product concept
- architecture
- database schema
- implemented features
- advanced filter system
- important decisions
- current roadmap

Do not edit files yet.
```

Review the summary before assigning work.

## Feature Prompt Format

Use small scoped prompts.

Good:

```text
Add active filter chips to the listings page. Keep URL query params in sync. Do not change database schema.
```

Bad:

```text
Improve the marketplace.
```

Every prompt should include:
- Target route/component.
- Desired behavior.
- Constraints.
- What not to change.
- Build/test expectations.

## Standard Task Template

```text
Implement [feature name].

Context:
- Read /docs/context.md and related docs first.
- Preserve existing marketplace behavior.

Scope:
- Modify [specific files/routes/components if known].
- Add [specific behavior].

Requirements:
- Spanish UI.
- Keep existing routes working.
- Keep Supabase/RLS assumptions intact.
- Do not add unrelated features.
- Ensure npm run build passes if npm is available.

Do not:
- Add payments.
- Add checkout.
- Add delivery.
- Add escrow.
- Add reviews.
- Add chat.
- Rewrite unrelated components.

End with:
- files changed
- checks run
- how to test manually
- known limitations
```

## Database Change Workflow

If a feature needs schema changes:
1. Ask Codex to create a migration file in `supabase/migrations`.
2. Ask Codex to update `lib/supabase/database.types.ts` and relevant app interfaces.
3. Review SQL.
4. Manually run SQL in Supabase SQL Editor unless migration CI is set up.
5. Push code.
6. Test production.

Reminder:

```text
Vercel deploys code.
Vercel does not apply Supabase SQL migrations.
```

## UI Integration Workflow with v0

When using v0-generated UI, do not overwrite the app blindly.

Recommended process:
1. Place v0 files in the sandbox folder currently used by this repo: `components_v0`.
2. Ask Codex to integrate one page at a time.
3. Keep business/data logic from the existing app.
4. Replace mock data with Supabase data.
5. Run build.
6. Only later move stable components into `/components`.

Note: some older prompts or planning docs may say `/components-v0`. The actual current folder is `components_v0`; use the real folder name unless a rename is explicitly requested.

Useful prompt:

```text
Integrate UI components from /components_v0 into the existing homepage.

Keep existing Supabase data fetching and routes.
Replace mock data with real approved listings/stores.
Do not modify backend logic.
Ensure npm run build passes.
```

## Supabase Safety Rules

For public content:
- Listings must stay filtered by `status='approved'`.
- Stores must stay filtered by `status='active'`.
- Listing photos should only be readable for approved listings through RLS.

For admin:
- Preserve login through Supabase Auth.
- Preserve `is_admin()` check.
- Do not add a service-role key to client code.
- Do not expose admin actions through public route handlers without RLS/RPC protection.

For storage:
- `listing-photos` is for listing submissions.
- `store-assets` is for logos/banners.
- Keep file type and size limits aligned with migrations and form validation.

## Filter Safety Rules

When changing filters:
- Update `lib/instrument-filters.ts`.
- Update `parseListingFilters()` only if URL parsing changes.
- Keep values stable and internal.
- Keep labels in Spanish.
- Make sure JSONB `attributes` values match stored shape.
- Test combinations, not just individual filters.
- Do not casually rename filter keys; existing database values and shareable URLs depend on them.

## Listing Card Safety Rules

When changing cards:
- Keep cards compact enough for 4-column desktop grids.
- Do not show `published_at` or `view_count` in cards.
- Keep first-photo lazy loading and on-demand extra photo fetch.
- Avoid loading all photos in the listings query.
- Do not break listing detail pages, which use a full-photo display.

## QA Prompt After Each Feature

```text
Run a QA pass for this feature.

Check:
- npm run build
- TypeScript
- ESLint
- affected routes
- Supabase queries
- mobile behavior
- empty/loading states
- no unrelated features changed

Fix only issues related to this feature.
End with files changed and manual test checklist.
```

If npm is unavailable, Codex should say so and still do static QA.

## Documentation Update Prompt

Every meaningful feature should update docs.

```text
Update /docs to reflect the feature just implemented.

Update:
- /docs/features.md
- /docs/database.md if schema changed
- /docs/filters.md if filter behavior changed
- /docs/decisions.md if a new product/engineering decision was made
- /docs/context.md if future Codex sessions need to know it

Do not modify app logic.
```

## Git Workflow

Recommended:

```bash
git status
git add .
git commit -m "short descriptive message"
git push
```

Vercel redeploys after push.

If Vercel fails:
1. Open deployment logs.
2. Copy exact error.
3. Ask Codex to fix only that error.
4. Commit/push again.

## Common Mistakes to Avoid

Avoid:
- Asking Codex to build too much at once.
- Letting Codex rewrite working pages unnecessarily.
- Allowing Codex to remove Supabase logic while redesigning UI.
- Copying v0 project config over working app config.
- Assuming Supabase migrations are automatic.
- Adding payments too early.
- Adding full marketplace complexity before liquidity.
- Renaming routes or filter keys without a migration plan.

Also avoid asking Codex to implement business-model mechanics before the operating need is clear. For example, "featured listings" can start as a manual/admin curation feature before payments, billing, subscriptions, or commission tracking exist.

## Good Next-Feature Examples

```text
Add user registration and a simple Mis publicaciones page.
```

```text
Add store-owner login and allow active stores to manage their listings.
```

```text
Add featured listings, but do not implement payments yet.
```

```text
Add SEO category landing pages for major instrument groups.
```

```text
Add instrument_type and attributes fields to the public sell form and admin listing editor. Keep existing submissions working.
```
