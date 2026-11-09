// Sets up (or tests) the background job that:
//   1. sends scheduled reminders, and
//   2. collects SMS delivery reports.
//
// Production (Render): create a Cron Job in the Render dashboard that POSTs
// to /api/cron/tick every 5 minutes with header X-Cron-Key.
//
// Usage:
//   npm run cron:setup                         print the key + Render steps
//   npm run cron:setup -- https://your.onrender.com
//   npm run cron:setup -- --run                also call the job once now
//   npm run cron:setup -- --legacy-pg          old Supabase pg_cron schedule (avoid on Render)
//
// The key is derived from SUPABASE_SECRET_KEY (or CRON_SECRET). Never commit it.
import { createHash } from 'node:crypto';
import { connect } from './db.mjs';

const JOB = 'portal-tick';
const args = process.argv.slice(2);
const remove = args.includes('--remove');
const runNow = args.includes('--run');
const legacyPg = args.includes('--legacy-pg');
const site = (args.find((a) => a.startsWith('http')) || process.env.PORTAL_URL || '').replace(/\/$/, '');
const secret = process.env.CRON_SECRET || process.env.SUPABASE_SECRET_KEY;
if (!secret) throw new Error('Set SUPABASE_SECRET_KEY or CRON_SECRET in .env.local');
const key = createHash('sha256').update(`${secret}:cron`).digest('hex');

const tickUrl = site ? `${site}/api/cron/tick` : 'https://YOUR-RENDER-APP.onrender.com/api/cron/tick';

console.log(`
────────────────────────────────────────────────────────
  Reminder job key (keep private)
────────────────────────────────────────────────────────
  X-Cron-Key: ${key}

  Render Cron Job (recommended for production)
  1. Render dashboard → New → Cron Job
  2. Schedule: */5 * * * *   (every 5 minutes, UTC)
  3. Command, for example:
       curl -sS -X POST "${tickUrl}" -H "X-Cron-Key: ${key}" -H "Content-Type: application/json" -d "{}"
  4. Same env vars as the web service (at least the secret used above)
────────────────────────────────────────────────────────
`);

if (runNow) {
  if (!site) throw new Error('Pass the live URL, e.g. npm run cron:setup -- https://your.onrender.com --run');
  const res = await fetch(`${site}/api/cron/tick`, {
    method: 'POST',
    headers: { 'X-Cron-Key': key, 'Content-Type': 'application/json' },
    body: '{}',
  });
  console.log(`Test run: HTTP ${res.status}`, await res.text());
}

if (!legacyPg) {
  if (!runNow) console.log('Tip: add --run with your live URL to test once.');
  process.exit(0);
}

// ── Legacy: Supabase pg_cron (not used when the app runs on Render) ───────────
const client = await connect();
try {
  await client.query('create extension if not exists pg_cron');
  await client.query('create extension if not exists pg_net');
  await client.query('select cron.unschedule(jobid) from cron.job where jobname = $1', [JOB]);
  if (remove) {
    console.log('Legacy pg_cron job removed.');
  } else {
    if (!site) throw new Error('Pass the live URL for --legacy-pg');
    const command = `select net.http_post(
      url := ${client.escapeLiteral(`${site}/api/cron/tick`)},
      headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Key', ${client.escapeLiteral(key)}),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    )`;
    await client.query('select cron.schedule($1, $2, $3)', [JOB, '*/5 * * * *', command]);
    console.log(`Legacy pg_cron scheduled every 5 minutes → ${site}/api/cron/tick`);
  }
} finally {
  await client.end();
}
