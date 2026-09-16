# Profile tools

The homepage brings together the current profile's rebirth requirements, layout
income improvement, named fusion recipes and collection progress. It uses the
same planner functions as Base and Optimise. Timers and the current event remain
above the dashboard. No alternative-plan comparison feature is included.

Guided setup creates a separate profile after a four-step review. The sample
base is also a separate, explicitly named profile. Both use the normal local
save/account sync path. Owned upgrades can be entered during setup; Cantina
purchases and Iconic unlocks remain in their shop pages.

Save history is available from the homepage and account/profile menu. Local
checkpoints retain up to 60 entries per signed-in account or local browser
scope, bounded to roughly 500,000 characters where possible. Browser storage
pressure can reduce that history; JSON export remains useful for long-term
backups. History is not a replacement for the current save.

Cloud history reads the existing `droid_archive_profile_history` table using
the signed-in user's ID and its existing row-level security policy. It shows
the latest 40 archived documents, including profiles that were deleted. No new
database migration is required if `data/supabase-schema.sql` or
`data/supabase-profile-safety-migration.sql` is already installed. If the query
fails, local recovery stays available. Recovery always creates a new profile
and does not overwrite the current one.

Share progress generates a 1200×630 PNG and an optional read-only link. The
title and selected progress fields are encoded in the URL fragment; no account
ID, email, session, private settings or full save is included. Layout and missing
requirements are opt-in. The PNG contains the selected summary and up to three
missing requirements; layout is shown on the linked page. The snapshot is
fixed, self-contained and cannot be revoked. There is no server-side publishing
step and recipients do not need to sign in. Generated links target
`https://droidarchives.co.uk/` and require this website update to be deployed.

The companion's recognised droid card queries the current Archives profile for
missing collection/rebirth requirements, safe income replacements, completed
named fusion ingredients and three-copy quality upgrades. Income checks preserve locked, unfinished,
rebirth-protected and mission droids. They assume an extra candidate is fully built,
and do not check affordability or automate purchases. Fusion hints describe
ingredients held, not permission to spend protected copies. Stale responses are
discarded when the recognised card changes or closes. The website update and
a newly built companion are both needed for these hints in live play; an older
website returns an update message and the existing Add-to-Droidex controls
continue working.

Validation: `node tests/archive-experience-ui.cjs` (Playwright; optional
`CHROME_PATH`), and `node --test desktop/test/droid-usefulness.test.js
desktop/test/ipc-handlers.test.js desktop/test/droid-reader.test.js`.
