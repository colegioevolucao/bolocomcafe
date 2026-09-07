-- BOLO COM CAFÉ — BANCO DE DADOS E SEGURANÇA
-- Execute este script no SQL Editor do Supabase.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  role text not null default 'vendas' check (role in ('vendas','gestao')),
  created_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  sale_date date not null default current_date,
  client text,
  channel text,

  whole_cake_flavor text,
  whole_cake_price numeric(10,2) not null default 0 check (whole_cake_price >= 0),

  pot_cake_flavor text,
  pot_cake_price numeric(10,2) not null default 0 check (pot_cake_price >= 0),

  slice_flavor text,
  slice_price numeric(10,2) not null default 0 check (slice_price >= 0),

  cookie_size text,
  cookie_price numeric(10,2) not null default 0 check (cookie_price >= 0),

  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_sale_date_idx on public.sales(sale_date);
create index if not exists sales_created_by_idx on public.sales(created_by);

-- Cria perfil automaticamente ao criar usuário no Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    'vendas'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.sales enable row level security;

-- PERFIS: o usuário lê somente o próprio perfil.
drop policy if exists "profile_read_self" on public.profiles;
create policy "profile_read_self"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

-- VENDAS: usuários autenticados podem consultar, inserir e atualizar.
-- Isso mantém a planilha comum e conectada ao painel de Gestão.
drop policy if exists "sales_select_authenticated" on public.sales;
create policy "sales_select_authenticated"
on public.sales
for select
to authenticated
using (true);

drop policy if exists "sales_insert_authenticated" on public.sales;
create policy "sales_insert_authenticated"
on public.sales
for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "sales_update_authenticated" on public.sales;
create policy "sales_update_authenticated"
on public.sales
for update
to authenticated
using (true)
with check (true);

-- Somente Gestão pode excluir.
drop policy if exists "sales_delete_gestao" on public.sales;
create policy "sales_delete_gestao"
on public.sales
for delete
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'gestao'
  )
);

-- Realtime: necessário para Registro e Controle permanecerem conectados.
alter table public.sales replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sales'
  ) then
    alter publication supabase_realtime add table public.sales;
  end if;
end $$;

-- ==========================================================
-- COMO DEFINIR UM USUÁRIO COMO GESTÃO:
-- 1. Crie o usuário em Authentication > Users.
-- 2. Pegue o UUID dele.
-- 3. Execute:
--
-- update public.profiles
-- set role = 'gestao', name = 'Nome da Gestora'
-- where id = 'UUID_DO_USUARIO';
--
-- Para acesso de Vendas, o papel padrão já é 'vendas'.
-- ==========================================================
