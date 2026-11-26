begin;
-- PAD-01/ESP-01: reaproveita o corpo exato pós-DF-023, preservando ambos métodos de entrada,
-- assinatura, grants e reautorização transacional. Nenhum vínculo/conteúdo existente é alterado.
create temporary table documento_previa_migrador on commit drop as
 select current_user::text migrador, pg_has_role(current_user,'ffcmapp_documento_owner','SET') tinha_set,
 has_schema_privilege('ffcmapp_documento_owner','api','CREATE') tinha_create;
do $migracao$
declare antes record; depois record; corpo text; previa text; definicao text; m record;
 ancora text := E' if not autorizado or fim<=clock_timestamp() then';
 corte text := E' if acao=''api.gravar_documento'' then\n  select * into anterior';
 gate text := $gate$
 -- A função de conta não concede carteira. O vínculo ativo do profissional é distinto.
 if autorizado and papel='colaborador' and perfil='profissional' then
  perform 1 from cadastro.acesso_paciente ap where ap.usuario_id=ator
   and ap.paciente_id=paciente and ap.revogada_em is null for share;
  autorizado:=found;
 end if;
$gate$;
begin
 select * into m from documento_previa_migrador;
 select p.prosrc,p.proacl,p.proowner,p.proconfig into antes from pg_proc p
  where p.oid='api.documento_operacao_privada(jsonb)'::regprocedure
   and p.proowner='ffcmapp_documento_owner'::regrole and p.prosecdef;
 if not found or md5(antes.prosrc)<>'5abf172784e472bd6ee449eeffe23942'
  or not ('search_path=""'=any(antes.proconfig)) then raise exception 'DOCUMENTO_FONTE_DIVERGENTE'; end if;
 if (length(antes.prosrc)-length(replace(antes.prosrc,ancora,'')))/length(ancora)<>1
  or (length(antes.prosrc)-length(replace(antes.prosrc,corte,'')))/length(corte)<>1 then
  raise exception 'DOCUMENTO_ANCORA_DIVERGENTE'; end if;
 if not m.tinha_set then
  if exists(select 1 from pg_auth_members where roleid='ffcmapp_documento_owner'::regrole and member=current_user::regrole and grantor=current_user::regrole) then raise exception 'MEMBERSHIP_EXISTENTE_SEM_SET'; end if;
  execute format('grant ffcmapp_documento_owner to %I with inherit false,set true granted by %I',m.migrador,m.migrador);
 end if;
 if not m.tinha_create then grant create on schema api to ffcmapp_documento_owner; end if;
 corpo:=replace(antes.prosrc,ancora,gate||ancora);
 definicao:=pg_get_functiondef('api.documento_operacao_privada(jsonb)'::regprocedure);
 perform set_config('role','ffcmapp_documento_owner',true);
 execute replace(definicao,antes.prosrc,corpo);
 -- A prévia executa TODAS as validações e a autorização do corpo vigente até o ponto
 -- imediatamente anterior à mutação. Não concede autorização reutilizável à RPC final.
 previa:=split_part(corpo,corte,1)||$previa$
 if acao is distinct from 'api.gravar_documento' then
  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 select * into anterior from operacao.requisicao r where r.ator_usuario_id=ator
  and r.operacao=acao and r.chave_idempotencia=e->>'chave_idempotencia';
 repeticao:=found;
 if repeticao then
  if anterior.digest_entrada is distinct from e->>'digest_idempotencia'
   or not exists(select 1 from cadastro.documento_caso_versao v where v.id=anterior.resultado_id
    and v.documento_id=documento and v.paciente_id=paciente and v.versao=anterior.resultado_versao) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito_idempotencia'),'request_id',req);
  end if;
 else
  select d.paciente_id into dono from cadastro.documento_caso d where d.id=documento for share;
  if (esperada=0 and found) or (esperada>0 and (not found or dono is distinct from paciente)) then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',req);
  end if;
  select coalesce(max(v.versao),0) into atual from cadastro.documento_caso_versao v where v.documento_id=documento;
  if atual<>esperada then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
   if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
  end if;
 end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
  values(gen_random_uuid(),ator,acao,'paciente',paciente,'permitido',req);
 if not found then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 if fim<=clock_timestamp() or not exists(select 1 from auth_privado.sessoes() s where s.id=sessao and s.user_id=ator and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception using errcode='PZ001',message='EXPIRACAO_INTERNA';
 end if;
 return jsonb_build_object('ok',true,'repeticao',repeticao,'request_id',req);
end;
$previa$;
 execute replace(replace(definicao,'FUNCTION api.documento_operacao_privada(', 'FUNCTION api.documento_preautorizar_privada('),antes.prosrc,previa);
 revoke all on function api.documento_preautorizar_privada(jsonb) from public,anon,authenticated,service_role;
 grant execute on function api.documento_preautorizar_privada(jsonb) to authenticated;
 perform set_config('role',m.migrador,true);
 select p.proacl,p.proowner,p.proconfig into depois from pg_proc p where p.oid='api.documento_operacao_privada(jsonb)'::regprocedure;
 if depois.proacl is distinct from antes.proacl or depois.proowner<>antes.proowner
  or depois.proconfig is distinct from antes.proconfig then raise exception 'DOCUMENTO_PRIVILEGIOS_ALTERADOS'; end if;
 if not m.tinha_create then revoke create on schema api from ffcmapp_documento_owner; end if;
 if not m.tinha_set then execute format('revoke ffcmapp_documento_owner from %I granted by %I',m.migrador,m.migrador); end if;
end $migracao$;
commit;
