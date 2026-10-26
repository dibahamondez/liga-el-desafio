-- =====================================================================
-- El Desafío · los jueces se ven en la página
-- Permite que todos sepan quién es juez (solo el id de la cuenta), para mostrar
-- el marco de juez alrededor de su foto de perfil. Nombrar o quitar jueces
-- sigue siendo solo de los organizadores.
-- Correr una vez en Supabase → SQL Editor. Se puede volver a correr sin problema.
-- =====================================================================

drop policy if exists "ver juez" on public.jueces;
drop policy if exists "ver jueces" on public.jueces;
create policy "ver jueces" on public.jueces for select using (true);
grant select on public.jueces to anon, authenticated;

do $$ begin
  begin alter publication supabase_realtime add table public.jueces; exception when duplicate_object then null; end;
end $$;
