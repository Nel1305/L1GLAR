/* N MARKET — wa-notify : appelée par la base (pg_net) à chaque commande / statut / retour.
   Protégée par le secret partagé WA_NOTIFY_SECRET (verify_jwt = false, voir config.toml). */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { timingSafeEqual, planOrderGroup, planOrderStatus, planReturnCreated, planReturnStatus } from '../_shared/wa.ts';
import type { Plan } from '../_shared/wa.ts';
import { cfgFromEnv, sendPlan } from '../_shared/send.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const secret = Deno.env.get('WA_NOTIFY_SECRET') || '';
  if (!secret || !timingSafeEqual(req.headers.get('x-notify-secret') || '', secret)) return new Response('Unauthorized', { status: 401 });

  let body: any; try { body = await req.json(); } catch { return new Response('Bad request', { status: 400 }); }
  const event = String(body?.event || ''), ref = String(body?.ref || '');
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { cfg, env } = cfgFromEnv((k) => Deno.env.get(k));

  const work = (async () => {
    let plans: Plan[] = [];
    if (event === 'order_group') {
      const { data: orders } = await db.from('orders').select('*').eq('order_group', ref).order('id');
      const ids = [...new Set((orders || []).map((o: any) => o.seller_id))];
      const { data: sellers } = await db.from('users').select('id,name,phone,wa_notifications').in('id', ids);
      const map: Record<string, any> = {}; for (const s of sellers || []) map[String(s.id)] = s;
      plans = planOrderGroup(cfg, orders || [], map);
    } else if (event === 'order_status') {
      const { data: o } = await db.from('orders').select('*').eq('id', ref).maybeSingle();
      if (o) plans = planOrderStatus(cfg, o);
    } else if (event === 'return_created' || event === 'return_status') {
      const { data: r } = await db.from('returns').select('*').eq('id', ref).maybeSingle();
      if (r) {
        const { data: order } = await db.from('orders').select('*').eq('id', r.order_id).maybeSingle();
        if (event === 'return_created') {
          const { data: seller } = await db.from('users').select('id,name,phone,wa_notifications').eq('id', r.seller_id).maybeSingle();
          plans = planReturnCreated(cfg, r, order, seller);
        } else plans = planReturnStatus(cfg, r, order);
      }
    }
    for (const p of plans) { try { await sendPlan(db, env, cfg, p); } catch (e) { console.error('wa-notify send', e); } }
  })().catch((e) => console.error('wa-notify', e));

  // @ts-ignore EdgeRuntime existe sur Supabase : on répond tout de suite et on termine l'envoi en arrière-plan
  if (typeof EdgeRuntime !== 'undefined') { EdgeRuntime.waitUntil(work); return new Response('accepted', { status: 202 }); }
  await work; return new Response('ok');
});
