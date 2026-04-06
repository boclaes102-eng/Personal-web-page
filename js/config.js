/**
 * config.js
 * Public Supabase connection details — safe to ship to the browser.
 *
 * The anon key is intentionally client-visible; it is designed for browser
 * use and can only do what Row-Level Security policies permit.
 * Never put a service_role key here — that key bypasses RLS entirely.
 *
 * Sensitive keys (Groq, etc.) live as Supabase Edge Function secrets
 * and never reach the client.
 */

export const SUPABASE_URL      = 'https://iequlhfuqkqjaxxqsijd.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllcXVsaGZ1cWtxamF4eHFzaWpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NDA4ODQsImV4cCI6MjA5MDIxNjg4NH0.4zP_KVcsMzoT3bon8tlC5GUKTRC9i3vohuCTtq-Htx8';

// Groq requests go through the groq-proxy Supabase Edge Function.
// The real API key lives as a server-side secret — it never reaches the browser.
