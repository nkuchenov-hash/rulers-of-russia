# History Core

`History Core` is the canonical factual layer for the Rulers of Russia project. UI, ruler pages, maps, timelines and future modules should consume it rather than maintain separate historical chronologies.

## Core rule

A canonical fact is not accepted because a modern map or historian says so. It must link to a historical document, archival original, official documentary publication or contemporary official map.

Russian archival and official documentary evidence is the canonical frame for the project. Russian academic scholarship may help interpret a difficult document or georeference a textual boundary, but secondary interpretation cannot create a canonical event or boundary by itself.

## Event-sourced territory

We do **not** hand-author one independent border map for every month. Humans edit only evidence and changes:

1. concrete historical documents;
2. dated historical events;
3. territorial changes caused by those events;
4. small source-backed geometry fragments;
5. verified base states from which changes can be replayed.

`npm run materialize:history-territory` replays all `geometry-verified` changes and generates every downstream state. If one date, document, confidence value or geometry fragment changes, later states are rebuilt automatically.

## Automatic map integration

The materializer emits the canonical month/day-capable index at:

`public/data/history-core/generated/territory/index.json`

It also emits generated GeoJSON states and uncertainty layers. For the current year-based globe it creates compatibility GeoJSON and automatically switches the matching polity entry in `public/data/territory/archive/manifest.json` to History Core output during build.

Therefore:

- a polity with verified History Core geometry uses it automatically;
- a polity not yet reconstructed continues to use the legacy bootstrap temporarily;
- no renderer code needs to be edited when research changes a border;
- month-aware consumers use the generated History Core index directly.

Generated snapshots are build artifacts. **Never repair a generated snapshot manually.** Fix the source document/event/change/fragment and rebuild.

## Date integrity

- Preserve the date exactly as printed in the source.
- Preserve the source calendar (Julian/Gregorian/etc.).
- Normalize only when conversion is safe.
- Never invent a month or day when the source supports only a year or range.
- Store signing, ratification, entry-into-force and actual implementation dates separately when they differ.

Only day/month-precise verified changes are eligible for deterministic monthly replay. A year-only or unresolved range remains research data and cannot silently move a production border.

## Territory is not always a modern line

For early and medieval Rus, a thin modern border line is often historically false. Geometry fragments can be:

- `territory-area` — reconstructed included territory;
- `boundary-corridor` — uncertain location of a boundary line;
- `frontier-zone` — historically fuzzy borderland;
- `control-zone` — de-facto/sphere-of-control evidence.

The territorial model can be:

- `linear-border`;
- `frontier-zone`;
- `sphere-of-control`;
- `tributary-zone`;
- `mixed`.

Each fragment carries confidence and may carry `uncertaintyMeters`. The materializer copies those into generated uncertainty layers so the map can style uncertainty from data instead of hard-coded visual guesses.

## Separate territorial tracks

Do not collapse unlike concepts into one polygon:

- `russian-legal-border` — canonical legal/state track for the site;
- `de-facto-control` — actual control where it differs;
- `front-line` — wartime front, not a state border;
- `internal-administrative` — guberniya/oblast/republic/internal boundary;
- `claim` — a claim that is not the same as effective control or a treaty border.

## Geometry operations

Every verified territorial change has a spatial action:

- `add` — union an acquired fragment with current territory;
- `remove` — subtract a ceded/separated fragment;
- `replace` — replace the whole state from verified fragments;
- `metadata-only` — documentary change that does not itself alter area.

The generator uses polygon boolean operations. `acquire`, `cede`, `unite`, `separate`, `occupy`, `withdraw` and `replace-state` have default actions, but `geometryAction` can be stated explicitly when the historical case requires it.

## Source tiers

- **A1 archival original** — scan/copy from a state archive or official archival system.
- **A2 official documentary publication** — official legal collections, treaty collections, documentary editions reproducing primary documents.
- **A3 contemporary official map** — period state/military/cartographic map with provenance.
- **B1 Russian academic interpretation** — can explain or georeference but cannot establish the canonical fact alone.
- **C bootstrap only** — third-party historical datasets/maps; useful for discovery and temporary visualization only.

Canonical event/boundary records require at least one A1/A2/A3 document.

## Editable data layout

- `public/data/history-core/sources.json` — discovery/source collections.
- `public/data/history-core/documents.json` — concrete cited documents.
- `public/data/history-core/events/*.json` — reusable historical events.
- `public/data/history-core/territory-changes/*.json` — event-to-territory operations.
- `public/data/history-core/territory-model.json` — replay graph: base states, geometry fragments and change files.
- geometry files referenced by `territory-model.json` — small evidence-backed editable pieces.

Generated output lives under `public/data/history-core/generated/territory/` during build.

## CI contract

Every main/deploy build runs:

1. `npm run validate:history`;
2. `npm run materialize:history-territory`;
3. site typecheck/build.

Validation rejects broken document references, unknown events/fragments, unverified geometry in verified states, missing geometry files, and geometry-mutating changes that have no verified fragments.

This makes the dependency chain explicit:

**document → event → territory change → geometry fragment → replayed state → globe / ruler page / timeline.**

The existing `src/historical-state` directory is a visual-state system. `History Core` is deliberately separate: it is factual provenance and chronology, not styling.
