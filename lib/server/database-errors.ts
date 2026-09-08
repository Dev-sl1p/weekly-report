// Only stable error codes are public. Never return driver messages, SQL,
// connection strings or parameter values to an unauthenticated browser.
export function databaseSetupError(error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : '';
  if (['42P01', '3F000', '42703'].includes(code))
    return {
      error:
        'ฐานข้อมูลยังไม่มีโครงสร้าง Weekly Report กรุณารัน npm run db:migrate ด้วย DIRECT_URL ของ Supabase โปรเจกต์เดียวกัน',
      code: 'database_migration_required',
    };
  if (code === '42501')
    return {
      error:
        'บัญชีฐานข้อมูลยังไม่มีสิทธิ์เข้าถึง Weekly Report กรุณาตรวจว่า login ใน DATABASE_URL ได้รับ role weekly_report_app',
      code: 'database_permission_denied',
    };
  if (['28P01', '28000'].includes(code))
    return {
      error:
        'เข้าสู่ฐานข้อมูลไม่สำเร็จ กรุณาตรวจชื่อผู้ใช้และรหัสผ่านใน DATABASE_URL แล้ว Redeploy',
      code: 'database_auth_failed',
    };
  if (
    [
      'SELF_SIGNED_CERT_IN_CHAIN',
      'DEPTH_ZERO_SELF_SIGNED_CERT',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      'CERT_HAS_EXPIRED',
      'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
    ].includes(code)
  )
    return {
      error:
        'ยืนยันใบรับรองฐานข้อมูลไม่สำเร็จ กรุณาตั้ง DATABASE_CA_CERT ด้วย root certificate จาก Supabase แล้ว Redeploy',
      code: 'database_certificate_error',
    };
  if (
    [
      'ENOTFOUND',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'CONNECT_TIMEOUT',
      'CONNECTION_CLOSED',
      'CONNECTION_ENDED',
      'EHOSTUNREACH',
      'ENETUNREACH',
    ].includes(code)
  )
    return {
      error:
        'เชื่อมต่อฐานข้อมูลไม่ได้ กรุณาตรวจ DATABASE_URL และสถานะโปรเจกต์ Supabase โดยใช้ Transaction pooler สำหรับ Vercel',
      code: 'database_unavailable',
    };
  return {
    error:
      'เริ่มเข้าสู่ระบบไม่สำเร็จ ผู้ดูแลตรวจ Vercel Logs ของ /api/auth/challenge เพื่อดูข้อผิดพลาดการเชื่อมต่อฐานข้อมูล',
    code: 'login_setup_failed',
  };
}
