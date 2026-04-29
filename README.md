# Project Memory Manager (PMM)

> Keep your docs in sync with your code. Automatically.

[![npm version](https://img.shields.io/npm/v/project-memory-manager.svg)](https://www.npmjs.com/package/project-memory-manager)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Project Memory Manager is a Git-native CLI tool for keeping project memory close to the code: tasks, bugs, ADRs, module docs, regression checks, and focused context packs for AI coding agents.

PMM stores everything as plain Markdown and YAML inside your repository. No database, no cloud service, no hidden state.

## Install

```bash
npm install -g project-memory-manager
```

Requires Node.js 20.10+ and pnpm 9+ for local development.

## Docker

PMM can also run without a local Node.js install:

```bash
docker compose build pmem
docker compose run --rm pmem --help
```

The compose service mounts the current directory at `/workspace`, so CLI commands run against your project:

```bash
docker compose run --rm pmem init --name my-project
docker compose run --rm pmem scan --write
docker compose run --rm pmem check
```

For containerized development, open the repository in VS Code Dev Containers or run:

```bash
docker compose run --rm --workdir /app --entrypoint pnpm pmem test
```

## Quickstart

```bash
cd my-project
pmem init
pmem scan --write

# edit code, then check whether related docs need updates
pmem check
```

## Git Hooks

```bash
pmem hooks install
pmem hooks uninstall
```

The pre-commit hook runs `pmem check --staged` before each commit and blocks commits when documentation drift is detected.

## AI Coding Agents

PMM can build focused context packs for AI-assisted development:

```bash
pmem context build --task TASK-001 --pack feature
pmem context build --bug BUG-001 --pack bugfix --include-regressions
pmem context build --diff --pack refactor
```

PMM also exposes a local MCP server over stdio:

```json
{ "mcpServers": { "pmem": { "command": "pmem", "args": ["mcp"] } } }
```

## Core Commands

| Command | Purpose |
|---|---|
| `pmem init` | Scaffold PMM config and docs structure |
| `pmem scan --write` | Detect modules and update `docs-map.yml` |
| `pmem check` | Detect code/docs drift |
| `pmem hooks install` | Install the PMM pre-commit hook |
| `pmem task create "Title"` | Create a task record |
| `pmem bug create "Title"` | Create a bug record |
| `pmem adr create "Title"` | Create an ADR record |
| `pmem context build --diff` | Build an LLM context pack |
| `pmem regression run REG-001` | Run a regression check |
| `pmem mcp` | Start the MCP server |

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

Repository layout:

```text
apps/cli/               # pmem command-line application
packages/core/          # domain logic
packages/shared-types/  # shared TypeScript types
templates/              # templates copied by pmem commands
```

## Contributing

Issues and pull requests are welcome. Please keep changes focused, add or update tests for behavior changes, and run `pnpm test` before submitting.

## License

MIT © Dmytro Kostynenko
