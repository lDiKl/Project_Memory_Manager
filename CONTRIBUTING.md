# Contributing

Thanks for helping improve Project Memory Manager.

## Development Setup

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

## Pull Requests

- Keep changes focused.
- Add or update tests for behavior changes.
- Update README or QUICKSTART when user-facing commands change.
- Do not commit secrets, local runtime data, generated build output, or private project notes.

## Public API Changes

Treat CLI commands, command output, config keys, templates, and MCP tool schemas as public surface area. Breaking changes should be intentional and documented.
