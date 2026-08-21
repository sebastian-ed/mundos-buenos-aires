-- Trama Buenos Aires · esquema Supabase
-- Ejecutar completo desde Supabase > SQL Editor en un proyecto nuevo.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('viewer','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  source_fid bigint unique,
  category_id uuid not null references public.categories(id) on update cascade on delete restrict,
  subcategory text,
  name text not null,
  secondary_function text,
  programming text,
  branch text,
  room text,
  street text,
  street_number text,
  neighborhood text,
  commune text,
  address text,
  longitude double precision check (longitude is null or longitude between -180 and 180),
  latitude double precision check (latitude is null or latitude between -90 and 90),
  phone text,
  email text,
  website text,
  facebook text,
  twitter text,
  instagram text,
  camera_1 text,
  camera_2 text,
  networks text,
  culture_point text,
  other_networks text,
  room_count integer check (room_count is null or room_count >= 0),
  capacity_total integer check (capacity_total is null or capacity_total >= 0),
  tag text,
  description text,
  image_url text,
  is_featured boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_usage (
  ip_hash text not null,
  usage_date date not null default current_date,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (ip_hash, usage_date)
);

create index if not exists spaces_category_idx on public.spaces(category_id);
create index if not exists spaces_neighborhood_idx on public.spaces(neighborhood);
create index if not exists spaces_commune_idx on public.spaces(commune);
create index if not exists spaces_active_idx on public.spaces(is_active);
create index if not exists spaces_name_trgm_idx on public.spaces using gin(name gin_trgm_ops);
create index if not exists spaces_address_trgm_idx on public.spaces using gin(address gin_trgm_ops);
create index if not exists spaces_tag_trgm_idx on public.spaces using gin(tag gin_trgm_ops);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists categories_updated_at on public.categories;
create trigger categories_updated_at before update on public.categories
for each row execute function public.set_updated_at();

drop trigger if exists spaces_updated_at on public.spaces;
create trigger spaces_updated_at before update on public.spaces
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role) values (new.id, 'viewer')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.get_space_facets()
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'neighborhoods', coalesce((
      select jsonb_agg(neighborhood order by neighborhood)
      from (select distinct neighborhood from public.spaces where is_active and neighborhood is not null) q
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name)
      from public.categories c
      where exists (select 1 from public.spaces s where s.category_id = c.id and s.is_active)
    ), '[]'::jsonb)
  );
$$;

create or replace function public.consume_ai_quota(p_ip_hash text, p_limit integer default 30)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  current_count integer;
begin
  insert into public.ai_usage(ip_hash, usage_date, request_count)
  values (p_ip_hash, current_date, 1)
  on conflict (ip_hash, usage_date)
  do update set request_count = public.ai_usage.request_count + 1, updated_at = now()
  returning request_count into current_count;

  return current_count <= greatest(p_limit, 1);
end;
$$;

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.spaces enable row level security;
alter table public.ai_usage enable row level security;

-- Profiles
create policy "profiles_select_self_or_admin"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

create policy "profiles_admin_update"
on public.profiles for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Categories: catálogo público legible; escritura solo admin.
create policy "categories_public_read"
on public.categories for select
to anon, authenticated
using (true);

create policy "categories_admin_insert"
on public.categories for insert
to authenticated
with check (public.is_admin());

create policy "categories_admin_update"
on public.categories for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "categories_admin_delete"
on public.categories for delete
to authenticated
using (public.is_admin());

-- Spaces: público ve solo activos; admin ve y gestiona todo.
create policy "spaces_public_read_active"
on public.spaces for select
to anon, authenticated
using (is_active = true);

create policy "spaces_admin_read_all"
on public.spaces for select
to authenticated
using (public.is_admin());

create policy "spaces_admin_insert"
on public.spaces for insert
to authenticated
with check (public.is_admin());

create policy "spaces_admin_update"
on public.spaces for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "spaces_admin_delete"
on public.spaces for delete
to authenticated
using (public.is_admin());

-- ai_usage no tiene políticas públicas. Solo se usa desde la Edge Function con clave secreta.

revoke all on public.ai_usage from anon, authenticated;
revoke all on function public.consume_ai_quota(text, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(text, integer) to service_role;

grant select on public.categories, public.spaces to anon, authenticated;
grant insert, update, delete on public.categories, public.spaces to authenticated;
grant select, update on public.profiles to authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.get_space_facets() to anon, authenticated, service_role;

-- Después de crear tu usuario desde Authentication > Users, promovelo una sola vez:
-- update public.profiles set role = 'admin' where id = 'UUID_DEL_USUARIO';
