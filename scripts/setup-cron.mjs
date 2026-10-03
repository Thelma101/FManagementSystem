// Makes the database call the portal's background job (/api/cron/tick) every 5 minutes,
// which sends scheduled reminders and collects SMS delivery reports.
//
// Usage: npm run cron:setup [-- https://your-portal.vercel.app]
//        npm run cron:setup -- --remove        stop the job
//        npm run cron:setup -- --run           also run the job once now and print the result
//
// The job's key is derived from SUPABASE_SECRET_KEY, so it lives only in the database's
// job list and in .env.local, never in git. Re-run this after rotating the secret key.
import { createHash } from 'node:crypto';
import { connect } from './db.mjs';

const JOB = 'portal-tick';
const args = process.argv.slice(2);
const remove = args.includes('--remove');
const runNow = args.includes('--run');
const site = (args.find((a) => a.startsWith('http')) || process.env.PORTAL_URL || 'https://f-management-system.vercel.app').replace(/\/$/, '');
const secret = process.env.SUPABASE_SECRET_KEY;
if (!secret) throw new Error('Set SUPABASE_SECRET_KEY in .env.local');
const key = createHash('sha256').update(`${secret}:cron`).digest('hex');

const client = await connect();
try {
  await client.query('create extension if not exists pg_cron');
  await client.query('create extension if not exists pg_net');
  await client.query('select cron.unschedule(jobid) from cron.job where jobname = $1', [JOB]);
  if (remove) {
    console.log('Background job removed.');
  } else {
    const command = `select net.http_post(
      url := ${client.escapeLiteral(`${site}/api/cron/tick`)},
      headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Key', ${client.escapeLiteral(key)}),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    )`;
    await client.query('select cron.schedule($1, $2, $3)', [JOB, '*/5 * * * *', command]);
    console.log(`Background job scheduled every 5 minutes → ${site}/api/cron/tick`);
  }
} finally {
  await client.end();
}

if (runNow && !remove) {
  const res = await fetch(`${site}/api/cron/tick`, { method: 'POST', headers: { 'X-Cron-Key': key } });
  console.log(`Run now: HTTP ${res.status}`, await res.text());
}
