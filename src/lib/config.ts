/**
 * When the Supabase env vars are missing the app runs in browser-only mode:
 * no login, and data is saved in this browser's localStorage.
 */
export const SUPABASE_ENABLED = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
