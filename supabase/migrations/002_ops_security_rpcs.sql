-- Chicken's Kingdom · 002 operations, security (RLS + grants), helpers and triggers

-- ---------- operational columns ----------
alter table public.stores
  add column paused_until timestamptz,
  add column accepts_delivery boolean not null default true,
  add column accepts_pickup boolean not null default true,
  add column prep_minutes int not null default 20 check (prep_minutes between 1 and 240);

alter table public.customers
  add column alt_phone text,
  add column tax_id text,               -- NIT / CI for the factura
  add column business_name text,        -- razón social
  add column allergies text,
  add column blocked boolean not null default false,
  add column opt_in_at timestamptz,
  add column opt_in_source text;

alter table public.customer_addresses
  add column zone text,                 -- zona / barrio
  add column ring text;                 -- anillo (Santa Cruz)

alter table public.orders
  add column tracking_token uuid not null unique default gen_random_uuid(),
  add column order_no int,
  add column business_day date,
  add column possible_duplicate boolean not null default false,
  add column invoice_tax_id text,
  add column invoice_name text,
  add column courier text not null default 'own',
  add column courier_ref text,
  add column courier_cost numeric(10,2),
  add column started_at timestamptz,
  add column cooking_at timestamptz;
create index orders_day_store_idx on public.orders (business_day, store_id);
create index orders_phone_created_idx on public.orders (customer_phone, created_at desc);

create table public.store_daily_counters (
  store_id text not null references public.stores(id) on delete cascade,
  day date not null,
  last_no int not null default 0,
  primary key (store_id, day)
);

create table public.cancel_reasons (
  code text primary key,
  label text not null,
  needs_note boolean not null default false,
  sort int not null default 0
);
insert into public.cancel_reasons (code, label, needs_note, sort) values
  ('changed_mind', 'El cliente cambió de opinión', false, 1),
  ('not_answering', 'El cliente no contesta', false, 2),
  ('duplicate', 'Pedido duplicado', false, 3),
  ('prank', 'Pedido falso o broma', false, 4),
  ('out_of_zone', 'Fuera de la zona de delivery', false, 5),
  ('sold_out', 'Producto agotado', false, 6),
  ('store_overloaded', 'Sucursal cerrada o saturada', false, 7),
  ('too_late', 'Demora excesiva', false, 8),
  ('order_error', 'Error al tomar el pedido', false, 9),
  ('payment_unconfirmed', 'Pago no confirmado', false, 10),
  ('wrong_address', 'Dirección incorrecta', false, 11),
  ('absent', 'Cliente ausente en la entrega', false, 12),
  ('rider_problem', 'Problema con el repartidor', false, 13),
  ('other', 'Otro motivo', true, 99);

-- ---------- private helpers (schema not exposed by the API) ----------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.my_staff() returns public.staff
language sql stable security definer set search_path = '' as $$
  select s.* from public.staff s where s.user_id = (select auth.uid()) and s.active
$$;
create or replace function private.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff s where s.user_id = (select auth.uid()) and s.active)
$$;
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff s where s.user_id = (select auth.uid()) and s.active and s.role in ('owner', 'admin'))
$$;
create or replace function private.has_role(roles public.staff_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff s where s.user_id = (select auth.uid()) and s.active and s.role = any (roles))
$$;
create or replace function private.can_store(p_store text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff s where s.user_id = (select auth.uid()) and s.active
                 and (s.role in ('owner', 'admin') or s.store_id = p_store))
$$;
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- Bolivian mobile: 8 digits starting with 6 or 7 → +591XXXXXXXX
create or replace function public.normalize_phone(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if length(d) = 11 and left(d, 3) = '591' then d := substr(d, 4); end if;
  if d ~ '^[67][0-9]{7}$' then return '+591' || d; end if;
  return null;
end $$;

-- ---------- triggers ----------
create or replace function private.order_totals() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.total := round(coalesce(new.subtotal, 0) + coalesce(new.delivery_fee, 0) - coalesce(new.discount, 0), 2);
  if new.total < 0 then new.total := 0; end if;
  return new;
end $$;
create trigger orders_totals before insert or update of subtotal, delivery_fee, discount on public.orders
  for each row execute function private.order_totals();

create or replace function private.refresh_customer_stats() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  foreach cid in array array[new.customer_id, case when tg_op = 'UPDATE' then old.customer_id end] loop
    continue when cid is null;
    update public.customers c set
      orders_count = s.n, total_spent = s.spent, first_order_at = s.first_at, last_order_at = s.last_at
    from (select count(*)::int n, coalesce(sum(total), 0) spent, min(created_at) first_at, max(created_at) last_at
          from public.orders where customer_id = cid and status <> 'cancelled') s
    where c.id = cid;
  end loop;
  return null;
end $$;
create trigger orders_customer_stats after insert or update of status, total, subtotal, delivery_fee, discount, customer_id on public.orders
  for each row execute function private.refresh_customer_stats();

create or replace function private.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_id text; v_data jsonb;
begin
  if tg_op = 'DELETE' then
    v_data := jsonb_build_object('old', to_jsonb(old));
    v_id := coalesce(to_jsonb(old)->>'id', to_jsonb(old)->>'user_id', (to_jsonb(old)->>'store_id') || '/' || (to_jsonb(old)->>'item_id'));
  elsif tg_op = 'INSERT' then
    v_data := jsonb_build_object('new', to_jsonb(new));
    v_id := coalesce(to_jsonb(new)->>'id', to_jsonb(new)->>'user_id', (to_jsonb(new)->>'store_id') || '/' || (to_jsonb(new)->>'item_id'));
  else
    select jsonb_build_object('old', jsonb_object_agg(k, to_jsonb(old)->k), 'new', jsonb_object_agg(k, to_jsonb(new)->k)) into v_data
      from jsonb_object_keys(to_jsonb(new)) k
      where k not in ('updated_at') and (to_jsonb(old)->k) is distinct from (to_jsonb(new)->k);
    if v_data is null or v_data->'new' is null then return new; end if;
    v_id := coalesce(to_jsonb(new)->>'id', to_jsonb(new)->>'user_id', (to_jsonb(new)->>'store_id') || '/' || (to_jsonb(new)->>'item_id'));
  end if;
  insert into public.audit_log (actor, action, entity, entity_id, data)
    values ((select auth.uid()), lower(tg_op), tg_table_name, v_id, v_data);
  return coalesce(new, old);
end $$;
create trigger stores_audit after insert or update or delete on public.stores for each row execute function private.audit();
create trigger menu_items_audit after insert or update or delete on public.menu_items for each row execute function private.audit();
create trigger availability_audit after insert or update or delete on public.store_item_availability for each row execute function private.audit();
create trigger staff_audit after insert or update or delete on public.staff for each row execute function private.audit();
create trigger orders_audit after update of status, cancel_reason, discount, delivery_fee, payment_method, payment_status, total, rider_id
  on public.orders for each row execute function private.audit();

-- ---------- row-level security ----------
alter table public.stores enable row level security;
alter table public.menu_items enable row level security;
alter table public.store_item_availability enable row level security;
alter table public.cancel_reasons enable row level security;
alter table public.staff enable row level security;
alter table public.customers enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.audit_log enable row level security;
alter table public.store_daily_counters enable row level security;

-- public catalogue (no personal data)
create policy stores_read on public.stores for select to anon, authenticated using (true);
create policy menu_read on public.menu_items for select to anon, authenticated using (true);
create policy availability_read on public.store_item_availability for select to anon, authenticated using (true);
create policy cancel_reasons_read on public.cancel_reasons for select to anon, authenticated using (true);

create policy stores_update on public.stores for update to authenticated
  using ((select private.is_admin()) or ((select private.has_role(array['manager']::public.staff_role[])) and (select private.can_store(id))))
  with check ((select private.is_admin()) or ((select private.has_role(array['manager']::public.staff_role[])) and (select private.can_store(id))));
create policy stores_insert on public.stores for insert to authenticated with check ((select private.is_admin()));

create policy menu_insert on public.menu_items for insert to authenticated with check ((select private.is_admin()));
create policy menu_update on public.menu_items for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create policy availability_insert on public.store_item_availability for insert to authenticated
  with check ((select private.has_role(array['owner','admin','manager','cashier','kitchen']::public.staff_role[])) and (select private.can_store(store_id)));
create policy availability_update on public.store_item_availability for update to authenticated
  using ((select private.has_role(array['owner','admin','manager','cashier','kitchen']::public.staff_role[])) and (select private.can_store(store_id)))
  with check ((select private.has_role(array['owner','admin','manager','cashier','kitchen']::public.staff_role[])) and (select private.can_store(store_id)));

create policy staff_read on public.staff for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin())
         or ((select private.has_role(array['manager']::public.staff_role[])) and store_id = (select (private.my_staff()).store_id)));

create policy customers_read on public.customers for select to authenticated
  using ((select private.has_role(array['owner','admin','manager','cashier']::public.staff_role[])));
create policy customers_update on public.customers for update to authenticated
  using ((select private.has_role(array['owner','admin','manager','cashier']::public.staff_role[])))
  with check ((select private.has_role(array['owner','admin','manager','cashier']::public.staff_role[])));

create policy addresses_read on public.customer_addresses for select to authenticated
  using ((select private.has_role(array['owner','admin','manager','cashier','rider']::public.staff_role[])));
create policy addresses_update on public.customer_addresses for update to authenticated
  using ((select private.has_role(array['owner','admin','manager','cashier']::public.staff_role[])))
  with check ((select private.has_role(array['owner','admin','manager','cashier']::public.staff_role[])));

create policy orders_read on public.orders for select to authenticated using ((select private.can_store(store_id)));
create policy orders_update on public.orders for update to authenticated
  using ((select private.can_store(store_id))) with check ((select private.can_store(store_id)));
create policy order_items_read on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (select private.can_store(o.store_id))));
create policy order_events_read on public.order_events for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (select private.can_store(o.store_id))));

create policy audit_read on public.audit_log for select to authenticated using ((select private.is_admin()));
-- store_daily_counters: no policies → no direct access (only security-definer RPCs)

-- ---------- privileges (column level) ----------
revoke all on all tables in schema public from anon, authenticated;
grant select on public.stores, public.menu_items, public.store_item_availability, public.cancel_reasons to anon, authenticated;

grant insert on public.stores to authenticated;
grant update (whatsapp, address, plus_code, open_time, close_time, is_paused, pause_reason, paused_until,
              accepts_delivery, accepts_pickup, prep_minutes, delivery_fee, active, sort) on public.stores to authenticated;
grant insert, update on public.menu_items to authenticated;
grant insert, update (store_id, item_id, available, updated_at, updated_by) on public.store_item_availability to authenticated;
grant select on public.staff to authenticated;
grant select on public.customers to authenticated;
grant update (name, email, birthday, notes, tags, marketing_opt_in, preferred_store, alt_phone, tax_id, business_name,
              allergies, blocked, opt_in_at, opt_in_source) on public.customers to authenticated;
grant select on public.customer_addresses to authenticated;
grant update (address, reference, lat, lng, zone, ring) on public.customer_addresses to authenticated;
grant select on public.orders, public.order_items, public.order_events, public.audit_log to authenticated;
-- staff may edit only operational columns; status and prices change only through RPCs
grant update (payment_method, payment_status, cash_change_for, rider_id, notes, delivery_fee, discount, address, reference,
              courier, courier_ref, courier_cost, invoice_tax_id, invoice_name, scheduled_for) on public.orders to authenticated;

-- ---------- realtime ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.orders, public.order_events, public.stores, public.store_item_availability;
  end if;
end $$;
