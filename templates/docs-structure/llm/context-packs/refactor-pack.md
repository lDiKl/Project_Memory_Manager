---
title: Refactor Context Pack
description: Context pack for code refactoring
include:
  - 'module context'
  - 'current state'
  - 'test coverage'
  - 'ADR decisions about the module'
exclude:
  - unrelated modules
  - implementation details
format: focused markdown for LLM
---

This pack is optimized for code refactoring.

## What It Includes

1. Module-level context from docs/context/
2. Refactoring task's current_state.md or full task description
3. ADRs related to the module architecture
4. Test coverage patterns
5. "Do not change" directives (public API, contracts)

## What It Excludes

- Irrelevant module details
- Old implementation artifacts
- Test history (focus on current state)

## Usage

```bash
pmem context build --task TASK-XXX --pack refactor
```
