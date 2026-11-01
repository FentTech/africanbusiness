create or replace function public.place_store_order_with_zone(
  p_full_name text,
  p_email text,
  p_phone text,
  p_delivery_address text,
  p_customer_note text,
  p_items jsonb,
  p_delivery_zone_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_zone public.store_delivery_zones%rowtype;
  v_order jsonb;
  v_order_number bigint;
begin
  select * into v_zone
  from public.store_delivery_zones
  where id = p_delivery_zone_id and active;

  if not found then
    raise exception 'delivery zone is unavailable' using errcode = '22023';
  end if;

  v_order := public.place_store_order(
    p_full_name,
    p_email,
    p_phone,
    v_zone.name,
    p_delivery_address,
    p_customer_note,
    p_items
  );
  v_order_number := (v_order->>'orderNumber')::bigint;

  update public.store_orders
  set delivery_zone_id = v_zone.id,
      delivery_fee_ghs = v_zone.fee_ghs
  where order_number = v_order_number;

  return v_order || jsonb_build_object(
    'deliveryArea', v_zone.name,
    'deliveryFeeGhs', v_zone.fee_ghs
  );
end;
$function$;

revoke all on function public.place_store_order_with_zone(text, text, text, text, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.place_store_order_with_zone(text, text, text, text, text, jsonb, uuid) to service_role;
