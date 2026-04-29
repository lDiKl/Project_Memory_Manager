// Cross-package contracts. Pure types only — never import runtime values here.
//
// These types are consumed by:
//   - @pmem/core (domain logic implementations)
//   - apps/cli (output formatting)
//   - apps/server (HTTP DTOs) — Phase 5+
//   - apps/web (UI props) — Phase 6+

export type RecordId = string;

export interface ModuleRef {
  readonly id: string;
  readonly name: string;
  readonly codePaths: readonly string[];
  readonly docPaths: readonly string[];
  readonly owners?: readonly string[];
}

export type TaskStatus = 'open' | 'in_progress' | 'blocked' | 'done';
export type BugStatus = 'open' | 'investigating' | 'fixed' | 'wont_fix';
export type AdrStatus = 'proposed' | 'accepted' | 'rejected' | 'deprecated';

export interface Task {
  readonly id: RecordId;
  readonly title: string;
  readonly status: TaskStatus;
  readonly modules: readonly string[];
  readonly docsImpact: 'none' | 'required' | 'completed';
  readonly source?: string;
  readonly externalId?: string;
  readonly externalUrl?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AgentRecordResponse<TRecord = unknown> {
  readonly record: TRecord;
  readonly path?: string;
  readonly body?: string;
}

export interface AgentListResponse<TRecord = unknown> {
  readonly records: readonly TRecord[];
}

export interface AgentMutationResponse<TRecord = unknown> {
  readonly status: 'ok';
  readonly record: TRecord;
  readonly path?: string;
  readonly message?: string;
}

export interface DocsImpactReport {
  readonly changedFiles: readonly string[];
  readonly affected: readonly ModuleImpact[];
  readonly status: 'ok' | 'warning' | 'missing-docs';
  readonly message: string;
}

export interface ModuleImpact {
  readonly module: string;
  readonly changedCode: readonly string[];
  readonly expectedDocs: readonly string[];
  readonly updatedDocs: readonly string[];
  readonly missingDocs: boolean;
}
