import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { emitKeypressEvents } from 'node:readline';
import { promisify } from 'node:util';
import { autocomplete } from './autcomplete.js';
import { executeCommand, helpBlock } from './commands/registry.js';
import { render } from './renderer.js';
import { ANSI } from './theme.js';
import type { AppState, TuiContext } from './types.js';

const execFileAsync = promisify(execFile);

export class NativeTuiApp {
  private state: AppState;
  private renderScheduled = false;
  private closed = false;

  constructor(context: TuiContext) {
    this.state = {
      context,
      status: 'idle',
      input: '',
      history: [],
      historyIndex: -1,
      output: [],
      dashboard: { tasks: [], bugs: [], loading: true },
      nextOutputId: 1,
    };
  }

  start(): void {
    process.stdout.write(`${ANSI.altScreen}${ANSI.hideCursor}${ANSI.clear}${ANSI.home}`);
    emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('keypress', this.handleKeypress);
    process.stdout.on('resize', this.scheduleRender);
    process.once('SIGINT', this.close);
    process.once('SIGTERM', this.close);

    this.scheduleRender();
    void this.refreshContext();
    void this.loadDashboard();
  }

  private handleKeypress = async (
    input: string,
    key: { name?: string; ctrl?: boolean },
  ): Promise<void> => {
    if (this.closed) return;

    if (key.ctrl && key.name === 'c') {
      this.close();
      return;
    }

    if (this.state.status === 'running') return;

    switch (key.name) {
      case 'return':
        await this.submit();
        return;
      case 'backspace':
        this.state.input = this.state.input.slice(0, -1);
        this.state.historyIndex = -1;
        this.scheduleRender();
        return;
      case 'tab': {
        const completed = autocomplete(this.state.input);
        if (completed) this.state.input = completed;
        this.scheduleRender();
        return;
      }
      case 'up':
        this.moveHistory(1);
        return;
      case 'down':
        this.moveHistory(-1);
        return;
      case 'escape':
        this.state.input = '';
        this.state.historyIndex = -1;
        this.scheduleRender();
        return;
    }

    if (input && !key.ctrl && input >= ' ') {
      this.state.input += input;
      this.state.historyIndex = -1;
      this.scheduleRender();
    }
  };

  private async submit(): Promise<void> {
    const command = this.state.input.trim();
    if (!command) return;

    this.state.input = '';
    this.state.history.push(command);
    this.state.historyIndex = -1;

    if (command === '/exit' || command === 'exit' || command === ':q') {
      this.close();
      return;
    }

    if (command === '/clear' || command === 'clear') {
      this.state.output = [];
      this.scheduleRender();
      return;
    }

    if (command === '/help' || command === 'help') {
      this.addOutput(command, helpBlock());
      this.scheduleRender();
      return;
    }

    this.state.status = 'running';
    this.scheduleRender();
    const lines = await executeCommand(command, this.state.context);
    this.addOutput(command, lines);
    this.state.status = 'idle';
    this.scheduleRender();
    void this.loadDashboard();
  }

  private addOutput(command: string, lines: AppState['output'][number]['lines']): void {
    this.state.output.push({
      id: this.state.nextOutputId++,
      command,
      lines,
      timestamp: Date.now(),
    });
  }

  private moveHistory(direction: 1 | -1): void {
    if (this.state.history.length === 0) return;
    const next = Math.max(
      -1,
      Math.min(this.state.history.length - 1, this.state.historyIndex + direction),
    );
    this.state.historyIndex = next;
    this.state.input =
      next === -1 ? '' : (this.state.history[this.state.history.length - 1 - next] ?? '');
    this.scheduleRender();
  }

  private scheduleRender = (): void => {
    if (this.renderScheduled || this.closed) return;
    this.renderScheduled = true;
    queueMicrotask(() => {
      this.renderScheduled = false;
      process.stdout.write(
        `${ANSI.home}${render(this.state, process.stdout.columns ?? 80, process.stdout.rows ?? 24)}`,
      );
    });
  };

  private async refreshContext(): Promise<void> {
    const root = await findProjectRootLite(process.cwd());
    const [branch, projectName] = await Promise.all([getBranchLite(root), getProjectName(root)]);
    this.state.context = { projectRoot: root, projectName, branch };
    this.scheduleRender();
  }

  private async loadDashboard(): Promise<void> {
    this.state.dashboard = { ...this.state.dashboard, loading: true, error: undefined };
    this.scheduleRender();

    try {
      const { listRecords, loadConfig } = await import('@pmem/core');
      const config = await loadConfig(this.state.context.projectRoot);
      const [tasks, bugs] = await Promise.all([
        listRecords(this.state.context.projectRoot, config, 'task'),
        listRecords(this.state.context.projectRoot, config, 'bug'),
      ]);
      this.state.dashboard = {
        tasks: tasks.filter((record) => record.type === 'task').slice(0, 6),
        bugs: bugs.filter((record) => record.type === 'bug').slice(0, 6),
        loading: false,
      };
    } catch (err) {
      this.state.dashboard = {
        tasks: [],
        bugs: [],
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    this.scheduleRender();
  }

  private close = (): void => {
    if (this.closed) return;
    this.closed = true;
    process.stdin.off('keypress', this.handleKeypress);
    process.stdout.off('resize', this.scheduleRender);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdout.write(`${ANSI.showCursor}${ANSI.clear}${ANSI.home}${ANSI.mainScreen}`);
    process.exit(0);
  };
}

async function findProjectRootLite(start: string): Promise<string> {
  let current = resolve(start);
  while (true) {
    if (
      (await exists(join(current, '.project-memory.yml'))) ||
      (await exists(join(current, '.git')))
    ) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) return resolve(start);
    current = parent;
  }
}

async function getProjectName(root: string): Promise<string> {
  return basename(root) || 'project';
}

async function getBranchLite(root: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', [
      '-C',
      root,
      'rev-parse',
      '--abbrev-ref',
      'HEAD',
    ]);
    return stdout.trim() || 'HEAD';
  } catch {
    return 'HEAD';
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
