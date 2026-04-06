/**
 * groq-proxy — Supabase Edge Function
 *
 * Forwards chat completion requests to Groq so the API key never
 * reaches the browser. Only authenticated users (valid Supabase JWT)
 * can call this endpoint.
 *
 * Environment variables (set via `supabase secrets set`):
 *   GROQ_API_KEY  — your Groq API key
 *
 * SUPABASE_URL and SUPABASE_ANON_KEY are injected automatically.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS });
  }

  // Verify Supabase JWT — only signed-in users can use this proxy
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401, headers: CORS });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return new Response('Unauthorized', { status: 401, headers: CORS });
  }

  // Forward the request body to Groq with the real API key
  const groqKey = Deno.env.get('GROQ_API_KEY');
  if (!groqKey) {
    return new Response('GROQ_API_KEY not configured', { status: 500, headers: CORS });
  }

  const body = await req.text();
  const groqRes = await fetch(GROQ_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${groqKey}`,
    },
    body,
  });

  // Stream the response straight back to the browser (preserves SSE chunks)
  return new Response(groqRes.body, {
    status:  groqRes.status,
    headers: {
      ...CORS,
      'Content-Type': groqRes.headers.get('Content-Type') ?? 'text/event-stream',
    },
  });
});
