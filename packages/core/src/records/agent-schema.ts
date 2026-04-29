import { z } from 'zod';
import {
  AdrRecordSchema,
  AnyRecordSchema,
  BugRecordSchema,
  RegressionRecordSchema,
  TaskRecordSchema,
} from './record-schema.js';

// ── Agent JSON response schemas ──────────────────────────────────────────────
//
// These schemas validate the JSON output that CLI commands emit with --json.
// They correspond to the interfaces in @pmem/shared-types but use the
// snake_case field names that YAML frontmatter records use.

const OkStatus = z.literal('ok');

export const AgentMutationResponseSchema = z.object({
  status: OkStatus,
  record: AnyRecordSchema,
  path: z.string().optional(),
  message: z.string().optional(),
});

export const AgentRecordResponseSchema = z.object({
  record: AnyRecordSchema,
  body: z.string().optional(),
  path: z.string().optional(),
});

export const AgentListResponseSchema = z.object({
  records: z.array(AnyRecordSchema),
});

export const AgentErrorResponseSchema = z.object({
  error: z.string(),
});

// ── Check response schemas ─────────────────────────────────────────────────────

const ModuleImpactSchema = z.object({
  module: z.string(),
  changedCode: z.array(z.string()).optional(),
  changed_code: z.array(z.string()).optional(),
  expectedDocs: z.array(z.string()).optional(),
  expected_docs: z.array(z.string()).optional(),
  updatedDocs: z.array(z.string()).optional(),
  updated_docs: z.array(z.string()).optional(),
  missingDocs: z.boolean().optional(),
  missing_docs: z.boolean().optional(),
});

const PendingDocsImpactSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  status: z.string().optional(),
});

export const DocsImpactReportSchema = z.object({
  changedFiles: z.array(z.string()).optional(),
  changed_files: z.array(z.string()).optional(),
  affected: z.array(z.any()).optional(),
  status: z.enum(['ok', 'warning', 'missing-docs']),
  message: z.string(),
  pending_docs_impact: z.array(PendingDocsImpactSchema).optional(),
});

// ── Regression response schemas ─────────────────────────────────────────────────

const RegressionResultSchema = z.object({
  regId: z.string(),
  status: z.enum(['pass', 'fail', 'error']),
  output: z.string().optional(),
  error: z.string().optional(),
  timestamp: z.string(),
});

export const RegressionRunResponseSchema = z.object({
  status: OkStatus.optional(),
  results: z.array(
    z.object({
      record: RegressionRecordSchema,
      result: RegressionResultSchema,
    }),
  ),
});

export const RegressionStatusResponseSchema = z.object({
  status: z
    .object({
      regId: z.string(),
      lastRun: RegressionResultSchema.optional(),
      runCount: z.number(),
    })
    .nullable()
    .optional(),
  statuses: z
    .array(
      z.object({
        record: RegressionRecordSchema,
        status: z
          .object({
            regId: z.string(),
            lastRun: RegressionResultSchema.optional(),
            runCount: z.number(),
          })
          .nullable(),
      }),
    )
    .optional(),
});

// ── Context build response schema ───────────────────────────────────────────────

export const ContextBuildResponseSchema = z.object({
  status: z.literal('ok'),
  markdown: z.string(),
  output: z.string().optional(),
});
