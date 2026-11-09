/* N MARKET — wa-send : réponse d'un vendeur (ou de l'admin) depuis la boîte WhatsApp du site.
   Appelée avec le JWT de l'utilisateur connecté (verify_jwt = true). Texte libre : uniquement
   dans les 24 h qui suivent le dernier message du client (règle Meta). */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { normPhone, isValidWaNumber, textPayload } from '../_shared/wa.ts';
import { cfgFromEnv, graphPost } from '../_shared/send.ts';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const auth = req.headers.get('Authorization') || '';
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'Connexion requise' }, 401);

  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { cfg, env } = cfgFromEnv((k) => Deno.env.get(k));
  if (!env.token || !env.phoneId) return json({ error: 'WhatsApp n\'est pas encore configuré sur la plateforme.' }, 503);

  let body: any; try { body = await req.json(); } catch { return json({ error: 'Requête invalide' }, 400); }
  const to = normPhone(body?.phone, cfg.cc);
  const text = String(body?.text ?? '').trim();
  if (!isValidWaNumber(to)) return json({ error: 'Numéro invalide' }, 400);
  if (!text || text.length > 1500) return json({ error: 'Message vide ou trop long (1500 caractères max).' }, 400);

  // Qui écrit ? vendeur actif ou admin
  const { data: admin } = await db.from('admins').select('id').eq('auth_id', user.id).maybeSingle();
  const { data: seller } = admin ? { data: null } : await db.from('users').select('id,is_blocked').eq('auth_id', user.id).maybeSingle();
  if (!admin && (!seller || seller.is_blocked)) return json({ error: 'Accès refusé' }, 403);

  // Le vendeur ne peut écrire qu'à SES clients (numéro présent dans l'une de ses commandes)
  const { data: route } = await db.rpc('fn_wa_route', { p_phone: to });
  const latest = Array.isArray(route) ? route[0] : route;
  let sellerId: number | null = admin ? (body?.seller_id ?? latest?.seller_id ?? null) : seller!.id;
  let orderId: number | null = latest?.order_id ?? null;
  if (!admin) {
    const { data: mine } = await db.from('orders').select('id,buyer_phone').eq('seller_id', seller!.id).order('id', { ascending: false }).limit(1000);
    const hit = (mine || []).find((o: any) => normPhone(o.buyer_phone, cfg.cc) === to);
    if (!hit) return json({ error: 'Ce numéro n\'est pas un de tes clients.' }, 403);
    orderId = hit.id;
  }

  // anti-flood : 30 messages / minute / vendeur
  const since1 = new Date(Date.now() - 60_000).toISOString();
  const { count } = await db.from('wa_messages').select('id', { count: 'exact', head: true })
    .eq('direction', 'out').eq('seller_id', sellerId ?? -1).gt('created_at', since1);
  if ((count || 0) >= 30) return json({ error: 'Trop de messages. Patiente une minute.' }, 429);

  // Fenêtre de 24 h
  const since24 = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count: inbound } = await db.from('wa_messages').select('id', { count: 'exact', head: true })
    .eq('direction', 'in').eq('buyer_phone', to).gt('created_at', since24);
  if (!inbound) return json({ error: 'window_closed',
    message: 'Le client n\'a pas écrit depuis plus de 24 h : WhatsApp n\'autorise pas de message libre. Attends sa réponse ou rappelle-le.' }, 409);

  const res = await graphPost(env, textPayload(to, text));
  await db.from('wa_messages').insert({
    seller_id: sellerId, order_id: orderId, buyer_phone: to, buyer_name: latest?.buyer_name ?? null, peer: 'buyer',
    direction: 'out', kind: 'text', body: text, wa_id: res.id, status: res.ok ? 'sent' : 'failed', error: res.err,
  });
  return res.ok ? json({ ok: true }) : json({ error: 'Envoi refusé par WhatsApp : ' + res.err }, 502);
});
