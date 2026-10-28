-- Perritos Perdidos SV: esquema para Supabase.
-- Pégalo completo en SQL Editor y presiona Run.
-- ANTES de ejecutarlo, cambia el correo de la función es_admin() por el tuyo.

-- 1) Quién es administrador ------------------------------------------------
create or replace function public.es_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'email') = 'CAMBIA_ESTE_CORREO@ejemplo.com', false)
$$;

-- 2) Tabla de reportes -------------------------------------------------------
create table if not exists public.reportes (
  id           uuid primary key,
  tipo         text not null check (tipo in ('perdido', 'encontrado')),
  estado       text not null default 'activo' check (estado in ('activo', 'reunido')),
  nombre       text not null default '' check (char_length(nombre) <= 40),
  raza         text not null default '' check (char_length(raza) <= 40),
  color        text not null default '' check (char_length(color) <= 40),
  tamano       text not null default '' check (tamano in ('', 'Pequeño', 'Mediano', 'Grande')),
  sexo         text not null default '' check (sexo in ('', 'Macho', 'Hembra')),
  depto        text not null check (depto in (
                 'Ahuachapán','Cabañas','Chalatenango','Cuscatlán','La Libertad','La Paz','La Unión',
                 'Morazán','San Miguel','San Salvador','San Vicente','Santa Ana','Sonsonate','Usulután')),
  municipio    text not null check (char_length(municipio) between 1 and 60),
  referencia   text not null default '' check (char_length(referencia) <= 90),
  fecha        date not null check (fecha <= current_date + 1 and fecha >= current_date - 365),
  senas        text not null default '' check (char_length(senas) <= 400),
  foto_url     text check (foto_url is null or foto_url like 'https://%/storage/v1/object/public/fotos/%'),
  contacto     text not null check (char_length(contacto) between 1 and 40),
  telefono     text not null check (telefono ~ '^[2679][0-9]{7}$'),
  codigo_hash  text not null check (char_length(codigo_hash) = 64),
  oculto       boolean not null default false,
  creado       timestamptz not null default now()
);

create index if not exists reportes_creado_idx on public.reportes (creado desc);
create index if not exists reportes_telefono_idx on public.reportes (telefono, creado desc);

-- 3) Denuncias de contenido falso o inapropiado ------------------------------
create table if not exists public.denuncias (
  id          bigint generated always as identity primary key,
  reporte_id  uuid not null references public.reportes (id) on delete cascade,
  motivo      text not null default '' check (char_length(motivo) <= 200),
  creado      timestamptz not null default now()
);

-- 4) Vista pública: sin el código secreto, sin ocultos y solo de los últimos 90 días
create or replace view public.reportes_publicos as
  select id, tipo, estado, nombre, raza, color, tamano, sexo, depto, municipio,
         referencia, fecha, senas, foto_url, contacto, telefono, creado
  from public.reportes
  where oculto = false
    and creado > now() - interval '90 days';

-- 5) Límite contra abuso: 5 reportes por teléfono al día y 40 por minuto en total
create or replace function public.limitar_reportes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.reportes
      where telefono = new.telefono and creado > now() - interval '1 day') >= 5 then
    raise exception 'Demasiados reportes con este número hoy. Intenta mañana.';
  end if;
  if (select count(*) from public.reportes where creado > now() - interval '1 minute') >= 40 then
    raise exception 'Demasiados reportes en este momento. Intenta en unos minutos.';
  end if;
  return new;
end
$$;

drop trigger if exists reportes_limite on public.reportes;
create trigger reportes_limite before insert on public.reportes
  for each row execute function public.limitar_reportes();

-- 6) Permisos -----------------------------------------------------------------
alter table public.reportes enable row level security;
alter table public.denuncias enable row level security;

revoke all on public.reportes from anon, authenticated;
revoke all on public.denuncias from anon, authenticated;
revoke all on public.reportes_publicos from anon, authenticated;

grant select on public.reportes_publicos to anon, authenticated;
grant insert on public.reportes to anon, authenticated;
grant select, update, delete on public.reportes to authenticated;
grant insert on public.denuncias to anon, authenticated;
grant select, delete on public.denuncias to authenticated;

drop policy if exists "publico crea reportes" on public.reportes;
create policy "publico crea reportes" on public.reportes
  for insert to anon, authenticated
  with check (estado = 'activo' and oculto = false);

drop policy if exists "admin gestiona reportes" on public.reportes;
create policy "admin gestiona reportes" on public.reportes
  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

drop policy if exists "publico denuncia" on public.denuncias;
create policy "publico denuncia" on public.denuncias
  for insert to anon, authenticated
  with check (true);

drop policy if exists "admin ve denuncias" on public.denuncias;
create policy "admin ve denuncias" on public.denuncias
  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- 7) Cerrar o borrar tu propio reporte con el código secreto (sin cuenta) -----
create or replace function public.actualizar_reporte(p_id uuid, p_hash text, p_accion text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if p_accion = 'reunido' then
    update public.reportes set estado = 'reunido' where id = p_id and codigo_hash = p_hash;
  elsif p_accion = 'eliminar' then
    delete from public.reportes where id = p_id and codigo_hash = p_hash;
  else
    return false;
  end if;
  get diagnostics n = row_count;
  return n > 0;
end
$$;

revoke all on function public.actualizar_reporte(uuid, text, text) from public;
grant execute on function public.actualizar_reporte(uuid, text, text) to anon, authenticated;

-- 8) Fotos: carpeta pública, solo JPG de hasta 600 KB --------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 614400, array['image/jpeg'])
on conflict (id) do update
  set public = true, file_size_limit = 614400, allowed_mime_types = array['image/jpeg'];

drop policy if exists "fotos subir" on storage.objects;
create policy "fotos subir" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'fotos');

drop policy if exists "fotos admin borra" on storage.objects;
create policy "fotos admin borra" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fotos' and public.es_admin());
