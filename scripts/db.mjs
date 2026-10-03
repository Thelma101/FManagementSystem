// Direct Postgres connection for the maintenance scripts (reads .env.local).
//
// Needs SUPABASE_DB_URL, or SUPABASE_URL + SUPABASE_DB_PASSWORD (the pooler region is auto-detected).
import pg from 'pg';

const REGIONS = [
  'eu-west-2', 'eu-west-1', 'eu-central-1', 'eu-west-3', 'eu-north-1', 'eu-central-2',
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'ca-central-1', 'sa-east-1',
  'ap-south-1', 'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2',
];

function candidateUrls() {
  if (process.env.SUPABASE_DB_URL) return [process.env.SUPABASE_DB_URL];
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!url || !password) throw new Error('Set SUPABASE_DB_URL, or SUPABASE_URL and SUPABASE_DB_PASSWORD, in .env.local');
  const ref = new URL(url).hostname.split('.')[0];
  const pw = encodeURIComponent(password);
  return [
    `postgresql://postgres:${pw}@db.${ref}.supabase.co:5432/postgres`,
    ...['aws-0', 'aws-1'].flatMap((prefix) =>
      REGIONS.map((r) => `postgresql://postgres.${ref}:${pw}@${prefix}-${r}.pooler.supabase.com:5432/postgres`),
    ),
  ];
}

export async function connect() {
  let lastError;
  for (const connectionString of candidateUrls()) {
    const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
    try {
      await client.connect();
      console.log('Connected via', new URL(connectionString).hostname);
      return client;
    } catch (err) {
      lastError = err;
      await client.end().catch(() => {});
    }
  }
  throw new Error(`Could not connect to the database: ${lastError?.message ?? 'unknown error'}`);
}
