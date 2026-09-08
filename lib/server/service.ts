import {
  sections,
  weekStart,
  type Report,
  type ReportContent,
  type User,
  type Member,
} from '../reports';
import { verifyGoogle, type GoogleIdentity } from './google';
import type { Database } from '../../db/database';
export type Runtime = {
  DB?: Database;
  GOOGLE_CLIENT_ID?: string;
  ADMIN_EMAIL?: string;
  APP_ORIGIN?: string;
};
type Verify = (
  credential: string,
  clientId: string,
  nonce: string,
) => Promise<GoogleIdentity>;
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'error',
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}
function fail(
  status: number,
  message: string,
  code = 'error',
  details: Record<string, unknown> = {},
): never {
  throw new ApiError(status, message, code, details);
}
const now = () => new Date().toISOString();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function configured(env: Runtime): env is Runtime & { DB: Database } {
  try {
    const u = new URL(env.APP_ORIGIN || '');
    return Boolean(
      env.DB &&
      env.GOOGLE_CLIENT_ID?.endsWith('.apps.googleusercontent.com') &&
      env.ADMIN_EMAIL &&
      emailPattern.test(env.ADMIN_EMAIL) &&
      (u.protocol === 'https:' ||
        (u.protocol === 'http:' &&
          ['localhost', '127.0.0.1'].includes(u.hostname))) &&
      u.origin === env.APP_ORIGIN,
    );
  } catch {
    return false;
  }
}
function requireConfig(
  env: Runtime,
): asserts env is Runtime & { DB: Database } {
  if (!configured(env))
    fail(503, 'ยังไม่พร้อมเข้าสู่ระบบ กรุณาติดต่อผู้ดูแล', 'setup_required');
}
export function parseCookie(request: Request, name: string): string {
  const matches = (request.headers.get('cookie') || '')
    .split(';')
    .map((x) => x.trim())
    .filter((x) => x.startsWith(name + '='));
  return matches.length === 1 ? matches[0].slice(name.length + 1) : '';
}
export async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
function token() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
function cookie(name: string, value: string, maxAge: number, env: Runtime) {
  return (
    name +
    '=' +
    value +
    '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' +
    maxAge +
    (env.APP_ORIGIN?.startsWith('https:') ? '; Secure' : '')
  );
}
const json = (
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
export async function session(
  request: Request,
  env: Runtime,
): Promise<{ user: User; csrfToken: string } | null> {
  if (!configured(env)) return null;
  const raw = parseCookie(request, 'wr_session');
  if (!/^[a-f0-9]{64}$/.test(raw)) return null;
  const row = await env.DB.prepare(
    'SELECT u.id,u.email,u.name,m.role,s.csrf_token AS "csrfToken" FROM weekly_report.sessions s JOIN weekly_report.users u ON u.id=s.user_id JOIN weekly_report.members m ON m.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>$2 AND m.active=1',
  )
    .bind(await hash(raw), Date.now())
    .first<User & { csrfToken: string }>();
  if (!row) return null;
  const { csrfToken, ...user } = row;
  return { user, csrfToken };
}
function checkOrigin(request: Request, env: Runtime) {
  if (
    request.headers.get('origin') !== env.APP_ORIGIN ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    fail(403, 'คำขอไม่ถูกต้อง กรุณาเปิดเว็บใหม่', 'csrf');
}
async function body(request: Request): Promise<Record<string, unknown>> {
  if (
    request.headers.get('content-type')?.split(';')[0].trim() !==
    'application/json'
  )
    fail(415, 'ต้องส่งข้อมูลแบบ JSON');
  const limit = 256000;
  if (Number(request.headers.get('content-length')) > limit)
    fail(413, 'รายงานยาวเกินไป');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'ข้อมูลไม่ถูกต้อง');
  const decoder = new TextDecoder();
  let raw = '',
    bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > limit) {
      await reader.cancel();
      fail(413, 'รายงานยาวเกินไป');
    }
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw Error();
    return parsed;
  } catch {
    return fail(400, 'ข้อมูลไม่ถูกต้อง');
  }
}
function content(input: Record<string, unknown>): ReportContent {
  return Object.fromEntries(
    sections.map(({ key }) => {
      const v = input[key];
      if (typeof v !== 'string' || v.length > 12000)
        fail(400, 'แต่ละหัวข้อกรอกได้ไม่เกิน 12,000 ตัวอักษร', 'validation');
      return [key, (v as string).trim()];
    }),
  ) as ReportContent;
}
function canonicalWeek(value: unknown): string {
  try {
    if (typeof value !== 'string' || weekStart(value) !== value) throw Error();
    return value;
  } catch {
    return fail(400, 'กรุณาเลือกสัปดาห์ที่ถูกต้อง', 'validation');
  }
}
const selectReport =
  'SELECT r.id,r.author_id AS "authorId",u.name AS "authorName",u.email AS "authorEmail",r.week_start::text AS "weekStart",r.completed,r.in_progress AS "inProgress",r.blockers,r.next_week AS "nextWeek",r.status,r.version,r.created_at AS "createdAt",r.updated_at AS "updatedAt",r.submitted_at AS "submittedAt" FROM weekly_report.reports r JOIN weekly_report.users u ON u.id=r.author_id';
async function reportById(
  env: Runtime & { DB: Database },
  id: string,
  user: User,
) {
  const row = await env.DB.prepare(
    selectReport +
      " WHERE r.id=$1 AND (r.status='submitted' OR r.author_id=$2)",
  )
    .bind(id, user.id)
    .first<Report>();
  if (!row) return fail(404, 'ไม่พบรายงานนี้', 'not_found');
  return row;
}
function sameContent(report: Report, c: ReportContent, status: string) {
  return (
    report.status === status &&
    sections.every(({ key }) => report[key] === c[key])
  );
}
async function writeReport(
  request: Request,
  env: Runtime & { DB: Database },
  user: User,
  id?: string,
  submit = false,
) {
  const input = await body(request),
    c = content(input);
  const status = submit ? 'submitted' : input.status;
  if (status !== 'draft' && status !== 'submitted')
    fail(400, 'สถานะรายงานไม่ถูกต้อง', 'validation');
  if (status === 'submitted' && sections.every(({ key }) => !c[key]))
    fail(400, 'กรอกเนื้อหาอย่างน้อยหนึ่งหัวข้อก่อนส่ง', 'validation');
  const timestamp = now();
  if (!id) {
    const week = canonicalWeek(input.weekStart),
      reportId = input.id;
    if (typeof reportId !== 'string' || !/^[a-f0-9-]{36}$/.test(reportId))
      fail(400, 'รหัสรายงานไม่ถูกต้อง');
    const inserted = await env.DB.prepare(
      'INSERT INTO weekly_report.reports (id,author_id,week_start,completed,in_progress,blockers,next_week,status,version,created_at,updated_at,submitted_at) SELECT $1,$2,$3,$4,$5,$6,$7,$8,1,$9,$10,$11 WHERE EXISTS(SELECT 1 FROM weekly_report.members WHERE user_id=$12 AND active=1) ON CONFLICT DO NOTHING RETURNING id',
    )
      .bind(
        reportId,
        user.id,
        week,
        c.completed,
        c.inProgress,
        c.blockers,
        c.nextWeek,
        status,
        timestamp,
        timestamp,
        status === 'submitted' ? timestamp : null,
        user.id,
      )
      .first<{ id: string }>();
    if (inserted)
      return json({ report: await reportById(env, inserted.id, user) }, 201);
    const existing = await env.DB.prepare(
      selectReport + ' WHERE r.author_id=$1 AND r.week_start=$2',
    )
      .bind(user.id, week)
      .first<Report>();
    if (existing && sameContent(existing, c, status as string))
      return json({ report: existing });
    return fail(
      409,
      'คุณมีรายงานของสัปดาห์นี้แล้ว กรุณาเปิดรายงานเดิม',
      'duplicate_week',
      { existingId: existing?.id },
    );
  }
  const existing = await reportById(env, id, user);
  if (existing.authorId !== user.id)
    fail(403, 'แก้ไขได้เฉพาะรายงานของตัวเอง', 'forbidden');
  if (input.weekStart !== undefined && input.weekStart !== existing.weekStart)
    fail(400, 'เปลี่ยนสัปดาห์ของรายงานที่บันทึกแล้วไม่ได้');
  if (!Number.isInteger(input.version) || Number(input.version) < 1)
    fail(400, 'เวอร์ชันรายงานไม่ถูกต้อง');
  if (existing.status === 'submitted' && status === 'draft')
    fail(400, 'รายงานที่ส่งแล้วไม่สามารถเปลี่ยนเป็นฉบับร่าง');
  if (existing.version !== input.version) {
    if (
      existing.version === Number(input.version) + 1 &&
      sameContent(existing, c, status as string)
    )
      return json({ report: existing });
    return fail(
      409,
      'รายงานถูกแก้ไขจากอีกหน้าต่าง กรุณาโหลดฉบับล่าสุดก่อนบันทึก',
      'version_conflict',
    );
  }
  const updated = await env.DB.prepare(
    'UPDATE weekly_report.reports SET completed=$1,in_progress=$2,blockers=$3,next_week=$4,status=$5,version=version+1,updated_at=$6,submitted_at=COALESCE(submitted_at,$7) WHERE id=$8 AND author_id=$9 AND version=$10 AND EXISTS(SELECT 1 FROM weekly_report.members WHERE user_id=$11 AND active=1) RETURNING id',
  )
    .bind(
      c.completed,
      c.inProgress,
      c.blockers,
      c.nextWeek,
      status,
      timestamp,
      status === 'submitted' ? timestamp : null,
      id,
      user.id,
      input.version,
      user.id,
    )
    .first<{ id: string }>();
  if (!updated)
    fail(409, 'ข้อมูลหรือสิทธิ์เปลี่ยนแปลง กรุณาโหลดใหม่', 'version_conflict');
  return json({ report: await reportById(env, id, user) });
}
export async function handleApi(
  request: Request,
  env: Runtime,
  verify: Verify = verifyGoogle,
): Promise<Response> {
  try {
    const url = new URL(request.url),
      path = url.pathname.replace(/^\/api\//, '').replace(/\/$/, ''),
      method = request.method;
    if (path === 'auth/config' && method === 'GET')
      return json({ ready: configured(env) });
    requireConfig(env);
    if (path === 'auth/challenge' && method === 'GET') {
      const raw = token(),
        nonce = token(),
        expires = Date.now() + 10 * 60 * 1000;
      await env.DB.batch([
        env.DB.prepare(
          'DELETE FROM weekly_report.login_challenges WHERE expires_at<$1',
        ).bind(Date.now()),
        env.DB.prepare(
          'INSERT INTO weekly_report.login_challenges (token_hash,nonce,expires_at) VALUES ($1,$2,$3)',
        ).bind(await hash(raw), nonce, expires),
      ]);
      return json(
        { clientId: env.GOOGLE_CLIENT_ID, csrfToken: raw, nonce },
        200,
        { 'Set-Cookie': cookie('wr_login', raw, 600, env) },
      );
    }
    if (path === 'auth/google' && method === 'POST') {
      checkOrigin(request, env);
      const input = await body(request),
        raw = parseCookie(request, 'wr_login');
      if (
        !raw ||
        input.csrfToken !== raw ||
        typeof input.credential !== 'string' ||
        input.credential.length > 16000
      )
        fail(403, 'การเข้าสู่ระบบหมดอายุ กรุณาลองใหม่', 'csrf');
      const challenge = await env.DB.prepare(
        'DELETE FROM weekly_report.login_challenges WHERE token_hash=$1 AND expires_at>$2 RETURNING nonce',
      )
        .bind(await hash(raw), Date.now())
        .first<{ nonce: string }>();
      if (!challenge) fail(401, 'การเข้าสู่ระบบหมดอายุ กรุณาลองใหม่');
      let identity: GoogleIdentity;
      try {
        identity = await verify(
          input.credential as string,
          env.GOOGLE_CLIENT_ID!,
          challenge.nonce,
        );
      } catch {
        return fail(
          401,
          'ยืนยันบัญชี Google ไม่สำเร็จ กรุณาใช้ Gmail หรือ Google Workspace',
          'invalid_identity',
        );
      }
      const email = identity.email.toLowerCase();
      if (email === env.ADMIN_EMAIL!.trim().toLowerCase()) {
        await env.DB.prepare(
          "INSERT INTO weekly_report.members (id,email,role,active,created_at) VALUES ($1,$2,'admin',1,$3) ON CONFLICT(email) DO NOTHING",
        )
          .bind(crypto.randomUUID(), email, now())
          .run();
      }
      const member = await env.DB.prepare(
        'SELECT id,email,user_id AS "userId",role,active FROM weekly_report.members WHERE user_id=$1 OR email=$2 ORDER BY CASE WHEN user_id=$3 THEN 0 ELSE 1 END LIMIT 1',
      )
        .bind(identity.sub, email, identity.sub)
        .first<Member>();
      if (
        !member ||
        member.active !== 1 ||
        (member.userId && member.userId !== identity.sub)
      )
        fail(403, 'บัญชีนี้ยังไม่ได้รับสิทธิ์ กรุณาติดต่อผู้ดูแลทีม', 'not_member');
      const sessionToken = token(),
        csrfToken = token();
      await env.DB.batch([
        env.DB.prepare(
          'INSERT INTO weekly_report.users (id,email,name,created_at) VALUES ($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name',
        ).bind(identity.sub, email, identity.name, now()),
        env.DB.prepare(
          'UPDATE weekly_report.members SET user_id=$1 WHERE id=$2 AND active=1 AND (user_id IS NULL OR user_id=$3)',
        ).bind(identity.sub, member.id, identity.sub),
        env.DB.prepare(
          'INSERT INTO weekly_report.sessions (token_hash,user_id,csrf_token,expires_at) SELECT $1,$2,$3,$4 WHERE EXISTS(SELECT 1 FROM weekly_report.members WHERE id=$5 AND active=1 AND user_id=$6)',
        ).bind(
          await hash(sessionToken),
          identity.sub,
          csrfToken,
          Date.now() + 7 * 86400000,
          member.id,
          identity.sub,
        ),
        env.DB.prepare(
          'DELETE FROM weekly_report.sessions WHERE expires_at<$1',
        ).bind(Date.now()),
      ]);
      const response = json({ ok: true }, 200, {
        'Set-Cookie': cookie('wr_session', sessionToken, 7 * 86400, env),
      });
      response.headers.append('Set-Cookie', cookie('wr_login', '', 0, env));
      return response;
    }
    const auth = await session(request, env);
    if (!auth) return fail(401, 'กรุณาเข้าสู่ระบบอีกครั้ง', 'unauthenticated');
    if (method !== 'GET' && method !== 'HEAD') {
      checkOrigin(request, env);
      if (request.headers.get('x-csrf-token') !== auth.csrfToken)
        fail(403, 'คำขอหมดอายุ กรุณาโหลดหน้าใหม่', 'csrf');
    }
    const user = auth.user;
    if (path === 'auth/session' && method === 'GET') return json(auth);
    if (path === 'auth/logout' && method === 'POST') {
      await env.DB.prepare(
        'DELETE FROM weekly_report.sessions WHERE token_hash=$1',
      )
        .bind(await hash(parseCookie(request, 'wr_session')))
        .run();
      return json({ ok: true }, 200, {
        'Set-Cookie': cookie('wr_session', '', 0, env),
      });
    }
    if (path === 'authors' && method === 'GET') {
      const rows = await env.DB.prepare(
        "SELECT u.id,u.name FROM weekly_report.users u WHERE EXISTS(SELECT 1 FROM weekly_report.reports r WHERE r.author_id=u.id AND r.status='submitted') ORDER BY u.name,u.id",
      ).all();
      return json({ authors: rows.results });
    }
    if (path === 'reports' && method === 'GET') {
      const scope = url.searchParams.get('scope') || 'team';
      if (!['team', 'mine'].includes(scope)) fail(400, 'ตัวกรองไม่ถูกต้อง');
      const clauses = [
          scope === 'mine' ? 'r.author_id=$1' : "r.status='submitted'",
        ],
        values: unknown[] = scope === 'mine' ? [user.id] : [];
      if (url.searchParams.get('week')) {
        clauses.push('r.week_start=$' + (values.length + 1));
        values.push(canonicalWeek(url.searchParams.get('week')));
      }
      if (url.searchParams.get('author')) {
        clauses.push('r.author_id=$' + (values.length + 1));
        values.push(url.searchParams.get('author'));
      }
      const page = Number(url.searchParams.get('page') || 1);
      if (!Number.isSafeInteger(page) || page < 1 || page > 100000)
        fail(400, 'หมายเลขหน้าไม่ถูกต้อง');
      const where = ' WHERE ' + clauses.join(' AND ');
      const results = await env.DB.prepare(
        selectReport +
          where +
          ' ORDER BY r.week_start DESC,r.updated_at DESC,r.id LIMIT 20 OFFSET $' +
          (values.length + 1),
      )
        .bind(...values, (page - 1) * 20)
        .all<Report>();
      const count = await env.DB.prepare(
        'SELECT COUNT(*) AS count FROM weekly_report.reports r' + where,
      )
        .bind(...values)
        .first<{ count: number }>();
      return json({
        reports: results.results,
        total: Number(count?.count || 0),
        page,
        pageSize: 20,
      });
    }
    if (path === 'reports' && method === 'POST')
      return await writeReport(request, env, user);
    const reportMatch = /^reports\/([^/]+)(\/submit)?$/.exec(path);
    if (reportMatch) {
      const id = decodeURIComponent(reportMatch[1]);
      if (method === 'GET' && !reportMatch[2])
        return json({ report: await reportById(env, id, user) });
      if (method === 'PATCH' && !reportMatch[2])
        return await writeReport(request, env, user, id);
      if (method === 'POST' && reportMatch[2])
        return await writeReport(request, env, user, id, true);
    }
    if (path === 'members' || path.startsWith('members/')) {
      if (user.role !== 'admin')
        fail(403, 'เฉพาะผู้ดูแลจัดการสมาชิกได้', 'forbidden');
      if (path === 'members' && method === 'GET') {
        const result = await env.DB.prepare(
          'SELECT m.id,m.email,m.user_id AS "userId",u.name,m.role,m.active,m.created_at AS "createdAt" FROM weekly_report.members m LEFT JOIN weekly_report.users u ON u.id=m.user_id ORDER BY m.active DESC,m.role,m.email',
        ).all<Member>();
        return json({ members: result.results });
      }
      if (path === 'members' && method === 'POST') {
        const input = await body(request);
        const email =
          typeof input.email === 'string'
            ? input.email.trim().toLowerCase()
            : '';
        if (!emailPattern.test(email) || email.length > 254)
          fail(400, 'กรุณากรอกอีเมลที่ถูกต้อง');
        await env.DB.prepare(
          "INSERT INTO weekly_report.members (id,email,role,active,created_at) VALUES ($1,$2,'member',1,$3) ON CONFLICT(email) DO UPDATE SET active=1",
        )
          .bind(crypto.randomUUID(), email, now())
          .run();
        return json({ ok: true }, 201);
      }
      if (method === 'DELETE' && /^members\/[^/]+$/.test(path)) {
        const memberId = decodeURIComponent(path.split('/')[1]);
        const target = await env.DB.prepare(
          'SELECT id,role,user_id AS "userId" FROM weekly_report.members WHERE id=$1',
        )
          .bind(memberId)
          .first<Member>();
        if (!target) fail(404, 'ไม่พบสมาชิก');
        if (target.role === 'admin') fail(400, 'ไม่สามารถนำผู้ดูแลออกจากทีม');
        await env.DB.batch([
          env.DB.prepare(
            'UPDATE weekly_report.members SET active=0 WHERE id=$1',
          ).bind(memberId),
          env.DB.prepare(
            'DELETE FROM weekly_report.sessions WHERE user_id=$1',
          ).bind(target.userId),
        ]);
        return json({ ok: true });
      }
    }
    return fail(404, 'ไม่พบรายการที่ร้องขอ', 'not_found');
  } catch (error) {
    if (error instanceof ApiError)
      return json(
        { error: error.message, code: error.code, ...error.details },
        error.status,
      );
    console.error(
      'Weekly Report request failed',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return json(
      {
        error: 'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง ข้อความที่กรอกยังอยู่',
        code: 'server_error',
      },
      500,
    );
  }
}
