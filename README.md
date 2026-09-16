# Droid Archives

A static, GitHub Pages-ready wiki and base planner for Fortnite: Droid Tycoon.

## Run locally

Serve the folder with any static server, for example:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000`. Directly opening `index.html` will not work because the app loads local JSON data with `fetch`.

See [Optimise planning and validation](OPTIMISE.md) for the movement pipeline,
its safety rules and regression checks.

## Data

- `data/droids.json` contains droid rarity, type, cost, variant, and income data.
- `data/rebirths.json` contains the complete Cycle 1–4 super-rebirth requirements through Rebirth 27. Droid variants and credit costs were verified against the four supplied cycle charts.
- `data/image-manifest.json` maps locally stored wiki image assets.

Data was cross-checked against the community tracker and Fortnite Wiki on 28 June 2026. This is an unofficial fan project and is not affiliated with Epic Games, Fortnite, Disney, or Lucasfilm.

## Supabase setup

Cloud profiles and account groups require the tables, row-level security policies, and RPC functions in `data/supabase-schema.sql`. Run the complete file in the Supabase SQL Editor after pulling an update; it is written to be safely rerunnable. The group RPCs expose only profiles that their owners explicitly share and handle permitted shared-profile edits atomically.
