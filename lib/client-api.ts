import type { Report, ReportContent } from './reports';
export class ClientError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public existingId?: string,
  ) {
    super(message);
  }
}
export async function requestApi<T>(
  path: string,
  csrfToken: string,
  method = 'GET',
  body?: unknown,
  refreshSession = true,
  expectedUserId?: string,
): Promise<T> {
  const response = await fetch('/api/' + path, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers:
      method === 'GET'
        ? {}
        : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let data: Record<string, unknown>;
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new ClientError(
      'เชื่อมต่อไม่สำเร็จ กรุณาลองอีกครั้ง',
      'network_error',
      response.status,
    );
  }
  if (
    response.status === 403 &&
    data.code === 'csrf' &&
    method !== 'GET' &&
    refreshSession
  ) {
    const auth = await requestApi<{ csrfToken: string; user: { id: string } }>(
      'auth/session',
      csrfToken,
    );
    if (expectedUserId && auth.user.id !== expectedUserId)
      throw new ClientError(
        'กรุณาเข้าสู่ระบบด้วยบัญชีเดิมก่อนบันทึก ข้อความของคุณยังอยู่',
        'account_changed',
        401,
      );
    return requestApi<T>(
      path,
      auth.csrfToken,
      method,
      body,
      false,
      expectedUserId,
    );
  }
  if (!response.ok)
    throw new ClientError(
      typeof data.error === 'string' ? data.error : 'เกิดข้อผิดพลาด',
      typeof data.code === 'string' ? data.code : 'error',
      response.status,
      typeof data.existingId === 'string' ? data.existingId : undefined,
    );
  return data as T;
}
export type SaveInput = ReportContent & {
  id?: string;
  weekStart: string;
  version?: number;
  status: 'draft' | 'submitted';
};
export async function saveReport(
  csrfToken: string,
  input: SaveInput,
  expectedUserId?: string,
) {
  const { id, version, ...rest } = input;
  const path = id
    ? 'reports/' +
      encodeURIComponent(id) +
      (rest.status === 'submitted' ? '/submit' : '')
    : 'reports';
  const method = id && rest.status === 'draft' ? 'PATCH' : 'POST';
  const result = await requestApi<{ report: Report }>(
    path,
    csrfToken,
    method,
    {
      ...rest,
      id: id || crypto.randomUUID(),
      ...(version === undefined ? {} : { version }),
    },
    true,
    expectedUserId,
  );
  return result.report;
}
