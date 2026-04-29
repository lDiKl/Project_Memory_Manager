import { z } from 'zod';

export const RecordTypeSchema = z.enum(['task', 'bug', 'adr', 'reg']);
export type RecordType = z.infer<typeof RecordTypeSchema>;

// js-yaml (used by gray-matter) auto-parses ISO dates like "2026-04-27" into Date objects.
// This preprocessor normalises them back to "YYYY-MM-DD" strings before Zod validates.
const dateString = z.preprocess(
  (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
  z.string(),
);

export const TaskRecordSchema = z.object({
  id: z.string(),
  type: z.literal('task'),
  title: z.string(),
  status: z.enum(['open', 'in_progress', 'blocked', 'done']).default('open'),
  modules: z.array(z.string()).default([]),
  docs_impact: z.enum(['none', 'required', 'completed']).default('required'),
  source: z.string().optional(),
  external_id: z.string().optional(),
  external_url: z.string().optional(),
  created_at: dateString,
  updated_at: dateString,
});

export const BugRecordSchema = z.object({
  id: z.string(),
  type: z.literal('bug'),
  title: z.string(),
  status: z.enum(['open', 'investigating', 'fixed', 'wont_fix']).default('open'),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  modules: z.array(z.string()).default([]),
  source: z.string().optional(),
  external_id: z.string().optional(),
  external_url: z.string().optional(),
  created_at: dateString,
  updated_at: dateString,
});

export const AdrRecordSchema = z.object({
  id: z.string(),
  type: z.literal('adr'),
  title: z.string(),
  status: z.enum(['proposed', 'accepted', 'rejected', 'deprecated']).default('proposed'),
  created_at: dateString,
  updated_at: dateString,
});

export const RegressionRecordSchema = z.object({
  id: z.string(),
  type: z.literal('reg'),
  title: z.string(),
  status: z.enum(['open', 'pass', 'fail']).default('open'),
  related: z
    .object({
      bugs: z.array(z.string()).default([]),
      tasks: z.array(z.string()).default([]),
      modules: z.array(z.string()).default([]),
    })
    .default({}),
  check: z.object({
    type: z.enum(['manual', 'command', 'json']),
    command: z.string().optional(),
    expect: z.record(z.unknown()).optional(),
  }),
  created_at: dateString,
  updated_at: dateString,
});

export const AnyRecordSchema = z.discriminatedUnion('type', [
  TaskRecordSchema,
  BugRecordSchema,
  AdrRecordSchema,
  RegressionRecordSchema,
]);

export type TaskRecord = z.infer<typeof TaskRecordSchema>;
export type BugRecord = z.infer<typeof BugRecordSchema>;
export type AdrRecord = z.infer<typeof AdrRecordSchema>;
export type RegressionRecord = z.infer<typeof RegressionRecordSchema>;
export type AnyRecord = z.infer<typeof AnyRecordSchema>;
