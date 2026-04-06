/**
 * config.js
 * Client-side configuration — committed to git and deployed via Netlify.
 *
 * SUPABASE_ANON_KEY is intentionally public; it can only do what
 * Row-Level Security policies permit. Never put a service_role key here.
 *
 * GROQ_API_KEY is also public here by design — the free-tier key has a
 * usage cap that limits abuse. Never put a service_role key here.
 */

export const SUPABASE_URL      = 'https://iequlhfuqkqjaxxqsijd.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllcXVsaGZ1cWtxamF4eHFzaWpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NDA4ODQsImV4cCI6MjA5MDIxNjg4NH0.4zP_KVcsMzoT3bon8tlC5GUKTRC9i3vohuCTtq-Htx8';

export const GROQ_API_KEY = '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';
