import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/sqlite-core';
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
});
export const members = sqliteTable(
  'members',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    userId: text('user_id').references(() => users.id),
    role: text('role', { enum: ['admin', 'member'] })
      .notNull()
      .default('member'),
    active: integer('active').notNull().default(1),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('members_email_unique').on(t.email),
    uniqueIndex('members_user_unique').on(t.userId),
    check('member_role', sql`${t.role} in ('admin','member')`),
    check('member_active', sql`${t.active} in (0,1)`),
  ],
);
export const sessions = sqliteTable(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    csrfToken: text('csrf_token').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [
    index('sessions_user').on(t.userId),
    index('sessions_expiry').on(t.expiresAt),
  ],
);
export const loginChallenges = sqliteTable(
  'login_challenges',
  {
    tokenHash: text('token_hash').primaryKey(),
    nonce: text('nonce').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [index('challenges_expiry').on(t.expiresAt)],
);
export const reports = sqliteTable(
  'reports',
  {
    id: text('id').primaryKey(),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id),
    weekStart: text('week_start').notNull(),
    completed: text('completed').notNull().default(''),
    inProgress: text('in_progress').notNull().default(''),
    blockers: text('blockers').notNull().default(''),
    nextWeek: text('next_week').notNull().default(''),
    status: text('status', { enum: ['draft', 'submitted'] })
      .notNull()
      .default('draft'),
    version: integer('version').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    submittedAt: text('submitted_at'),
  },
  (t) => [
    uniqueIndex('reports_author_week_unique').on(t.authorId, t.weekStart),
    index('reports_status_week').on(t.status, t.weekStart),
    check('report_status', sql`${t.status} in ('draft','submitted')`),
    check('report_version', sql`${t.version} > 0`),
  ],
);
