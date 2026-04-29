// Public surface of @pmem/core.
// Services are exported individually — no single god-object.

export { PmemError } from './errors.js';
export type { PmemErrorCode } from './errors.js';

// Config
export {
  findProjectRoot,
  loadConfig,
  writeConfig,
  loadDocsMap,
  writeDocsMap,
  writeYaml,
  readYaml,
  DEFAULT_CONFIG,
  DEFAULT_DOCS_MAP,
} from './config/config-service.js';
export {
  ProjectMemoryConfigSchema,
  DocsMapSchema,
  ModuleEntrySchema,
  DEFAULT_CONFIG as CONFIG_DEFAULTS,
  DEFAULT_DOCS_MAP as DOCS_MAP_DEFAULTS,
} from './config/schema.js';
export type {
  ProjectMemoryConfig,
  DocsMap,
  ModuleEntry,
} from './config/schema.js';

// Scanner
export {
  detectModules,
  mergeDetectedIntoDocsMap,
} from './scanner/scanner-service.js';
export type { DetectedModule } from './scanner/scanner-service.js';

// Git
export { getChangedFiles, getCurrentBranch } from './git/git-service.js';
export type { DiffMode } from './git/git-service.js';

// Checker
export { checkDrift } from './checker/checker-service.js';

// Records
export {
  recordDir,
  recordPath,
  nextId,
  loadRecord,
  listRecords,
  writeRecord,
  createRecord,
  patchRecord,
  findRecord,
} from './records/record-service.js';
export {
  TaskRecordSchema,
  BugRecordSchema,
  AdrRecordSchema,
  RegressionRecordSchema,
  AnyRecordSchema,
  RecordTypeSchema,
} from './records/record-schema.js';
export type {
  RecordType,
  TaskRecord,
  BugRecord,
  AdrRecord,
  RegressionRecord,
  AnyRecord,
} from './records/record-schema.js';
export {
  AgentMutationResponseSchema,
  AgentRecordResponseSchema,
  AgentListResponseSchema,
  AgentErrorResponseSchema,
  DocsImpactReportSchema,
  RegressionRunResponseSchema,
  RegressionStatusResponseSchema,
  ContextBuildResponseSchema,
} from './records/agent-schema.js';
export {
  renderTemplate,
  renderCurrentState,
  BUG_ATTEMPT_TEMPLATE,
} from './records/template-service.js';

// Context
export { buildContext, loadContextPack, listContextPacks } from './context/context-service.js';
export type { ContextPack, ContextOptions, ContextOutput } from './context/context-service.js';

// Regression
export {
  regressionDir,
  regressionPath,
  resultsDir,
  loadRegression,
  listRegressions,
  listRegressionsByBug,
  listRegressionsByModule,
  runRegression,
  saveResult,
  getRegressionStatus,
} from './regression/regression-service.js';
export type { RegressionResult, RegressionStatus } from './regression/regression-service.js';
