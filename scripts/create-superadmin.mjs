// Creates (or promotes) a Super Admin account.
// Usage: npm run create-superadmin -- you@example.com "Your Name"
// Prints a temporary password; the user must set their own at first sign-in.
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const [email, ...nameParts] = process.argv.slice(2);
const name = nameParts.join(' ').trim();
if (!email || !name) {
  console.error('Usage: npm run create-superadmin -- you@example.com "Your Name"');
  process.exit(1);
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error('SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local');
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const password = randomBytes(9).toString('base64url');
const normalizedEmail = email.trim().toLowerCase();

let userId;
const { data: created, error } = await admin.auth.admin.createUser({
  email: normalizedEmail,
  password,
  email_confirm: true,
  user_metadata: { name },
});

if (error) {
  // Already registered: find the user and reset their password.
  const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;
  const existing = list.users.find((u) => u.email?.toLowerCase() === normalizedEmail);
  if (!existing) throw error;
  userId = existing.id;
  const { error: updateError } = await admin.auth.admin.updateUserById(userId, { password });
  if (updateError) throw updateError;
} else {
  userId = created.user.id;
}

const { error: profileError } = await admin.from('profiles').upsert({
  id: userId,
  name,
  email: normalizedEmail,
  role: 'superadmin',
  must_change_password: true,
  created_by: 'Setup script',
});
if (profileError) throw profileError;

console.log('\nSuper Admin ready');
console.log('  Email:              ', normalizedEmail);
console.log('  Temporary password: ', password);
console.log('You will be asked to choose a new password at first sign-in.\n');
