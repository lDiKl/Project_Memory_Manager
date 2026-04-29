export type PmemErrorCode =
  | 'E_NOT_PMEM_REPO' // no .project-memory.yml or .git in the tree
  | 'E_DOCS_MAP_MISSING' // docs-map.yml not found
  | 'E_DOCS_MAP_INVALID' // docs-map.yml fails schema validation
  | 'E_CONFIG_INVALID' // .project-memory.yml fails schema validation
  | 'E_INIT_CONFLICT' // pmem init: files already exist, no --force
  | 'E_SCAN_NO_MODULES' // scan detected zero modules
  | 'E_GIT_NOT_REPO' // not a git repository
  | 'E_GIT_FAILED' // git subprocess error
  | 'E_RECORD_NOT_FOUND' // record file not found
  | 'E_PACK_NOT_FOUND' // context pack not found
  | 'E_HOOK_CORRUPTED' // pre-commit hook markers mismatched
  | 'E_NO_GIT'; // .git directory not found

export class PmemError extends Error {
  readonly code: PmemErrorCode;

  constructor(code: PmemErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PmemError';
    this.code = code;
  }
}
