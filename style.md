# Droid Archives style

This is the required reference for all UI changes. Preserve the existing flat dark slate interface, readable spacing and green active states. Read this together with AGENTS.md.

## Spacing is part of the component

**Text must never touch its enclosing border, separator or neighbouring control.** This applies to breadcrumbs, headings, introductions, cards, notices, forms, results, dialogs and empty states.

- Standard content cards and bordered page wrappers: 24px internal padding on desktop, 16px on phones. Existing dense cards may use 12–16px; compact badges and controls use their own padding.
- Keep 16–24px between independent sections/cards; use 24–32px for major form sections. Keep 8px between a label and its control and 8–12px between related controls.
- Use 8–12px between an eyebrow and heading, 12–16px between heading and explanatory text, and 16–24px before the next section.
- Dividers need clearance on both sides: normally 12–16px of padding or margin around the adjoining text. Do not place text directly on a divider.
- A grid gap separates cards. A margin separates a component from its surroundings. Neither provides padding inside the component's border.
- Every component that introduces a border must define where its content padding comes from. Do not rely on browser default heading/paragraph margins.
- Reset first/last child margins where needed to avoid collapsed margins or doubled space. Flex/grid cards need explicit heading margins: the global h2 top margin is for document sections, not headings inside cards.
- Semantic elements such as article and section are not automatically cards. Use a named component class or .panel for a surface; do not add borders globally to every article.
- Do not solve clipping by hiding overflow on text or by reducing padding to zero. Allow wrapping, use min-width:0 and minmax(0,1fr), and stack columns at narrow widths.

## Visual language

- Reuse the theme tokens in next/shell.css: --panel, --bg-deep, --text, --muted, --line, --accent and --radius. Avoid new hard-coded theme colours.
- Keep panels flat, with a subtle 1px border and the existing 4px corner radius. Avoid unrelated gradients, oversized rounded cards or decorative shadows.
- Use Inter/system fonts. Existing shell sizes are 22px page headings, 16px section headings, 14px body text and 12px supporting text. Keep body line-height around 1.45–1.6.
- Green means primary action, selection, success or active navigation. Inactive navigation must retain the same neutral surface as its neighbours.
- Use the existing droid portraits, variant colours and established shop icon treatment. Maintain aspect ratio with object-fit:contain. Do not introduce opaque icon background boxes.

## Controls and behaviour

- Prefer short clear labels. Keep labels above selects/inputs with an 8px gap.
- Align controls in a row along their input baseline. Stack related checkbox options together, vertically centred beside the fields or below their associated dropdown.
- Controls should be at least 36px high on desktop and 42px where used as primary touch controls. Preserve visible keyboard focus and label associations.
- Use flex/grid gaps for button groups and allow them to wrap on mobile. Keep notices and empty states padded just like populated content.
- Search fields for droids should disable browser autocomplete suggestions.
- Keep text readable at narrow widths. Tables or maps may have their own explicit scrolling region; the whole document should not scroll sideways.
- Floating timers, dialogs and sticky controls must not cover essential actions or the final row of content.

## CSS ownership

- styles.css provides the shared base styles; next/theme.css adapts them; next/shell.css supplies the current shell and tokens. Feature CSS is loaded afterwards.
- Prefer a component-scoped fix. Fix a shared rule when it causes a shared defect, but audit the pages using it before and after.
- Do not add broad element selectors to repair one feature. Do not accumulate contradictory overrides or use !important as the default fix.
- Update stylesheet query versions in both supported HTML shells after changing a served stylesheet.

## Required review before calling a UI change complete

1. Inspect the rendered page at desktop (1440px) and phone (390px); check 320px for new responsive layouts. Source code or a passing functional test alone is not visual verification.
2. Check all four edges of bordered content, the gap around dividers, heading/paragraph rhythm, labels, buttons and wrapped text. Verify at least 16px page-card insets on mobile.
3. Check populated, empty, error and result states that the change can produce. For authenticated pages use a test fixture when available; never change a real account to test layout.
4. Verify no accidental horizontal overflow and that floating UI does not block actions.
5. For shared stylesheet changes run node tests/site-spacing-audit.cjs and inspect representative screenshots. The audit is a diagnostic aid, not a substitute for visual review.
6. Run relevant feature checks. For Blueprint Calc use node tests/blueprint-calc-ui.cjs and node --test tests/blueprint-calc.test.cjs.
7. Report any untested authenticated or live-data states honestly. Do not claim every possible state was checked.

## Spacing audit: 8 November 2026

Reviewed the shared shell and feature styles, and rendered these public/default routes at 1440px and 390px: Home, Base, Optimise, Rebirth, Trading, Droids, Droidex, Scourgedex, Traits, Fusion Lab, Nova Shop, Cantina Shop, Droid Calc, Blueprint Calc, Crit Calc, Lucky Droid, Groups, Event, Companion, To Do, Site Help and an individual droid page.

The defect was an unscoped article surface rule adding a border to the Blueprint Calc page wrapper without padding. Removed the automatic article surface, gave Blueprint Calc an explicit padded surface, and reset its card heading/paragraph spacing. Existing named cards retain their own styling. Browser checks include populated calculator results using a fixture. Signed-in trading chats, private groups and every possible account-dependent state are not covered by the public-route sweep.

## Shared content

Droid facts and common labels must come from the sources in [shared-data.md](shared-data.md). Reuse shared portrait and text renderers while keeping page-specific layout scoped to its component.
