---
id: {{id}}
type: reg
title: "{{title}}"
status: open
related:
  bugs: []
  tasks: []
  modules: []
check:
  type: manual
created_at: '{{created_at}}'
updated_at: '{{created_at}}'
---

# {{id}} — {{title}}

## Description

Describe what this regression check validates.

## Related

- Bugs: <list related BUG-XXX IDs>
- Tasks: <list related TASK-XXX IDs>
- Modules: <list related module names>

## Check Type

> **YAML tip:** Always quote command values that contain special characters
> like `{`, `}`, `:`, or `#`. Example: `command: 'echo {"valid": true}'`

### Manual

Steps to verify manually:

1. <step 1>
2. <step 2>
3. <step 3>

### Command

```bash
<command to run>
```

### JSON

```bash
<command that outputs JSON>
```

Expected output:

```json
{
  "field": "value"
}
```

## History

| Date | Result | Notes |
|------|--------|-------|
| | | |