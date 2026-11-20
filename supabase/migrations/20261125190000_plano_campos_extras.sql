begin;
-- ESP-05/06: fontes fixadas após DF-023; sem ativação ou grants de aplicação.
-- Valores permanecem cifrados; servidor valida tipo/opções. Banco revalida snapshot
-- assinado sob locks e preserva autorização de caso/audiência já existente.
create temporary table plano_predicados_inventario(assinatura text primary key, origem text not null, hash_anterior text not null, hash_novo text not null) on commit drop;
create function pg_temp.atualizar_plano(p_assinatura text,p_hash text,p_hash_novo text,p_patches jsonb,p_origem text,p_executores text[] default null) returns void language plpgsql as $guard$
declare oid_alvo oid:=to_regprocedure(p_assinatura); antes record; depois record; definicao text; migrador text:=current_user; dono text; esquema text; tinha_set boolean; tinha_create boolean; novo_corpo text; patch jsonb; antigo text; novo text; executor text; executor_owner text; executores text[];
begin
 if oid_alvo is null then raise exception 'CONSUMIDOR_AUSENTE: %',p_assinatura;end if;
 select p.prosrc,p.proowner,p.proacl,p.proconfig,p.prosecdef,p.prorettype,p.proargtypes into antes from pg_proc p where p.oid=oid_alvo;
 if md5(antes.prosrc)<>p_hash then raise exception 'FONTE_AUTENTICADOR_DIVERGENTE: %',p_assinatura;end if;
 select r.rolname,n.nspname into dono,esquema from pg_proc p join pg_roles r on r.oid=p.proowner join pg_namespace n on n.oid=p.pronamespace where p.oid=oid_alvo and (not antes.prosecdef or (not r.rolsuper and not r.rolbypassrls and not r.rolcanlogin));
 if dono is null or not ('search_path=""'=any(antes.proconfig)) then raise exception 'OWNER_CONFIG_INESPERADO: %',p_assinatura;end if;
 novo_corpo:=antes.prosrc;
 for patch in select value from jsonb_array_elements(p_patches) loop
  antigo:=patch->>'antes';novo:=patch->>'depois';
  if antigo is null or antigo='' or novo is null or (length(novo_corpo)-length(replace(novo_corpo,antigo,'')))/length(antigo)<>1 then raise exception 'ANCORA_NAO_UNICA: %',p_assinatura;end if;
  novo_corpo:=replace(novo_corpo,antigo,novo);
 end loop;
 if md5(novo_corpo)<>p_hash_novo then raise exception 'HASH_FINAL_DIVERGENTE: %',p_assinatura;end if;
 if antes.prosecdef then
 tinha_set:=pg_has_role(migrador,dono,'SET');tinha_create:=has_schema_privilege(dono,esquema,'CREATE');
 if not tinha_set then
  if exists(select 1 from pg_auth_members where roleid=dono::regrole and member=migrador::regrole and grantor=migrador::regrole) then raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET';end if;
  execute format('grant %I to %I with inherit false,set true granted by %I',dono,migrador,migrador);
 end if;
 if not tinha_create then execute format('grant create on schema %I to %I',esquema,dono);end if;
 definicao:=pg_get_functiondef(oid_alvo);
 perform set_config('role',dono,true);
 execute replace(definicao,antes.prosrc,novo_corpo);
 perform set_config('role',migrador,true);
 if not tinha_create then execute format('revoke create on schema %I from %I',esquema,dono);end if;
 if not tinha_set then execute format('revoke %I from %I granted by %I',dono,migrador,migrador);end if;
 else
  if not pg_has_role(migrador,dono,'USAGE') then raise exception 'OWNERSHIP_INVOKER_INDISPONIVEL: %',p_assinatura;end if;
  definicao:=pg_get_functiondef(oid_alvo);
  execute replace(definicao,antes.prosrc,novo_corpo);
 end if;
 select p.prosrc,p.proowner,p.proacl,p.proconfig,p.prosecdef,p.prorettype,p.proargtypes into depois from pg_proc p where p.oid=oid_alvo;
 if depois.proowner<>antes.proowner or depois.proacl is distinct from antes.proacl or depois.proconfig is distinct from antes.proconfig or depois.prosecdef<>antes.prosecdef or depois.prorettype<>antes.prorettype or depois.proargtypes<>antes.proargtypes or depois.prosrc<>novo_corpo then raise exception 'CONSUMIDOR_NAO_PRESERVADO: %',p_assinatura;end if;
 insert into plano_predicados_inventario values(p_assinatura,p_origem,p_hash,md5(depois.prosrc));
end $guard$;
select pg_temp.atualizar_plano('operacao.campo_extra_plano_operacao_privada(jsonb)','644ad1608a59a15237474473b322389c','c322dd0a3e5a5319067adb6047348ebe',jsonb_build_array(jsonb_build_object('antes',$fragmento$if contexto_gerenciado->>'perfil' in ('administrador') then$fragmento$,'depois',$fragmento$if contexto_gerenciado->>'perfil' = 'administrador'
    or (acao = 'api.listar_campo_extra_plano' and contexto_gerenciado->>'perfil' = 'profissional') then$fragmento$)),'20261125170000_acessos_consumidores_autenticacao.sql');
select pg_temp.atualizar_plano('api.plano_cuidado_operacao_privada(jsonb)','2483159de882896f1c2acbe6d7f314f8','8c7f12fb01a8ff10173dbd7277eb04e0',jsonb_build_array(jsonb_build_object('antes',$fragmento$'cursor','limite','visibilidade']$fragmento$,'depois',$fragmento$'cursor','limite','visibilidade','campos_extras_catalogo']$fragmento$),
jsonb_build_object('antes',$fragmento$ if acao='api.gravar_objetivo_cuidado' then
  select * into anterior from operacao.requisicao$fragmento$,'depois',$fragmento$ if acao='api.gravar_objetivo_cuidado' then
  declare campo_extra record; versao_catalogo integer; begin
    if e ? 'campos_extras_catalogo' then
      if jsonb_typeof(e->'campos_extras_catalogo') is distinct from 'object' then
        raise exception using errcode='22023', message='ENTRADA_INVALIDA';
      end if;
      for campo_extra in select key, value from jsonb_each(e->'campos_extras_catalogo') order by key loop
        if campo_extra.key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          or jsonb_typeof(campo_extra.value) is distinct from 'number'
          or (campo_extra.value #>> '{}') !~ '^[1-9][0-9]{0,9}$' then
          raise exception using errcode='22023', message='ENTRADA_INVALIDA';
        end if;
        select c.versao into versao_catalogo from cadastro.campo_extra_plano_catalogo c
          where c.id=campo_extra.key::uuid and c.ativo for share;
        if not found or versao_catalogo::text is distinct from (campo_extra.value #>> '{}') then
          insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
            values(gen_random_uuid(),ator,acao,'paciente',paciente,'negado',req);
          if not found then raise exception using errcode='P0002', message='AUDITORIA_NAO_INSERIDA'; end if;
          return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','conflito'),'request_id',req);
        end if;
      end loop;
    end if;
  end;
  select * into anterior from operacao.requisicao$fragmento$),
jsonb_build_object('antes',$fragmento$  select jsonb_build_object('registro_id',v.id,'objetivo_id',v.objetivo_id,'paciente_id',paciente,'versao',v.versao,'conteudo',v.conteudo_cifrado,'visibilidade',v.visibilidade)$fragmento$,'depois',$fragmento$  select jsonb_build_object('registro_id',v.id,'objetivo_id',v.objetivo_id,'paciente_id',paciente,'versao',v.versao,'conteudo',v.conteudo_cifrado,'visibilidade',v.visibilidade,'aprovacoes',(select coalesce(jsonb_agg(jsonb_build_object('registro_id',ap.registro_id,'aprovador_usuario_id',ap.aprovador_usuario_id,'aprovado_em',ap.aprovado_em) order by ap.aprovado_em),'[]'::jsonb) from cadastro.objetivo_cuidado_aprovacao ap where ap.registro_id=v.id))$fragmento$),
jsonb_build_object('antes',$fragmento$  select jsonb_build_object('itens',coalesce(jsonb_agg(jsonb_build_object('registro_id',v.id,'objetivo_id',objetivo,'paciente_id',paciente,'versao',v.versao,'conteudo',v.conteudo_cifrado,'visibilidade',v.visibilidade) order by v.versao),'[]'::jsonb),$fragmento$,'depois',$fragmento$  select jsonb_build_object('itens',coalesce(jsonb_agg(jsonb_build_object('registro_id',v.id,'objetivo_id',objetivo,'paciente_id',paciente,'versao',v.versao,'conteudo',v.conteudo_cifrado,'visibilidade',v.visibilidade,'aprovacoes',(select coalesce(jsonb_agg(jsonb_build_object('registro_id',ap.registro_id,'aprovador_usuario_id',ap.aprovador_usuario_id,'aprovado_em',ap.aprovado_em) order by ap.aprovado_em),'[]'::jsonb) from cadastro.objetivo_cuidado_aprovacao ap where ap.registro_id=v.id)) order by v.versao),'[]'::jsonb),$fragmento$),
jsonb_build_object('antes',$fragmento$  select jsonb_build_object('itens',coalesce(jsonb_agg(jsonb_build_object('registro_id',v.id,'objetivo_id',o.id,'paciente_id',paciente,'versao',v.versao,'conteudo',v.conteudo_cifrado,'visibilidade',v.visibilidade) order by o.id) filter (where papel='colaborador' or v.visibilidade='publica'),'[]'::jsonb),$fragmento$,'depois',$fragmento$  select jsonb_build_object('itens',coalesce(jsonb_agg(jsonb_build_object('registro_id',v.id,'objetivo_id',o.id,'paciente_id',paciente,'versao',v.versao,'conteudo',v.conteudo_cifrado,'visibilidade',v.visibilidade,'aprovacoes',(select coalesce(jsonb_agg(jsonb_build_object('registro_id',ap.registro_id,'aprovador_usuario_id',ap.aprovador_usuario_id,'aprovado_em',ap.aprovado_em) order by ap.aprovado_em),'[]'::jsonb) from cadastro.objetivo_cuidado_aprovacao ap where ap.registro_id=v.id)) order by o.id) filter (where papel='colaborador' or v.visibilidade='publica'),'[]'::jsonb),$fragmento$)),'20261125170000_acessos_consumidores_autenticacao.sql');

grant select (id, versao, ativo), update (versao) on cadastro.campo_extra_plano_catalogo to ffcmapp_plano_owner;
create policy plano_catalogo_select on cadastro.campo_extra_plano_catalogo for select to ffcmapp_plano_owner using (true);
create policy plano_catalogo_lock on cadastro.campo_extra_plano_catalogo for update to ffcmapp_plano_owner using (true) with check (false);
grant select (registro_id,aprovador_usuario_id,aprovado_em) on cadastro.objetivo_cuidado_aprovacao to ffcmapp_plano_owner;
create policy plano_aprovacao_select on cadastro.objetivo_cuidado_aprovacao for select to ffcmapp_plano_owner using (true);
-- ACL/owner/proconfig conferidos pelo helper; memberships e CREATE temporários restaurados.
-- Nenhum grant novo a anon/authenticated/service_role.
commit;
