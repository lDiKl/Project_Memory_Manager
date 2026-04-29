---
title: Feature Context Pack
description: Context pack for implementing new features
include:
  - 'module context'
  - 'related ADRs'
  - 'current state'
  - 'test patterns'
exclude:
  - unrelated modules
  - implementation details
format: focused markdown for LLM
---

This pack is optimized for implementing new features.

## What It Includes

1. Module-level context from docs/context/
2. Feature's current_state.md (if present) or full task description
3. ADRs related to the touched modules
4. Test patterns and examples
5. "Do not change" directives

## What It Excludes

- Irrelevant module details
- Implementation artifacts
- Long test files (prefer references)

## Usage

```bash
pmem context build --task TASK-XXX --pack feature
```
