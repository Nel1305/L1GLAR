/* N MARKET — _shared/send.ts : envoi Meta + journal. `db` = client Supabase (clé service_role). */
import { TEMPLATES, templatePayload, textPayload } from './wa.ts';
import type { Cfg, Plan } from './wa.ts';

export type Env = { token: string; phoneId: string; version: string };

export function cfgFromEnv(get: (k: string) => string | undefined): { cfg: Cfg; env: Env } {
  const tpl: Record<string, string> = {};
  for (const k of Object.keys(TEMPLATES)) tpl[k] = get('WA_TPL_' + k.toUpperCase()) || TEMPLATES[k].name;
  return {
    cfg: { cc: get('WA_DEFAULT_CC') || '221', lang: get('WA_TEMPLATE_LANG') || 'fr',
           siteUrl: get('SITE_URL') || '', platform: get('PLATFORM_NAME') || 'N Market', tpl },
    env: { token: get('WA_TOKEN') || '', phoneId: get('WA_PHONE_NUMBER_ID') || '', version: get('WA_API_VERSION') || 'v21.0' },
  };
}

export async function graphPost(env: Env, payload: unknown, fetchFn: typeof fetch = fetch) {
  const r = await fetchFn(`https://graph.facebook.com/${env.version}/${env.phoneId}/messages`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const j: any = await r.json().catch(() => ({}));
  return { ok: r.ok, id: (j?.messages?.[0]?.id as string) || null,
           err: j?.error ? `${j.error.code}: ${j.error.message}` : (r.ok ? null : `HTTP ${r.status}`) };
}

/** Envoie un message planifié (modèle approuvé, sinon texte libre si la fenêtre de 24 h est ouverte) et le journalise. */
export async function sendPlan(db: any, env: Env, cfg: Cfg, plan: Plan, fetchFn: typeof fetch = fetch) {
  if (!env.token || !env.phoneId) return { ok: false, err: 'WhatsApp non configuré' };
  let res = await graphPost(env, templatePayload(cfg, plan), fetchFn);
  let kind: 'template' | 'text' = 'template';
  if (!res.ok) {
    const t = await graphPost(env, textPayload(plan.to, plan.text), fetchFn);
    if (t.ok) { res = t; kind = 'text'; }
  }
  await db.from('wa_messages').insert({
    seller_id: plan.sellerId, order_id: plan.orderId, buyer_phone: plan.logPhone, buyer_name: plan.name,
    peer: plan.peer, direction: 'out', kind, template: kind === 'template' ? (cfg.tpl[plan.tplKey] || null) : null,
    body: plan.text, wa_id: res.id, status: res.ok ? 'sent' : 'failed', error: res.err,
  });
  return res;
}
