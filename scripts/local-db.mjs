import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const hosting = JSON.parse(
  readFileSync('.openai/hosting.json', 'utf8').replace(/^\uFEFF/, ''),
);
mkdirSync('.wrangler', { recursive: true });
const config = '.wrangler/local-db.json';
writeFileSync(
  config,
  JSON.stringify({
    name: 'weekly-report-local',
    compatibility_date: '2026-05-15',
    d1_databases: [
      {
        binding: hosting.d1,
        database_name: 'site-creator-d1',
        database_id: '00000000-0000-4000-8000-000000000000',
        migrations_dir: '../drizzle',
      },
    ],
  }),
);
const result = spawnSync(
  process.execPath,
  [
    'node_modules/wrangler/bin/wrangler.js',
    'd1',
    'migrations',
    'apply',
    'site-creator-d1',
    '--local',
    '--config',
    config,
    '--persist-to',
    '.wrangler/state',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      WRANGLER_SEND_METRICS: 'false',
      WRANGLER_WRITE_LOGS: 'false',
    },
  },
);
process.exit(result.status ?? 1);
