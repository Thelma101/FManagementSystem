// Applies supabase/migrations/*.sql to the project database.
// Usage: npm run db:migrate   (reads .env.local; connection settings: see ./db.mjs)
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { connect } from './db.mjs';

const dir = path.resolve('supabase/migrations');
const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
const client = await connect();
try {
  for (const file of files) {
    process.stdout.write(`Applying ${file}… `);
    await client.query(await readFile(path.join(dir, file), 'utf8'));
    console.log('done');
  }
  await client.query("notify pgrst, 'reload schema'");
} finally {
  await client.end();
}
