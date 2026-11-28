-- Libera a composição de barreira (reserva/encerramento/reconhecimento) da EQUIPE.
--
-- Contato, acesso ao caso, tarefa e turno receberam esse grant em migrations próprias
-- (20261112160000, 20261112250000, 20261116210000, 20261125260000). A equipe não recebeu:
-- `20261112350000_barreira_concessao_equipe_privada.sql` cria e REVOGA, como as irmãs, e o
-- grant que viria depois nunca existiu.
--
-- Efeito observado em produção em 25/11/2026, navegando como a administradora: a aba Equipe
-- da Administração ficava inteira desabilitada com "Não foi possível concluir a conferência",
-- porque `/api/equipe/barreira` respondia 503 — a RPC existia e `authenticated` não podia
-- executá-la. Conferido: as outras quatro barreiras têm EXECUTE, só `equipe` não tinha.
--
-- Mesma forma das irmãs, incluindo as guardas: o bloco falha inteiro se o alvo não estiver no
-- estado esperado (dono dedicado, sem login, security definer) ou se a ACL inicial já tiver
-- sido alterada por outro caminho.
do $$
declare
 migrador text := current_user;
 item record;
 tinha_set boolean;
begin
 for item in select * from (values
  ('ffcmapp_equipe_barreira_owner','api.equipe_barreira_composicao(jsonb)')
 ) as alvos(owner_nome, assinatura) loop
  if not exists(select 1 from pg_proc p join pg_roles r on r.oid=p.proowner
    where p.oid=to_regprocedure(item.assinatura) and r.rolname=item.owner_nome
      and not r.rolcanlogin and not r.rolsuper and not r.rolbypassrls
      and not r.rolcreaterole and not r.rolcreatedb
      and not exists(select 1 from pg_auth_members m where m.member=r.oid)
      and p.prosecdef and 'row_security=on'=any(p.proconfig) and 'search_path=""'=any(p.proconfig)) then
   raise exception 'WRAPPER_INESPERADO: %', item.assinatura;
  end if;
  if has_function_privilege('authenticated',to_regprocedure(item.assinatura),'execute')
   or has_function_privilege('anon',to_regprocedure(item.assinatura),'execute')
   or has_function_privilege('service_role',to_regprocedure(item.assinatura),'execute') then
   raise exception 'ACL_INICIAL_INESPERADA: %', item.assinatura;
  end if;
  tinha_set := pg_has_role(migrador,item.owner_nome,'SET');
  if not tinha_set then
   if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid
     join pg_roles u on u.oid=m.member join pg_roles g on g.oid=m.grantor
     where r.rolname=item.owner_nome and u.rolname=migrador and g.rolname=migrador) then
    raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET';
   end if;
   execute format('grant %I to %I with inherit false, set true granted by %I',item.owner_nome,migrador,migrador);
  end if;
  perform set_config('role',item.owner_nome,true);
  execute format('grant execute on function %s to authenticated',item.assinatura);
  perform set_config('role',migrador,true);
  if not tinha_set then
   execute format('revoke %I from %I granted by %I',item.owner_nome,migrador,migrador);
  end if;
 end loop;
end $$;
