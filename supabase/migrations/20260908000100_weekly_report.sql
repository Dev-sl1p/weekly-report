-- Private server-only schema. Never add this schema to Supabase Exposed schemas.
CREATE SCHEMA weekly_report;
REVOKE ALL ON SCHEMA weekly_report FROM PUBLIC;

CREATE TABLE weekly_report.users (
  id text PRIMARY KEY,
  email text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE weekly_report.members (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  user_id text UNIQUE REFERENCES weekly_report.users(id),
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  active smallint NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at timestamptz NOT NULL
);

CREATE TABLE weekly_report.sessions (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES weekly_report.users(id),
  csrf_token text NOT NULL,
  expires_at bigint NOT NULL
);
CREATE INDEX sessions_user ON weekly_report.sessions (user_id);
CREATE INDEX sessions_expiry ON weekly_report.sessions (expires_at);

CREATE TABLE weekly_report.login_challenges (
  token_hash text PRIMARY KEY,
  nonce text NOT NULL,
  expires_at bigint NOT NULL
);
CREATE INDEX challenges_expiry ON weekly_report.login_challenges (expires_at);

CREATE TABLE weekly_report.reports (
  id text PRIMARY KEY,
  author_id text NOT NULL REFERENCES weekly_report.users(id),
  week_start date NOT NULL CHECK (extract(isodow FROM week_start) = 1),
  completed text NOT NULL DEFAULT '' CHECK (char_length(completed) <= 12000),
  in_progress text NOT NULL DEFAULT '' CHECK (char_length(in_progress) <= 12000),
  blockers text NOT NULL DEFAULT '' CHECK (char_length(blockers) <= 12000),
  next_week text NOT NULL DEFAULT '' CHECK (char_length(next_week) <= 12000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  submitted_at timestamptz,
  UNIQUE (author_id, week_start),
  CHECK ((status = 'submitted') = (submitted_at IS NOT NULL)),
  CHECK (status <> 'submitted' OR length(trim(completed || in_progress || blockers || next_week)) > 0)
);
CREATE INDEX reports_status_week ON weekly_report.reports (status, week_start DESC);

-- A login inheriting this role is used only by the Next.js server. Per-member
-- permissions are checked in lib/server/service.ts using opaque app sessions.
-- Supabase Auth/Data API accounts receive no access to these tables.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'weekly_report_app') THEN
    CREATE ROLE weekly_report_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA weekly_report TO weekly_report_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA weekly_report TO weekly_report_app;
GRANT DELETE ON weekly_report.sessions, weekly_report.login_challenges TO weekly_report_app;
REVOKE ALL ON ALL TABLES IN SCHEMA weekly_report FROM PUBLIC;

DO $$ DECLARE t text; r text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'members', 'sessions', 'login_challenges', 'reports'] LOOP
    EXECUTE format('ALTER TABLE weekly_report.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY server_access ON weekly_report.%I TO weekly_report_app USING (true) WITH CHECK (true)', t);
  END LOOP;
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA weekly_report FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA weekly_report FROM %I', r);
    END IF;
  END LOOP;
END $$;
