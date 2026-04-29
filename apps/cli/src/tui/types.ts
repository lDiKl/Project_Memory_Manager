import type { AnyRecord, BugRecord, TaskRecord } from '@pmem/core';

export type AppStatus = 'idle' | 'running';

export type TuiStyle = 'dim' | 'success' | 'warn' | 'error' | 'info' | 'title' | 'muted';

export interface TuiLine {
  text: string;
  style?: TuiStyle | undefined;
}

export type TuiBlock = TuiLine[];

export interface OutputEntry {
  id: number;
  command: string;
  lines: TuiBlock;
  timestamp: number;
}

export interface TuiContext {
  projectRoot: string;
  projectName: string;
  branch: string;
}

export interface DashboardState {
  tasks: TaskRecord[];
  bugs: BugRecord[];
  loading: boolean;
  error?: string | undefined;
}

export interface AppState {
  context: TuiContext;
  status: AppStatus;
  input: string;
  history: string[];
  historyIndex: number;
  output: OutputEntry[];
  dashboard: DashboardState;
  nextOutputId: number;
}

export type RecordLike = AnyRecord;
