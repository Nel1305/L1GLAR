-- ═══════════════════════════════════════════════════
-- MARKET PLACE L1 GLAR — Supabase Setup SQL
-- Colle ce fichier entier dans :
-- Supabase → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════

-- 1. USERS (comptes vendeurs)
create table if not exists users (
  id         bigint generated always as identity primary key,
  first_name text not null,
  last_name  text,
  name       text not null,          -- nom affiché (ex: "Amina D.")
  email      text unique not null,
  phone      text,
  password   text not null,          -- hashé côté JS (btoa simple pour démo)
  bio        text,
  shop_open  boolean default true,
  created_at timestamptz default now()
);

-- 2. PRODUCTS (produits des vendeurs)
create table if not exists products (
  id          bigint generated always as identity primary key,
  seller_id   bigint references users(id) on delete cascade,
  seller_name text not null,
  name        text not null,
  description text,
  category    text check (category in ('food','drink','other')) default 'food',
  price       integer not null,
  emoji       text default '🛍️',
  photo_url   text,                  -- URL base64 ou lien image
  rating      numeric(3,1) default 0,
  votes       integer default 0,
  available   boolean default true,
  created_at  timestamptz default now()
);

-- 3. ORDERS (commandes des clients)
create table if not exists orders (
  id           bigint generated always as identity primary key,
  seller_id    bigint references users(id) on delete cascade,
  product_id   bigint references products(id) on delete set null,
  product_name text not null,
  buyer_name   text not null,
  buyer_email  text not null,
  buyer_phone  text,
  qty          integer not null default 1,
  total        integer not null,
  notes        text,
  status       text check (status in ('new','done','cancel')) default 'new',
  created_at   timestamptz default now()
);

-- 4. REVIEWS (avis sur les produits)
create table if not exists reviews (
  id            bigint generated always as identity primary key,
  seller_id     bigint references users(id) on delete cascade,
  product_id    bigint references products(id) on delete cascade,
  product_name  text not null,
  seller_name   text,
  reviewer_name text not null,
  rating        integer check (rating between 1 and 5) not null,
  text          text not null,
  created_at    timestamptz default now()
);

-- ── Activer l'accès public (Row Level Security désactivé pour démo)
alter table users    enable row level security;
alter table products enable row level security;
alter table orders   enable row level security;
alter table reviews  enable row level security;

-- Politiques ouvertes (démo — en prod, restreindre par seller_id)
create policy "public_all" on users    for all using (true) with check (true);
create policy "public_all" on products for all using (true) with check (true);
create policy "public_all" on orders   for all using (true) with check (true);
create policy "public_all" on reviews  for all using (true) with check (true);

-- ── Données démo (quelques produits de base)
insert into users (first_name, last_name, name, email, phone, password) values
  ('Demo', 'Vendeur', 'Demo V.', 'demo@glar.com', '+221 77 000 00 00', 'ZGVtbzEyMw==')
on conflict (email) do nothing;

-- (Les produits démo seront insérés automatiquement par le JS au premier lancement)
