-- ═══════════════════════════════════════════════════
-- MARKET PLACE L1 GLAR — superadmin_setup.sql
-- Colle dans Supabase → SQL Editor → Run
-- ═══════════════════════════════════════════════════

-- 1. Compte super admin (toi seul)
create table if not exists admins (
  id         bigint generated always as identity primary key,
  email      text unique not null,
  password   text not null,
  name       text not null default 'Admin',
  created_at timestamptz default now()
);

-- Insère ton compte admin (change l'email et le mot de passe !)
-- Mot de passe ici = "admin2024" encodé en btoa (valeur actuelle : YWRtaW4yMDI0)
-- Après le premier login, le mot de passe sera migré en SHA-256 (plus sûr) par le code JS.
insert into admins (email, password, name)
values ('cbuabey@gmail.com', 'YWRtaW4yMDI0', 'Nel''si Admin')
on conflict (email) do nothing;

-- 2. Paramètres de facturation par vendeur
alter table users
  add column if not exists billing_period text default 'monthly'
    check (billing_period in ('weekly', 'monthly')),
  add column if not exists is_blocked     boolean default false,
  add column if not exists blocked_reason text;

-- 3. Table des commissions (une ligne par période)
create table if not exists commissions (
  id            bigint generated always as identity primary key,
  seller_id     bigint references users(id) on delete cascade,
  seller_name   text not null,
  period_label  text not null,      -- ex: "Janvier 2025" ou "Semaine 12 - 2025"
  period_start  date not null,
  period_end    date not null,
  revenue       integer not null default 0,   -- CA de la période (FCFA)
  rate          numeric(4,2) not null default 5.00,  -- taux %
  amount_due    integer not null default 0,   -- montant dû (revenue * rate / 100)
  amount_paid   integer not null default 0,   -- montant reçu
  status        text default 'pending'
    check (status in ('pending', 'paid', 'overdue', 'partial')),
  due_date      date,
  paid_at       timestamptz,
  note          text,
  created_at    timestamptz default now()
);

-- Politiques accès
alter table admins      enable row level security;
alter table commissions enable row level security;
create policy "public_all" on admins      for all using (true) with check (true);
create policy "public_all" on commissions for all using (true) with check (true);
