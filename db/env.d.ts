declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    GOOGLE_CLIENT_ID?: string;
    ADMIN_EMAIL?: string;
    APP_ORIGIN?: string;
  }
}
