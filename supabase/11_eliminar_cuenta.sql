-- =====================================================================
-- 11 · Eliminar mi cuenta (botón "Eliminar mi cuenta" en Mi perfil)
-- Ejecutar una vez en Supabase → SQL Editor → Run. No borra nada por sí solo:
-- solo crea la función que el jugador llama al confirmar.
--
-- Qué hace la función, todo en una sola transacción (o se borra todo, o nada):
--   1. Borra la cuenta de inicio de sesión (auth.users) y, en cascada, sus sesiones,
--      identidades de Google, perfil, foto/apodo público, vínculos con la liga,
--      inscripciones, reportes de mesa y rol de juez.
--   2. Borra su correo de la tabla de contactos de los organizadores.
--   3. Borra los registros de inicio de sesión (auditoría) de esa cuenta.
--   4. Reemplaza su nombre por "Jugador eliminado #xxxx" en las fechas guardadas,
--      la fecha en curso, el calendario/salón de la fama y las sanciones.
--      Los puntos de las partidas se mantienen ANÓNIMOS para no alterar el
--      standing ni las estadísticas de los demás jugadores.
-- Las cuentas de organizador no se pueden borrar desde el botón (se hace a mano).
-- =====================================================================

-- Igual que claveNombre() de la página: minúsculas y sin tildes
create or replace function public.clave_nombre(t text) returns text
language sql immutable as $$
  select trim(regexp_replace(lower(translate(coalesce(t, ''),
    'ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑáàäâéèëêíìïîóòöôúùüûñ',
    'AAAAEEEEIIIIOOOOUUUUNaaaaeeeeiiiioooouuuun')), '\s+', ' ', 'g'));
$$;

create or replace function public.eliminar_mi_cuenta() returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare
  uid      uuid := auth.uid();
  correo   text;
  anon     text;
  nombres  text[] := '{}';
  n        text;
  patron   text;
  v        record;
  cambiadas int := 0;
begin
  if uid is null then raise exception 'Tienes que haber iniciado sesión.'; end if;
  if exists (select 1 from public.admins where user_id = uid) then
    raise exception 'Las cuentas de organizador no se eliminan desde aquí. Pídeselo al administrador de la liga.';
  end if;

  select email into correo from auth.users where id = uid;
  anon := 'Jugador eliminado #' || substr(replace(uid::text, '-', ''), 1, 4);

  -- Nombres con los que aparece en la liga: el de su perfil y el del jugador vinculado en cada liga
  select array_agg(distinct x) into nombres from (
    select trim(p.nombre || ' ' || p.apellido) as x from public.perfiles p where p.id = uid
    union
    select pl->>'name' from public.vinculos vi
      join public.liga l on l.id = case when vi.liga = 'b3' then 'estado_b3' else 'estado' end
      cross join lateral jsonb_array_elements(coalesce(l.data->'players', '[]'::jsonb)) pl
      where vi.user_id = uid and pl->>'id' = vi.pid
  ) s where x is not null and char_length(trim(x)) >= 4;
  nombres := coalesce(nombres, '{}');

  -- Correo en contactos (organizadores): por correo y por nombre
  delete from public.contactos
   where (correo is not null and lower(data->>'email') = lower(correo))
      or id = any (select public.clave_nombre(x) from unnest(nombres) x);

  -- Si fue juez: su correo queda fuera de las sanciones que marcó
  if correo is not null then
    update public.sanciones set data = jsonb_set(data, '{por}', to_jsonb('juez eliminado'::text))
     where lower(data->>'por') = lower(correo);
  end if;

  -- Nombre → anónimo en fechas guardadas, fecha en curso, calendario y salón de la fama
  foreach n in array nombres loop
    patron := '\m' || regexp_replace(n, '([\\.\^\$\|\?\*\+\(\)\[\]\{\}])', '\\\1', 'g') || '\M';
    for v in select id from public.historial where data::text ~* patron loop
      update public.historial set data = regexp_replace(data::text, patron, anon, 'gi')::jsonb where id = v.id;
      cambiadas := cambiadas + 1;
    end loop;
    for v in select id from public.liga where data::text ~* patron loop
      update public.liga set data = regexp_replace(data::text, patron, anon, 'gi')::jsonb where id = v.id;
      cambiadas := cambiadas + 1;
    end loop;
    for v in select id, liga from public.sanciones where data::text ~* patron loop
      update public.sanciones set data = regexp_replace(data::text, patron, anon, 'gi')::jsonb where id = v.id and liga = v.liga;
    end loop;
  end loop;

  -- Registros de inicio de sesión de esta cuenta
  begin
    delete from auth.audit_log_entries where payload->>'actor_id' = uid::text or payload->>'actor_username' = correo;
  exception when others then null;
  end;

  -- Datos propios (también caen en cascada al borrar la cuenta; se borran explícito por claridad)
  delete from public.votos          where user_id = uid;
  delete from public.inscripciones  where user_id = uid;
  delete from public.vinculos       where user_id = uid;
  delete from public.perfil_publico where user_id = uid;
  delete from public.jueces         where user_id = uid;
  delete from public.perfiles       where id = uid;

  -- La cuenta de inicio de sesión (sesiones, tokens e identidades de Google caen en cascada)
  delete from auth.users where id = uid;

  return jsonb_build_object('ok', true, 'anonimo', anon, 'registros_anonimizados', cambiadas);
end $$;

revoke all on function public.eliminar_mi_cuenta() from public, anon;
grant execute on function public.eliminar_mi_cuenta() to authenticated;
