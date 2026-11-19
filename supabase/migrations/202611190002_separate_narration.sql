create or replace function public.maic_admit(p_owner uuid, p_task text, p_model text, p_max integer, p_global integer)
returns boolean language plpgsql security definer set search_path = pg_catalog as $$
declare d date := (now() at time zone 'UTC')::date;
begin
  perform pg_advisory_xact_lock(hashtextextended('maic_usage_' || d::text,0));
  if (select coalesce(sum(calls),0) from maic_control.usage where day=d and owner_id=p_owner and (task='audio/speech')=(p_task='audio/speech'))>=p_max
    or (select coalesce(sum(calls),0) from maic_control.usage where day=d)>=p_global then return false; end if;
  insert into maic_control.usage values(p_owner,d,p_task,p_model,1)
    on conflict(owner_id,day,task,model) do update set calls=maic_control.usage.calls+1;
  return true;
end $$;
