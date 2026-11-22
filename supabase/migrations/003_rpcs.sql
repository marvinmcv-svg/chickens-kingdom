-- Chicken's Kingdom · 003 RPCs
-- Errors are raised as plain codes (e.g. 'sold_out:Combo Queen') so the site and the assistant can map them.

create or replace function private.status_rank(s public.order_status) returns int
language sql immutable set search_path = '' as $$
  select case s when 'new' then 0 when 'confirmed' then 1 when 'preparing' then 2 when 'frying' then 3
    when 'ready' then 4 when 'out_for_delivery' then 5 when 'delivered' then 6 else 9 end
$$;

-- CK- + 5 chars from an alphabet without 0/O/1/I/L
create or replace function private.new_code() returns text
language plpgsql volatile set search_path = '' as $$
declare a text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; c text;
begin
  loop
    c := 'CK-' || (select string_agg(substr(a, 1 + floor(random() * length(a))::int, 1), '') from generate_series(1, 5));
    exit when not exists (select 1 from public.orders where code = c);
  end loop;
  return c;
end $$;

create or replace function private.local_today() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'America/La_Paz')::date $$;

create or replace function private.order_result(o public.orders, dup boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'ok', true, 'duplicate', dup, 'code', o.code, 'order_no', o.order_no, 'tracking_token', o.tracking_token,
    'subtotal', o.subtotal, 'delivery_fee', o.delivery_fee, 'total', o.total, 'status', o.status,
    'store', s.name, 'store_whatsapp', s.whatsapp, 'possible_duplicate', o.possible_duplicate,
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.item_id, 'name', i.name, 'qty', i.qty, 'unit_price', i.unit_price, 'line_total', i.line_total) order by i.id)
                       from public.order_items i where i.order_id = o.id), '[]'::jsonb))
  from public.stores s where s.id = o.store_id
$$;

create or replace function public.place_order(payload jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_ref text := nullif(trim(payload->>'client_ref'), '');
  v_found public.orders;
  v_staff public.staff;
  v_is_staff boolean := false;
  v_channel public.order_channel;
  v_store public.stores;
  v_service public.service_type;
  v_phone text;
  v_name text := nullif(trim(payload->>'customer_name'), '');
  v_addr text := nullif(trim(payload->>'address'), '');
  v_refer text := nullif(trim(payload->>'reference'), '');
  v_lat double precision := nullif(payload->>'lat', '')::double precision;
  v_lng double precision := nullif(payload->>'lng', '')::double precision;
  v_sched timestamptz;
  v_raw_sched text := nullif(trim(payload->>'scheduled_for'), '');
  v_items jsonb := '[]'::jsonb;
  v_line record;
  v_mi public.menu_items;
  v_qty int;
  v_sub numeric(10,2) := 0;
  v_cust uuid;
  v_day date := private.local_today();
  v_no int;
  v_order public.orders;
  v_customer public.customers;
begin
  if v_ref is null or length(v_ref) > 120 then raise exception 'invalid_client_ref'; end if;

  -- 1. idempotency
  select * into v_found from public.orders where client_ref = v_ref;
  if found then return private.order_result(v_found, true); end if;

  -- 2. caller
  select * into v_staff from public.staff where user_id = (select auth.uid()) and active;
  v_is_staff := found;
  begin
    v_channel := coalesce(nullif(payload->>'channel', ''), 'web')::public.order_channel;
    v_service := coalesce(nullif(payload->>'service', ''), 'pickup')::public.service_type;
  exception when invalid_text_representation then raise exception 'invalid_channel_or_service';
  end;
  if not v_is_staff and v_channel not in ('web', 'pollitia') then raise exception 'invalid_channel'; end if;

  -- 3. store
  select * into v_store from public.stores
    where active and (id = payload->>'store' or lower(name) = lower(coalesce(payload->>'store', '')));
  if not found then raise exception 'unknown_store'; end if;
  if v_is_staff and v_staff.role not in ('owner', 'admin') and v_staff.store_id is distinct from v_store.id then raise exception 'forbidden_store'; end if;
  if not v_is_staff then
    if v_store.is_paused and (v_store.paused_until is null or v_store.paused_until > now()) then raise exception 'store_paused'; end if;
    if v_service = 'delivery' and not v_store.accepts_delivery then raise exception 'delivery_unavailable'; end if;
    if v_service = 'pickup' and not v_store.accepts_pickup then raise exception 'pickup_unavailable'; end if;
    if v_service = 'dine_in' then raise exception 'dine_in_unavailable'; end if;
  end if;

  -- 4. customer data
  v_phone := public.normalize_phone(payload->>'customer_phone');
  if v_phone is null and (not v_is_staff or nullif(trim(payload->>'customer_phone'), '') is not null) then raise exception 'invalid_phone'; end if;
  if v_name is null then raise exception 'missing_name'; end if;
  if v_service = 'delivery' and v_addr is null and (v_lat is null or v_lng is null) then raise exception 'missing_address'; end if;

  -- 5. schedule: HH:MM today (La Paz) or an ISO timestamp
  if v_raw_sched is not null then
    if v_raw_sched ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      v_sched := (v_day + v_raw_sched::time) at time zone 'America/La_Paz';
    else
      begin v_sched := v_raw_sched::timestamptz; exception when others then raise exception 'invalid_schedule'; end;
    end if;
  end if;

  -- 6. anti-abuse
  if v_phone is not null then
    select * into v_customer from public.customers where phone = v_phone;
    if found and v_customer.blocked and not v_is_staff then raise exception 'customer_blocked'; end if;
    if not v_is_staff and (select count(*) from public.orders where customer_phone = v_phone and channel in ('web', 'pollitia')
                           and created_at > now() - interval '10 minutes') >= 5 then raise exception 'rate_limited'; end if;
  end if;

  -- 7. items, priced from menu_items (never from the client)
  if jsonb_typeof(payload->'items') <> 'array' or jsonb_array_length(payload->'items') < 1 then raise exception 'no_items'; end if;
  if jsonb_array_length(payload->'items') > 30 then raise exception 'too_many_items'; end if;
  for v_line in
    select x->>'id' as id, sum(greatest(1, least(50, coalesce(nullif(x->>'qty', '')::int, 1))))::int as qty
    from jsonb_array_elements(payload->'items') x group by x->>'id'
  loop
    select * into v_mi from public.menu_items where id = v_line.id and active;
    if not found then raise exception 'unknown_item:%', v_line.id; end if;
    if exists (select 1 from public.store_item_availability a where a.store_id = v_store.id and a.item_id = v_mi.id and not a.available) then
      raise exception 'sold_out:%', v_mi.name;
    end if;
    if v_mi.kind = 'promo' and v_service = 'delivery' then raise exception 'in_store_only'; end if;
    v_qty := least(50, v_line.qty);
    v_items := v_items || jsonb_build_object('id', v_mi.id, 'name', v_mi.name, 'unit_price', v_mi.price, 'qty', v_qty, 'line_total', round(v_mi.price * v_qty, 2));
    v_sub := v_sub + round(v_mi.price * v_qty, 2);
  end loop;

  -- 8. customer + address
  if v_phone is not null then
    insert into public.customers (phone, name, preferred_store, tax_id, business_name)
      values (v_phone, v_name, v_store.id, nullif(payload->>'tax_id', ''), nullif(payload->>'business_name', ''))
    on conflict (phone) do update set name = excluded.name, preferred_store = excluded.preferred_store,
      tax_id = coalesce(excluded.tax_id, public.customers.tax_id), business_name = coalesce(excluded.business_name, public.customers.business_name)
    returning id into v_cust;
    if v_service = 'delivery' and v_addr is not null then
      insert into public.customer_addresses (customer_id, address, reference, lat, lng)
        values (v_cust, v_addr, v_refer, v_lat, v_lng)
      on conflict (customer_id, address) do update set reference = coalesce(excluded.reference, public.customer_addresses.reference),
        lat = coalesce(excluded.lat, public.customer_addresses.lat), lng = coalesce(excluded.lng, public.customer_addresses.lng), last_used_at = now();
    end if;
  end if;

  -- 9-10. daily number, insert order, items and first event
  insert into public.store_daily_counters as c (store_id, day, last_no) values (v_store.id, v_day, 1)
    on conflict (store_id, day) do update set last_no = c.last_no + 1 returning last_no into v_no;

  begin
    insert into public.orders (code, client_ref, store_id, customer_id, channel, service, scheduled_for, customer_name, customer_phone,
      address, reference, lat, lng, notes, subtotal, delivery_fee, created_by, order_no, business_day, possible_duplicate,
      invoice_tax_id, invoice_name)
    values (private.new_code(), v_ref, v_store.id, v_cust, v_channel, v_service, v_sched, v_name, v_phone,
      case when v_service = 'delivery' then v_addr end, case when v_service = 'delivery' then v_refer end,
      case when v_service = 'delivery' then v_lat end, case when v_service = 'delivery' then v_lng end,
      left(nullif(trim(payload->>'notes'), ''), 500), v_sub,
      case when v_service = 'delivery' then coalesce(v_store.delivery_fee, 0) else 0 end,
      (select auth.uid()), v_no, v_day,
      exists (select 1 from public.orders o where o.customer_phone = v_phone and o.store_id = v_store.id and o.subtotal = v_sub
              and o.created_at > now() - interval '3 minutes' and o.status <> 'cancelled'),
      nullif(payload->>'tax_id', ''), nullif(payload->>'business_name', ''))
    returning * into v_order;
  exception when unique_violation then
    select * into v_found from public.orders where client_ref = v_ref;
    if found then return private.order_result(v_found, true); end if;
    raise;
  end;

  insert into public.order_items (order_id, item_id, name, unit_price, qty, line_total)
    select v_order.id, x->>'id', x->>'name', (x->>'unit_price')::numeric, (x->>'qty')::int, (x->>'line_total')::numeric
    from jsonb_array_elements(v_items) x;
  insert into public.order_events (order_id, status, note, actor)
    values (v_order.id, 'new', 'Pedido recibido por ' || v_channel::text, (select auth.uid()));

  return private.order_result(v_order, false);
end $$;

-- Public tracking: first name only, no phone, no address.
create or replace function public.track_order(token uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'code', o.code, 'order_no', o.order_no, 'status', o.status, 'service', o.service,
    'first_name', split_part(coalesce(o.customer_name, ''), ' ', 1),
    'created_at', o.created_at, 'scheduled_for', o.scheduled_for, 'total', o.total, 'delivery_fee', o.delivery_fee,
    'cancel_reason', (select r.label from public.cancel_reasons r where r.code = o.cancel_reason),
    'store', jsonb_build_object('name', s.name, 'city', s.city, 'whatsapp', s.whatsapp, 'prep_minutes', s.prep_minutes),
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty) order by i.id) from public.order_items i where i.order_id = o.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('status', e.status, 'at', e.created_at) order by e.created_at) from public.order_events e where e.order_id = o.id), '[]'::jsonb))
  from public.orders o join public.stores s on s.id = o.store_id
  where o.tracking_token = token
$$;

create or replace function public.set_order_status(p_order uuid, p_status public.order_status, p_note text default null, p_cancel_reason text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  me public.staff;
  o public.orders;
  reason public.cancel_reasons;
  is_mgr boolean;
  closed boolean;
begin
  select * into me from public.staff where user_id = (select auth.uid()) and active;
  if not found then raise exception 'not_staff'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'order_not_found'; end if;
  if me.role not in ('owner', 'admin') and me.store_id is distinct from o.store_id then raise exception 'forbidden_store'; end if;
  if o.status = p_status then return jsonb_build_object('ok', true, 'status', o.status, 'unchanged', true); end if;
  is_mgr := me.role in ('owner', 'admin', 'manager');
  closed := o.status in ('delivered', 'cancelled');

  if closed and not is_mgr then raise exception 'reopen_needs_manager'; end if;
  if me.role = 'kitchen' and p_status not in ('confirmed', 'preparing', 'frying', 'ready') then raise exception 'kitchen_limited'; end if;
  if me.role = 'rider' and p_status not in ('out_for_delivery', 'delivered') then raise exception 'rider_limited'; end if;
  if p_status = 'out_for_delivery' and o.service <> 'delivery' then raise exception 'not_delivery'; end if;
  if p_status = 'cancelled' then
    select * into reason from public.cancel_reasons where code = p_cancel_reason;
    if not found then raise exception 'cancel_reason_required'; end if;
    if reason.needs_note and nullif(trim(coalesce(p_note, '')), '') is null then raise exception 'cancel_note_required'; end if;
    if private.status_rank(o.status) >= private.status_rank('preparing') and not is_mgr then raise exception 'cancel_needs_manager'; end if;
  elsif not closed and private.status_rank(p_status) < private.status_rank(o.status) and not is_mgr then
    raise exception 'recall_needs_manager';
  end if;

  update public.orders set
    status = p_status,
    cancel_reason = case when p_status = 'cancelled' then p_cancel_reason else null end,
    confirmed_at = case when p_status = 'confirmed' then coalesce(confirmed_at, now()) else confirmed_at end,
    started_at = case when p_status = 'preparing' then coalesce(started_at, now()) else started_at end,
    cooking_at = case when p_status = 'frying' then coalesce(cooking_at, now()) else cooking_at end,
    ready_at = case when p_status = 'ready' then coalesce(ready_at, now()) else ready_at end,
    dispatched_at = case when p_status = 'out_for_delivery' then coalesce(dispatched_at, now()) else dispatched_at end,
    delivered_at = case when p_status = 'delivered' then coalesce(delivered_at, now()) else delivered_at end,
    cancelled_at = case when p_status = 'cancelled' then coalesce(cancelled_at, now()) else cancelled_at end,
    rider_id = case when me.role = 'rider' then me.user_id else rider_id end
  where id = o.id;
  insert into public.order_events (order_id, status, note, actor) values (o.id, p_status, nullif(trim(coalesce(p_note, '')), ''), me.user_id);
  return jsonb_build_object('ok', true, 'status', p_status);
end $$;

-- ---------- staff administration (owner/admin) ----------
create or replace function public.admin_create_staff(p_email text, p_password text, p_full_name text, p_role public.staff_role,
  p_store text default null, p_phone text default null) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare me public.staff; uid uuid := gen_random_uuid(); em text := lower(trim(p_email));
begin
  select * into me from public.staff where user_id = (select auth.uid()) and active;
  if not found or me.role not in ('owner', 'admin') then raise exception 'forbidden'; end if;
  if p_role = 'owner' and me.role <> 'owner' then raise exception 'only_owner_creates_owner'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'weak_password'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email'; end if;
  if exists (select 1 from auth.users where email = em) then raise exception 'email_taken'; end if;
  if p_role not in ('owner', 'admin') and p_store is null then raise exception 'store_required'; end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', em, extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', p_full_name), now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', em, 'email_verified', true), 'email', now(), now(), now());
  insert into public.staff (user_id, full_name, email, phone, role, store_id)
  values (uid, trim(p_full_name), em, nullif(trim(coalesce(p_phone, '')), ''), p_role, case when p_role in ('owner', 'admin') then p_store else p_store end);
  return uid;
end $$;

create or replace function public.admin_update_staff(p_user uuid, p_role public.staff_role, p_store text, p_active boolean, p_full_name text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare me public.staff; target public.staff;
begin
  select * into me from public.staff where user_id = (select auth.uid()) and active;
  if not found or me.role not in ('owner', 'admin') then raise exception 'forbidden'; end if;
  select * into target from public.staff where user_id = p_user;
  if not found then raise exception 'staff_not_found'; end if;
  if (target.role = 'owner' or p_role = 'owner') and me.role <> 'owner' then raise exception 'only_owner_edits_owner'; end if;
  if p_user = me.user_id and (p_role is distinct from me.role or not p_active) then raise exception 'cannot_demote_self'; end if;
  if p_role not in ('owner', 'admin') and p_store is null then raise exception 'store_required'; end if;
  update public.staff set role = p_role, store_id = p_store, active = p_active, full_name = coalesce(nullif(trim(p_full_name), ''), full_name)
    where user_id = p_user;
end $$;

create or replace function public.admin_set_password(p_user uuid, p_password text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare me public.staff; target public.staff;
begin
  select * into me from public.staff where user_id = (select auth.uid()) and active;
  if not found or me.role not in ('owner', 'admin') then raise exception 'forbidden'; end if;
  select * into target from public.staff where user_id = p_user;
  if not found then raise exception 'staff_not_found'; end if;
  if target.role = 'owner' and me.role <> 'owner' then raise exception 'only_owner_edits_owner'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'weak_password'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now() where id = p_user;
end $$;

-- ---------- reports ----------
create or replace function public.report_summary(p_from date, p_to date, p_store text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me public.staff; v_store text := p_store; result jsonb;
begin
  select * into me from public.staff where user_id = (select auth.uid()) and active;
  if not found or me.role not in ('owner', 'admin', 'manager', 'cashier') then raise exception 'forbidden'; end if;
  if me.role not in ('owner', 'admin') then v_store := me.store_id; end if;
  with o as (
    select * from public.orders where business_day between p_from and p_to and (v_store is null or store_id = v_store)
  ), ok as (select * from o where status <> 'cancelled')
  select jsonb_build_object(
    'from', p_from, 'to', p_to, 'store', v_store,
    'orders', (select count(*) from ok),
    'revenue', (select coalesce(sum(total), 0) from ok),
    'avg_ticket', (select coalesce(round(avg(total), 2), 0) from ok),
    'cancelled', (select count(*) from o where status = 'cancelled'),
    'cancelled_pct', (select case when count(*) = 0 then 0 else round(100.0 * count(*) filter (where status = 'cancelled') / count(*), 1) end from o),
    'customers', (select count(distinct customer_id) from ok),
    'new_customers', (select count(*) from public.customers c where c.first_order_at::date between p_from and p_to
                      and exists (select 1 from ok where ok.customer_id = c.id)),
    'avg_prep_min', (select round(avg(extract(epoch from ready_at - confirmed_at) / 60)::numeric, 1) from ok where ready_at is not null and confirmed_at is not null),
    'avg_out_door_min', (select round(avg(extract(epoch from dispatched_at - created_at) / 60)::numeric, 1) from ok where dispatched_at is not null),
    'avg_delivery_min', (select round(avg(extract(epoch from delivered_at - created_at) / 60)::numeric, 1) from ok where delivered_at is not null and service = 'delivery'),
    'late_pct', (select case when count(*) = 0 then 0 else round(100.0 * count(*) filter (where extract(epoch from delivered_at - created_at) / 60 > 45) / count(*), 1) end from ok where delivered_at is not null),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'orders', n, 'revenue', r) order by d), '[]'::jsonb) from (select business_day d, count(*) n, sum(total) r from ok group by 1) x),
    'by_hour', (select coalesce(jsonb_agg(jsonb_build_object('hour', h, 'orders', n) order by h), '[]'::jsonb) from (select extract(hour from created_at at time zone 'America/La_Paz')::int h, count(*) n from ok group by 1) x),
    'by_store', (select coalesce(jsonb_agg(jsonb_build_object('store', s, 'orders', n, 'revenue', r) order by r desc), '[]'::jsonb) from (select store_id s, count(*) n, sum(total) r from ok group by 1) x),
    'by_channel', (select coalesce(jsonb_agg(jsonb_build_object('channel', c, 'orders', n) order by n desc), '[]'::jsonb) from (select channel c, count(*) n from ok group by 1) x),
    'by_service', (select coalesce(jsonb_agg(jsonb_build_object('service', c, 'orders', n) order by n desc), '[]'::jsonb) from (select service c, count(*) n from ok group by 1) x),
    'top_items', (select coalesce(jsonb_agg(jsonb_build_object('item', name, 'qty', q, 'revenue', r) order by q desc), '[]'::jsonb) from (
                   select i.name, sum(i.qty) q, sum(i.line_total) r from public.order_items i join ok on ok.id = i.order_id group by i.name order by 2 desc limit 15) x),
    'cancel_reasons', (select coalesce(jsonb_agg(jsonb_build_object('reason', coalesce(r.label, o2.cancel_reason), 'count', n) order by n desc), '[]'::jsonb)
                       from (select cancel_reason, count(*) n from o where status = 'cancelled' group by 1) o2 left join public.cancel_reasons r on r.code = o2.cancel_reason)
  ) into result;
  return result;
end $$;

-- ---------- function grants ----------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.place_order(jsonb) to anon, authenticated;
grant execute on function public.track_order(uuid) to anon, authenticated;
grant execute on function public.normalize_phone(text) to anon, authenticated;
grant execute on function public.set_order_status(uuid, public.order_status, text, text) to authenticated;
grant execute on function public.admin_create_staff(text, text, text, public.staff_role, text, text) to authenticated;
grant execute on function public.admin_update_staff(uuid, public.staff_role, text, boolean, text) to authenticated;
grant execute on function public.admin_set_password(uuid, text) to authenticated;
grant execute on function public.report_summary(date, date, text) to authenticated;
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
