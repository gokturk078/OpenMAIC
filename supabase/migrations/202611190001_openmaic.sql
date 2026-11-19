begin;
create schema if not exists maic_control;
revoke all on schema maic_control from public, anon, authenticated;
create table if not exists maic_control.accounts (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table maic_control.accounts enable row level security;
create policy own_account on maic_control.accounts for select to authenticated using (owner_id = (select auth.uid()));
create table maic_control.usage (
  owner_id uuid not null references maic_control.accounts on delete cascade,
  day date not null, task text not null, model text not null, calls integer not null check (calls > 0),
  primary key(owner_id, day, task, model)
);
alter table maic_control.usage enable row level security;
create policy own_usage on maic_control.usage for select to authenticated using (owner_id = (select auth.uid()));
-- The Worker calls these RPCs on its private service channel. No browser role can call them.
create function public.maic_provision(p_owner uuid, p_password text) returns void
language plpgsql security definer set search_path = pg_catalog as $$
declare tenant text := 'maic_' || replace(p_owner::text,'-','');
begin
  if p_password !~ '^[0-9a-f]{64}$' or not exists (select 1 from auth.users where id=p_owner and email_confirmed_at is not null) then
    raise exception 'Verified account required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(tenant,0));
  if exists(select 1 from maic_control.accounts where owner_id=p_owner) then return; end if;
  execute format('create role %I login password %L nosuperuser nocreatedb nocreaterole noinherit nobypassrls connection limit 16',tenant,p_password);
  execute format('grant %I to postgres',tenant);
  execute format('create schema %I authorization %I',tenant,tenant);
  execute format('alter role %I set search_path = %I,pg_catalog',tenant,tenant);
  insert into maic_control.accounts(owner_id) values(p_owner);
end $$;
create function public.maic_admit(p_owner uuid, p_task text, p_model text, p_max integer, p_global integer)
returns boolean language plpgsql security definer set search_path = pg_catalog as $$
declare d date := (now() at time zone 'UTC')::date;
begin
  perform pg_advisory_xact_lock(hashtextextended('maic_usage_' || d::text,0));
  if (select coalesce(sum(calls),0) from maic_control.usage where day=d and owner_id=p_owner)>=p_max
    or (select coalesce(sum(calls),0) from maic_control.usage where day=d)>=p_global then return false; end if;
  insert into maic_control.usage values(p_owner,d,p_task,p_model,1)
    on conflict(owner_id,day,task,model) do update set calls=maic_control.usage.calls+1;
  return true;
end $$;
revoke all on function public.maic_provision(uuid,text),public.maic_admit(uuid,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.maic_provision(uuid,text),public.maic_admit(uuid,text,text,integer,integer) to service_role;
commit;
