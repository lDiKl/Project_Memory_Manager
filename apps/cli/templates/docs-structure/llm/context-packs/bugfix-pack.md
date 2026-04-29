---
title: Bugfix Context Pack
description: Context pack for debugging and fixing bugs
include:
  - 'module context'
  - 'current state of bug'
  - 'related ADRs'
  - 'regression commands'
exclude:
  - full bug history
  - unrelated modules
format: focused markdown for LLM
---
  
This pack is optimized for debugging and fixing bugs efficiently.

## What It Includes

1. Module-level context from docs/context/
2. Bug's current_state.md (if present) or full bug description
3. ADRs related to the touched modules
4. Regression commands that failed
5. "Do not change" directives from docs-map.yml

## What It Excludes

- Full bug history (summarized in current_state.md)
- Irrelevant module details
- Long code snippets (prefer references)

## Usage

```bash
pmem context build --bug BUG-XXX --pack bugfix
```
