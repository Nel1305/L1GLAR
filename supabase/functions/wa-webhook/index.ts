/* N MARKET — wa-webhook : URL de rappel (Callback URL) déclarée chez Meta.
   GET = vérification ; POST = messages reçus + accusés (envoyé / distribué / lu). verify_jwt = false. */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { parseWebhook, verifySignature } from '../_shared/wa.ts';

const RANK: Record<string, string[]> = {            // statut → statuts qu'il a le droit de remplacer
  sent: ['queued'], delivered: ['queued', 'sent'], read: ['queued', 'sent', 'delivered'],
  failed: ['queued', 'sent', 'delivered'],
};

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === 'GET') {
    const ok = url.searchParams.get('hub.mode') === 'subscribe' &&
      url.searchParams.get('hub.verify_token') === (Deno.env.get('WA_VERIFY_TOKEN') || '\u0000');
    return ok ? new Response(url.searchParams.get('hub.challenge') || '', { status: 200 }) : new Response('Forbidden', { status: 403 });
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const raw = await req.text();
  const appSecret = Deno.env.get('WA_APP_SECRET') || '';
  if (!appSecret) return new Response('WA_APP_SECRET manquant', { status: 500 });
  if (!(await verifySignature(raw, req.headers.get('x-hub-signature-256'), appSecret))) return new Response('Bad signature', { status: 401 });

  let payload: any; try { payload = JSON.parse(raw); } catch { return new Response('ok'); }
  const { messages, statuses } = parseWebhook(payload);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  for (const m of messages) {
    try {
      const { data: route } = await db.rpc('fn_wa_route', { p_phone: m.from });
      const r = Array.isArray(route) ? route[0] : route;
      await db.from('wa_messages').upsert({
        seller_id: r?.seller_id ?? null, order_id: r?.order_id ?? null, buyer_phone: m.from,
        buyer_name: m.name || r?.buyer_name || null, peer: 'buyer', direction: 'in', kind: 'text',
        body: m.body, wa_id: m.id, status: 'received',
      }, { onConflict: 'wa_id', ignoreDuplicates: true });
    } catch (e) { console.error('wa-webhook msg', e); }
  }
  for (const s of statuses) {
    const from = RANK[s.status]; if (!from) continue;
    try { await db.from('wa_messages').update({ status: s.status, error: s.error }).eq('wa_id', s.id).in('status', from); }
    catch (e) { console.error('wa-webhook status', e); }
  }
  return new Response('ok');                        // Meta réessaie tant qu'il ne reçoit pas 200
});
