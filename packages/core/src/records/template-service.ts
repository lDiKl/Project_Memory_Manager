import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RecordType } from './record-schema.js';

const TEMPLATE_FILES: Record<RecordType, string> = {
  task: 'task.md',
  bug: 'bug.md',
  adr: 'adr.md',
  reg: 'reg.md',
};

const CURRENT_STATE_TEMPLATES: Record<RecordType, string> = {
  task: 'task-current-state.md',
  bug: 'bug-current-state.md',
  adr: 'adr-current-state.md',
  reg: 'reg-current-state.md',
};

export async function renderTemplate(
  templatesRoot: string,
  type: RecordType,
  vars: Record<string, string>,
): Promise<string> {
  const templatePath = join(templatesRoot, 'records', TEMPLATE_FILES[type]);
  let template: string;
  try {
    template = await readFile(templatePath, 'utf-8');
  } catch {
    template = defaultTemplate(type);
  }

  return template
    .replace(/<(\w+)>/g, (_, key: string) => vars[key] ?? `<${key}>`)
    .replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}

export async function renderCurrentState(
  templatesRoot: string,
  type: RecordType,
  vars: Record<string, string>,
): Promise<string> {
  const templatePath = join(templatesRoot, 'records', CURRENT_STATE_TEMPLATES[type]);
  let template: string;
  try {
    template = await readFile(templatePath, 'utf-8');
  } catch {
    template = defaultCurrentStateTemplate(type);
  }

  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}

function defaultCurrentStateTemplate(type: RecordType): string {
  if (type === 'task') {
    return `---
id: {{id}}
type: task
title: {{title}}
status: open
modules: []
created_at: {{created_at}}
updated_at: {{created_at}}
docs_impact: required
---

# {{id}} — {{title}}

## Current State

<short snapshot of current implementation>

## Requirements

- [ ] <requirement 1>
- [ ] <requirement 2>

## Context

<background information>

## Result

<expected outcome>
`;
  }
  if (type === 'bug') {
    return `---
id: {{id}}
type: bug
title: {{title}}
status: open
severity: medium
modules: []
created_at: {{created_at}}
updated_at: {{created_at}}
---

# {{id}} — {{title}}

## Current State

<short snapshot of current implementation or bug state>

## Steps to Reproduce

1. <step 1>
2. <step 2>
3. <step 3>

## Expected Result

<what should happen>

## Actual Result

<what actually happens>

## Regression

<reference to REG-XXX if applicable>
`;
  }
  return '';
}

export const BUG_ATTEMPT_TEMPLATE = `
## Attempt {{date}}

**Hypothesis:**

**Change:**

**Result:**

**Regression:**

**Next:**
`.trimStart();

function defaultTemplate(type: RecordType): string {
  if (type === 'task') {
    return `---
id: {{id}}
type: task
title: {{title}}
status: open
modules: []
created_at: {{created_at}}
updated_at: {{created_at}}
docs_impact: required
---

# {{id}} — {{title}}

## Summary

## Context

## Requirements

- [ ]

## Result
`;
  }
  if (type === 'bug') {
    return `---
id: {{id}}
type: bug
title: {{title}}
status: open
severity: medium
modules: []
created_at: {{created_at}}
updated_at: {{created_at}}
---

# {{id}} — {{title}}

## Summary

## Steps to Reproduce

1.

## Expected Result

## Actual Result
`;
  }
  return `---
id: {{id}}
type: adr
title: {{title}}
status: proposed
created_at: {{created_at}}
updated_at: {{created_at}}
---

# {{id}} — {{title}}

## Context

## Decision

## Alternatives Considered

## Consequences
`;
}
