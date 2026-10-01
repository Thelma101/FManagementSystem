/** Supabase Auth rejects anything shorter than 6, so this is as low as sign-in allows. No other rules. */
export const MIN_PASSWORD_LENGTH = 6;

export function passwordError(password: string): string | null {
  return password.length < MIN_PASSWORD_LENGTH ? `Use at least ${MIN_PASSWORD_LENGTH} characters.` : null;
}
