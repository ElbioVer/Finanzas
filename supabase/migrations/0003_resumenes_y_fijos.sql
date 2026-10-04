-- Finanzas · etapa 2: resúmenes de tarjeta, gastos fijos y su vencimiento de cada mes.
-- Pegar completo en Supabase → SQL Editor → Run. Se puede correr más de una vez sin problema.

-- Resumen mensual de cada tarjeta. period = mes del vencimiento (YYYY-MM).
create table if not exists public.card_statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  payment_method_id uuid not null references public.payment_methods (id) on delete cascade,
  period text not null check (period ~ '^\d{4}-\d{2}$'),
  closing_date date,
  due_date date not null,
  total_ars numeric(14, 2) not null default 0 check (total_ars >= 0),
  total_usd numeric(14, 2) not null default 0 check (total_usd >= 0),
  minimum_payment numeric(14, 2) not null default 0 check (minimum_payment >= 0),
  planned_kind text not null default 'total' check (planned_kind in ('total', 'minimo', 'otro')),
  planned_amount numeric(14, 2) check (planned_amount is null or planned_amount >= 0),
  paid_amount numeric(14, 2) check (paid_amount is null or paid_amount >= 0),
  paid_at date,
  created_at timestamptz not null default now(),
  unique (user_id, payment_method_id, period)
);

-- Gastos fijos que se repiten todos los meses (alquiler, cuota del auto, servicios…)
create table if not exists public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  category_id uuid references public.categories (id) on delete set null,
  payment_method_id uuid references public.payment_methods (id) on delete set null,
  default_amount numeric(14, 2) check (default_amount is null or default_amount >= 0),
  currency text not null default 'ARS' check (currency in ('ARS', 'USD')),
  due_day smallint not null check (due_day between 1 and 31),
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

-- El gasto fijo de cada mes: cuánto es, cuándo vence y si ya se pagó
create table if not exists public.recurring_instances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recurring_id uuid not null references public.recurring_expenses (id) on delete cascade,
  period text not null check (period ~ '^\d{4}-\d{2}$'),
  due_date date not null,
  amount numeric(14, 2) not null default 0 check (amount >= 0),
  currency text not null default 'ARS' check (currency in ('ARS', 'USD')),
  paid_at date,
  transaction_id uuid references public.transactions (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, recurring_id, period)
);

create index if not exists card_statements_period on public.card_statements (user_id, period);
create index if not exists recurring_instances_period on public.recurring_instances (user_id, period);

alter table public.card_statements enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.recurring_instances enable row level security;

do $$
declare t text;
begin
  foreach t in array array['card_statements', 'recurring_expenses', 'recurring_instances'] loop
    execute format('drop policy if exists "propias" on public.%I', t);
    execute format(
      'create policy "propias" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;
