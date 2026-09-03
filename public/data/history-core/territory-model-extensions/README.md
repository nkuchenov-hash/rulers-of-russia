# History Core territory-model extensions

This directory contains additive, deterministic fragments and base states that are merged into `territory-model.json` by `scripts/apply-history-model-extensions.mjs` before History Core validation and materialization.

Rules:

- extensions are source data, not generated output;
- IDs must be globally unique;
- an extension may reference an existing verified fragment from the core model;
- conflicting duplicate IDs fail the pipeline;
- extension loading must not weaken provenance, geometry-verification, date-precision, materialization, or strict completion rules;
- this mechanism exists to keep large era/base-state batches reviewable without turning `territory-model.json` into a single unmaintainable file.
