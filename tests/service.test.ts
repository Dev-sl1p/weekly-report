import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from './database';
import { Database } from '../db/database';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import {
  handleApi,
  hash,
  configured,
  type Runtime,
} from '../lib/server/service';
import { verifyGoogle, type GoogleIdentity } from '../lib/server/google';
import {
  blankContent,
  bangkokDate,
  weekStart,
  weekLabel,
  type Report,
} from '../lib/reports';
const admin: GoogleIdentity = {
  sub: 'google-admin',
  email: 'owner@gmail.com',
  name: 'ผู้ดูแล',
};
const alice: GoogleIdentity = {
  sub: 'google-alice',
  email: 'alice@gmail.com',
  name: 'อลิซ',
};
const bob: GoogleIdentity = {
  sub: 'google-bob',
  email: 'bob@company.com',
  name: 'บ็อบ',
};
const origin = 'https://reports.example.com';
type Session = { cookie: string; csrfToken: string };
function runtime(db: Database): Runtime & { DB: Database } {
  return {
    DB: db,
    GOOGLE_CLIENT_ID: 'client.apps.googleusercontent.com',
    ADMIN_EMAIL: admin.email,
    APP_ORIGIN: origin,
  };
}
async function call(
  env: Runtime,
  path: string,
  method = 'GET',
  data?: unknown,
  auth?: Session,
  extraHeaders: Record<string, string> = {},
) {
  return handleApi(
    new Request(origin + '/api/' + path, {
      method,
      headers: {
        ...(auth
          ? { cookie: auth.cookie, 'x-csrf-token': auth.csrfToken }
          : {}),
        ...(method !== 'GET'
          ? { 'content-type': 'application/json', origin }
          : {}),
        ...extraHeaders,
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    }),
    env,
  );
}
async function login(env: Runtime, identity: GoogleIdentity) {
  const challenge = await call(env, 'auth/challenge');
  assert.equal(challenge.status, 200);
  const data = (await challenge.json()) as { csrfToken: string; nonce: string };
  const req = new Request(origin + '/api/auth/google', {
    method: 'POST',
    headers: {
      origin,
      'content-type': 'application/json',
      cookie: challenge.headers.get('set-cookie')!.split(';')[0],
    },
    body: JSON.stringify({
      credential: 'test-credential',
      csrfToken: data.csrfToken,
    }),
  });
  const response = await handleApi(
    req,
    env,
    async (_credential, _client, nonce) => {
      assert.equal(nonce, data.nonce);
      return identity;
    },
  );
  return response;
}
async function authorize(env: Runtime, identity: GoogleIdentity) {
  const response = await login(env, identity);
  assert.equal(response.status, 200, await response.clone().text());
  const cookie = response.headers
    .getSetCookie()
    .find((c) => c.startsWith('wr_session='))!
    .split(';')[0];
  const me = await handleApi(
    new Request(origin + '/api/auth/session', { headers: { cookie } }),
    env,
  );
  const auth = (await me.json()) as { csrfToken: string };
  return { cookie, csrfToken: auth.csrfToken };
}
async function team(db: Database) {
  const env = runtime(db),
    owner = await authorize(env, admin);
  assert.equal(
    (await call(env, 'members', 'POST', { email: alice.email }, owner)).status,
    201,
  );
  assert.equal(
    (await call(env, 'members', 'POST', { email: bob.email }, owner)).status,
    201,
  );
  return {
    env,
    owner,
    a: await authorize(env, alice),
    b: await authorize(env, bob),
  };
}
function draft(extra: Record<string, unknown> = {}) {
  return {
    ...blankContent,
    id: crypto.randomUUID(),
    weekStart: '2026-09-07',
    status: 'draft',
    completed: 'ทำงานเสร็จแล้ว',
    ...extra,
  };
}
async function create(
  env: Runtime,
  auth: Session,
  input = draft(),
): Promise<Report> {
  const response = await call(env, 'reports', 'POST', input, auth);
  assert.ok(
    [200, 201].includes(response.status),
    await response.clone().text(),
  );
  return ((await response.json()) as { report: Report }).report;
}
test('fails closed without config and rejects anonymous access', async () => {
  const { db, sql } = await database();
  try {
    assert.equal(configured({ ...runtime(db), GOOGLE_CLIENT_ID: '' }), false);
    assert.equal(configured({ ...runtime(db), DB: undefined }), false);
    const diagnostics = await call(
      { ...runtime(db), DB: undefined },
      'auth/config',
    );
    const diagnosticsBody = (await diagnostics.json()) as {
      ready: boolean;
      issues: { key: string }[];
    };
    assert.equal(diagnosticsBody.ready, false);
    assert.deepEqual(
      diagnosticsBody.issues.map((issue) => issue.key),
      ['DATABASE_URL'],
    );
    assert.ok(!JSON.stringify(diagnosticsBody).includes(admin.email));
    assert.equal(
      (await call({ ...runtime(db), DB: undefined }, 'reports')).status,
      503,
    );
    assert.equal(
      (await call({ ...runtime(db), ADMIN_EMAIL: '' }, 'auth/challenge'))
        .status,
      503,
    );
    assert.equal((await call(runtime(db), 'reports')).status, 401);
    assert.equal(
      (await call(runtime(db), 'reports', 'POST', draft())).status,
      401,
    );
  } finally {
    await sql.close();
  }
});

test('login initialization reports migration failures without disclosing database details', async (t) => {
  t.mock.method(console, 'error', () => {});
  const failure = Object.assign(new Error('sensitive database detail'), {
    code: '42P01',
  });
  const broken = new Database(
    async () => {
      throw failure;
    },
    async () => {
      throw failure;
    },
  );
  const response = await call(runtime(broken), 'auth/challenge');
  assert.equal(response.status, 503);
  const data = (await response.json()) as { error: string; code: string };
  assert.equal(data.code, 'database_migration_required');
  assert.ok(!JSON.stringify(data).includes('sensitive database detail'));
  assert.equal(response.headers.has('set-cookie'), false);
});
test('Google allowlist, administrator bootstrap, secure cookie and session logout', async () => {
  const { db, sql } = await database();
  try {
    const env = {
      ...runtime(db),
      APP_ORIGIN: origin + '/ ',
      ADMIN_EMAIL: ' Owner@Gmail.com ',
      GOOGLE_CLIENT_ID: ' client.apps.googleusercontent.com\n',
    };
    assert.equal((await login(env, alice)).status, 403);
    const response = await login(env, admin);
    assert.equal(response.status, 200);
    const header = response.headers
      .getSetCookie()
      .find((x) => x.startsWith('wr_session='))!;
    assert.match(header, /HttpOnly/);
    assert.match(header, /Secure/);
    assert.match(header, /SameSite=Lax/);
    assert.match(header, /Max-Age=604800/);
    const owner = await authorize(env, admin);
    assert.equal(
      (await call(env, 'auth/logout', 'POST', {}, owner)).status,
      200,
    );
    assert.equal(
      (await call(env, 'reports', 'GET', undefined, owner)).status,
      401,
    );
  } finally {
    await sql.close();
  }
});
test('login requires matching CSRF, allowed origin, one-use unexpired challenge and Google verification', async () => {
  const { db, sql } = await database();
  try {
    const env = runtime(db),
      challenge = await call(env, 'auth/challenge'),
      data = (await challenge.json()) as { csrfToken: string };
    const cookie = challenge.headers.get('set-cookie')!.split(';')[0];
    const request = (csrf = data.csrfToken, site = origin) =>
      new Request(origin + '/api/auth/google', {
        method: 'POST',
        headers: { origin: site, 'content-type': 'application/json', cookie },
        body: JSON.stringify({ credential: 'bad', csrfToken: csrf }),
      });
    assert.equal(
      (await handleApi(request('bad'), env, async () => admin)).status,
      403,
    );
    assert.equal(
      (
        await handleApi(
          request(data.csrfToken, 'https://evil.example'),
          env,
          async () => admin,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await handleApi(request(), env, async () => {
          throw Error('invalid token');
        })
      ).status,
      401,
    );
    assert.equal(
      (await handleApi(request(), env, async () => admin)).status,
      401,
    );
    const another = await call(env, 'auth/challenge'),
      body = (await another.json()) as { csrfToken: string };
    await sql.exec('UPDATE weekly_report.login_challenges SET expires_at=0');
    const expired = new Request(origin + '/api/auth/google', {
      method: 'POST',
      headers: {
        origin,
        'content-type': 'application/json',
        cookie: another.headers.get('set-cookie')!.split(';')[0],
      },
      body: JSON.stringify({ credential: 'test', csrfToken: body.csrfToken }),
    });
    assert.equal(
      (await handleApi(expired, env, async () => admin)).status,
      401,
    );
  } finally {
    await sql.close();
  }
});
test('drafts never leak via team lists, counts, authors or direct links, including to admin', async () => {
  const { db, sql } = await database();
  try {
    const { env, owner, a, b } = await team(db),
      r = await create(env, a);
    for (const viewer of [owner, b]) {
      const list = await call(env, 'reports', 'GET', undefined, viewer);
      assert.deepEqual(
        ((await list.json()) as { reports: Report[] }).reports,
        [],
      );
      assert.equal(
        (await call(env, 'reports/' + r.id, 'GET', undefined, viewer)).status,
        404,
      );
      const authors = await call(env, 'authors', 'GET', undefined, viewer);
      assert.deepEqual(
        ((await authors.json()) as { authors: unknown[] }).authors,
        [],
      );
    }
    const mine = await call(env, 'reports?scope=mine', 'GET', undefined, a);
    assert.equal(((await mine.json()) as { total: number }).total, 1);
  } finally {
    await sql.close();
  }
});
test('submission exposes saved content, other users cannot edit, owner can revise without losing submission', async () => {
  const { db, sql } = await database();
  try {
    const { env, a, b, owner } = await team(db),
      r = await create(env, a);
    let response = await call(
      env,
      'reports/' + r.id + '/submit',
      'POST',
      { ...r, completed: 'พร้อมส่ง', version: r.version },
      a,
    );
    assert.equal(response.status, 200);
    const submitted = ((await response.json()) as { report: Report }).report;
    assert.equal(submitted.status, 'submitted');
    assert.ok(submitted.submittedAt);
    for (const viewer of [b, owner]) {
      assert.equal(
        (await call(env, 'reports/' + r.id, 'GET', undefined, viewer)).status,
        200,
      );
      assert.equal(
        (
          await call(
            env,
            'reports/' + r.id,
            'PATCH',
            { ...submitted, completed: 'แอบแก้' },
            viewer,
          )
        ).status,
        403,
      );
    }
    response = await call(
      env,
      'reports/' + r.id + '/submit',
      'POST',
      { ...submitted, completed: 'แก้ล่าสุด' },
      a,
    );
    const revised = ((await response.json()) as { report: Report }).report;
    assert.equal(revised.completed, 'แก้ล่าสุด');
    assert.equal(revised.submittedAt, submitted.submittedAt);
    assert.equal(revised.version, 3);
    assert.equal(
      (
        await call(
          env,
          'reports/' + r.id,
          'PATCH',
          { ...revised, status: 'draft' },
          a,
        )
      ).status,
      400,
    );
  } finally {
    await sql.close();
  }
});
test('one report per person/week, duplicate sends are idempotent, weeks and authors remain independent', async () => {
  const { db, sql } = await database();
  try {
    const { env, a, b } = await team(db),
      input = draft(),
      r = await create(env, a, input);
    const retry = await create(env, a, input);
    assert.equal(retry.id, r.id);
    assert.equal(retry.version, 1);
    assert.equal(
      (await call(env, 'reports', 'POST', draft({ completed: 'different' }), a))
        .status,
      409,
    );
    assert.equal((await call(env, 'reports', 'POST', draft(), b)).status, 201);
    assert.equal(
      (
        await call(
          env,
          'reports',
          'POST',
          draft({ weekStart: '2026-08-31' }),
          a,
        )
      ).status,
      201,
    );
  } finally {
    await sql.close();
  }
});
test('concurrent different edits accept one and reject stale overwrite; exact retried save is idempotent', async () => {
  const { db, sql } = await database();
  try {
    const { env, a } = await team(db),
      r = await create(env, a);
    const results = await Promise.all([
      call(env, 'reports/' + r.id, 'PATCH', { ...r, completed: 'first' }, a),
      call(env, 'reports/' + r.id, 'PATCH', { ...r, completed: 'second' }, a),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    const successful = results.find((r) => r.status === 200)!;
    const saved = ((await successful.json()) as { report: Report }).report;
    const retry = await call(
      env,
      'reports/' + r.id,
      'PATCH',
      { ...r, completed: saved.completed },
      a,
    );
    assert.equal(retry.status, 200);
    assert.equal(
      ((await retry.json()) as { report: Report }).report.version,
      2,
    );
  } finally {
    await sql.close();
  }
});
test('membership removal invalidates every existing session, keeps reports and restored access does not revive old sessions', async () => {
  const { db, sql } = await database();
  try {
    const { env, a, owner, b } = await team(db),
      a2 = await authorize(env, alice),
      r = await create(env, a, draft({ status: 'submitted' }));
    const members = await call(env, 'members', 'GET', undefined, owner);
    const member = (
      (await members.json()) as { members: { id: string; email: string }[] }
    ).members.find((m) => m.email === alice.email)!;
    assert.equal(
      (await call(env, 'members/' + member.id, 'DELETE', undefined, owner))
        .status,
      200,
    );
    for (const stale of [a, a2])
      assert.equal(
        (await call(env, 'reports', 'GET', undefined, stale)).status,
        401,
      );
    assert.equal((await login(env, alice)).status, 403);
    assert.equal(
      (await call(env, 'reports/' + r.id, 'GET', undefined, b)).status,
      200,
    );
    await call(env, 'members', 'POST', { email: alice.email }, owner);
    assert.equal((await call(env, 'reports', 'GET', undefined, a)).status, 401);
    assert.equal((await login(env, alice)).status, 200);
  } finally {
    await sql.close();
  }
});
test('only administrator manages members and administrator cannot be removed', async () => {
  const { db, sql } = await database();
  try {
    const { env, a, owner } = await team(db);
    for (const [method, data] of [
      ['GET', undefined],
      ['POST', { email: 'x@gmail.com' }],
      ['DELETE', undefined],
    ] as const) {
      assert.equal(
        (
          await call(
            env,
            method === 'DELETE' ? 'members/anything' : 'members',
            method,
            data,
            a,
          )
        ).status,
        403,
      );
    }
    const rows = await call(env, 'members', 'GET', undefined, owner);
    const adminRow = (
      (await rows.json()) as { members: { id: string; role: string }[] }
    ).members.find((m) => m.role === 'admin')!;
    assert.equal(
      (await call(env, 'members/' + adminRow.id, 'DELETE', undefined, owner))
        .status,
      400,
    );
  } finally {
    await sql.close();
  }
});
test('server rejects forged ownership, CSRF, invalid weeks, blank submission and oversized content', async () => {
  const { db, sql } = await database();
  try {
    const { env, a } = await team(db);
    assert.equal(
      (
        await call(env, 'reports', 'POST', draft(), a, {
          'x-csrf-token': 'bad',
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await call(env, 'reports', 'POST', draft(), a, {
          origin: 'https://evil.example',
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await call(
          env,
          'reports',
          'POST',
          draft({ weekStart: '2026-09-08' }),
          a,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          env,
          'reports',
          'POST',
          draft({ weekStart: '2026-02-30' }),
          a,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          env,
          'reports',
          'POST',
          draft({ status: 'submitted', completed: '  ' }),
          a,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          env,
          'reports',
          'POST',
          draft({ completed: 'x'.repeat(12001) }),
          a,
        )
      ).status,
      400,
    );
    const r = await create(env, a, draft({ authorId: admin.sub }));
    assert.equal(r.authorId, alice.sub);
  } finally {
    await sql.close();
  }
});
test('archive filters sort by week, paginate and do not include drafts', async () => {
  const { db, sql } = await database();
  try {
    const { env, a, b } = await team(db);
    for (let n = 0; n < 22; n++) {
      const date = new Date('2026-01-05T00:00:00Z');
      date.setUTCDate(date.getUTCDate() + 7 * n);
      await create(
        env,
        a,
        draft({
          weekStart: date.toISOString().slice(0, 10),
          status: 'submitted',
        }),
      );
    }
    await create(env, b, draft({ status: 'submitted' }));
    await create(env, a, draft({ weekStart: '2026-10-05' }));
    const list = await call(env, 'reports', 'GET', undefined, b),
      payload = (await list.json()) as { reports: Report[]; total: number };
    assert.equal(payload.total, 23);
    assert.equal(payload.reports.length, 20);
    assert.equal(payload.reports[0].authorId, bob.sub);
    const second = await call(env, 'reports?page=2', 'GET', undefined, b);
    assert.equal(
      ((await second.json()) as { reports: Report[] }).reports.length,
      3,
    );
    const filtered = await call(
      env,
      'reports?week=2026-01-05&author=' + alice.sub,
      'GET',
      undefined,
      b,
    );
    assert.equal(((await filtered.json()) as { total: number }).total, 1);
    const injection = await call(
      env,
      'reports?author=' + encodeURIComponent("' OR 1=1 --"),
      'GET',
      undefined,
      b,
    );
    assert.equal(((await injection.json()) as { total: number }).total, 0);
  } finally {
    await sql.close();
  }
});
test('records and sessions survive closing and reopening the database', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weekly-report-test-')),
    path = join(dir, 'postgres');
  let opened = await database(path);
  try {
    const { env, a } = await team(opened.db),
      r = await create(env, a);
    await opened.sql.close();
    opened = await database(path, false);
    const restored = await call(
      runtime(opened.db),
      'reports/' + r.id,
      'GET',
      undefined,
      a,
    );
    assert.equal(restored.status, 200);
    assert.equal(
      ((await restored.json()) as { report: Report }).report.completed,
      r.completed,
    );
  } finally {
    await opened.sql.close();
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
    assert.ok(basename(dir).startsWith('weekly-report-test-'));
    rmSync(dir, { recursive: true, force: true });
  }
});
test('expired sessions are rejected', async () => {
  const { db, sql } = await database();
  try {
    const { env, a } = await team(db);
    await db
      .prepare(
        'UPDATE weekly_report.sessions SET expires_at=0 WHERE token_hash=$1',
      )
      .bind(await hash(a.cookie.split('=')[1]))
      .run();
    assert.equal((await call(env, 'reports', 'GET', undefined, a)).status, 401);
  } finally {
    await sql.close();
  }
});
test('Thai timezone week boundaries and year crossing', () => {
  assert.equal(bangkokDate(new Date('2026-09-06T17:00:00Z')), '2026-09-07');
  assert.equal(
    weekStart(bangkokDate(new Date('2026-09-06T16:59:59Z'))),
    '2026-08-31',
  );
  assert.equal(weekStart('2027-01-01'), '2026-12-28');
  assert.equal(weekStart('2024-02-29'), '2024-02-26');
  assert.throws(() => weekStart('2026-02-30'));
  assert.match(weekLabel('2026-12-28'), /2569/);
  assert.match(weekLabel('2026-12-28'), /2570/);
});
test('real JWT signature verification checks issuer, audience, expiry, nonce, verified email and Google authority', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256'),
    jwk = await exportJWK(publicKey),
    keys = createLocalJWKSet({ keys: [{ ...jwk, kid: 'test', alg: 'RS256' }] });
  const clientId = 'client.apps.googleusercontent.com',
    nonce = 'nonce';
  async function sign(overrides: Record<string, unknown> = {}) {
    return new SignJWT({
      sub: '123',
      email: 'alice@gmail.com',
      email_verified: true,
      nonce,
      name: 'Alice',
      iss: 'https://accounts.google.com',
      aud: clientId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300,
      ...overrides,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .sign(privateKey);
  }
  assert.equal(
    (await verifyGoogle(await sign(), clientId, nonce, keys)).sub,
    '123',
  );
  assert.equal(
    (
      await verifyGoogle(
        await sign({ email: 'bob@company.com', hd: 'company.com' }),
        clientId,
        nonce,
        keys,
      )
    ).email,
    'bob@company.com',
  );
  for (const fields of [
    { iss: 'https://evil.example' },
    { aud: 'wrong' },
    { exp: 1 },
    { nonce: 'wrong' },
    { email_verified: false },
    { email: 'thirdparty@example.com' },
    { sub: '' },
  ])
    await assert.rejects(() =>
      sign(fields).then((token) => verifyGoogle(token, clientId, nonce, keys)),
    );
  const signed = await sign();
  await assert.rejects(() =>
    verifyGoogle(signed.slice(0, -12) + 'aaaaaaaaaaaa', clientId, nonce, keys),
  );
});
