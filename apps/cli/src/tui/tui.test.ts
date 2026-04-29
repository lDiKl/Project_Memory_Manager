import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BugRecord, TaskRecord } from '@pmem/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { autocomplete, suggestions } from './autcomplete.js';
import { render } from './renderer.js';
import type { AppState, TuiContext } from './types.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'pmem-tui-'));
  await mkdir(join(tmpDir, 'docs', 'tasks'), { recursive: true });
  await mkdir(join(tmpDir, 'docs', 'bugs'), { recursive: true });
  await mkdir(join(tmpDir, 'docs', 'decisions'), { recursive: true });
  await mkdir(join(tmpDir, 'docs', 'regressions'), { recursive: true });
  await writeFile(
    join(tmpDir, '.project-memory.yml'),
    'version: 1\nproject:\n  name: tui-test\n  docs_root: docs\n',
    'utf-8',
  );
  await writeFile(join(tmpDir, 'docs-map.yml'), 'modules: {}\n', 'utf-8');
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function makeContext(): TuiContext {
  return { projectRoot: tmpDir, projectName: 'tui-test', branch: 'main' };
}

function makeState(overrides?: Partial<AppState>): AppState {
  return {
    context: makeContext(),
    status: 'idle',
    input: '',
    history: [],
    historyIndex: -1,
    output: [],
    dashboard: { tasks: [], bugs: [], loading: true },
    nextOutputId: 1,
    ...overrides,
  };
}

describe('TUI autocomplete', () => {
  it('returns null for empty input', () => {
    expect(autocomplete('')).toBeNull();
  });

  it('completes /ini to /init', () => {
    expect(autocomplete('/ini')).toBe('/init');
  });

  it('completes /ch to /check', () => {
    expect(autocomplete('/ch')).toBe('/check');
  });

  it('returns common prefix for /task (has subcommands)', () => {
    expect(autocomplete('/task')).toBe('/task ');
  });

  it('completes subcommand /task cr to /task create', () => {
    expect(autocomplete('/task cr')).toBe('/task create');
  });

  it('completes subcommand /bug li to /bug list', () => {
    expect(autocomplete('/bug li')).toBe('/bug list');
  });

  it('completes /context b to /context build', () => {
    expect(autocomplete('/context b')).toBe('/context build');
  });

  it('completes /regression r to /regression run', () => {
    expect(autocomplete('/regression r')).toBe('/regression run');
  });

  it('returns null for no matching commands', () => {
    expect(autocomplete('/xyz')).toBeNull();
  });

  it('returns null when input already matches a command exactly', () => {
    expect(autocomplete('/init')).toBeNull();
  });

  describe('suggestions', () => {
    it('returns all commands for /', () => {
      const result = suggestions('/');
      expect(result).toContain('/init');
      expect(result).toContain('/check');
      expect(result).toContain('/task');
      expect(result).toContain('/exit');
    });

    it('filters commands by prefix', () => {
      const result = suggestions('/c');
      expect(result).toContain('/check');
      expect(result).toContain('/context');
      expect(result).not.toContain('/task');
    });

    it('returns subcommands for /task ', () => {
      const result = suggestions('/task ');
      expect(result).toContain('/task create');
      expect(result).toContain('/task list');
    });

    it('returns empty for non-slash input', () => {
      expect(suggestions('hello')).toEqual([]);
    });
  });
});

describe('TUI renderer', () => {
  it('renders header with project name and branch', () => {
    const state = makeState();
    const output = render(state, 80, 24);
    expect(output).toContain('tui-test');
    expect(output).toContain('main');
  });

  it('renders logo lines', () => {
    const state = makeState();
    const output = render(state, 80, 24);
    expect(output).toContain('PROJECT');
    expect(output).toContain('MANAGER');
  });

  it('renders loading dashboard when no data', () => {
    const state = makeState();
    const output = render(state, 80, 24);
    expect(output).toContain('Loading');
  });

  it('renders tasks and bugs in dashboard', () => {
    const task: TaskRecord = {
      id: 'TASK-001',
      type: 'task',
      title: 'Test task',
      status: 'open',
      modules: [],
      docs_impact: 'required',
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };
    const bug: BugRecord = {
      id: 'BUG-001',
      type: 'bug',
      title: 'Test bug',
      status: 'open',
      severity: 'medium',
      modules: [],
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };
    const state = makeState({
      dashboard: { tasks: [task], bugs: [bug], loading: false },
    });
    const output = render(state, 80, 24);
    expect(output).toContain('TASK-001');
    expect(output).toContain('BUG-001');
  });

  it('renders empty input prompt', () => {
    const state = makeState({ input: '' });
    const output = render(state, 80, 24);
    expect(output).toContain('Type / for commands');
  });

  it('renders command palette when input starts with /', () => {
    const state = makeState({ input: '/c' });
    const output = render(state, 80, 24);
    expect(output).toContain('/check');
    expect(output).toContain('/context');
  });

  it('renders activity output with command results', () => {
    const state = makeState({
      output: [
        {
          id: 1,
          command: '/check',
          lines: [{ text: 'OK No drift', style: 'success' as const }],
          timestamp: Date.now(),
        },
      ],
    });
    const output = render(state, 80, 24);
    expect(output).toContain('/check');
    expect(output).toContain('No drift');
  });

  it('renders running status indicator', () => {
    const state = makeState({ status: 'running' });
    const output = render(state, 80, 24);
    expect(output).toContain('running...');
  });

  it('renders activity hint when no output', () => {
    const state = makeState({ output: [] });
    const output = render(state, 80, 24);
    expect(output).toContain('Type / for commands');
  });
});

describe('TUI slash commands via executeCommand', () => {
  it('executes /check and returns drift report or no-change message', async () => {
    const { executeCommand } = await import('./commands/registry.js');
    const context = makeContext();
    const result = await executeCommand('/check', context);
    const text = result.map((l) => l.text).join('\n');
    expect(text.length).toBeGreaterThan(0);
  });

  it('executes /task list and returns task list', async () => {
    const { executeCommand } = await import('./commands/registry.js');
    const context = makeContext();
    const result = await executeCommand('/task list', context);
    const text = result.map((l) => l.text).join('\n');
    expect(text).toContain('task');
  });

  it('executes /bug list and returns bug list', async () => {
    const { executeCommand } = await import('./commands/registry.js');
    const context = makeContext();
    const result = await executeCommand('/bug list', context);
    const text = result.map((l) => l.text).join('\n');
    expect(text).toContain('bug');
  });

  it('executes /init --force and initializes project memory', async () => {
    const { executeCommand } = await import('./commands/registry.js');
    const context = makeContext();
    const result = await executeCommand('/init --force', context);
    const text = result.map((l) => l.text).join('\n');
    expect(text).toContain('PMEM');
  });

  it('returns error for unknown command', async () => {
    const { executeCommand } = await import('./commands/registry.js');
    const context = makeContext();
    const result = await executeCommand('/xyz', context);
    const text = result.map((l) => l.text).join('\n');
    expect(text).toContain('Unknown command');
  });

  it('executes /help and shows available commands', async () => {
    const { helpBlock } = await import('./commands/registry.js');
    const result = helpBlock();
    const text = result.map((l) => l.text).join('\n');
    expect(text).toContain('/init');
    expect(text).toContain('/check');
    expect(text).toContain('/task');
    expect(text).toContain('/bug');
    expect(text).toContain('/adr');
    expect(text).toContain('/context');
    expect(text).toContain('/regression');
    expect(text).toContain('/exit');
  });
});
