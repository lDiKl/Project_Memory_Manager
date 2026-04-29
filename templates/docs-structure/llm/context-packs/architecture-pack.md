---
title: Architecture Context Pack
description: Context pack for architectural decisions and planning
include:
  - 'project vision'
  - 'current architecture'
  - 'ADR history'
  - 'module boundaries'
exclude:
  - implementation details
  - code snippets
format: focused markdown for LLM
---

This pack is optimized for architectural discussions and planning.

## What It Includes

1. Project vision from docs/project/vision.md
2. Current architecture from docs/project/architecture.md
3. ADRs related to architecture decisions
4. Module boundaries and relationships
5. Technology stack

## What It Excludes

- Implementation details
- Specific code examples
- Test coverage details

## Usage

```bash
pmem context build --task TASK-XXX --pack architecture
```
