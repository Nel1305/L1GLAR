-- ═══════════════════════════════════════════════════
-- MARKET PLACE L1 GLAR — chat_setup.sql
-- Colle dans Supabase → SQL Editor → Run
-- ═══════════════════════════════════════════════════

-- Messages (chiffrés AES-256 côté client)
CREATE TABLE IF NOT EXISTS messages (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sender_id   bigint NOT NULL,
  sender_name text NOT NULL,
  sender_role text NOT NULL CHECK (sender_role IN ('seller','admin')),
  receiver_id bigint,           -- NULL = canal général
  content     text NOT NULL,    -- contenu chiffré
  is_general  boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

-- Connexions vendeur ↔ vendeur (métadonnées seulement)
CREATE TABLE IF NOT EXISTS seller_connections (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  seller_a_id   bigint NOT NULL,
  seller_a_name text NOT NULL,
  seller_b_id   bigint NOT NULL,
  seller_b_name text NOT NULL,
  message_count integer DEFAULT 1,
  last_contact  timestamptz DEFAULT now(),
  UNIQUE (seller_a_id, seller_b_id)
);

ALTER TABLE messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all" ON messages           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON seller_connections FOR ALL USING (true) WITH CHECK (true);

-- Activer Realtime sur messages
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
