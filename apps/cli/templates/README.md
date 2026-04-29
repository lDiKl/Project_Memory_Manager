# Templates

Files copied or rendered into the user's repository by `pmem` commands.

| Folder | Used by | Purpose |
|---|---|---|
| `docs-structure/` | `pmem init` | Initial `docs/` skeleton scaffolded into a fresh repo. |
| `records/` | `pmem task/bug/adr create` | Per-record markdown templates with frontmatter. |
| `config/` | `pmem init` | Default `.project-memory.yml` and `docs-map.yml`. |

Templates use `{{placeholder}}` syntax for substitution. The substitution engine lives in `@pmm/core/src/docs/template-engine.ts` (Phase S2).

## Editing rules

- Keep templates small. They are the user's first impression of PMM.
- Every record template must include YAML frontmatter with `id`, `status`, `created_at`.
- Section headings should match what `pmem check --strict` validates (see `config/check-rules.yml` in S2).
