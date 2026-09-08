import test from 'node:test';
import assert from 'node:assert/strict';
import { configurationIssues, normalizeSettings } from '../lib/server/config';
import { databaseSetupError } from '../lib/server/database-errors';

const settings = {
  DB: {},
  GOOGLE_CLIENT_ID: 'client.apps.googleusercontent.com',
  ADMIN_EMAIL: 'owner@gmail.com',
  APP_ORIGIN: 'https://reports.example.com',
};

test('copied env values accept whitespace and root slash while preserving one trusted origin', () => {
  const normalized = normalizeSettings({
    GOOGLE_CLIENT_ID: ' client.apps.googleusercontent.com\n',
    ADMIN_EMAIL: ' Owner@Gmail.com ',
    APP_ORIGIN: ' https://REPORTS.example.com:443/ \n',
  });
  assert.deepEqual({ ...settings, ...normalized }, settings);
  assert.deepEqual(configurationIssues({ ...settings, ...normalized }), []);
});

test('origin normalization never accepts paths, credentials, queries or unencrypted public sites', () => {
  for (const APP_ORIGIN of [
    'https://reports.example.com/login',
    'https://reports.example.com/?redirect=evil',
    'https://reports.example.com/#login',
    'https://user:password@reports.example.com/',
    'http://reports.example.com/',
    'reports.example.com',
  ]) {
    const issues = configurationIssues({
      ...settings,
      ...normalizeSettings({ ...settings, APP_ORIGIN }),
    });
    assert.ok(
      issues.some(
        (issue) => issue.key === 'APP_ORIGIN' && issue.reason === 'invalid',
      ),
    );
  }
  assert.deepEqual(
    configurationIssues({
      ...settings,
      ...normalizeSettings({
        ...settings,
        APP_ORIGIN: 'http://localhost:3001/',
      }),
    }),
    [],
  );
});

test('setup diagnostics identify each required setting without exposing any values', () => {
  assert.deepEqual(
    configurationIssues({}).map((issue) => issue.key),
    ['DATABASE_URL', 'GOOGLE_CLIENT_ID', 'ADMIN_EMAIL', 'APP_ORIGIN'],
  );
  const data = {
    databaseInvalid: true,
    GOOGLE_CLIENT_ID: 'private-client-value',
    ADMIN_EMAIL: 'private-invalid-address',
    APP_ORIGIN: 'private-origin-value',
  };
  const issues = configurationIssues(data);
  assert.equal(issues.length, 4);
  for (const value of Object.values(data))
    if (typeof value === 'string')
      assert.ok(!JSON.stringify(issues).includes(value));
  assert.ok(issues.every((issue) => issue.reason === 'invalid'));
});

test('database setup errors explain actionable codes without leaking driver messages or secrets', () => {
  const expected = {
    '42P01': 'database_migration_required',
    '42501': 'database_permission_denied',
    '28P01': 'database_auth_failed',
    SELF_SIGNED_CERT_IN_CHAIN: 'database_certificate_error',
    ENOTFOUND: 'database_unavailable',
    unknown: 'login_setup_failed',
  };
  for (const [code, result] of Object.entries(expected)) {
    const error = databaseSetupError({
      code,
      message: 'postgres://secret-password@private-host/database',
      query: 'private SQL',
    });
    assert.equal(error.code, result);
    assert.ok(!JSON.stringify(error).includes('secret-password'));
    assert.ok(!JSON.stringify(error).includes('private-host'));
    assert.ok(!JSON.stringify(error).includes('private SQL'));
  }
});
