/* ═══════════════════════════════════════════════════════════════
   N MARKET — secure_01_migration.sql
   REFONTE SÉCURITÉ : Supabase Auth + RLS par rôle + RPC atomiques

   Remplace TOUTES les politiques « public_all » et les RPC non
   authentifiées (fn_update_password, fn_admin_update_password,
   fn_regenerate_access_key, fn_login_*, …).

   PRÉREQUIS : la base existante (setup_complet + update_v2..v6 +
   backend_hardening_all) doit déjà avoir été appliquée — c'est
   le cas si le site fonctionne aujourd'hui.

   ORDRE D'EXÉCUTION (Supabase → SQL Editor) :
     1. ce fichier (secure_01_migration.sql)
     2. secure_02_migrate_existing_accounts.sql   (comptes vendeurs existants)
     3. secure_03_create_admin.sql                (compte admin, après l'avoir créé dans Auth)
   Puis déployer le nouveau code du site. Voir SECURITE_LISEZMOI.md.

   Idempotent : peut être relancé.
═══════════════════════════════════════════════════════════════ */

DO $$ BEGIN
  IF to_regclass('public.notifications') IS NULL OR to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'Base incomplète : exécute d''abord setup_complet.sql et backend_hardening_all.sql.';
  END IF;
END $$;

/* ───────────────────────────────────────────────────────────────
   0. COLONNES — rend le script autonome (anciens schémas inclus)
─────────────────────────────────────────────────────────────── */
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name         text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name          text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS name               text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio                text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_open          boolean DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked         boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_reason     text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_period     text DEFAULT 'monthly';
ALTER TABLE users ADD COLUMN IF NOT EXISTS filiere            text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash      text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_key         text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_premium         boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_expires_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_theme      jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_id            uuid;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS password_hash     text;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS auth_id           uuid;
ALTER TABLE products ADD COLUMN IF NOT EXISTS attributes      jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lat        double precision;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lng        double precision;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_place_name text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS receiver_role text;   -- 'seller' | 'admin' | NULL (canal général)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_plain      boolean DEFAULT false; -- false = ancien message chiffré côté client

-- Les mots de passe sont désormais gérés par Supabase Auth
ALTER TABLE users  ALTER COLUMN password DROP NOT NULL;
ALTER TABLE admins ALTER COLUMN password DROP NOT NULL;

-- Lien comptes métier ↔ Supabase Auth (supprimer le compte Auth supprime le compte métier)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_auth_id_fkey') THEN
    ALTER TABLE users ADD CONSTRAINT users_auth_id_fkey FOREIGN KEY (auth_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admins_auth_id_fkey') THEN
    ALTER TABLE admins ADD CONSTRAINT admins_auth_id_fkey FOREIGN KEY (auth_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_id  ON users(auth_id)  WHERE auth_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_admins_auth_id ON admins(auth_id) WHERE auth_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_ci ON users(lower(email));

-- seller_connections : une ligne par paire (alimentée désormais par un trigger serveur)
DELETE FROM seller_connections a USING seller_connections b
 WHERE a.id > b.id AND a.seller_a_id = b.seller_a_id AND a.seller_b_id = b.seller_b_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_seller_conn_pair ON seller_connections(seller_a_id, seller_b_id);

-- Anciens messages : renseigne receiver_role
UPDATE messages SET receiver_role = CASE
    WHEN is_general THEN NULL
    WHEN sender_role = 'seller' AND receiver_id IS NULL THEN 'admin'
    ELSE 'seller' END
 WHERE receiver_role IS NULL AND NOT is_general;


/* ───────────────────────────────────────────────────────────────
   1. SUPPRESSION DES ANCIENNES RPC DANGEREUSES
─────────────────────────────────────────────────────────────── */
DROP FUNCTION IF EXISTS fn_update_password(bigint, text);
DROP FUNCTION IF EXISTS fn_admin_update_password(bigint, text);
DROP FUNCTION IF EXISTS fn_regenerate_access_key(bigint);
DROP FUNCTION IF EXISTS fn_login_with_access_key(text);
DROP FUNCTION IF EXISTS fn_login_user(text, text);
DROP FUNCTION IF EXISTS fn_admin_login(text, text);
DROP FUNCTION IF EXISTS fn_register_user(text, text, text, text, text, text);
DROP FUNCTION IF EXISTS gen_access_key();


/* ───────────────────────────────────────────────────────────────
   2. TOUT FERMER PAR DÉFAUT (RLS + droits)
─────────────────────────────────────────────────────────────── */
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['users','admins','products','orders','reviews','commissions','messages',
    'seller_connections','categories','filieres','settings','returns','promo_plans','promotions',
    'seller_reports','ad_banners','notifications']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;

REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;


/* ───────────────────────────────────────────────────────────────
   3. FONCTIONS D'IDENTITÉ (utilisées par les politiques RLS)
─────────────────────────────────────────────────────────────── */
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM admins WHERE auth_id = auth.uid());
$$;

-- id du vendeur connecté (même s'il est bloqué : lecture de son propre compte)
CREATE OR REPLACE FUNCTION public.my_user_id() RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM users WHERE auth_id = auth.uid();
$$;

-- id du vendeur connecté ET non bloqué : requis pour toute écriture
CREATE OR REPLACE FUNCTION public.my_active_seller_id() RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM users WHERE auth_id = auth.uid() AND NOT coalesce(is_blocked, false);
$$;

GRANT EXECUTE ON FUNCTION public.is_admin(), public.my_user_id(), public.my_active_seller_id() TO anon, authenticated;


/* ───────────────────────────────────────────────────────────────
   4. INSCRIPTION : profil vendeur créé CÔTÉ SERVEUR à partir de Supabase Auth
      (le client appelle supabase.auth.signUp avec first_name/last_name/phone/filiere)
─────────────────────────────────────────────────────────────── */
CREATE OR REPLACE FUNCTION public.handle_new_auth_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_first text; v_last text; v_name text; v_phone text; v_fil text;
BEGIN
  -- compte déjà lié (migration) ou compte sans métadonnées d'inscription (ex. admin créé depuis le Dashboard)
  IF EXISTS (SELECT 1 FROM users WHERE auth_id = NEW.id) THEN RETURN NEW; END IF;
  v_first := left(btrim(coalesce(NEW.raw_user_meta_data->>'first_name', '')), 60);
  IF v_first = '' THEN RETURN NEW; END IF;

  v_last  := nullif(left(btrim(coalesce(NEW.raw_user_meta_data->>'last_name', '')), 60), '');
  v_phone := nullif(left(btrim(coalesce(NEW.raw_user_meta_data->>'phone', '')), 30), '');
  v_fil   := nullif(left(btrim(coalesce(NEW.raw_user_meta_data->>'filiere', '')), 60), '');
  v_name  := v_first || CASE WHEN v_last IS NOT NULL THEN ' ' || upper(left(v_last, 1)) || '.' ELSE '' END;

  IF EXISTS (SELECT 1 FROM users WHERE lower(email) = lower(NEW.email)) THEN
    RAISE EXCEPTION 'Cet email est déjà utilisé.';
  END IF;

  INSERT INTO users (first_name, last_name, name, email, phone, password, filiere, auth_id)
  VALUES (v_first, v_last, v_name, NEW.email, v_phone, '', v_fil, NEW.id);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Changement d'email confirmé côté Auth → recopié dans le profil
CREATE OR REPLACE FUNCTION public.sync_auth_email() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE users  SET email = NEW.email WHERE auth_id = NEW.id;
    UPDATE admins SET email = NEW.email WHERE auth_id = NEW.id;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
CREATE TRIGGER on_auth_user_email_changed AFTER UPDATE OF email ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.sync_auth_email();


/* ───────────────────────────────────────────────────────────────
   5. TABLES DE RÉFÉRENCE : lecture publique, écriture admin
─────────────────────────────────────────────────────────────── */
GRANT SELECT ON categories, filieres, settings, promo_plans, ad_banners TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON categories, filieres, settings, promo_plans, ad_banners TO authenticated;

CREATE POLICY categories_read  ON categories  FOR SELECT USING (true);
CREATE POLICY filieres_read    ON filieres    FOR SELECT USING (true);
CREATE POLICY settings_read    ON settings    FOR SELECT USING (key IN ('commission_rate','report_threshold') OR is_admin());
CREATE POLICY promo_plans_read ON promo_plans FOR SELECT USING (active OR is_admin());
CREATE POLICY ad_banners_read  ON ad_banners  FOR SELECT USING (active OR is_admin());

CREATE POLICY categories_admin  ON categories  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY filieres_admin    ON filieres    FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY settings_admin    ON settings    FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY promo_plans_admin ON promo_plans FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY ad_banners_admin  ON ad_banners  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());


/* ───────────────────────────────────────────────────────────────
   6. USERS / ADMINS
      - un vendeur ne lit/modifie QUE son propre profil (colonnes limitées)
      - jamais d'accès à password, password_hash, access_key
      - blocage / facturation / suppression : RPC admin uniquement
─────────────────────────────────────────────────────────────── */
GRANT SELECT (id, auth_id, first_name, last_name, name, email, phone, bio, shop_open, is_blocked,
              blocked_reason, billing_period, filiere, created_at, is_premium, premium_expires_at, premium_theme)
  ON users TO authenticated;
GRANT UPDATE (first_name, last_name, name, phone, bio, shop_open, filiere) ON users TO authenticated;

CREATE POLICY users_select ON users FOR SELECT TO authenticated USING (auth_id = auth.uid() OR is_admin());
CREATE POLICY users_update ON users FOR UPDATE TO authenticated USING (auth_id = auth.uid()) WITH CHECK (auth_id = auth.uid());

GRANT SELECT (id, auth_id, name, email, created_at) ON admins TO authenticated;
CREATE POLICY admins_select ON admins FOR SELECT TO authenticated USING (auth_id = auth.uid());

-- Vitrine publique des vendeurs : AUCUNE donnée de contact
CREATE OR REPLACE VIEW public.public_sellers WITH (security_invoker = false) AS
  SELECT id, name, bio, shop_open, filiere FROM users WHERE NOT coalesce(is_blocked, false);
GRANT SELECT ON public.public_sellers TO anon, authenticated;

-- Garde les noms dénormalisés cohérents
CREATE OR REPLACE FUNCTION public.trg_users_name_sync() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE products SET seller_name = NEW.name WHERE seller_id = NEW.id;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS t_users_name_sync ON users;
CREATE TRIGGER t_users_name_sync AFTER UPDATE OF name ON users
FOR EACH ROW EXECUTE FUNCTION public.trg_users_name_sync();

CREATE OR REPLACE FUNCTION public.trg_users_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.name IS NULL OR btrim(NEW.name) = '' OR length(NEW.name) > 80 THEN RAISE EXCEPTION 'Nom de boutique invalide.'; END IF;
  IF NEW.bio IS NOT NULL AND length(NEW.bio) > 1000 THEN RAISE EXCEPTION 'Description trop longue.'; END IF;
  IF NEW.phone IS NOT NULL AND length(NEW.phone) > 30 THEN RAISE EXCEPTION 'Téléphone invalide.'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS t_users_guard ON users;
CREATE TRIGGER t_users_guard BEFORE UPDATE OF name, bio, phone ON users
FOR EACH ROW EXECUTE FUNCTION public.trg_users_guard();


/* ───────────────────────────────────────────────────────────────
   7. PRODUITS
─────────────────────────────────────────────────────────────── */
GRANT SELECT ON products TO anon, authenticated;
GRANT INSERT ON products TO authenticated;
GRANT UPDATE (name, description, category, price, emoji, photo_url, available, track_stock, stock, show_stock, attributes)
  ON products TO authenticated;
GRANT DELETE ON products TO authenticated;

CREATE POLICY products_read   ON products FOR SELECT USING (available OR seller_id = my_user_id() OR is_admin());
CREATE POLICY products_insert ON products FOR INSERT TO authenticated WITH CHECK (seller_id = my_active_seller_id());
CREATE POLICY products_update ON products FOR UPDATE TO authenticated
  USING (seller_id = my_active_seller_id() OR is_admin()) WITH CHECK (seller_id = my_active_seller_id() OR is_admin());
CREATE POLICY products_delete ON products FOR DELETE TO authenticated USING (seller_id = my_user_id() OR is_admin());

CREATE OR REPLACE FUNCTION public.trg_products_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT name INTO NEW.seller_name FROM users WHERE id = NEW.seller_id;   -- jamais fourni par le client
    NEW.rating := 0; NEW.votes := 0;
  END IF;
  -- Ne valide que ce qui change : une vieille donnée atypique ne doit jamais bloquer une commande (décrément de stock)
  IF TG_OP = 'INSERT' OR NEW.name IS DISTINCT FROM OLD.name THEN
    IF NEW.name IS NULL OR btrim(NEW.name) = '' OR length(NEW.name) > 150 THEN RAISE EXCEPTION 'Nom de produit invalide.'; END IF;
  END IF;
  IF TG_OP = 'INSERT' OR NEW.description IS DISTINCT FROM OLD.description THEN
    IF NEW.description IS NOT NULL AND length(NEW.description) > 2000 THEN RAISE EXCEPTION 'Description trop longue.'; END IF;
  END IF;
  IF TG_OP = 'INSERT' OR NEW.price IS DISTINCT FROM OLD.price THEN
    IF NEW.price IS NULL OR NEW.price < 0 OR NEW.price > 100000000 THEN RAISE EXCEPTION 'Prix invalide.'; END IF;
  END IF;
  IF TG_OP = 'INSERT' OR NEW.stock IS DISTINCT FROM OLD.stock THEN
    IF NEW.stock IS NULL OR NEW.stock < 0 OR NEW.stock > 1000000 THEN RAISE EXCEPTION 'Stock invalide.'; END IF;
  END IF;
  IF TG_OP = 'INSERT' OR NEW.emoji IS DISTINCT FROM OLD.emoji THEN
    IF NEW.emoji IS NOT NULL AND length(NEW.emoji) > 16 THEN RAISE EXCEPTION 'Emoji invalide.'; END IF;
  END IF;
  IF (TG_OP = 'INSERT' OR NEW.photo_url IS DISTINCT FROM OLD.photo_url) AND NEW.photo_url IS NOT NULL AND NEW.photo_url <> '' THEN
    IF length(NEW.photo_url) > 9000000
       OR NEW.photo_url ~ '["''<>[:space:]]'
       OR NOT (NEW.photo_url ~* '^data:image/(png|jpe?g|webp|gif);base64,' OR NEW.photo_url ~* '^https://') THEN
      RAISE EXCEPTION 'Photo invalide (PNG, JPEG, WebP ou GIF).';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS t_products_guard ON products;
CREATE TRIGGER t_products_guard BEFORE INSERT OR UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION public.trg_products_guard();


/* ───────────────────────────────────────────────────────────────
   8. COMMANDES — création UNIQUEMENT via fn_place_order
      (prix recalculés serveur, stock verrouillé et décrémenté
       dans la même transaction, panier tout-ou-rien)
─────────────────────────────────────────────────────────────── */
GRANT SELECT ON orders TO authenticated;
GRANT UPDATE (status) ON orders TO authenticated;
CREATE POLICY orders_select ON orders FOR SELECT TO authenticated USING (seller_id = my_user_id() OR is_admin());
CREATE POLICY orders_update ON orders FOR UPDATE TO authenticated
  USING (seller_id = my_user_id() OR is_admin()) WITH CHECK (seller_id = my_user_id() OR is_admin());

-- Statuts : 'cancel' est définitif ; l'annulation recrédite le stock côté serveur
CREATE OR REPLACE FUNCTION public.trg_orders_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('new','done','cancel') THEN RAISE EXCEPTION 'Statut invalide.'; END IF;
  IF OLD.status = 'cancel' AND NEW.status <> 'cancel' THEN
    RAISE EXCEPTION 'Une commande annulée ne peut plus être modifiée.';
  END IF;
  IF NEW.status = 'cancel' AND OLD.status <> 'cancel' AND NEW.product_id IS NOT NULL THEN
    UPDATE products SET stock = stock + NEW.qty WHERE id = NEW.product_id AND track_stock;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS t_orders_status ON orders;
CREATE TRIGGER t_orders_status BEFORE UPDATE OF status ON orders
FOR EACH ROW EXECUTE FUNCTION public.trg_orders_status();

CREATE OR REPLACE FUNCTION public.fn_place_order(
  p_buyer_name text, p_buyer_phone text, p_notes text,
  p_delivery_date date, p_delivery_time text, p_delivery_type text, p_delivery_address text,
  p_buyer_classe text, p_buyer_filiere text, p_items jsonb,
  p_lat double precision DEFAULT NULL, p_lng double precision DEFAULT NULL, p_place_name text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_group text := 'og_' || replace(gen_random_uuid()::text, '-', '');
  v_name text := btrim(coalesce(p_buyer_name, ''));
  v_phone text := btrim(coalesce(p_buyer_phone, ''));
  v_type text := coalesce(p_delivery_type, 'campus');
  v_item record; v_prod products%ROWTYPE; v_seller users%ROWTYPE;
  v_order orders%ROWTYPE; v_out jsonb := '[]'::jsonb; v_total numeric := 0; v_note text;
BEGIN
  IF length(v_name) < 2 OR length(v_name) > 100 THEN RAISE EXCEPTION 'Nom invalide.'; END IF;
  IF length(regexp_replace(v_phone, '\D', '', 'g')) < 7 OR length(v_phone) > 30 THEN RAISE EXCEPTION 'Numéro de téléphone invalide.'; END IF;
  IF p_notes IS NOT NULL AND length(p_notes) > 500 THEN RAISE EXCEPTION 'Instructions trop longues.'; END IF;
  IF v_type NOT IN ('campus','external') THEN RAISE EXCEPTION 'Type de livraison invalide.'; END IF;
  IF p_delivery_date IS NULL OR p_delivery_date < current_date - 1 OR p_delivery_date > current_date + 90 THEN RAISE EXCEPTION 'Date de livraison invalide.'; END IF;
  IF p_delivery_time IS NULL OR p_delivery_time !~ '^[0-2][0-9]:[0-5][0-9]$' THEN RAISE EXCEPTION 'Heure de livraison invalide.'; END IF;
  IF v_type = 'external' AND (p_delivery_address IS NULL OR btrim(p_delivery_address) = '' OR length(p_delivery_address) > 300) THEN RAISE EXCEPTION 'Adresse de livraison invalide.'; END IF;
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
     GROUP BY 1 ORDER BY 1                       -- ordre stable : évite les deadlocks
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
                        buyer_classe, buyer_filiere, order_group, delivery_lat, delivery_lng, delivery_place_name)
    VALUES (v_prod.seller_id, v_seller.name, v_prod.id, v_prod.name, v_name, v_phone, v_item.qty,
            v_prod.price * v_item.qty,
            nullif(btrim(coalesce(p_notes, '')), ''), v_note, 'new', p_delivery_date, p_delivery_time, v_type,
            CASE WHEN v_type = 'external' THEN btrim(p_delivery_address) END,
            CASE WHEN v_type = 'campus' THEN btrim(p_buyer_classe) END,
            CASE WHEN v_type = 'campus' THEN p_buyer_filiere END,
            v_group,
            CASE WHEN v_type = 'external' THEN p_lat END, CASE WHEN v_type = 'external' THEN p_lng END,
            CASE WHEN v_type = 'external' THEN left(p_place_name, 120) END)
    RETURNING * INTO v_order;

    v_total := v_total + v_order.total;
    v_out := v_out || jsonb_build_object(
      'id', v_order.id, 'created_at', v_order.created_at, 'product_id', v_order.product_id,
      'product_name', v_order.product_name, 'seller_id', v_order.seller_id, 'seller_name', v_order.seller_name,
      'qty', v_order.qty, 'total', v_order.total, 'item_note', coalesce(v_order.item_note, ''));
  END LOOP;

  RETURN jsonb_build_object('order_group', v_group, 'orders', v_out, 'grand_total', v_total);
END; $$;
GRANT EXECUTE ON FUNCTION public.fn_place_order(text,text,text,date,text,text,text,text,text,jsonb,double precision,double precision,text) TO anon, authenticated;


/* ───────────────────────────────────────────────────────────────
   9. AVIS — via RPC ; note moyenne recalculée serveur
─────────────────────────────────────────────────────────────── */
GRANT SELECT ON reviews TO anon, authenticated;
CREATE POLICY reviews_read ON reviews FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.fn_add_review(p_product_id bigint, p_name text, p_rating int, p_text text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prod products%ROWTYPE; v_name text := btrim(coalesce(p_name, '')); v_text text := btrim(coalesce(p_text, ''));
BEGIN
  IF length(v_name) < 2 OR length(v_name) > 60 THEN RAISE EXCEPTION 'Nom invalide.'; END IF;
  IF length(v_text) < 1 OR length(v_text) > 1000 THEN RAISE EXCEPTION 'Avis invalide.'; END IF;
  IF p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Note invalide.'; END IF;
  SELECT * INTO v_prod FROM products WHERE id = p_product_id AND available;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produit introuvable.'; END IF;
  IF EXISTS (SELECT 1 FROM reviews WHERE product_id = p_product_id AND lower(reviewer_name) = lower(v_name)
                AND created_at > now() - interval '1 day') THEN
    RAISE EXCEPTION 'Tu as déjà donné ton avis sur ce produit.';
  END IF;
  IF (SELECT count(*) FROM reviews WHERE product_id = p_product_id AND created_at > now() - interval '1 hour') >= 20 THEN
    RAISE EXCEPTION 'Trop d''avis en peu de temps. Réessaie plus tard.';
  END IF;
  INSERT INTO reviews (seller_id, product_id, product_name, seller_name, reviewer_name, rating, text)
  VALUES (v_prod.seller_id, v_prod.id, v_prod.name, v_prod.seller_name, v_name, p_rating, v_text);
  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.fn_add_review(bigint, text, int, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_reviews_rating() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE products SET
    rating = coalesce((SELECT round(avg(rating)::numeric, 1) FROM reviews WHERE product_id = NEW.product_id), 0),
    votes  = (SELECT count(*) FROM reviews WHERE product_id = NEW.product_id)
  WHERE id = NEW.product_id;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS t_reviews_rating ON reviews;
CREATE TRIGGER t_reviews_rating AFTER INSERT ON reviews
FOR EACH ROW EXECUTE FUNCTION public.trg_reviews_rating();


/* ───────────────────────────────────────────────────────────────
   10. RETOURS — création vérifiée (n° de commande + téléphone)
─────────────────────────────────────────────────────────────── */
GRANT SELECT ON returns TO authenticated;
GRANT UPDATE (status, seller_response, responded_at) ON returns TO authenticated;
CREATE POLICY returns_select ON returns FOR SELECT TO authenticated USING (seller_id = my_user_id() OR is_admin());
CREATE POLICY returns_update ON returns FOR UPDATE TO authenticated
  USING (seller_id = my_user_id()) WITH CHECK (seller_id = my_user_id());

CREATE OR REPLACE FUNCTION public.trg_returns_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('pending','accepted','rejected') THEN RAISE EXCEPTION 'Statut invalide.'; END IF;
  IF NEW.seller_response IS NOT NULL AND length(NEW.seller_response) > 1000 THEN RAISE EXCEPTION 'Réponse trop longue.'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS t_returns_guard ON returns;
CREATE TRIGGER t_returns_guard BEFORE UPDATE ON returns
FOR EACH ROW EXECUTE FUNCTION public.trg_returns_guard();

CREATE OR REPLACE FUNCTION public.fn_create_return(p_order_id bigint, p_phone text, p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order orders%ROWTYPE; v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  IF length(v_reason) < 5 OR length(v_reason) > 1000 THEN RAISE EXCEPTION 'Motif invalide (5 à 1000 caractères).'; END IF;
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND OR regexp_replace(coalesce(v_order.buyer_phone, ''), '\D', '', 'g') <> regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
     OR length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 7 THEN
    RAISE EXCEPTION 'Commande introuvable ou téléphone incorrect.';
  END IF;
  IF v_order.status = 'cancel' THEN RAISE EXCEPTION 'Cette commande a été annulée.'; END IF;
  IF EXISTS (SELECT 1 FROM returns WHERE order_id = v_order.id AND status = 'pending') THEN
    RAISE EXCEPTION 'Une demande est déjà en cours pour cette commande.';
  END IF;
  INSERT INTO returns (order_id, seller_id, buyer_name, buyer_phone, product_name, reason, status)
  VALUES (v_order.id, v_order.seller_id, v_order.buyer_name, v_order.buyer_phone, v_order.product_name, v_reason, 'pending');
  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.fn_create_return(bigint, text, text) TO anon, authenticated;


/* ───────────────────────────────────────────────────────────────
   11. COMMISSIONS (lecture : propriétaire ; écriture : admin)
─────────────────────────────────────────────────────────────── */
GRANT SELECT, INSERT, UPDATE, DELETE ON commissions TO authenticated;
CREATE POLICY commissions_read  ON commissions FOR SELECT TO authenticated USING (seller_id = my_user_id() OR is_admin());
CREATE POLICY commissions_admin ON commissions FOR ALL    TO authenticated USING (is_admin()) WITH CHECK (is_admin());


/* ───────────────────────────────────────────────────────────────
   12. PROMOTIONS — demande via RPC (prix = tarif officiel)
─────────────────────────────────────────────────────────────── */
GRANT SELECT ON promotions TO authenticated;
GRANT UPDATE (status, starts_at, ends_at, admin_note) ON promotions TO authenticated;
CREATE POLICY promotions_read   ON promotions FOR SELECT TO authenticated USING (seller_id = my_user_id() OR is_admin());
CREATE POLICY promotions_admin  ON promotions FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE OR REPLACE FUNCTION public.fn_request_promotion(p_product_id bigint, p_plan_id bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me bigint := my_active_seller_id(); v_prod products%ROWTYPE; v_plan promo_plans%ROWTYPE; v_seller users%ROWTYPE; v_row promotions%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Connexion requise.'; END IF;
  SELECT * INTO v_prod FROM products WHERE id = p_product_id AND seller_id = v_me;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produit introuvable.'; END IF;
  SELECT * INTO v_plan FROM promo_plans WHERE id = p_plan_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Formule indisponible.'; END IF;
  IF EXISTS (SELECT 1 FROM promotions WHERE product_id = p_product_id AND status = 'pending') THEN
    RAISE EXCEPTION 'Une demande est déjà en attente pour ce produit.';
  END IF;
  SELECT * INTO v_seller FROM users WHERE id = v_me;
  INSERT INTO promotions (product_id, seller_id, seller_name, product_name, plan_id, plan_label, duration_days, price, status)
  VALUES (v_prod.id, v_me, v_seller.name, v_prod.name, v_plan.id, v_plan.label, v_plan.duration_days, v_plan.price, 'pending')
  RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END; $$;
GRANT EXECUTE ON FUNCTION public.fn_request_promotion(bigint, bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_active_promoted_product_ids() RETURNS SETOF bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT product_id FROM promotions WHERE status = 'active' AND (ends_at IS NULL OR ends_at > now());
$$;
GRANT EXECUTE ON FUNCTION public.fn_active_promoted_product_ids() TO anon, authenticated;


/* ───────────────────────────────────────────────────────────────
   13. SIGNALEMENTS — création via RPC, lecture admin uniquement
─────────────────────────────────────────────────────────────── */
GRANT SELECT ON seller_reports TO authenticated;
GRANT UPDATE (status) ON seller_reports TO authenticated;
CREATE POLICY reports_read   ON seller_reports FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY reports_update ON seller_reports FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE OR REPLACE FUNCTION public.fn_report_seller(p_seller_id bigint, p_name text, p_phone text, p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_seller users%ROWTYPE; v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  IF length(v_reason) < 5 OR length(v_reason) > 1000 THEN RAISE EXCEPTION 'Motif invalide (5 à 1000 caractères).'; END IF;
  IF p_name IS NOT NULL AND length(p_name) > 80 THEN RAISE EXCEPTION 'Nom trop long.'; END IF;
  IF p_phone IS NOT NULL AND length(p_phone) > 30 THEN RAISE EXCEPTION 'Téléphone invalide.'; END IF;
  SELECT * INTO v_seller FROM users WHERE id = p_seller_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendeur introuvable.'; END IF;
  IF (SELECT count(*) FROM seller_reports WHERE seller_id = p_seller_id AND created_at > now() - interval '1 hour') >= 10 THEN
    RAISE EXCEPTION 'Trop de signalements récents pour ce vendeur.';
  END IF;
  IF coalesce(p_phone, '') <> '' AND EXISTS (SELECT 1 FROM seller_reports WHERE seller_id = p_seller_id AND reporter_phone = p_phone
        AND created_at > now() - interval '1 day') THEN
    RAISE EXCEPTION 'Tu as déjà signalé ce vendeur récemment.';
  END IF;
  INSERT INTO seller_reports (seller_id, seller_name, reporter_name, reporter_phone, reason, status)
  VALUES (v_seller.id, v_seller.name, nullif(btrim(coalesce(p_name, '')), ''), nullif(btrim(coalesce(p_phone, '')), ''), v_reason, 'pending');
  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.fn_report_seller(bigint, text, text, text) TO anon, authenticated;


/* ───────────────────────────────────────────────────────────────
   14. CHAT — réservé aux vendeurs connectés et aux admins
       (expéditeur imposé par le serveur, plus d'usurpation possible)
─────────────────────────────────────────────────────────────── */
GRANT SELECT, INSERT ON messages TO authenticated;
CREATE POLICY messages_read ON messages FOR SELECT TO authenticated USING (
     is_admin()
  OR (is_general AND my_user_id() IS NOT NULL)
  OR (sender_role = 'seller'   AND sender_id   = my_user_id())
  OR (receiver_role = 'seller' AND receiver_id = my_user_id())
);
CREATE POLICY messages_insert ON messages FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR my_active_seller_id() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.trg_messages_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin admins%ROWTYPE; v_user users%ROWTYPE;
BEGIN
  IF NEW.content IS NULL OR btrim(NEW.content) = '' OR length(NEW.content) > 4000 THEN RAISE EXCEPTION 'Message invalide.'; END IF;
  SELECT * INTO v_admin FROM admins WHERE auth_id = auth.uid();
  IF FOUND THEN
    NEW.sender_role := 'admin'; NEW.sender_id := v_admin.id; NEW.sender_name := v_admin.name;
  ELSE
    SELECT * INTO v_user FROM users WHERE auth_id = auth.uid() AND NOT coalesce(is_blocked, false);
    IF NOT FOUND THEN RAISE EXCEPTION 'Connexion requise.'; END IF;
    NEW.sender_role := 'seller'; NEW.sender_id := v_user.id; NEW.sender_name := v_user.name;
  END IF;

  NEW.is_plain := true;
  NEW.read_by  := '[]'::jsonb;
  IF coalesce(NEW.is_general, false) THEN
    NEW.is_general := true; NEW.receiver_id := NULL; NEW.receiver_role := NULL;
  ELSE
    NEW.is_general := false;
    IF NEW.receiver_role = 'admin' AND NEW.sender_role = 'seller' THEN
      NEW.receiver_id := NULL;
    ELSIF NEW.receiver_role = 'seller' AND NEW.receiver_id IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE id = NEW.receiver_id) THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'Destinataire invalide.';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS t_messages_guard ON messages;
CREATE TRIGGER t_messages_guard BEFORE INSERT ON messages
FOR EACH ROW EXECUTE FUNCTION public.trg_messages_guard();

-- Graphe des conversations vendeur ↔ vendeur : alimenté côté serveur
CREATE OR REPLACE FUNCTION public.trg_messages_connection() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a bigint; b bigint; an text; bn text;
BEGIN
  IF NOT NEW.is_general AND NEW.sender_role = 'seller' AND NEW.receiver_role = 'seller' AND NEW.receiver_id <> NEW.sender_id THEN
    a := least(NEW.sender_id, NEW.receiver_id); b := greatest(NEW.sender_id, NEW.receiver_id);
    SELECT name INTO an FROM users WHERE id = a;
    SELECT name INTO bn FROM users WHERE id = b;
    INSERT INTO seller_connections (seller_a_id, seller_a_name, seller_b_id, seller_b_name)
    VALUES (a, coalesce(an, '?'), b, coalesce(bn, '?'))
    ON CONFLICT (seller_a_id, seller_b_id)
    DO UPDATE SET message_count = seller_connections.message_count + 1, last_contact = now();
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS t_messages_connection ON messages;
CREATE TRIGGER t_messages_connection AFTER INSERT ON messages
FOR EACH ROW EXECUTE FUNCTION public.trg_messages_connection();

GRANT SELECT ON seller_connections TO authenticated;
CREATE POLICY conn_read ON seller_connections FOR SELECT TO authenticated
  USING (is_admin() OR seller_a_id = my_user_id() OR seller_b_id = my_user_id());


/* ───────────────────────────────────────────────────────────────
   15. NOTIFICATIONS — chacun ne voit que les siennes
─────────────────────────────────────────────────────────────── */
GRANT SELECT ON notifications TO authenticated;
GRANT UPDATE (is_read) ON notifications TO authenticated;
CREATE POLICY notif_read ON notifications FOR SELECT TO authenticated USING (
  (recipient_type = 'seller' AND recipient_id = my_user_id()) OR (recipient_type = 'admin' AND is_admin()));
CREATE POLICY notif_update ON notifications FOR UPDATE TO authenticated
  USING      ((recipient_type = 'seller' AND recipient_id = my_user_id()) OR (recipient_type = 'admin' AND is_admin()))
  WITH CHECK ((recipient_type = 'seller' AND recipient_id = my_user_id()) OR (recipient_type = 'admin' AND is_admin()));


/* ───────────────────────────────────────────────────────────────
   16. ACTIONS ADMIN (vérifient is_admin() À L'INTÉRIEUR)
─────────────────────────────────────────────────────────────── */
CREATE OR REPLACE FUNCTION public.admin_set_block(p_user_id bigint, p_block boolean, p_reason text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Accès refusé.'; END IF;
  UPDATE users SET is_blocked = p_block, blocked_reason = CASE WHEN p_block THEN left(p_reason, 500) END
   WHERE id = p_user_id RETURNING auth_id INTO v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendeur introuvable.'; END IF;
  UPDATE products SET available = NOT p_block WHERE seller_id = p_user_id;
  IF v_uid IS NOT NULL THEN   -- coupe aussi les sessions Auth
    UPDATE auth.users SET banned_until = CASE WHEN p_block THEN 'infinity'::timestamptz ELSE NULL END WHERE id = v_uid;
  END IF;
  RETURN jsonb_build_object('ok', true);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_billing(p_user_id bigint, p_period text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Accès refusé.'; END IF;
  IF p_period NOT IN ('monthly','weekly') THEN RAISE EXCEPTION 'Période invalide.'; END IF;
  UPDATE users SET billing_period = p_period WHERE id = p_user_id;
  RETURN jsonb_build_object('ok', true);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_delete_seller(p_user_id bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Accès refusé.'; END IF;
  SELECT auth_id INTO v_uid FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendeur introuvable.'; END IF;
  IF v_uid IS NOT NULL THEN DELETE FROM auth.users WHERE id = v_uid;   -- cascade vers users puis products
  ELSE DELETE FROM users WHERE id = p_user_id; END IF;
  RETURN jsonb_build_object('ok', true);
END; $$;

GRANT EXECUTE ON FUNCTION public.admin_set_block(bigint, boolean, text), public.admin_set_billing(bigint, text),
                          public.admin_delete_seller(bigint) TO authenticated;

-- Création / liaison d'un admin : réservé au rôle postgres (SQL Editor), jamais exposé à l'API
CREATE OR REPLACE FUNCTION public.link_admin(p_email text, p_name text DEFAULT 'Admin') RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(btrim(p_email));
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Aucun compte Auth pour % — crée-le d''abord (Authentication → Users → Add user).', p_email; END IF;
  INSERT INTO admins (email, password, name, auth_id) VALUES (lower(btrim(p_email)), '', p_name, v_uid)
  ON CONFLICT (email) DO UPDATE SET auth_id = EXCLUDED.auth_id, name = EXCLUDED.name, password = '';
  RETURN 'Admin lié : ' || p_email;
END; $$;
REVOKE ALL ON FUNCTION public.link_admin(text, text) FROM PUBLIC, anon, authenticated;


/* ───────────────────────────────────────────────────────────────
   17. DÉSACTIVE LES ANCIENS SECRETS
─────────────────────────────────────────────────────────────── */
-- Le compte admin par défaut (admin@glar.com / admin2024) ne doit plus exister
DELETE FROM admins WHERE auth_id IS NULL AND (password = 'YWRtaW4yMDI0' OR lower(email) = 'admin@glar.com');
UPDATE users SET access_key = NULL;   -- la connexion par clé d'accès est supprimée


/* ───────────────────────────────────────────────────────────────
   17bis. DROITS FINAUX SUR LES FONCTIONS (liste blanche)
          Aucune fonction n'est appelable via l'API sauf celles-ci.
─────────────────────────────────────────────────────────────── */
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig, p.proname
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prokind = 'f'
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')  -- ignore les extensions
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.sig);
    IF f.proname NOT IN ('is_admin','my_user_id','my_active_seller_id','fn_place_order','fn_add_review',
                         'fn_create_return','fn_request_promotion','fn_active_promoted_product_ids',
                         'fn_report_seller','admin_set_block','admin_set_billing','admin_delete_seller',
                         'fn_create_return_by_code','fn_set_wa_notifications','admin_list_admins','admin_set_profile','admin_save_admin','admin_remove_admin') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', f.sig);
    END IF;
  END LOOP;
END $$;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;


/* ───────────────────────────────────────────────────────────────
   18. VÉRIFICATION — doit lister les politiques et AUCUNE « public_all »
─────────────────────────────────────────────────────────────── */
SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;
