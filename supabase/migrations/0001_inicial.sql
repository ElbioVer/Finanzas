-- Finanzas · etapa 1: tópicos, medios de pago, movimientos y configuración.
-- Pegar completo en Supabase → SQL Editor → Run.

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  kind text not null check (kind in ('ingreso', 'egreso')),
  is_fixed boolean not null default false,
  monthly_cap numeric(14, 2) check (monthly_cap is null or monthly_cap >= 0),
  archived boolean not null default false,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  kind text not null check (kind in ('debito', 'efectivo', 'credito', 'banco')),
  issuer text,
  last4 text check (last4 is null or last4 ~ '^[0-9]{4}$'),
  closing_day smallint check (closing_day between 1 and 31),
  due_day smallint check (due_day between 1 and 31),
  color text,
  archived boolean not null default false,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  description text not null check (char_length(description) between 1 and 120),
  amount numeric(14, 2) not null check (amount >= 0),
  currency text not null default 'ARS' check (currency in ('ARS', 'USD')),
  type text not null check (type in ('ingreso', 'egreso')),
  category_id uuid references public.categories (id) on delete set null,
  payment_method_id uuid references public.payment_methods (id) on delete set null,
  -- Compras en cuotas: todas las cuotas comparten plan_id
  plan_id uuid,
  installment_number smallint check (installment_number >= 1),
  installments_total smallint check (installments_total >= 1),
  created_at timestamptz not null default now()
);

create index if not exists transactions_user_date on public.transactions (user_id, date);
create index if not exists transactions_plan on public.transactions (plan_id) where plan_id is not null;

create table if not exists public.settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  fx_source text not null default 'oficial' check (fx_source in ('oficial', 'manual')),
  fx_manual numeric(14, 2),
  updated_at timestamptz not null default now()
);

-- Cada usuario ve y modifica solo sus filas
alter table public.categories enable row level security;
alter table public.payment_methods enable row level security;
alter table public.transactions enable row level security;
alter table public.settings enable row level security;

do $$
declare t text;
begin
  foreach t in array array['categories', 'payment_methods', 'transactions', 'settings'] loop
    execute format('drop policy if exists "propias" on public.%I', t);
    execute format(
      'create policy "propias" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;
