#!/bin/bash
# Behavioural checks for the Supabase migrations against a LOCAL Postgres (no Supabase needed).
# Usage: bash tests/db/run-local.sh   (creates a throwaway cluster, applies stub + migrations + seed, runs these checks)
D=${CKPG_DIR:-/tmp/ckpg}
P() { psql -h $D -p 5499 -U postgres -d ck -qtA -v ON_ERROR_STOP=0 "$@" 2>&1; }
as_anon() { P -c "set role anon; $1"; }
as_user() { P -c "select set_config('request.jwt.claim.sub', '$1', false); set role authenticated; $2"; }
ok() { echo "PASS  $1"; }
bad() { echo "FAIL  $1 :: $2"; }
expect() { if echo "$2" | grep -q -- "$3"; then ok "$1"; else bad "$1" "$2"; fi; }

ORDER='{"client_ref":"t-1","channel":"web","store":"villarroel","service":"pickup","customer_name":"Ana Pérez","customer_phone":"71234567","items":[{"id":"combo-queen","qty":2,"price":1},{"id":"jugo-mango-m","qty":1}]}'
R=$(as_anon "select public.place_order('$ORDER')")
expect "anon places order, server-priced total 93 (2x43 + 7)" "$R" '"total": 93'
R2=$(as_anon "select public.place_order('$ORDER')")
expect "same client_ref is idempotent (duplicate: true)" "$R2" '"duplicate": true'
expect "client price field ignored" "$R" '"unit_price": 43'
TOKEN=$(echo "$R" | grep -o '"tracking_token": "[^"]*"' | cut -d'"' -f4)
T=$(as_anon "select public.track_order('$TOKEN')")
expect "track_order works for anon" "$T" '"status": "new"'
expect "track_order first name only" "$T" '"first_name": "Ana"'
if echo "$T" | grep -q "71234567"; then bad "track_order hides phone" "$T"; else ok "track_order hides phone"; fi
expect "anon cannot read orders" "$(as_anon 'select count(*) from public.orders')" "permission denied"
expect "anon cannot read customers" "$(as_anon 'select count(*) from public.customers')" "permission denied"
expect "anon cannot call set_order_status" "$(as_anon "select public.set_order_status(gen_random_uuid(), 'ready')")" "permission denied"
expect "invalid phone rejected" "$(as_anon "select public.place_order('{\"client_ref\":\"t-2\",\"store\":\"villarroel\",\"service\":\"pickup\",\"customer_name\":\"X\",\"customer_phone\":\"123\",\"items\":[{\"id\":\"combo-queen\"}]}')")" "invalid_phone"
expect "unknown item rejected" "$(as_anon "select public.place_order('{\"client_ref\":\"t-3\",\"store\":\"villarroel\",\"service\":\"pickup\",\"customer_name\":\"X\",\"customer_phone\":\"71234567\",\"items\":[{\"id\":\"pizza\"}]}')")" "unknown_item:pizza"
expect "delivery needs address" "$(as_anon "select public.place_order('{\"client_ref\":\"t-4\",\"store\":\"villarroel\",\"service\":\"delivery\",\"customer_name\":\"X\",\"customer_phone\":\"71234567\",\"items\":[{\"id\":\"combo-queen\"}]}')")" "missing_address"
expect "Combo Yape refused for delivery" "$(as_anon "select public.place_order('{\"client_ref\":\"t-5\",\"store\":\"villarroel\",\"service\":\"delivery\",\"address\":\"Calle 1\",\"customer_name\":\"X\",\"customer_phone\":\"71234567\",\"items\":[{\"id\":\"yape-pollo\"}]}')")" "in_store_only"
expect "anon cannot use phone channel" "$(as_anon "select public.place_order('{\"client_ref\":\"t-6\",\"channel\":\"phone\",\"store\":\"villarroel\",\"service\":\"pickup\",\"customer_name\":\"X\",\"customer_phone\":\"71234567\",\"items\":[{\"id\":\"combo-queen\"}]}')")" "invalid_channel"

# staff: owner created directly (as the README says), others via admin_create_staff
OWNER=11111111-1111-1111-1111-111111111111
P -c "insert into auth.users (id, email, aud, role) values ('$OWNER', 'dueno@test.bo', 'authenticated', 'authenticated'); insert into public.staff (user_id, full_name, email, role) values ('$OWNER', 'Dueño', 'dueno@test.bo', 'owner');" >/dev/null
MGR=$(as_user $OWNER "select public.admin_create_staff('gerente@test.bo', 'secreta123', 'Gerente Villarroel', 'manager', 'villarroel')" | tail -1)
KIT=$(as_user $OWNER "select public.admin_create_staff('cocina@test.bo', 'secreta123', 'Cocina Villarroel', 'kitchen', 'villarroel')" | tail -1)
CASH=$(as_user $OWNER "select public.admin_create_staff('caja@test.bo', 'secreta123', 'Caja Villarroel', 'cashier', 'villarroel')" | tail -1)
MGR2=$(as_user $OWNER "select public.admin_create_staff('gerente2@test.bo', 'secreta123', 'Gerente Velarde', 'manager', 'velarde')" | tail -1)
expect "owner creates staff (uuid returned)" "$MGR" "-"
expect "password hashed with bcrypt" "$(P -c "select left(encrypted_password,4) from auth.users where email='gerente@test.bo'")" '$2a\$'
expect "manager cannot create staff" "$(as_user $MGR "select public.admin_create_staff('x@test.bo','secreta123','X','cashier','villarroel')")" "forbidden"
expect "weak password refused" "$(as_user $OWNER "select public.admin_create_staff('y@test.bo','corta','Y','cashier','villarroel')")" "weak_password"
expect "owner cannot demote self" "$(as_user $OWNER "select public.admin_update_staff('$OWNER','admin',null,true)")" "cannot_demote_self"

OID=$(P -c "select id from public.orders where client_ref='t-1'")
expect "manager sees own store order" "$(as_user $MGR "select count(*) from public.orders")" "^1$"
expect "other-store manager sees nothing" "$(as_user $MGR2 "select count(*) from public.orders")" "^0$"
expect "staff cannot change prices directly" "$(as_user $MGR "update public.orders set subtotal = 1 where id = '$OID'")" "permission denied"
expect "staff cannot change status directly" "$(as_user $MGR "update public.orders set status = 'ready' where id = '$OID'")" "permission denied"
expect "kitchen confirms" "$(as_user $KIT "select public.set_order_status('$OID', 'confirmed')")" '"ok": true'
expect "kitchen moves to frying" "$(as_user $KIT "select public.set_order_status('$OID', 'frying')")" '"ok": true'
expect "kitchen cannot dispatch" "$(as_user $KIT "select public.set_order_status('$OID', 'out_for_delivery')")" "kitchen_limited"
expect "cashier cannot cancel after frying" "$(as_user $CASH "select public.set_order_status('$OID', 'cancelled', null, 'changed_mind')")" "cancel_needs_manager"
expect "cancel needs a valid reason" "$(as_user $MGR "select public.set_order_status('$OID', 'cancelled')")" "cancel_reason_required"
expect "pickup can't go out for delivery" "$(as_user $MGR "select public.set_order_status('$OID', 'out_for_delivery')")" "not_delivery"
expect "kitchen marks ready" "$(as_user $KIT "select public.set_order_status('$OID', 'ready')")" '"ok": true'
expect "cashier cannot recall (go back)" "$(as_user $CASH "select public.set_order_status('$OID', 'preparing')")" "recall_needs_manager"
expect "events timeline recorded" "$(P -c "select string_agg(status::text, ',' order by id) from public.order_events where order_id='$OID'")" "new,confirmed,frying,ready"
expect "timestamps set" "$(P -c "select (confirmed_at is not null and cooking_at is not null and ready_at is not null) from public.orders where id='$OID'")" "^t$"
expect "audit row for status change" "$(P -c "select count(*) from public.audit_log where entity='orders' and data->'new' ? 'status'")" "^[1-9]"
expect "manager cannot read audit" "$(as_user $MGR "select count(*) from public.audit_log")" "^0$"
expect "customer stats refreshed" "$(P -c "select orders_count || '/' || total_spent from public.customers where phone='+59171234567'")" "1/93"

# sold out + paused
as_user $KIT "insert into public.store_item_availability (store_id, item_id, available) values ('villarroel', 'combo-king', false)" >/dev/null
expect "kitchen 86s an item (audit)" "$(P -c "select count(*) from public.audit_log where entity='store_item_availability'")" "^1$"
expect "sold-out item rejected" "$(as_anon "select public.place_order('{\"client_ref\":\"t-7\",\"store\":\"villarroel\",\"service\":\"pickup\",\"customer_name\":\"X\",\"customer_phone\":\"71234567\",\"items\":[{\"id\":\"combo-king\"}]}')")" "sold_out:Combo King"
expect "kitchen cannot 86 another store" "$(as_user $KIT "insert into public.store_item_availability (store_id, item_id, available) values ('velarde', 'combo-king', false)")" "row-level security"
as_user $MGR "update public.stores set is_paused = true, pause_reason = 'Saturados' where id = 'villarroel'" >/dev/null
expect "paused store rejected" "$(as_anon "select public.place_order('{\"client_ref\":\"t-8\",\"store\":\"villarroel\",\"service\":\"pickup\",\"customer_name\":\"X\",\"customer_phone\":\"71234567\",\"items\":[{\"id\":\"combo-queen\"}]}')")" "store_paused"
as_user $MGR "update public.stores set is_paused = true where id = 'velarde'" >/dev/null
expect "manager cannot pause another store" "$(P -c "select is_paused from public.stores where id = 'velarde'")" "^f$"
as_user $MGR "update public.menu_items set price = 1 where id = 'combo-queen'" >/dev/null
expect "manager cannot edit menu prices" "$(P -c "select price from public.menu_items where id = 'combo-queen'")" "^43.00$"
P -c "update public.stores set is_paused = false where id = 'villarroel'" >/dev/null

# daily number + rate limit + report
for i in 1 2 3 4; do as_anon "select public.place_order('{\"client_ref\":\"rl-$i\",\"store\":\"velarde\",\"service\":\"pickup\",\"customer_name\":\"Rafa\",\"customer_phone\":\"69999999\",\"items\":[{\"id\":\"solo-cuarto\"}]}')" >/dev/null; done
expect "per-store daily number increments" "$(P -c "select max(order_no) from public.orders where store_id='velarde'")" "^4$"
expect "possible duplicate flagged" "$(P -c "select bool_or(possible_duplicate) from public.orders where store_id='velarde'")" "^t$"
as_anon "select public.place_order('{\"client_ref\":\"rl-5\",\"store\":\"velarde\",\"service\":\"pickup\",\"customer_name\":\"Rafa\",\"customer_phone\":\"69999999\",\"items\":[{\"id\":\"solo-cuarto\"}]}')" >/dev/null
expect "6th order in 10 min rate-limited" "$(as_anon "select public.place_order('{\"client_ref\":\"rl-6\",\"store\":\"velarde\",\"service\":\"pickup\",\"customer_name\":\"Rafa\",\"customer_phone\":\"69999999\",\"items\":[{\"id\":\"solo-cuarto\"}]}')")" "rate_limited"
REP=$(as_user $OWNER "select public.report_summary(current_date - 1, current_date + 1)")
expect "report_summary works for owner" "$REP" '"orders": 6'
expect "report scoped for manager" "$(as_user $MGR "select public.report_summary(current_date - 1, current_date + 1, 'velarde')->>'store'")" "villarroel"
