export type Settings = {
  GOOGLE_CLIENT_ID?: string;
  ADMIN_EMAIL?: string;
  APP_ORIGIN?: string;
};

export type SetupIssue = {
  key: 'DATABASE_URL' | 'GOOGLE_CLIENT_ID' | 'ADMIN_EMAIL' | 'APP_ORIGIN';
  reason: 'missing' | 'invalid';
  message: string;
};

// Normalize harmless copy/paste differences once, before both validation and
// CSRF checks. Never infer a trusted origin from request headers.
export function normalizeSettings(settings: Settings): Settings {
  let origin = settings.APP_ORIGIN?.trim();
  if (origin) {
    try {
      const url = new URL(origin);
      if (
        url.pathname === '/' &&
        !url.search &&
        !url.hash &&
        !url.username &&
        !url.password
      )
        origin = url.origin;
    } catch {
      // Preserve invalid input so validation can identify the setting.
    }
  }
  return {
    GOOGLE_CLIENT_ID: settings.GOOGLE_CLIENT_ID?.trim(),
    ADMIN_EMAIL: settings.ADMIN_EMAIL?.trim().toLowerCase(),
    APP_ORIGIN: origin,
  };
}

export function configurationIssues(
  settings: Settings & { DB?: unknown; databaseInvalid?: boolean },
): SetupIssue[] {
  const issues: SetupIssue[] = [];
  if (!settings.DB)
    issues.push({
      key: 'DATABASE_URL',
      reason: settings.databaseInvalid ? 'invalid' : 'missing',
      message: settings.databaseInvalid
        ? 'ต้องเป็น PostgreSQL connection string จาก Supabase'
        : 'ยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูลใน deployment นี้',
    });
  if (!settings.GOOGLE_CLIENT_ID)
    issues.push({
      key: 'GOOGLE_CLIENT_ID',
      reason: 'missing',
      message: 'ยังไม่ได้ตั้ง Google Web application Client ID',
    });
  else if (
    !/^[^\s]+\.apps\.googleusercontent\.com$/.test(settings.GOOGLE_CLIENT_ID)
  )
    issues.push({
      key: 'GOOGLE_CLIENT_ID',
      reason: 'invalid',
      message: 'ต้องเป็น Client ID ที่ลงท้าย .apps.googleusercontent.com',
    });
  if (!settings.ADMIN_EMAIL)
    issues.push({
      key: 'ADMIN_EMAIL',
      reason: 'missing',
      message: 'ยังไม่ได้ตั้งอีเมลผู้ดูแลเริ่มต้น',
    });
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.ADMIN_EMAIL))
    issues.push({
      key: 'ADMIN_EMAIL',
      reason: 'invalid',
      message: 'รูปแบบอีเมลผู้ดูแลไม่ถูกต้อง',
    });
  if (!settings.APP_ORIGIN)
    issues.push({
      key: 'APP_ORIGIN',
      reason: 'missing',
      message: 'ยังไม่ได้ตั้ง URL ของเว็บที่ใช้เข้าสู่ระบบ',
    });
  else {
    let valid = false;
    try {
      const url = new URL(settings.APP_ORIGIN);
      valid =
        url.origin === settings.APP_ORIGIN &&
        (url.protocol === 'https:' ||
          (url.protocol === 'http:' &&
            ['localhost', '127.0.0.1'].includes(url.hostname)));
    } catch {
      /* Invalid URL is reported below without including its value. */
    }
    if (!valid)
      issues.push({
        key: 'APP_ORIGIN',
        reason: 'invalid',
        message:
          'ต้องเป็น URL เช่น https://your-project.vercel.app โดยไม่มี path เช่น /login',
      });
  }
  return issues;
}
