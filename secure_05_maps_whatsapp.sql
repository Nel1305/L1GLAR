/* ═══════════════════════════════════════════════════════════════
   N MARKET — secure_05_maps_whatsapp.sql
   • Livraison hors campus : position GPS (carte Google) validée côté serveur
   • Code de reçu par commande (NM-XXXX-XXXX) → retours par code
   • WhatsApp (Meta Cloud API) : journal des messages + déclencheurs
     qui appellent les Edge Functions Supabase (dossier supabase/functions)

   À exécuter APRÈS secure_01, secure_02 et secure_04. Ré-exécutable.
   Ensuite : voir WHATSAPP_MAPS_LISEZMOI.md (étapes Meta + Google).
═══════════════════════════════════════════════════════════════ */

/* ───────────────────────────────────────────────────────────────
   1. OUTILS : normalisation des numéros, code de reçu
─────────────────────────────────────────────────────────────── */
-- 77 597 71 14 → 221775977114 ; +221 77… → 221 77… ; 00221… → 221…
CREATE OR REPLACE FUNCTION public.norm_phone(p text, cc text DEFAULT '221') RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN d = '' THEN ''
    WHEN d LIKE '00%' THEN substr(d, 3)
    WHEN length(d) <= 9 THEN cc || ltrim(d, '0')
    ELSE d
  END
  FROM (SELECT regexp_replace(coalesce(p, ''), '\D', '', 'g') AS d) s;
$$;

-- alphabet sans caractères ambigus (pas de 0/O, 1/I/L)
CREATE OR REPLACE FUNCTION public.gen_receipt_code() RETURNS text
LANGUAGE plpgsql VOLATILE AS $$
DECLARE a constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; c text; i int;
BEGIN
  LOOP
    c := '';
    FOR i IN 1..8 LOOP c := c || substr(a, 1 + floor(random() * length(a))::int, 1); END LOOP;
    c := 'NM-' || substr(c, 1, 4) || '-' || substr(c, 5, 4);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM orders WHERE receipt_code = c);
  END LOOP;
  RETURN c;
END; $$;

/* ───────────────────────────────────────────────────────────────
   2. COLONNES
─────────────────────────────────────────────────────────────── */
ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_code text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS wa_opt_in    boolean NOT NULL DEFAULT false;
ALTER TABLE users  ADD COLUMN IF NOT EXISTS wa_notifications boolean NOT NULL DEFAULT true;
GRANT SELECT (wa_notifications) ON users TO authenticated;

-- anciennes commandes : un code chacune
UPDATE orders SET receipt_code = public.gen_receipt_code() WHERE receipt_code IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_receipt_code ON orders(receipt_code);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_norm ON orders (public.norm_phone(buyer_phone), created_at DESC);

-- le client ne lit jamais `orders` ; le vendeur voit le code de ses commandes (déjà couvert par GRANT SELECT)

/* ───────────────────────────────────────────────────────────────
   3. COMMANDE : position GPS validée + code de reçu + notification WhatsApp
      (remplace fn_place_order de secure_01)
─────────────────────────────────────────────────────────────── */
DROP FUNCTION IF EXISTS public.fn_place_order(text,text,text,date,text,text,text,text,text,jsonb,double precision,double precision,text);

CREATE OR REPLACE FUNCTION public.fn_place_order(
  p_buyer_name text, p_buyer_phone text, p_notes text,
  p_delivery_date date, p_delivery_time text, p_delivery_type text, p_delivery_address text,
  p_buyer_classe text, p_buyer_filiere text, p_items jsonb,
  p_lat double precision DEFAULT NULL, p_lng double precision DEFAULT NULL, p_place_name text DEFAULT NULL,
  p_wa_opt_in boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_group text := 'og_' || replace(gen_random_uuid()::text, '-', '');
  v_name text := btrim(coalesce(p_buyer_name, ''));
  v_phone text := btrim(coalesce(p_buyer_phone, ''));
  v_type text := coalesce(p_delivery_type, 'campus');
  v_addr text := nullif(btrim(coalesce(p_delivery_address, '')), '');
  v_geo boolean := (p_lat IS NOT NULL AND p_lng IS NOT NULL);
  v_item record; v_prod products%ROWTYPE; v_seller users%ROWTYPE;
  v_order orders%ROWTYPE; v_out jsonb := '[]'::jsonb; v_total numeric := 0; v_note text;
BEGIN
  IF length(v_name) < 2 OR length(v_name) > 100 THEN RAISE EXCEPTION 'Nom invalide.'; END IF;
  IF length(regexp_replace(v_phone, '\D', '', 'g')) < 7 OR length(v_phone) > 30 THEN RAISE EXCEPTION 'Numéro de téléphone invalide.'; END IF;
  IF p_notes IS NOT NULL AND length(p_notes) > 500 THEN RAISE EXCEPTION 'Instructions trop longues.'; END IF;
  IF v_type NOT IN ('campus','external') THEN RAISE EXCEPTION 'Type de livraison invalide.'; END IF;
  IF p_delivery_date IS NULL OR p_delivery_date < current_date - 1 OR p_delivery_date > current_date + 90 THEN RAISE EXCEPTION 'Date de livraison invalide.'; END IF;
  IF p_delivery_time IS NULL OR p_delivery_time !~ '^[0-2][0-9]:[0-5][0-9]$' THEN RAISE EXCEPTION 'Heure de livraison invalide.'; END IF;

  IF (p_lat IS NULL) <> (p_lng IS NULL) THEN RAISE EXCEPTION 'Position GPS incomplète.'; END IF;
  IF v_geo AND (p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180
                OR p_lat <> p_lat OR p_lng <> p_lng) THEN RAISE EXCEPTION 'Position GPS invalide.'; END IF;   -- (x<>x : NaN)
  IF v_type = 'external' THEN
    IF v_addr IS NULL AND NOT v_geo THEN RAISE EXCEPTION 'Indique une adresse ou place un repère sur la carte.'; END IF;
    IF v_addr IS NULL THEN v_addr := 'Position choisie sur la carte'; END IF;
    IF length(v_addr) > 300 THEN RAISE EXCEPTION 'Adresse trop longue.'; END IF;
  END IF;
  IF v_type = 'campus' AND (coalesce(btrim(p_buyer_classe), '') = '' OR length(p_buyer_classe) > 60
        OR NOT EXISTS (SELECT 1 FROM filieres WHERE slug = p_buyer_filiere)) THEN RAISE EXCEPTION 'Classe / filière invalide.'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Panier invalide.'; END IF;

  -- anti-spam : 6 paniers max / 10 min pour un même numéro
  IF (SELECT count(DISTINCT order_group) FROM orders WHERE buyer_phone = v_phone AND created_at > now() - interval '10 minutes') >= 6 THEN
    RAISE EXCEPTION 'Trop de commandes en peu de temps. Réessaie dans quelques minutes.';
  END IF;

  FOR v_item IN
    SELECT (e->>'product_id')::bigint AS product_id,
           sum((e->>'qty')::int)      AS qty,
           max(left(coalesce(e->>'note', ''), 300)) AS note
      FROM jsonb_array_elements(p_items) e
     GROUP BY 1 ORDER BY 1
  LOOP
    IF v_item.qty < 1 OR v_item.qty > 100 THEN RAISE EXCEPTION 'Quantité invalide.'; END IF;

    SELECT * INTO v_prod FROM products WHERE id = v_item.product_id FOR UPDATE;
    IF NOT FOUND OR NOT v_prod.available THEN RAISE EXCEPTION 'Produit indisponible.'; END IF;
    SELECT * INTO v_seller FROM users WHERE id = v_prod.seller_id;
    IF NOT FOUND OR coalesce(v_seller.is_blocked, false) THEN RAISE EXCEPTION 'Produit indisponible.'; END IF;
    IF v_seller.shop_open IS FALSE THEN RAISE EXCEPTION 'La boutique « % » est fermée.', v_seller.name; END IF;

    IF v_prod.track_stock THEN
      IF v_prod.stock < v_item.qty THEN
        RAISE EXCEPTION 'Stock insuffisant pour « % » (reste %).', v_prod.name, v_prod.stock;
      END IF;
      UPDATE products SET stock = stock - v_item.qty WHERE id = v_prod.id;
    END IF;

    v_note := nullif(btrim(v_item.note), '');
    INSERT INTO orders (seller_id, seller_name, product_id, product_name, buyer_name, buyer_phone, qty, total,
                        notes, item_note, status, delivery_date, delivery_time, delivery_type, delivery_address,
                        buyer_classe, buyer_filiere, order_group, delivery_lat, delivery_lng, delivery_place_name,
                        receipt_code, wa_opt_in)
    VALUES (v_prod.seller_id, v_seller.name, v_prod.id, v_prod.name, v_name, v_phone, v_item.qty,
            v_prod.price * v_item.qty,
            nullif(btrim(coalesce(p_notes, '')), ''), v_note, 'new', p_delivery_date, p_delivery_time, v_type,
            CASE WHEN v_type = 'external' THEN v_addr END,
            CASE WHEN v_type = 'campus' THEN btrim(p_buyer_classe) END,
            CASE WHEN v_type = 'campus' THEN p_buyer_filiere END,
            v_group,
            CASE WHEN v_type = 'external' THEN p_lat END, CASE WHEN v_type = 'external' THEN p_lng END,
            CASE WHEN v_type = 'external' THEN left(p_place_name, 120) END,
            public.gen_receipt_code(), coalesce(p_wa_opt_in, false))
    RETURNING * INTO v_order;

    v_total := v_total + v_order.total;
    v_out := v_out || jsonb_build_object(
      'id', v_order.id, 'created_at', v_order.created_at, 'product_id', v_order.product_id,
      'product_name', v_order.product_name, 'seller_id', v_order.seller_id, 'seller_name', v_order.seller_name,
      'qty', v_order.qty, 'total', v_order.total, 'item_note', coalesce(v_order.item_note, ''),
      'receipt_code', v_order.receipt_code);
  END LOOP;

  PERFORM public.fn_wa_notify('order_group', v_group);   -- WhatsApp (sans effet si non configuré ; n'échoue jamais)

  RETURN jsonb_build_object('order_group', v_group, 'orders', v_out, 'grand_total', v_total);
END; $$;
GRANT EXECUTE ON FUNCTION public.fn_place_order(text,text,text,date,text,text,text,text,text,jsonb,double precision,double precision,text,boolean) TO anon, authenticated;

/* ───────────────────────────────────────────────────────────────
   4. RETOURS PAR CODE DE REÇU
      Les échecs sont comptés (pas de RAISE : sinon l'enregistrement serait annulé)
─────────────────────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS return_attempts (id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now());
ALTER TABLE return_attempts ENABLE ROW LEVEL SECURITY;      -- aucune politique : inaccessible depuis l'API

DROP FUNCTION IF EXISTS public.fn_create_return(bigint, text, text);
CREATE OR REPLACE FUNCTION public.fn_create_return_by_code(p_code text, p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reason text := btrim(coalesce(p_reason, ''));
  v_raw text := regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g');
  v_code text; v_order orders%ROWTYPE;
BEGIN
  IF length(v_reason) < 5 OR length(v_reason) > 1000 THEN RETURN jsonb_build_object('ok', false, 'error', 'Motif invalide (5 à 1000 caractères).'); END IF;
  IF v_raw LIKE 'NM%' THEN v_raw := substr(v_raw, 3); END IF;
  IF length(v_raw) <> 8 THEN RETURN jsonb_build_object('ok', false, 'error', 'Code de reçu invalide (format NM-XXXX-XXXX).'); END IF;
  v_code := 'NM-' || substr(v_raw, 1, 4) || '-' || substr(v_raw, 5, 4);

  -- anti-devinette : 40 échecs / 10 min pour toute la plateforme
  IF (SELECT count(*) FROM return_attempts WHERE at > now() - interval '10 minutes') >= 40 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Trop de tentatives. Réessaie dans quelques minutes.');
  END IF;
  DELETE FROM return_attempts WHERE at < now() - interval '1 day';

  SELECT * INTO v_order FROM orders WHERE receipt_code = v_code;
  IF NOT FOUND THEN
    INSERT INTO return_attempts DEFAULT VALUES;
    RETURN jsonb_build_object('ok', false, 'error', 'Code de reçu introuvable.');
  END IF;
  IF v_order.status = 'cancel' THEN RETURN jsonb_build_object('ok', false, 'error', 'Cette commande a été annulée.'); END IF;
  IF EXISTS (SELECT 1 FROM returns WHERE order_id = v_order.id AND status = 'pending') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Une demande est déjà en cours pour cette commande.');
  END IF;

  INSERT INTO returns (order_id, seller_id, buyer_name, buyer_phone, product_name, reason, status)
  VALUES (v_order.id, v_order.seller_id, v_order.buyer_name, v_order.buyer_phone, v_order.product_name, v_reason, 'pending');
  RETURN jsonb_build_object('ok', true, 'product_name', v_order.product_name);
END; $$;
GRANT EXECUTE ON FUNCTION public.fn_create_return_by_code(text, text) TO anon, authenticated;

/* ───────────────────────────────────────────────────────────────
   5. WHATSAPP — journal des messages (lecture : vendeur concerné / admin)
      Écriture : uniquement par les Edge Functions (clé service_role)
─────────────────────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS wa_messages (
  id          bigserial PRIMARY KEY,
  seller_id   bigint REFERENCES users(id) ON DELETE SET NULL,
  order_id    bigint REFERENCES orders(id) ON DELETE SET NULL,
  buyer_phone text   NOT NULL,                       -- format international sans « + » (221775977114)
  buyer_name  text,
  peer        text   NOT NULL DEFAULT 'buyer' CHECK (peer IN ('buyer','seller')),   -- 'seller' = notification envoyée au vendeur (pas une conversation client)
  direction   text   NOT NULL CHECK (direction IN ('in','out')),
  kind        text   NOT NULL DEFAULT 'text' CHECK (kind IN ('text','template','media')),
  template    text,
  body        text   NOT NULL DEFAULT '',
  wa_id       text,                                  -- id Meta du message
  status      text   NOT NULL DEFAULT 'sent' CHECK (status IN ('queued','sent','delivered','read','failed','received')),
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_messages_waid  ON wa_messages(wa_id) WHERE wa_id IS NOT NULL;
CREATE INDEX        IF NOT EXISTS idx_wa_messages_sell  ON wa_messages(seller_id, buyer_phone, created_at DESC);
ALTER TABLE wa_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_messages_select ON wa_messages;
CREATE POLICY wa_messages_select ON wa_messages FOR SELECT TO authenticated
  USING (seller_id = my_user_id() OR is_admin());
GRANT SELECT ON wa_messages TO authenticated;

-- temps réel (la base ne diffuse que les lignes autorisées par la politique ci-dessus)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'wa_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE wa_messages;
  END IF;
END $$;

-- Réglages privés (URL des fonctions + secret partagé) : AUCUN accès depuis l'API
CREATE TABLE IF NOT EXISTS wa_config (key text PRIMARY KEY, value text NOT NULL);
ALTER TABLE wa_config ENABLE ROW LEVEL SECURITY;

-- Le vendeur choisit s'il reçoit ses commandes sur WhatsApp
CREATE OR REPLACE FUNCTION public.fn_set_wa_notifications(p_on boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me bigint := my_active_seller_id();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Connexion requise.'; END IF;
  UPDATE users SET wa_notifications = coalesce(p_on, true) WHERE id = v_me;
END; $$;
GRANT EXECUTE ON FUNCTION public.fn_set_wa_notifications(boolean) TO authenticated;

-- Conversation entrante : quel vendeur / quelle commande ? → la plus récente de ce numéro
CREATE OR REPLACE FUNCTION public.fn_wa_route(p_phone text) RETURNS TABLE (seller_id bigint, order_id bigint, buyer_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.seller_id, o.id, o.buyer_name FROM orders o
   WHERE public.norm_phone(o.buyer_phone) = public.norm_phone(p_phone)
   ORDER BY o.created_at DESC LIMIT 1;
$$;

/* ───────────────────────────────────────────────────────────────
   6. DÉCLENCHEURS → Edge Function « wa-notify » (via pg_net)
      Ne bloque et ne fait JAMAIS échouer une commande.
─────────────────────────────────────────────────────────────── */
CREATE OR REPLACE FUNCTION public.fn_wa_notify(p_event text, p_ref text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_url text; v_secret text;
BEGIN
  SELECT value INTO v_url    FROM wa_config WHERE key = 'notify_url';
  SELECT value INTO v_secret FROM wa_config WHERE key = 'notify_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN RETURN; END IF;                 -- WhatsApp non configuré
  IF to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL THEN RETURN; END IF;   -- pg_net absent
  BEGIN
    EXECUTE 'SELECT net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 5000)'
      USING v_url, jsonb_build_object('event', p_event, 'ref', p_ref),
            jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'wa-notify : %', SQLERRM;
  END;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_wa_order_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN PERFORM public.fn_wa_notify('order_status', NEW.id::text); END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS t_wa_order_status ON orders;
CREATE TRIGGER t_wa_order_status AFTER UPDATE OF status ON orders
FOR EACH ROW EXECUTE FUNCTION public.trg_wa_order_status();

CREATE OR REPLACE FUNCTION public.trg_wa_return() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN PERFORM public.fn_wa_notify('return_created', NEW.id::text);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN PERFORM public.fn_wa_notify('return_status', NEW.id::text);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS t_wa_return_ins ON returns;
DROP TRIGGER IF EXISTS t_wa_return_upd ON returns;
CREATE TRIGGER t_wa_return_ins AFTER INSERT ON returns FOR EACH ROW EXECUTE FUNCTION public.trg_wa_return();
CREATE TRIGGER t_wa_return_upd AFTER UPDATE OF status ON returns FOR EACH ROW EXECUTE FUNCTION public.trg_wa_return();

/* ───────────────────────────────────────────────────────────────
   7. DROITS : tout est fermé sauf ce qui est listé ici
─────────────────────────────────────────────────────────────── */
REVOKE ALL ON FUNCTION public.norm_phone(text, text), public.gen_receipt_code(),
  public.fn_wa_route(text), public.fn_wa_notify(text, text),
  public.trg_wa_order_status(), public.trg_wa_return() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON wa_config, return_attempts FROM anon, authenticated;
REVOKE ALL ON wa_messages FROM anon;
REVOKE ALL ON SEQUENCE wa_messages_id_seq, return_attempts_id_seq FROM anon, authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON wa_messages, wa_config TO service_role;
    GRANT USAGE ON SEQUENCE wa_messages_id_seq TO service_role;
    GRANT EXECUTE ON FUNCTION public.fn_wa_route(text), public.norm_phone(text, text) TO service_role;
  END IF;
END $$;

/* ───────────────────────────────────────────────────────────────
   8. BRANCHER LES DÉCLENCHEURS (à faire APRÈS le déploiement des fonctions)
      Remplace <REF> par la référence de ton projet Supabase et <SECRET> par le
      même secret que WA_NOTIFY_SECRET des Edge Functions, puis exécute :

   INSERT INTO wa_config (key, value) VALUES
     ('notify_url',    'https://<REF>.supabase.co/functions/v1/wa-notify'),
     ('notify_secret', '<SECRET>')
   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
─────────────────────────────────────────────────────────────── */
