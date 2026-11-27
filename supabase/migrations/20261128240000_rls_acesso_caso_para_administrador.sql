begin;
-- Conclui a decisão de 24/11/2026 — "o administrador terá acesso a todos os casos, pois é o
-- dono do sistema" — no único lugar que ficou de fora dela: as POLICIES da fatia.
--
-- `20261124200000_acesso_caso_para_administrador.sql` trocou a conferência DENTRO de
-- `operacao.conceder_acesso_paciente_privado` para `u.perfil in ('profissional','administrador')`
-- e parou aí. Só que a mesma regra está escrita mais duas vezes, em RLS, desde
-- `20261112070000_owners_acesso_paciente_privado.sql`, e as duas continuaram dizendo
-- `perfil='profissional'`:
--
--   conceder_acesso_owner_acesso_insert ... with check (... exists (select 1 from public.usuario u
--     where u.id=usuario_id and u.perfil='profissional' and u.ativo))
--   conceder_acesso_owner_usuario       ... using  (id=(select auth_privado.uid())
--     or (perfil='profissional' and ativo))
--
-- Por isso a concessão passava pela conferência e morria no INSERT. Reproduzido em Postgres
-- local, com a cadeia de migrations e a fixture de `acesso_paciente_autorizacao_local.sql`,
-- a administradora concedendo acesso a si mesma:
--
--   EXCECAO sqlstate=42501 msg=new row violates row-level security policy for table "acesso_paciente"
--
-- que é exatamente o `banco_42501` que a interface vinha mostrando. Não era grant faltando: o
-- EXECUTE em `api.conceder_acesso_paciente_privado(jsonb)` para `authenticated` já existe desde
-- `20261112250000_grants_vinculos_teste.sql`. Era a policy de INSERT recusando o destinatário.
--
-- A policy de SELECT/UPDATE em `public.usuario` entra junto pelo mesmo motivo: sem ela, a
-- administradora só enxerga a própria linha (`id=auth_privado.uid()`), e conceder acesso a OUTRO
-- administrador pararia antes, em `nao_encontrado`, no `for update` do destinatário.
--
-- Nada mais muda. Quem concede continua precisando ser administrador ativo, com sessão,
-- atestado e concessão de equipe conferidos; o paciente continua exigindo administrador; o
-- motivo continua cifrado; a auditoria continua obrigatória na mesma transação. A única
-- ampliação é o conjunto de destinatários aceitos, que passa a ser o mesmo já declarado na
-- função.

do $$
declare
 esperado text[] := array[
  'conceder_acesso_owner_usuario',
  'conceder_acesso_owner_usuario_lock',
  'conceder_acesso_owner_acesso_insert'
 ];
 nome text;
begin
 foreach nome in array esperado loop
  if not exists(select 1 from pg_policies p
    where p.policyname=nome
      and (p.schemaname,p.tablename) in (('public','usuario'),('cadastro','acesso_paciente'))
      and p.roles::text[] @> array['ffcmapp_conceder_acesso_owner']
      and coalesce(p.qual,'')||coalesce(p.with_check,'') like '%profissional%') then
   raise exception 'POLICY_INESPERADA: %', nome;
  end if;
 end loop;
end $$;

drop policy conceder_acesso_owner_usuario on public.usuario;
create policy conceder_acesso_owner_usuario on public.usuario for select to ffcmapp_conceder_acesso_owner
 using (id=(select auth_privado.uid()) or (perfil in ('profissional','administrador') and ativo));

drop policy conceder_acesso_owner_usuario_lock on public.usuario;
create policy conceder_acesso_owner_usuario_lock on public.usuario for update to ffcmapp_conceder_acesso_owner
 using (id=(select auth_privado.uid()) or (perfil in ('profissional','administrador') and ativo)) with check (false);

drop policy conceder_acesso_owner_acesso_insert on cadastro.acesso_paciente;
create policy conceder_acesso_owner_acesso_insert on cadastro.acesso_paciente for insert to ffcmapp_conceder_acesso_owner
 with check (exists (select 1 from public.usuario u where u.id=(select auth_privado.uid()) and u.ativo and u.perfil='administrador')
  and concedido_por_usuario_id=(select auth_privado.uid())
  and exists (select 1 from public.usuario u where u.id=usuario_id and u.perfil in ('profissional','administrador') and u.ativo));

commit;
