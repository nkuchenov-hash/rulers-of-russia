# Generic Core isolation

Core Design System, Inspector trees, module passports, HVS contracts and the default skeleton must remain ruler-agnostic.

## Rule

A named historical ruler must never be hard-coded into:

- Core module structure;
- Inspector layer trees;
- module passports;
- default Core fixture;
- shared visual contracts;
- generic renderer behavior.

The generic renderer may only use neutral placeholder data such as «Имя правителя», «год—год», «значение» and semantic field labels.

Inspector tree labels must also remain generic even when the Test Lab is currently rendering a specific ruler.

## Concrete rulers

Concrete rulers are input data only.

For the current Test Lab, Peter I lives in:

`src/content/rulers/peterILabRulerPageData.ts`

and is injected only by:

`src/app/lab/page.tsx`

The shared `CoreDesignSystemSkeleton` must render correctly without knowing that Peter I exists.
