'use client';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './workspace';
import { requestApi, saveReport, type SaveInput } from '@/lib/client-api';
import { sections, type Report } from '@/lib/reports';
export type WebTool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => Promise<unknown>;
};
type ModelContext = {
  registerTool: (
    tool: WebTool,
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
export function WebMCP() {
  const { csrfToken, user } = useAuth(),
    client = useQueryClient();
  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const fields = Object.fromEntries(
      sections.map(({ key }) => [key, { type: 'string', maxLength: 12000 }]),
    );
    const schema = (properties: object, required: string[] = []) => ({
      type: 'object',
      properties,
      required,
      additionalProperties: false,
    });
    function inputObject(input: unknown): Record<string, unknown> {
      if (!input || typeof input !== 'object' || Array.isArray(input))
        throw Error('Expected an object');
      return input as Record<string, unknown>;
    }
    const tools: WebTool[] = [
      {
        name: 'list_reports',
        description:
          'Read submitted team reports, or your own drafts and reports. Filter by Monday week date and author.',
        inputSchema: schema({
          scope: { enum: ['team', 'mine'] },
          week: { type: 'string' },
          author: { type: 'string' },
          page: { type: 'integer', minimum: 1 },
        }),
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async (input) => {
          const value = inputObject(input),
            params = new URLSearchParams();
          for (const key of ['scope', 'week', 'author', 'page'])
            if (value[key] !== undefined) params.set(key, String(value[key]));
          return requestApi('reports?' + params, csrfToken);
        },
      },
      {
        name: 'read_report',
        description: 'Read a submitted report or your own draft by ID.',
        inputSchema: schema({ id: { type: 'string' } }, ['id']),
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async (input) => {
          const value = inputObject(input);
          if (typeof value.id !== 'string' || !value.id)
            throw Error('Report ID is required');
          return requestApi(
            'reports/' + encodeURIComponent(value.id),
            csrfToken,
          );
        },
      },
      ...(['draft', 'submitted'] as const).map((status) => ({
        name: status === 'draft' ? 'save_draft' : 'submit_report',
        description:
          status === 'draft'
            ? 'Save a private weekly report draft. To update, provide its id and current version.'
            : 'Save and submit your weekly report so all team members can read it. To update, provide its id and current version.',
        inputSchema: schema(
          {
            ...fields,
            weekStart: {
              type: 'string',
              description: 'Monday date YYYY-MM-DD',
            },
            id: { type: 'string' },
            version: { type: 'integer', minimum: 1 },
          },
          ['weekStart', ...sections.map((s) => s.key)],
        ),
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute: async (input: unknown) => {
          const v = inputObject(input);
          if (
            typeof v.weekStart !== 'string' ||
            sections.some((s) => typeof v[s.key] !== 'string') ||
            (v.id !== undefined &&
              (typeof v.id !== 'string' || !Number.isInteger(v.version)))
          )
            throw Error('Invalid report fields or version');
          const report: Report = await saveReport(
            csrfToken,
            {
              ...(v as SaveInput),
              status,
            },
            user.id,
          );
          await client.invalidateQueries();
          window.dispatchEvent(
            new CustomEvent('weekly-report:saved', { detail: report }),
          );
          return {
            id: report.id,
            status: report.status,
            version: report.version,
            weekStart: report.weekStart,
          };
        },
      })),
    ];
    for (const tool of tools) {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => console.warn('WebMCP registration unavailable'));
      } catch {
        console.warn('WebMCP registration unavailable');
      }
    }
    return () => lifecycle.abort();
  }, [csrfToken, client, user.id]);
  return null;
}
