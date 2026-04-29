import {
  AgentErrorResponseSchema,
  AgentListResponseSchema,
  AgentMutationResponseSchema,
  AgentRecordResponseSchema,
  ContextBuildResponseSchema,
  DocsImpactReportSchema,
} from '@pmem/core';

type SchemaChoice = 'mutation' | 'record' | 'list' | 'error' | 'check' | 'context' | 'none';

const SCHEMAS: Record<Exclude<SchemaChoice, 'none'>, unknown> = {
  mutation: AgentMutationResponseSchema,
  record: AgentRecordResponseSchema,
  list: AgentListResponseSchema,
  error: AgentErrorResponseSchema,
  check: DocsImpactReportSchema,
  context: ContextBuildResponseSchema,
};

export function writeJson(value: unknown, schema: SchemaChoice = 'none'): void {
  if (schema !== 'none') {
    const zodSchema = SCHEMAS[schema];
    if (zodSchema && typeof (zodSchema as { safeParse?: unknown }).safeParse === 'function') {
      const result = (
        zodSchema as {
          safeParse: (v: unknown) => { success: boolean; error?: { message: string } };
        }
      ).safeParse(value);
      if (!result.success) {
        process.stderr.write(
          `[pmem] Warning: JSON response did not match ${schema} schema: ${result.error?.message}\n`,
        );
      }
    }
  }
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function writeJsonError(err: unknown): void {
  writeJson({ error: err instanceof Error ? err.message : String(err) });
}
