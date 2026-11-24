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
-- NO toca el historial de la liga: las fechas jugadas, resultados, reportes ya
-- aplicados, salón de la fama, sorteos y sanciones quedan tal cual.
-- Las cuentas de organizador no se pueden borrar desde el botón (se hace a mano).
-- =====================================================================

create or replace function public.eliminar_mi_cuenta() returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare
  uid      uuid := auth.uid();
  correo   text;
begin
  if uid is null then raise exception 'Tienes que haber iniciado sesión.'; end if;
  if exists (select 1 from public.admins where user_id = uid) then
    raise exception 'Las cuentas de organizador no se eliminan desde aquí. Pídeselo al administrador de la liga.';
  end if;

  select email into correo from auth.users where id = uid;

  -- Correo en contactos (lista de los organizadores)
  if correo is not null then
    delete from public.contactos where lower(data->>'email') = lower(correo);
  end if;

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

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.eliminar_mi_cuenta() from public, anon;
grant execute on function public.eliminar_mi_cuenta() to authenticated;
