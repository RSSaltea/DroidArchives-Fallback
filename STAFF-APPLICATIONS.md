# Staff application form

The static form is in `staffform/`, reachable at `https://droidarchives.co.uk/staffform` after website deployment. It uses the existing Droid Archives login and the public Supabase configuration in `data/supabase-config.json`.

The bot integration is in the sibling **paws of fury bot** workspace:

- `cogs/droid_staff_applications.py`
- `data/droid_staff_questions.json`
- `supabase/migrations/20260915_droid_staff_applications.sql`
- `docs/DROID-STAFF-APPLICATIONS.md` (activation instructions and behaviour)

Before publishing, apply the SQL migration and deploy/restart the updated bot. Delivery is fixed to Droid Archives server `1458242062599323803`, channel `1549427990977581116`. The form shows a queued receipt; bot delivery can follow later if the bot is offline. No bot token or service credential is included in this website.

Question wording lives in `staffform/questions.json` and is mirrored to the bot's question file. Helpers answer the common questions; Moderator and Either role also require the two moderation scenarios. A submission is limited to once per account per 24 hours.

Run `node tests/staffform-ui.cjs` for isolated browser checks. It requires Playwright/Chrome and does not create live applications. The bot repository also contains unit and local database tests.

Use this repository's protected publishing workflow in `CLAUDE.md`. The private companion app, research files and reference media remain excluded from public Git history.
