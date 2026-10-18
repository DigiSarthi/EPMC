// Supabase Edge Function: admin-only employee creation. The service-role key exists ONLY here (server-side env).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info' };
const out = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = Deno.env.get('SUPABASE_URL')!;
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return out({ error: 'Not signed in' }, 401);
  const svc = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: p } = await svc.from('profiles').select('role,is_active').eq('id', user.id).single();
  if (!p || p.role !== 'admin' || !p.is_active) return out({ error: 'Forbidden' }, 403);
  const b = await req.json();
  if (!b.email || !b.password || b.password.length < 8) return out({ error: 'Email and password (min 8 chars) required' }, 400);
  const { error } = await svc.auth.admin.createUser({
    email: b.email, password: b.password, email_confirm: true,
    user_metadata: { full_name: b.full_name, employee_code: b.employee_code, mobile: b.mobile },
  });
  if (error) return out({ error: error.message }, 400);
  return out({ ok: true });
});
