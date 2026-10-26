-- =====================================================================
-- El Desafío · perfil público (apodo e imagen de perfil)
-- Cada jugador edita su apodo y su foto desde "Mi perfil"; todos los ven junto a su nombre.
-- Correr una vez en Supabase → SQL Editor. Se puede volver a correr sin problema.
-- =====================================================================

create table if not exists public.perfil_publico (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,          -- {apodo, avatar (imagen chica en base64)}
  actualizado timestamptz not null default now(),
  constraint perfil_publico_tamano check (octet_length(data::text) < 120000)
);
alter table public.perfil_publico enable row level security;

drop policy if exists "ver perfil publico" on public.perfil_publico;
create policy "ver perfil publico" on public.perfil_publico for select using (true);
drop policy if exists "editar mi perfil publico" on public.perfil_publico;
create policy "editar mi perfil publico" on public.perfil_publico for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select on public.perfil_publico to anon, authenticated;
grant insert, update, delete on public.perfil_publico to authenticated;
grant all on public.perfil_publico to service_role;

do $$ begin
  begin alter publication supabase_realtime add table public.perfil_publico; exception when duplicate_object then null; end;
end $$;

-- Los apodos que ya existían pasan al perfil público
insert into public.perfil_publico (user_id, data)
select id, jsonb_build_object('apodo', apodo, 'nombre', trim(nombre || ' ' || apellido)) from public.perfiles where apodo is not null
on conflict (user_id) do nothing;
