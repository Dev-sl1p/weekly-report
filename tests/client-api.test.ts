import test from 'node:test';
import assert from 'node:assert/strict';
import { requestApi, ClientError } from '../lib/client-api';
test('retry after signing in again preserves the submitted payload and uses the refreshed CSRF token', async (t) => {
  const bodies: string[] = [];
  let calls = 0;
  t.mock.method(
    globalThis,
    'fetch',
    async (path: string, options: RequestInit) => {
      calls++;
      if (path === '/api/auth/session')
        return Response.json({ csrfToken: 'new-token', user: { id: 'alice' } });
      bodies.push(options.body as string);
      if (
        (options.headers as Record<string, string>)['X-CSRF-Token'] ===
        'old-token'
      )
        return Response.json(
          { error: 'expired', code: 'csrf' },
          { status: 403 },
        );
      return Response.json({ ok: true });
    },
  );
  const payload = { completed: 'ข้อความที่ยังไม่หาย', version: 2 };
  assert.deepEqual(
    await requestApi('reports/1', 'old-token', 'PATCH', payload, true, 'alice'),
    { ok: true },
  );
  assert.equal(calls, 3);
  assert.equal(bodies[0], bodies[1]);
});
test('a different account in another tab cannot silently submit the old account draft', async (t) => {
  let writes = 0;
  t.mock.method(globalThis, 'fetch', async (path: string) => {
    if (path === '/api/auth/session')
      return Response.json({ csrfToken: 'new-token', user: { id: 'bob' } });
    writes++;
    return Response.json({ error: 'expired', code: 'csrf' }, { status: 403 });
  });
  await assert.rejects(
    () =>
      requestApi(
        'reports',
        'old-token',
        'POST',
        { completed: 'Alice draft' },
        true,
        'alice',
      ),
    (e: unknown) => e instanceof ClientError && e.code === 'account_changed',
  );
  assert.equal(writes, 1);
});
test('CSRF recovery retries at most once and does not loop', async (t) => {
  let writes = 0;
  t.mock.method(globalThis, 'fetch', async (path: string) => {
    if (path === '/api/auth/session')
      return Response.json({ csrfToken: 'new-token', user: { id: 'alice' } });
    writes++;
    return Response.json(
      { error: 'bad origin', code: 'csrf' },
      { status: 403 },
    );
  });
  await assert.rejects(
    () => requestApi('reports', 'old-token', 'POST', {}, true, 'alice'),
    ClientError,
  );
  assert.equal(writes, 2);
});
