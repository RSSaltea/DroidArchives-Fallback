# Shared information and components

Read this before adding game data or repeating a droid description. Prefer a shared source and a renderer over copying a value or sentence into another page.

## Source ownership

| Information | Canonical source | How features consume it |
| --- | --- | --- |
| Droid name, class, rarity, variant income/cost/build time, portrait paths | data/droids.json | Use the loaded catalogue record passed by app.js; do not create page-specific droid records. |
| Name compatibility aliases, Iconic classification and perk summaries | droid-rules.js | canonicalDroidName, isIconic, ICONIC_EFFECTS, iconicIncome |
| Variant lists, order, active Kyber forms, rebirth eligibility | droid-rules.js | ALL_VARIANTS, OWNED_VARIANTS, baseVariant, variantRank, rebirthVariantReady |
| Upgrade chip prices, station rates, sell values, lucky upgrade chances | droid-rules.js | CHIP_COSTS, upgradeChipRate, baseChipSellValue, luckyChance |
| Kyber activation alternatives and trade colour charges | droid-rules.js | KYBER_ACTIVATION and KYBER_TRADE_COLOUR are deliberately separate rules. |
| Droid portrait selection, fallback and image markup | droid-display.js | imageFor and droidPicture; existing feature contexts receive the shared picture callback. |
| Trade costs and payer difference | trade-values.js | tradeValue and tradeDifference use the catalogue and shared chip table. |
| Rarity average and blueprint targets | blueprint-calc.js | Uses BLUEPRINT_RARITY_POINTS from droid-rules.js. |
| Companion comparison goals and eligible trait choices | companion-trait-comparison.js | Reads traits.js; app.js supplies existing Base credit, scrap and critical-hit calculations. |
| Traits, eligibility and bonuses | traits.js and trait-badges.js | Use trait helpers and badges; do not repeat trait calculations in cards. |
| Production, scrap, crafting and mission calculations | economy.js, crafting.js, mission-economy.js | Pass the current profile and catalogue into the existing pure calculators. |
| Fusion recipes | data/fusion.json and the existing fusion resolver in app.js | Fusion Target calls the resolver supplied by the app; never invent a second recipe evaluator. |
| Nova levels/cost totals | nova-levels.js and loaded shop data | Use the shared level and cost helpers. |
| Event timing and rewards | event-schedule.js, event-data.js and event data files | Reuse event helpers across countdowns and pages. |
| HTML text/attribute escaping | ui-text.js | escapeHtml; this is not a URL sanitizer. |
| Spacing and appearance | style.md and shared CSS | Use established tokens and component rules. |

## Rules for future changes

- Resolve a mentioned droid against the current catalogue. Render its name, portrait, rarity, class and variant stats from that record. Pass the record/helper to components instead of maintaining another list.
- Keep player-owned copies separate from catalogue definitions. Slot, trait, traded status, lock and build progress belong to the exact owned copy; they must never be written onto the shared droid definition.
- The main app loads/updates the catalogue and passes it into features. Do not fetch competing copies from individual cards or keep a stale module-global name index after a catalogue refresh.
- Shared rule tables are frozen. Copy arrays before sorting. Add new facts to their canonical module and update its consumers, rather than adding a page-local fallback table.
- Similar-looking concepts are not automatically equivalent: blueprint rarity points give Mythic 5, rarity display order gives it index 4; active Kyber colours share a rebirth tier but have different trade charges; activation prices differ from trade charges. Keep those distinctions explicit.
- Keep pure rules independent of DOM, localStorage, network and mutable profile state. Browser UI and the Optimise worker must import the same rules.
- Generated optimise-layout-context.js is an output, not a second source. Regenerate it with node tools/build-optimise-layout.cjs after app changes; never hand-edit it.
- When changing a shared module, update versioned imports through its browser consumers. Run cross-feature regression tests, not just the new page.
- Source-inspection tests that evaluate app declarations also read droid-rules.js; tests for public modules should import the modules directly.

## Current boundaries

This consolidation covers shared droid rules and rendering plus common formatting across the existing features. It does not replace every page's layout or rewrite the whole application. Catalogue loading, fusion resolution and some profile-specific orchestration remain in app.js; extend their existing interfaces rather than creating a parallel implementation.
