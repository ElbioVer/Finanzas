-- Finanzas · corrige tópicos y medios de pago cargados dos veces y evita que se repita.
-- Pegar completo en Supabase → SQL Editor → Run. Se puede correr más de una vez sin problema.

-- 1. Tópicos duplicados: queda uno por nombre (el que tiene tope, o el más antiguo).
--    Primero se pasan los movimientos al que queda, después se borran las copias.
with m as (
  select id, first_value(id) over (
           partition by user_id, kind, lower(trim(name))
           order by (monthly_cap is not null) desc, created_at, id
         ) as keep_id
  from public.categories
  where not archived
)
update public.transactions t set category_id = m.keep_id
from m where t.category_id = m.id and m.id <> m.keep_id;

with m as (
  select id, first_value(id) over (
           partition by user_id, kind, lower(trim(name))
           order by (monthly_cap is not null) desc, created_at, id
         ) as keep_id
  from public.categories
  where not archived
)
delete from public.categories c
using m where c.id = m.id and m.id <> m.keep_id;

-- 2. Medios de pago duplicados: queda el que tiene más datos cargados (días, últimos 4 números)
with m as (
  select id, first_value(id) over (
           partition by user_id, kind, lower(trim(name))
           order by ((closing_day is not null)::int + (due_day is not null)::int + (last4 is not null)::int) desc, created_at, id
         ) as keep_id
  from public.payment_methods
  where not archived
)
update public.transactions t set payment_method_id = m.keep_id
from m where t.payment_method_id = m.id and m.id <> m.keep_id;

with m as (
  select id, first_value(id) over (
           partition by user_id, kind, lower(trim(name))
           order by ((closing_day is not null)::int + (due_day is not null)::int + (last4 is not null)::int) desc, created_at, id
         ) as keep_id
  from public.payment_methods
  where not archived
)
delete from public.payment_methods p
using m where p.id = m.id and m.id <> m.keep_id;

-- 3. Carga inicial a prueba de repeticiones: si la app se abre en dos lugares a la vez,
--    el bloqueo hace que la segunda espere y vea que ya está cargado.
create or replace function public.seed_defaults(cats jsonb, pms jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('seed:' || auth.uid()::text, 0));
  if exists (select 1 from categories where user_id = auth.uid()) then
    return;
  end if;
  insert into categories (id, name, kind, is_fixed, monthly_cap, archived, sort)
  select * from jsonb_to_recordset(cats)
    as x(id uuid, name text, kind text, is_fixed boolean, monthly_cap numeric, archived boolean, sort integer);
  insert into payment_methods (id, name, kind, issuer, last4, closing_day, due_day, color, archived, sort)
  select * from jsonb_to_recordset(pms)
    as x(id uuid, name text, kind text, issuer text, last4 text, closing_day smallint, due_day smallint, color text, archived boolean, sort integer);
end;
$$;

revoke all on function public.seed_defaults(jsonb, jsonb) from public, anon;
grant execute on function public.seed_defaults(jsonb, jsonb) to authenticated;
