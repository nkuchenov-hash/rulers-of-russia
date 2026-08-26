# History Core

`History Core` is the canonical factual layer for the Rulers of Russia project. UI, ruler pages, maps, timelines and future modules should consume it rather than maintain separate historical chronologies.

## Core rule

A canonical fact is not accepted because a modern map or historian says so. It must link to a historical document, archival original, official documentary publication or contemporary official map.

Russian archival and official documentary evidence is the canonical frame for the project. Russian academic scholarship may help interpret a difficult document or georeference a textual boundary, but secondary interpretation cannot create a canonical event or boundary by itself.

## Why the database is event-sourced

We do **not** store one independent border map for every month. We store:

1. dated historical events;
2. primary-source evidence for each event;
3. territorial changes caused by the event;
4. source-backed boundary snapshots at actual change dates.

A view for any day or month resolves the latest verified territorial state effective at that date. Months without a border change reuse the previous state. This produces month-level history without inventing thousands of duplicate maps.

## Date integrity

- Preserve the date exactly as printed in the source.
- Preserve the source calendar (Julian/Gregorian/etc.).
- Normalize only when conversion is safe.
- Never invent a month or day when the source supports only a year or range.
- Store signing, ratification, entry-into-force and actual implementation dates separately when they differ.

## Territory is not always a modern line

For early and medieval Rus, a thin modern border line is often historically false. The schema supports:

- `linear-border` — a documented/demarcated line;
- `frontier-zone` — a documented borderland with uncertain width;
- `sphere-of-control` — political/military control without a modern state line;
- `tributary-zone` — tribute/dependency relationships;
- `mixed` — combinations of the above.

Uncertainty must be visible in the data and eventually in the map UI.

## Separate territorial tracks

Do not collapse unlike concepts into one polygon:

- `russian-legal-border` — canonical legal/state track for the site;
- `de-facto-control` — actual control where it differs;
- `front-line` — wartime front, not a state border;
- `internal-administrative` — guberniya/oblast/republic/internal boundary;
- `claim` — a claim that is not the same as effective control or a treaty border.

This prevents conquest, occupation, armistice lines and final treaty borders from being silently treated as the same thing.

## Source tiers

- **A1 archival original** — scan/copy from a state archive or official archival system.
- **A2 official documentary publication** — official legal collections, treaty collections, documentary editions reproducing primary documents.
- **A3 contemporary official map** — period state/military/cartographic map with provenance.
- **B1 Russian academic interpretation** — can explain or georeference but cannot establish the canonical fact alone.
- **C bootstrap only** — third-party historical datasets/maps; useful for discovery and temporary visualization only.

Canonical event/boundary records require at least one A1/A2/A3 source.

## Planned data layout

`public/data/history-core/sources.json` — source registry.

`public/data/history-core/events/*.json` — editable event records, eventually split by period/century for manageable reviews.

`public/data/history-core/territory-changes/*.json` — event-to-boundary changes.

`public/data/history-core/territory-snapshots/*.geojson` — materialized source-backed geometry at actual change dates.

`public/data/history-core/month-index.json` — generated index from month -> effective snapshot IDs. It is build output, never manually authored.

## Required fields for a canonical territorial change

- event ID;
- original and normalized effective date with precision;
- polity;
- operation (`acquire`, `cede`, `demarcate`, etc.);
- territorial model and track;
- primary source IDs;
- geometry method;
- derivation note if a verbal treaty description was converted to geometry;
- review status and uncertainty.

## Research order

1. Build complete source registry and research queue.
2. Replace current third-party Russian territory bootstrap with source-backed change events.
3. Start with periods where primary documentation is dense and exact: 1649-present.
4. Then 1229-1648 from charters, treaty books, acts and chronicles.
5. Handle 862-1228 as documentary territorial models/zones rather than false precise borders.
6. Link the same event IDs into ruler pages and the global timeline.

The existing `src/historical-state` directory is a visual-state system. `History Core` is deliberately separate: it is factual provenance and chronology, not styling.
