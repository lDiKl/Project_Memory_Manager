# @pmm/core

Domain logic for Project Memory Manager.

This package contains all business logic. It has **no CLI**, **no HTTP server**, **no React** — only TypeScript services consumed by `apps/cli` (and later `apps/server`).

## Modules

See [`docs/modules/core/`](../../docs/modules/core/) for the per-module documentation.

| Folder | Service | Phase |
|---|---|---|
| `src/config/` | Config + docs-map loader | S0 |
| `src/git/` | Git changed-files reader | S0 |
| `src/scanner/` | Module detector | S0 |
| `src/checker/` | Docs-impact analyzer | S1 |
| `src/records/` | Task/Bug/ADR record engine | S2 |
| `src/docs/` | Markdown + template engine | S2 |

## Conventions

See [`docs/knowledge/patterns.md`](../../docs/knowledge/patterns.md).
