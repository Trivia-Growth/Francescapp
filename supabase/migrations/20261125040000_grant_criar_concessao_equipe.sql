-- Libera a criação de concessão de equipe — a pré-concessão de acesso.
--
-- É o caminho que atende o requisito do solicitante de 24/11/2026: "quem tem usuário do
-- domínio deve entrar com tudo configurado; se a Edilaine criar um usuário no sistema com
-- usuário do domínio, automaticamente as concessões e configurações vêm para o sistema".
-- A pré-concessão registra a pessoa pelo e-mail e deixa a concessão em `aguardando_google`;
-- o vínculo se fecha sozinho quando ela entra pelo Workspace. Não depende de caixa de
-- entrada, ao contrário da conta interna.
--
-- A fatia estava inteira, menos este grant. Reserva, encerramento e consulta da barreira
-- (20261112350000 mais o grant de 25/11/2026) e a listagem (20261112260000) já estavam
-- liberados — uma barreira concedida sem nada para proteger não faz sentido.
--
-- Observado em produção em 25/11/2026, pela tela, como a administradora: preencher a aba
-- Equipe e acionar "Pré-conceder acesso" respondia "Não deu para saber se o convite foi
-- registrado. Confira antes de continuar.", e a auditoria mostrava só
-- `api.reservar_concessao_equipe`, sem nenhum evento de criação. A RPC existia e
-- `authenticated` não podia executá-la.
--
-- Mesma forma das irmãs, com as mesmas guardas: o bloco falha inteiro se o alvo não estiver
-- no estado esperado (dono dedicado, sem login, security definer, `row_security=on`) ou se a
-- ACL inicial já tiver sido alterada por outro caminho.
do $$
declare
 migrador text := current_user;
 item record;
 tinha_set boolean;
begin
 for item in select * from (values
  ('ffcmapp_criar_equipe_owner','api.criar_concessao_equipe_privado(jsonb)')
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
