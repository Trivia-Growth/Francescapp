-- RASCUNHO DE ROLLBACK: somente após grant desta proposta, desligar flags e reconciliar operações.
-- Revoga apenas grants atribuídos pelos owners; não altera grants de outros concedentes.
do $$
declare
 migrador text := current_user;
 item record;
 tinha_set boolean;
begin
 for item in select * from (values
  ('ffcmapp_edicao_paciente_owner','api.consultar_paciente_edicao_privado(jsonb)'),
  ('ffcmapp_edicao_paciente_owner','api.edicao_paciente_composicao_privada(jsonb)'),
  ('ffcmapp_edicao_paciente_owner','api.editar_paciente_privado(jsonb)'),
  ('ffcmapp_contato_barreira_owner','api.contato_barreira_composicao(jsonb)'),
  ('ffcmapp_contato_owner','api.criar_contato_paciente(jsonb)')
 ) as alvos(owner_nome, assinatura) loop
  if not exists(select 1 from pg_proc p join pg_roles r on r.oid=p.proowner
    where p.oid=to_regprocedure(item.assinatura) and r.rolname=item.owner_nome
      and p.prosecdef and 'row_security=on'=any(p.proconfig) and 'search_path=""'=any(p.proconfig)) then
   raise exception 'WRAPPER_INESPERADO: %', item.assinatura;
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
  execute format('revoke execute on function %s from authenticated granted by %I',item.assinatura,item.owner_nome);
  perform set_config('role',migrador,true);
  if not tinha_set then
   execute format('revoke %I from %I granted by %I',item.owner_nome,migrador,migrador);
  end if;
 end loop;
end $$;
