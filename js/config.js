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

// SIEM integration — set these to your Railway backend URL and webhook secret
export const SIEM_WEBHOOK_URL    = 'https://threat-intel-platform-production-eb1b.up.railway.app';
export const SIEM_WEBHOOK_SECRET = '9f3c2a7d4b8e1c6f0a2d9e7b5c3f1a8e6d4c2b1a9f0e7d6c5b4a3f2e1d0c9b8';   // must match SIEM_WEBHOOK_SECRET in Railway env vars
