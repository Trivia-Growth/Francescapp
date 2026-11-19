begin;

create temporary table acessos_privilegios_migracao on commit drop as select current_user::text migrador,pg_has_role(current_user,'ffcmapp_acessos_owner','SET') tinha_set,has_schema_privilege('ffcmapp_acessos_owner','api','CREATE') tinha_api,has_schema_privilege('ffcmapp_acessos_owner','identidade','CREATE') tinha_identidade;
do $$ declare p record;begin select * into p from acessos_privilegios_migracao;
 if not p.tinha_set then
  if exists(select 1 from pg_auth_members where roleid='ffcmapp_acessos_owner'::regrole and member=current_user::regrole and grantor=current_user::regrole) then raise exception 'MEMBERSHIP_CONCEDENTE_EXISTENTE_SEM_SET';end if;
  execute format('grant ffcmapp_acessos_owner to %I with inherit false,set true granted by %I',p.migrador,p.migrador);
 end if;
 if not p.tinha_api then grant create on schema api to ffcmapp_acessos_owner;end if;
 if not p.tinha_identidade then grant create on schema identidade to ffcmapp_acessos_owner;end if;
end $$;
-- DF-023. Allowlist fechada; sem SQL remoto ou ativação. Corpo/ACL/owner/proconfig conferidos.
-- Não altera autorização de caso, audiência, habilitação ou técnica legada.
create temporary table acessos_predicados_inventario(assinatura text primary key, origem text not null, hash_anterior text not null,hash_novo text not null) on commit drop;
create function pg_temp.substituir_autenticador(p_assinatura text,p_hash text,p_hash_novo text,p_patches jsonb,p_origem text,p_executores text[] default null) returns void language plpgsql as $guard$
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
 -- INVOKER preserva owner nominal; EXECUTE contexto vai aos wrappers explícitos.
 if antes.prosecdef then executores:=array[p_assinatura];else executores:=p_executores;end if;
 if executores is null or cardinality(executores)=0 then raise exception 'EXECUTOR_NAO_INVENTARIADO: %',p_assinatura;end if;
 foreach executor in array executores loop
  select r.rolname into executor_owner from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid=to_regprocedure(executor) and p.prosecdef and not r.rolsuper and not r.rolbypassrls and not r.rolcanlogin and 'search_path=""'=any(p.proconfig);
  if executor_owner is null or not has_function_privilege(executor_owner,oid_alvo,'EXECUTE') then raise exception 'EXECUTOR_INESPERADO: %',executor;end if;
  perform set_config('role','ffcmapp_acessos_owner',true);
  execute format('grant execute on function identidade.contexto_acesso_vigente(boolean),identidade.cadastro_gerenciado_proprio(boolean) to %I',executor_owner);
  if p_assinatura in ('api.admitir_sessao_nativa(uuid)','api.consultar_sessao_nativa(uuid)','api.admitir_sessao_familiar_nativa(uuid)') then
   execute format('grant execute on function identidade.sessao_gerenciada_nativa(uuid,boolean),identidade.recusar_admissao_familiar_gerenciada(uuid) to %I',executor_owner);
  end if;
  perform set_config('role',migrador,true);
 end loop;
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
 insert into acessos_predicados_inventario values(p_assinatura,p_origem,p_hash,md5(depois.prosrc));
end $guard$;
-- identidade.listar_carteira_privada: 20261118330000_carteira_filtros_sinal.sql
select pg_temp.substituir_autenticador('identidade.listar_carteira_privada(jsonb)','436c2c8ba0219e3ae3acabfeaa2d5455','5aec66366ee5d24b0943ed927cedb211',jsonb_build_array(jsonb_build_object('antes',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 if exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password') then
$fragmento$,'depois',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador','profissional') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
   perfil:=contexto_gerenciado->>'perfil';
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 if exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password') then
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 -- Responsável e situação vivem em cadastro.acompanhamento_caso, que só o ramo do
 -- Administrador enxerga. Pedir esses filtros fora dele é entrada inválida, nunca um
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 -- Responsável e situação vivem em cadastro.acompanhamento_caso, que só o ramo do
 -- Administrador enxerga. Pedir esses filtros fora dele é entrada inválida, nunca um
$fragmento$)),'20261118330000_carteira_filtros_sinal.sql');
-- operacao.criar_paciente_privado: 20261113120000_criar_caso_atomico.sql
select pg_temp.substituir_autenticador('operacao.criar_paciente_privado(jsonb)','2211b4c3067c5a7c0fd8a19539c113e8','94a284cb198950e3cb69c91cabbef02b',jsonb_build_array(jsonb_build_object('antes',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$)),'20261113120000_criar_caso_atomico.sql',array['api.criar_paciente(jsonb)']);
-- operacao.cadastro_composicao_privada: 20261110140000_cadastro_conta_tecnica.sql
select pg_temp.substituir_autenticador('operacao.cadastro_composicao_privada(jsonb)','864e64fe523b9d8f7f0a0a51aa199540','fd9dd315c914a180c8ade0599e123ba8',jsonb_build_array(jsonb_build_object('antes',$fragmento$  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$)),'20261110140000_cadastro_conta_tecnica.sql',array['api.cadastro_composicao(jsonb)']);
-- api.anamnese_operacao_privada: 20261125010000_anamnese_vinculo_caso.sql
select pg_temp.substituir_autenticador('api.anamnese_operacao_privada(jsonb)','8a5bca5200fcc00063d2a1da79121bef','4fb160ef68edd924b87ed7f7adaa33c1',jsonb_build_array(jsonb_build_object('antes',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador','profissional') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
   perfil:=contexto_gerenciado->>'perfil';
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 if autorizado then
  perform 1 from cadastro.acesso_paciente x where x.usuario_id=ator and x.paciente_id=paciente and x.revogada_em is null for share;
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if autorizado then
  perform 1 from cadastro.acesso_paciente x where x.usuario_id=ator and x.paciente_id=paciente and x.revogada_em is null for share;
$fragmento$)),'20261125010000_anamnese_vinculo_caso.sql');
-- api.plano_cuidado_operacao_privada: 20261124110000_plano_cuidado_familia_privada.sql
select pg_temp.substituir_autenticador('api.plano_cuidado_operacao_privada(jsonb)','775bedecb56f860de68d5820f4b1777a','2483159de882896f1c2acbe6d7f314f8',jsonb_build_array(jsonb_build_object('antes',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador','profissional') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
   perfil:=contexto_gerenciado->>'perfil';
   papel:='colaborador';
  end if;
 end;
 if not autorizado and (not identidade.cadastro_gerenciado_proprio(false) or (identidade.contexto_acesso_vigente(false)->>'perfil'='familia') is true) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ -- alcançar os outros dois ramos, então a validação de `gravar` não repete o gate de papel.
 if not autorizado and acao='api.ler_plano_cuidado'
  and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password') then
  perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil='familia' for share;
  if found then
   perform 1 from cadastro.acesso_paciente ap where ap.usuario_id=ator and ap.paciente_id=paciente and ap.revogada_em is null for share;
   if found then
    perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and s.metodo='familia'
      and s.concessao_id is null and s.concessao_versao_admissao is null
      and s.revogada_em is null and s.encerrada_em is null for share;
$fragmento$,'depois',$fragmento$ -- alcançar os outros dois ramos, então a validação de `gravar` não repete o gate de papel.
 if not autorizado and acao='api.ler_plano_cuidado'
  and (exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password') or identidade.contexto_acesso_vigente(false)->>'perfil'='familia') then
  perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil='familia' for share;
  if found then
   perform 1 from cadastro.acesso_paciente ap where ap.usuario_id=ator and ap.paciente_id=paciente and ap.revogada_em is null for share;
   if found then
    perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and ((s.metodo='familia' and not identidade.cadastro_gerenciado_proprio(false)) or (identidade.contexto_acesso_vigente(false)->>'perfil'='familia' and s.metodo=identidade.contexto_acesso_vigente(false)->>'metodo'))
      and s.concessao_id is null and s.concessao_versao_admissao is null
      and s.revogada_em is null and s.encerrada_em is null for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$)),'20261124110000_plano_cuidado_familia_privada.sql');
-- operacao.plano_composicao_privada: 20261107170000_plano_composicao_privada.sql
select pg_temp.substituir_autenticador('operacao.plano_composicao_privada(jsonb)','307e7b84a3a4a730d0201e5db06d42de','752824bc724e19faa9318aa02a9f52e1',jsonb_build_array(jsonb_build_object('antes',$fragmento$  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador','profissional') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$)),'20261107170000_plano_composicao_privada.sql',array['api.plano_composicao_privada(jsonb)']);
-- operacao.editar_paciente_privado: 20261113100000_acompanhamento_caso.sql
select pg_temp.substituir_autenticador('operacao.editar_paciente_privado(jsonb)','03b214558f903bb89489be19fee36a3d','060b5ed4a96e32d1d451bd8d625553c9',jsonb_build_array(jsonb_build_object('antes',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$)),'20261113100000_acompanhamento_caso.sql',array['api.editar_paciente_privado(jsonb)']);
-- operacao.edicao_paciente_composicao_privada: 20261112140000_auditoria_edicao_contato_auth_nao_admitido.sql
select pg_temp.substituir_autenticador('operacao.edicao_paciente_composicao_privada(jsonb)','3bccfb7b9d386fbbc8dd4d96023c4f22','cc56e8808dae6cedafb4ec6d82df57e9',jsonb_build_array(jsonb_build_object('antes',$fragmento$  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$)),'20261112140000_auditoria_edicao_contato_auth_nao_admitido.sql',array['api.edicao_paciente_composicao_privada(jsonb)']);
-- operacao.consultar_paciente_edicao_privado: 20261113100000_acompanhamento_caso.sql
select pg_temp.substituir_autenticador('operacao.consultar_paciente_edicao_privado(jsonb)','f309933682a8611f7b873ea5d3f05e2d','e2a0c81777ac72038b4937fff55b37d5',jsonb_build_array(jsonb_build_object('antes',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$)),'20261113100000_acompanhamento_caso.sql',array['api.consultar_paciente_edicao_privado(jsonb)']);
-- operacao.criar_contato_paciente_privado: 20261112140000_auditoria_edicao_contato_auth_nao_admitido.sql
select pg_temp.substituir_autenticador('operacao.criar_contato_paciente_privado(jsonb)','33271171fe2123a6100338db6cf9d909','925529052b593c2e273013a4e14af222',jsonb_build_array(jsonb_build_object('antes',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$)),'20261112140000_auditoria_edicao_contato_auth_nao_admitido.sql',array['api.criar_contato_paciente(jsonb)']);
-- api.tarefa_cuidado_operacao_privada: 20261125110000_tarefa_autorizacao_somente.sql
select pg_temp.substituir_autenticador('api.tarefa_cuidado_operacao_privada(jsonb)','b6e1d27b6b3eee0a83c53f89ef52e7c6','0ee51c8dd494b05dbea0de989a52d8b0',jsonb_build_array(jsonb_build_object('antes',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('profissional') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
   perfil:=contexto_gerenciado->>'perfil';
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$)),'20261125110000_tarefa_autorizacao_somente.sql');
-- operacao.contato_barreira_composicao_privada: 20261112140000_auditoria_edicao_contato_auth_nao_admitido.sql
select pg_temp.substituir_autenticador('operacao.contato_barreira_composicao_privada(jsonb)','13a53236cb57ad5449889afd6aa3b33f','dfb5e8a7c2cf24002e0692ed351ccdee',jsonb_build_array(jsonb_build_object('antes',$fragmento$  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$)),'20261112140000_auditoria_edicao_contato_auth_nao_admitido.sql',array['api.contato_barreira_composicao(jsonb)']);
-- operacao.conceder_acesso_paciente_privado: 20261112220000_auditoria_vinculos_auth_nao_admitido.sql
select pg_temp.substituir_autenticador('operacao.conceder_acesso_paciente_privado(jsonb)','2a6759ee0abf06037afc8a6c82018005','6cbb09b406a4586968885a132ffcea8b',jsonb_build_array(jsonb_build_object('antes',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$)),'20261112220000_auditoria_vinculos_auth_nao_admitido.sql',array['api.conceder_acesso_paciente_privado(jsonb)']);
-- operacao.revogar_acesso_paciente_privado: 20261112220000_auditoria_vinculos_auth_nao_admitido.sql
select pg_temp.substituir_autenticador('operacao.revogar_acesso_paciente_privado(jsonb)','7b87823e9871f2319a29cf00203a0f7a','defa29dc7186041cb931fb347c47f320',jsonb_build_array(jsonb_build_object('antes',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$)),'20261112220000_auditoria_vinculos_auth_nao_admitido.sql',array['api.revogar_acesso_paciente_privado(jsonb)']);
-- operacao.listar_concessoes_equipe_privado: 20261112230000_auditoria_equipe_auth_nao_admitido.sql
select pg_temp.substituir_autenticador('operacao.listar_concessoes_equipe_privado(jsonb)','60a4420f0cbaa2839895dbb57caf03c2','d486c69da229802a6f4c1fb8b9cc734f',jsonb_build_array(jsonb_build_object('antes',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 if autorizado and cursor_id is not null then
  select c.criada_em into cursor_criado from identidade.concessao_equipe c
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if autorizado and cursor_id is not null then
  select c.criada_em into cursor_criado from identidade.concessao_equipe c
$fragmento$)),'20261112230000_auditoria_equipe_auth_nao_admitido.sql',array['api.listar_concessoes_equipe_privado(jsonb)']);
-- operacao.acesso_barreira_composicao_privada: 20261112220000_auditoria_vinculos_auth_nao_admitido.sql
select pg_temp.substituir_autenticador('operacao.acesso_barreira_composicao_privada(jsonb)','99051dcae976fbc2cb8609b5d4cebb86','4cd9330e29dca9601de771d4833b9848',jsonb_build_array(jsonb_build_object('antes',$fragmento$  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$)),'20261112220000_auditoria_vinculos_auth_nao_admitido.sql',array['api.acesso_barreira_composicao(jsonb)']);
-- operacao.tarefa_barreira_composicao_privada: 20261112300000_barreira_tarefa_cuidado_privada.sql
select pg_temp.substituir_autenticador('operacao.tarefa_barreira_composicao_privada(jsonb)','31df47c382b6ec6b191f52ff8eece53d','d19d639b308af4fd3b9045de741ab760',jsonb_build_array(jsonb_build_object('antes',$fragmento$  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('profissional') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$)),'20261112300000_barreira_tarefa_cuidado_privada.sql',array['api.tarefa_barreira_composicao(jsonb)']);
-- operacao.criar_concessao_equipe_privado: 20261112350000_barreira_concessao_equipe_privada.sql
select pg_temp.substituir_autenticador('operacao.criar_concessao_equipe_privado(jsonb)','0a2a9bdcbfc3f31229df14ee64db3050','6814278d250302af29ae90cd992b0028',jsonb_build_array(jsonb_build_object('antes',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$)),'20261112350000_barreira_concessao_equipe_privada.sql',array['api.criar_concessao_equipe_privado(jsonb)']);
-- api.historico_anamnese_operacao_privada: 20261125010000_anamnese_vinculo_caso.sql
select pg_temp.substituir_autenticador('api.historico_anamnese_operacao_privada(jsonb)','05ad2dd20bdda6cf24731789b64dedf3','50b79aa31eaa057ca2c61e363e7f9937',jsonb_build_array(jsonb_build_object('antes',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador','profissional') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
   perfil:=contexto_gerenciado->>'perfil';
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 if autorizado then
  perform 1 from cadastro.acesso_paciente x where x.usuario_id=ator and x.paciente_id=paciente and x.revogada_em is null for share;
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if autorizado then
  perform 1 from cadastro.acesso_paciente x where x.usuario_id=ator and x.paciente_id=paciente and x.revogada_em is null for share;
$fragmento$)),'20261125010000_anamnese_vinculo_caso.sql');
-- operacao.equipe_barreira_composicao_privada: 20261112350000_barreira_concessao_equipe_privada.sql
select pg_temp.substituir_autenticador('operacao.equipe_barreira_composicao_privada(jsonb)','857215e69cc174eab1245f4371d28e32','af5b8f215016cc6d01ff963fde2ea781',jsonb_build_array(jsonb_build_object('antes',$fragmento$  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$)),'20261112350000_barreira_concessao_equipe_privada.sql',array['api.equipe_barreira_composicao(jsonb)']);
-- operacao.campo_extra_plano_operacao_privada: 20261116140000_campo_extra_plano_operacoes_privadas.sql
select pg_temp.substituir_autenticador('operacao.campo_extra_plano_operacao_privada(jsonb)','81470b9f33002a6a43b06cad91bc44f4','644ad1608a59a15237474473b322389c',jsonb_build_array(jsonb_build_object('antes',$fragmento$  -- Google Workspace vinculado como administrador, ou exceção técnica individual vinculada
  -- como administrador. Nenhuma alteração de lógica em relação ao original.
  if bloqueios_auth.travar(ator, sessao) is true then
    select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
    if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'oauth') then
$fragmento$,'depois',$fragmento$  -- Google Workspace vinculado como administrador, ou exceção técnica individual vinculada
  -- como administrador. Nenhuma alteração de lógica em relação ao original.
  -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator, sessao) is true then
    select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
    if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'oauth') then
$fragmento$),
jsonb_build_object('antes',$fragmento$    end if;
  end if;
  if not autorizado or fim <= clock_timestamp() then
    if exists(select 1 from public.usuario where id = ator) then
$fragmento$,'depois',$fragmento$    end if;
  end if;
 end if; -- autenticador legado só quando contexto não admitiu

  if not autorizado or fim <= clock_timestamp() then
    if exists(select 1 from public.usuario where id = ator) then
$fragmento$)),'20261116140000_campo_extra_plano_operacoes_privadas.sql',array['api.campo_extra_plano_privado(jsonb)']);
-- operacao.aprovador_plano_operacao_privada: 20261116160000_aprovador_plano_operacoes_privadas.sql
select pg_temp.substituir_autenticador('operacao.aprovador_plano_operacao_privada(jsonb)','b3f0a8c137565201de8557e4877d6a92','100efcaa25d5fbd23e0fe5f2d970b758',jsonb_build_array(jsonb_build_object('antes',$fragmento$  -- Google Workspace vinculado como administrador, ou exceção técnica individual vinculada
  -- como administrador. Nenhuma alteração de lógica em relação ao original.
  if bloqueios_auth.travar(ator, sessao) is true then
    select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
    if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'oauth') then
$fragmento$,'depois',$fragmento$  -- Google Workspace vinculado como administrador, ou exceção técnica individual vinculada
  -- como administrador. Nenhuma alteração de lógica em relação ao original.
  -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator, sessao) is true then
    select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
    if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'oauth') then
$fragmento$),
jsonb_build_object('antes',$fragmento$    end if;
  end if;
  if not autorizado or fim <= clock_timestamp() then
    if exists(select 1 from public.usuario where id = ator) then
$fragmento$,'depois',$fragmento$    end if;
  end if;
 end if; -- autenticador legado só quando contexto não admitiu

  if not autorizado or fim <= clock_timestamp() then
    if exists(select 1 from public.usuario where id = ator) then
$fragmento$)),'20261116160000_aprovador_plano_operacoes_privadas.sql',array['api.aprovador_plano_privado(jsonb)']);
-- operacao.aprovar_objetivo_plano_operacao_privada: 20261116170000_aprovar_objetivo_plano_privado.sql
select pg_temp.substituir_autenticador('operacao.aprovar_objetivo_plano_operacao_privada(jsonb)','af69cb5719ffda64435de39ca7a536f1','33ae0f694e802028c953ea09d45b6898',jsonb_build_array(jsonb_build_object('antes',$fragmento$  -- operacao.plano_cuidado_operacao_privada — seguido da exceção técnica, restrita a
  -- administrador, como em operacao.criar_concessao_equipe_privado.
  if bloqueios_auth.travar(ator, sessao) is true then
    select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
    if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'oauth') then
$fragmento$,'depois',$fragmento$  -- operacao.plano_cuidado_operacao_privada — seguido da exceção técnica, restrita a
  -- administrador, como em operacao.criar_concessao_equipe_privado.
  -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador','profissional') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
   perfil:=contexto_gerenciado->>'perfil';
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator, sessao) is true then
    select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
    if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'oauth') then
$fragmento$),
jsonb_build_object('antes',$fragmento$    end if;
  end if;
  -- Gate extra: colaborador autorizado só aprova se for administrador ou estiver ativo na
  -- lista de aprovadores indicados.
$fragmento$,'depois',$fragmento$    end if;
  end if;
 end if; -- autenticador legado só quando contexto não admitiu

  -- Gate extra: colaborador autorizado só aprova se for administrador ou estiver ativo na
  -- lista de aprovadores indicados.
$fragmento$)),'20261116170000_aprovar_objetivo_plano_privado.sql',array['api.aprovar_objetivo_plano_privado(jsonb)']);
-- api.encaminhamento_operacao_privada: 20261117110000_encaminhamento_operacoes_privadas.sql
select pg_temp.substituir_autenticador('api.encaminhamento_operacao_privada(jsonb)','b2d37b503bf1d0600fb492ec4c56c595','71e04a086928df0bcda9318a5005889a',jsonb_build_array(jsonb_build_object('antes',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador','profissional') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
   perfil:=contexto_gerenciado->>'perfil';
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 if not autorizado or fim<=clock_timestamp() then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if not autorizado or fim<=clock_timestamp() then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
$fragmento$)),'20261117110000_encaminhamento_operacoes_privadas.sql');
-- api.orientacao_operacao_privada: 20261124140000_orientacao_familia_privada.sql
select pg_temp.substituir_autenticador('api.orientacao_operacao_privada(jsonb)','ffcad53bdca1ded4158d3cdceb802597','f685b39324cfab24dd3edee89c5d523a',jsonb_build_array(jsonb_build_object('antes',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador','profissional') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
   perfil:=contexto_gerenciado->>'perfil';
   papel:='colaborador';
  end if;
 end;
 if not autorizado and (not identidade.cadastro_gerenciado_proprio(false) or (identidade.contexto_acesso_vigente(false)->>'perfil'='familia') is true) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ -- outro ramo, então a validação de `gravar` não repete o gate de papel.
 if not autorizado and acao='api.ler_orientacoes'
  and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password') then
  perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil='familia' for share;
  if found then
   perform 1 from cadastro.acesso_paciente ap where ap.usuario_id=ator and ap.paciente_id=paciente and ap.revogada_em is null for share;
   if found then
    perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and s.metodo='familia'
      and s.concessao_id is null and s.concessao_versao_admissao is null
      and s.revogada_em is null and s.encerrada_em is null for share;
$fragmento$,'depois',$fragmento$ -- outro ramo, então a validação de `gravar` não repete o gate de papel.
 if not autorizado and acao='api.ler_orientacoes'
  and (exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password') or identidade.contexto_acesso_vigente(false)->>'perfil'='familia') then
  perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil='familia' for share;
  if found then
   perform 1 from cadastro.acesso_paciente ap where ap.usuario_id=ator and ap.paciente_id=paciente and ap.revogada_em is null for share;
   if found then
    perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and ((s.metodo='familia' and not identidade.cadastro_gerenciado_proprio(false)) or (identidade.contexto_acesso_vigente(false)->>'perfil'='familia' and s.metodo=identidade.contexto_acesso_vigente(false)->>'metodo'))
      and s.concessao_id is null and s.concessao_versao_admissao is null
      and s.revogada_em is null and s.encerrada_em is null for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 if not autorizado or fim<=clock_timestamp() then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if not autorizado or fim<=clock_timestamp() then
  insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
$fragmento$)),'20261124140000_orientacao_familia_privada.sql');
-- api.saude_operacao_privada: 20261117210000_saude_operacoes_privadas.sql
select pg_temp.substituir_autenticador('api.saude_operacao_privada(jsonb)','3c63f3c081d76e512fda986460652cbe','e98a2a68aaddf4d5e6492d9cff61509b',jsonb_build_array(jsonb_build_object('antes',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador','profissional') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
   perfil:=contexto_gerenciado->>'perfil';
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$)),'20261117210000_saude_operacoes_privadas.sql');
-- api.contexto_cuidado_operacao_privada: 20261117310000_contexto_cuidado_operacoes_privadas.sql
select pg_temp.substituir_autenticador('api.contexto_cuidado_operacao_privada(jsonb)','3bd89d8459790ea35b8649948bb65b51','c8cf2a46a885c52da346b756088bcdb8',jsonb_build_array(jsonb_build_object('antes',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador','profissional') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
   perfil:=contexto_gerenciado->>'perfil';
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$)),'20261117310000_contexto_cuidado_operacoes_privadas.sql');
-- api.rede_cuidado_operacao_privada: 20261117340000_rede_cuidado_operacoes_privadas.sql
select pg_temp.substituir_autenticador('api.rede_cuidado_operacao_privada(jsonb)','0140c8835994dfa479cda1bfa8dc33df','f3a252e0c5e9297d0b1432b750f7dcaf',jsonb_build_array(jsonb_build_object('antes',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador','profissional') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
   perfil:=contexto_gerenciado->>'perfil';
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$)),'20261117340000_rede_cuidado_operacoes_privadas.sql');
-- operacao.configuracao_sistema_operacao_privada: 20261119110000_configuracao_sistema_opcoes.sql
select pg_temp.substituir_autenticador('operacao.configuracao_sistema_operacao_privada(jsonb)','6e8909c1ee69ab927d709f2e441f3935','fa9ccda93e5d6a6b2c9f24d7e9385b3d',jsonb_build_array(jsonb_build_object('antes',$fragmento$    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  if bloqueios_auth.travar(ator, sessao) is true then
    select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
    if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'oauth') then
$fragmento$,'depois',$fragmento$    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator, sessao) is true then
    select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
    if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'oauth') then
$fragmento$),
jsonb_build_object('antes',$fragmento$    end if;
  end if;
  if not autorizado or fim <= clock_timestamp() then
    if exists(select 1 from public.usuario where id = ator) then
$fragmento$,'depois',$fragmento$    end if;
  end if;
 end if; -- autenticador legado só quando contexto não admitiu

  if not autorizado or fim <= clock_timestamp() then
    if exists(select 1 from public.usuario where id = ator) then
$fragmento$)),'20261119110000_configuracao_sistema_opcoes.sql',array['api.configuracao_sistema_privado(jsonb)']);
-- operacao.habilitacao_plano_crise_privada: 20261125040000_plano_crise_case_manager_atual.sql
select pg_temp.substituir_autenticador('operacao.habilitacao_plano_crise_privada(jsonb)','9f0e89e276f17e4447699e7bc810ae88','b82c497dcd1b0108067f82be94f3228e',jsonb_build_array(jsonb_build_object('antes',$fragmento$    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  if bloqueios_auth.travar(ator, sessao) is true then
    select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
    if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'oauth') then
$fragmento$,'depois',$fragmento$    raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
  end if;
  -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator, sessao) is true then
    select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
    if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'oauth') then
$fragmento$),
jsonb_build_object('antes',$fragmento$    end if;
  end if;
  if not autorizado or fim <= clock_timestamp() then
    if exists(select 1 from public.usuario where id = ator) then
$fragmento$,'depois',$fragmento$    end if;
  end if;
 end if; -- autenticador legado só quando contexto não admitiu

  if not autorizado or fim <= clock_timestamp() then
    if exists(select 1 from public.usuario where id = ator) then
$fragmento$)),'20261125040000_plano_crise_case_manager_atual.sql',array['api.habilitacao_plano_crise_privado(jsonb)']);
-- api.plano_crise_operacao_privada: 20261125040000_plano_crise_case_manager_atual.sql
select pg_temp.substituir_autenticador('api.plano_crise_operacao_privada(jsonb)','f3673b99e126a9846933967bc6c4afc0','f81a89b4f82898ca4137448bf4f8ec6e',jsonb_build_array(jsonb_build_object('antes',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador','profissional') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
   perfil:=contexto_gerenciado->>'perfil';
   habilitado:=(contexto_gerenciado->>'habilitado_plano_crise')::boolean;
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 -- DF-021: habilitação explícita e liderança atual do caso; perfil sozinho não autoriza.
 if acao='api.aprovar_plano_crise' and not (perfil in ('administrador','profissional') and habilitado is true) then
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 -- DF-021: habilitação explícita e liderança atual do caso; perfil sozinho não autoriza.
 if acao='api.aprovar_plano_crise' and not (perfil in ('administrador','profissional') and habilitado is true) then
$fragmento$)),'20261125040000_plano_crise_case_manager_atual.sql');
-- api.diario_operacao_privada: 20261120360000_diario_acontecimento_area_em_claro.sql
select pg_temp.substituir_autenticador('api.diario_operacao_privada(jsonb)','6a3ccd2804204c5be5f974ff5e35f927','cf2b4a45adfb6f9aca32adae392e2c6b',jsonb_build_array(jsonb_build_object('antes',$fragmento$ end if;
 -- Trilha colaborador: Google Workspace, como em anamnese, saúde e encaminhamento.
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$ end if;
 -- Trilha colaborador: Google Workspace, como em anamnese, saúde e encaminhamento.
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador','profissional') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
   perfil:=contexto_gerenciado->>'perfil';
   papel:='colaborador';
  end if;
 end;
 if not autorizado and (not identidade.cadastro_gerenciado_proprio(false) or (identidade.contexto_acesso_vigente(false)->>'perfil'='familia') is true) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ -- vigente ao paciente deste pedido — vínculo com outro paciente não serve.
 if not autorizado
  and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password') then
  perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil='familia' for share;
  if found then
   perform 1 from cadastro.acesso_paciente ap where ap.usuario_id=ator and ap.paciente_id=paciente and ap.revogada_em is null for share;
   if found then
    perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and s.metodo='familia'
      and s.concessao_id is null and s.concessao_versao_admissao is null
      and s.revogada_em is null and s.encerrada_em is null for share;
$fragmento$,'depois',$fragmento$ -- vigente ao paciente deste pedido — vínculo com outro paciente não serve.
 if not autorizado
  and (exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password') or identidade.contexto_acesso_vigente(false)->>'perfil'='familia') then
  perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil='familia' for share;
  if found then
   perform 1 from cadastro.acesso_paciente ap where ap.usuario_id=ator and ap.paciente_id=paciente and ap.revogada_em is null for share;
   if found then
    perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and ((s.metodo='familia' and not identidade.cadastro_gerenciado_proprio(false)) or (identidade.contexto_acesso_vigente(false)->>'perfil'='familia' and s.metodo=identidade.contexto_acesso_vigente(false)->>'metodo'))
      and s.concessao_id is null and s.concessao_versao_admissao is null
      and s.revogada_em is null and s.encerrada_em is null for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$)),'20261120360000_diario_acontecimento_area_em_claro.sql');
-- api.pendencia_operacao_privada: 20261118310000_pendencia_caso_operacoes_privadas.sql
select pg_temp.substituir_autenticador('api.pendencia_operacao_privada(jsonb)','289910e41a8d942bd283100ede281ed1','62d760200c34108e93ea91606b863df4',jsonb_build_array(jsonb_build_object('antes',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador','profissional') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
   perfil:=contexto_gerenciado->>'perfil';
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 -- Recorte por caso: o Profissional precisa de acesso vigente ao paciente, travado na
 -- mesma transação. O acordo do caso é decisão de gestão e fica só com o Administrador.
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 -- Recorte por caso: o Profissional precisa de acesso vigente ao paciente, travado na
 -- mesma transação. O acordo do caso é decisão de gestão e fica só com o Administrador.
$fragmento$)),'20261118310000_pendencia_caso_operacoes_privadas.sql');
-- api.transcricao_operacao_privada: 20261119130000_audio_transcricao_operacoes_privadas.sql
select pg_temp.substituir_autenticador('api.transcricao_operacao_privada(jsonb)','8c85923fda2437f29f1a164aaf5bbe91','5a715a1b7dfd9bbabfefeb10f2c8c431',jsonb_build_array(jsonb_build_object('antes',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador','profissional') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
   perfil:=contexto_gerenciado->>'perfil';
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$)),'20261119130000_audio_transcricao_operacoes_privadas.sql');
-- operacao.consultar_auditoria_privado: 20261120210000_consulta_auditoria_por_caso.sql
select pg_temp.substituir_autenticador('operacao.consultar_auditoria_privado(jsonb)','fc594d7eb3fa532891cceded1858cee8','a525534bf7e307cabd245de1c0346678',jsonb_build_array(jsonb_build_object('antes',$fragmento$  -- Bloco de autorização admin-only idêntico ao de operacao.listar_concessoes_equipe_privado.
  -- Nenhuma alteração de lógica em relação ao original.
  if bloqueios_auth.travar(ator, sessao) is true then
    select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
    if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'oauth') then
$fragmento$,'depois',$fragmento$  -- Bloco de autorização admin-only idêntico ao de operacao.listar_concessoes_equipe_privado.
  -- Nenhuma alteração de lógica em relação ao original.
  -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator, sessao) is true then
    select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
    if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'oauth') then
$fragmento$),
jsonb_build_object('antes',$fragmento$    end if;
  end if;
  -- O cursor é um evento da própria trilha. Resolver o instante aqui (em vez de confiar num
  -- cursor opaco com data embutida) impede que a tela peça uma janela que o filtro não cobre.
$fragmento$,'depois',$fragmento$    end if;
  end if;
 end if; -- autenticador legado só quando contexto não admitiu

  -- O cursor é um evento da própria trilha. Resolver o instante aqui (em vez de confiar num
  -- cursor opaco com data embutida) impede que a tela peça uma janela que o filtro não cobre.
$fragmento$)),'20261120210000_consulta_auditoria_por_caso.sql',array['api.consultar_auditoria(jsonb)']);
-- operacao.solicitacao_titular_operacao_privada: 20261119350000_solicitacao_titular_operacoes_privadas.sql
select pg_temp.substituir_autenticador('operacao.solicitacao_titular_operacao_privada(jsonb)','54e9b968c169974055810d16f828a179','95031cdcad73e932de4658b51c6db029',jsonb_build_array(jsonb_build_object('antes',$fragmento$  end if;
  -- Bloco de autorização admin-only idêntico ao de operacao.configuracao_sistema_operacao_privada.
  if bloqueios_auth.travar(ator, sessao) is true then
    select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
    if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'oauth') then
$fragmento$,'depois',$fragmento$  end if;
  -- Bloco de autorização admin-only idêntico ao de operacao.configuracao_sistema_operacao_privada.
  -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator, sessao) is true then
    select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
    if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'oauth') then
$fragmento$),
jsonb_build_object('antes',$fragmento$    end if;
  end if;
  if not autorizado or fim <= clock_timestamp() then
    if exists(select 1 from public.usuario where id = ator) then
$fragmento$,'depois',$fragmento$    end if;
  end if;
 end if; -- autenticador legado só quando contexto não admitiu

  if not autorizado or fim <= clock_timestamp() then
    if exists(select 1 from public.usuario where id = ator) then
$fragmento$)),'20261119350000_solicitacao_titular_operacoes_privadas.sql',array['api.solicitacao_titular_privado(jsonb)']);
-- api.documento_operacao_privada: 20261125090000_documento_entrega_privada.sql
select pg_temp.substituir_autenticador('api.documento_operacao_privada(jsonb)','f166ecb0eb6ea03fa4dc4e40b98de691','5abf172784e472bd6ee449eeffe23942',jsonb_build_array(jsonb_build_object('antes',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador','profissional') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
   perfil:=contexto_gerenciado->>'perfil';
   papel:='colaborador';
  end if;
 end;
 if not autorizado and (not identidade.cadastro_gerenciado_proprio(false) or (identidade.contexto_acesso_vigente(false)->>'perfil'='familia') is true) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ -- outro ramo, então a validação de `gravar` não repete o gate de papel.
 if not autorizado and acao='api.ler_documentos'
  and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password') then
  perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil='familia' for share;
  if found then
   perform 1 from cadastro.acesso_paciente ap where ap.usuario_id=ator and ap.paciente_id=paciente and ap.revogada_em is null for share;
   if found then
    perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and s.metodo='familia'
      and s.concessao_id is null and s.concessao_versao_admissao is null
      and s.revogada_em is null and s.encerrada_em is null for share;
$fragmento$,'depois',$fragmento$ -- outro ramo, então a validação de `gravar` não repete o gate de papel.
 if not autorizado and acao='api.ler_documentos'
  and (exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password') or identidade.contexto_acesso_vigente(false)->>'perfil'='familia') then
  perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil='familia' for share;
  if found then
   perform 1 from cadastro.acesso_paciente ap where ap.usuario_id=ator and ap.paciente_id=paciente and ap.revogada_em is null for share;
   if found then
    perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and ((s.metodo='familia' and not identidade.cadastro_gerenciado_proprio(false)) or (identidade.contexto_acesso_vigente(false)->>'perfil'='familia' and s.metodo=identidade.contexto_acesso_vigente(false)->>'metodo'))
      and s.concessao_id is null and s.concessao_versao_admissao is null
      and s.revogada_em is null and s.encerrada_em is null for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if not autorizado or fim<=clock_timestamp() then
  if exists(select 1 from public.usuario where id=ator) then
$fragmento$)),'20261125090000_documento_entrega_privada.sql');
-- api.linha_tempo_operacao_privada: 20261120380000_linha_tempo_filtros_area_objetivo.sql
select pg_temp.substituir_autenticador('api.linha_tempo_operacao_privada(jsonb)','c6d12648cad18670ec6f80e5cf676a2a','feb2b3c2e5b22628d2015c3b8a19b053',jsonb_build_array(jsonb_build_object('antes',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador','profissional') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
   perfil:=contexto_gerenciado->>'perfil';
   papel:='colaborador';
  end if;
 end;
 if not autorizado and (not identidade.cadastro_gerenciado_proprio(false) or (identidade.contexto_acesso_vigente(false)->>'perfil'='familia') is true) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 if not autorizado
  and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password') then
  perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil='familia' for share;
  if found then
   perform 1 from cadastro.acesso_paciente ap where ap.usuario_id=ator and ap.paciente_id=paciente and ap.revogada_em is null for share;
   if found then
    perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and s.metodo='familia'
      and s.concessao_id is null and s.concessao_versao_admissao is null
      and s.revogada_em is null and s.encerrada_em is null for share;
$fragmento$,'depois',$fragmento$ end if;
 if not autorizado
  and (exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password') or identidade.contexto_acesso_vigente(false)->>'perfil'='familia') then
  perform 1 from public.usuario u where u.id=ator and u.ativo and u.perfil='familia' for share;
  if found then
   perform 1 from cadastro.acesso_paciente ap where ap.usuario_id=ator and ap.paciente_id=paciente and ap.revogada_em is null for share;
   if found then
    perform 1 from identidade.sessao s where s.session_id=sessao and s.usuario_id=ator and ((s.metodo='familia' and not identidade.cadastro_gerenciado_proprio(false)) or (identidade.contexto_acesso_vigente(false)->>'perfil'='familia' and s.metodo=identidade.contexto_acesso_vigente(false)->>'metodo'))
      and s.concessao_id is null and s.concessao_versao_admissao is null
      and s.revogada_em is null and s.encerrada_em is null for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 if autorizado and papel='colaborador' and perfil='profissional' then
  perform 1 from cadastro.acesso_paciente x where x.usuario_id=ator and x.paciente_id=paciente and x.revogada_em is null for share;
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 if autorizado and papel='colaborador' and perfil='profissional' then
  perform 1 from cadastro.acesso_paciente x where x.usuario_id=ator and x.paciente_id=paciente and x.revogada_em is null for share;
$fragmento$)),'20261120380000_linha_tempo_filtros_area_objetivo.sql');
-- api.exportacao_operacao_privada: 20261120390000_exportacao_escopo_e_terceiros.sql
select pg_temp.substituir_autenticador('api.exportacao_operacao_privada(jsonb)','f392cff6313a4827365c546528b230d0','1e680a2bf19a44f2134cd9a8ca69ca3c',jsonb_build_array(jsonb_build_object('antes',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador','profissional') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
   perfil:=contexto_gerenciado->>'perfil';
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 -- ESCOPO_PERFIL, decidido pelo solicitante em 12/11/2026: exportar é do Administrador e
 -- da profissional do caso. A profissional precisa de `acesso_paciente` vigente travado na
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 -- ESCOPO_PERFIL, decidido pelo solicitante em 12/11/2026: exportar é do Administrador e
 -- da profissional do caso. A profissional precisa de `acesso_paciente` vigente travado na
$fragmento$)),'20261120390000_exportacao_escopo_e_terceiros.sql');
-- operacao.segredos_integracoes_operacao_privada: 20261125020000_segredos_integracoes.sql
select pg_temp.substituir_autenticador('operacao.segredos_integracoes_operacao_privada(jsonb)','e25849cd27db18cb6e9dd055008a5758','f69b3789f0622da0b81a87f93f932a86',jsonb_build_array(jsonb_build_object('antes',$fragmento$  -- Google Workspace vinculado como administrador, ou exceção técnica individual vinculada
  -- como administrador. Nenhuma alteração de lógica em relação ao original.
  if bloqueios_auth.travar(ator, sessao) is true then
    select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
    if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'oauth') then
$fragmento$,'depois',$fragmento$  -- Google Workspace vinculado como administrador, ou exceção técnica individual vinculada
  -- como administrador. Nenhuma alteração de lógica em relação ao original.
  -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator, sessao) is true then
    select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
    if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'oauth') then
$fragmento$),
jsonb_build_object('antes',$fragmento$    end if;
  end if;
  if not autorizado or fim <= clock_timestamp() then
    if exists(select 1 from public.usuario where id = ator) then
$fragmento$,'depois',$fragmento$    end if;
  end if;
 end if; -- autenticador legado só quando contexto não admitiu

  if not autorizado or fim <= clock_timestamp() then
    if exists(select 1 from public.usuario where id = ator) then
$fragmento$)),'20261125020000_segredos_integracoes.sql',array['api.segredos_integracoes_privado(jsonb)']);
-- api.consultar_expurgo_audio: 20261125070000_audio_expurgo_aviso_admin.sql
select pg_temp.substituir_autenticador('api.consultar_expurgo_audio(jsonb)','538437f40a503a1cc5f7565cca3fd0ce','55c93a35a7f856eb04f8b1c5a5193ef5',jsonb_build_array(jsonb_build_object('antes',$fragmento$  -- Google Workspace vinculado como administrador, ou exceção técnica individual vinculada
  -- como administrador. Nenhuma alteração de lógica em relação ao original.
  if bloqueios_auth.travar(ator, sessao) is true then
    select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
    if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'oauth') then
$fragmento$,'depois',$fragmento$  -- Google Workspace vinculado como administrador, ou exceção técnica individual vinculada
  -- como administrador. Nenhuma alteração de lógica em relação ao original.
  -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator, sessao) is true then
    select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
    if found and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'oauth') then
$fragmento$),
jsonb_build_object('antes',$fragmento$    end if;
  end if;
  if not autorizado or fim <= clock_timestamp() then
    if exists(select 1 from public.usuario where id = ator) then
$fragmento$,'depois',$fragmento$    end if;
  end if;
 end if; -- autenticador legado só quando contexto não admitiu

  if not autorizado or fim <= clock_timestamp() then
    if exists(select 1 from public.usuario where id = ator) then
$fragmento$)),'20261125070000_audio_expurgo_aviso_admin.sql');
-- operacao.turno_operacao_privada: 20261125140000_turno_escala_passagem.sql
select pg_temp.substituir_autenticador('operacao.turno_operacao_privada(jsonb)','d864dc9408e3ed6f126663975fc4bd53','5fa68ef3768dc5884ea0395e33221598',jsonb_build_array(jsonb_build_object('antes',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$  raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('profissional') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
   perfil:=contexto_gerenciado->>'perfil';
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 perform 1 from identidade.configuracao_sistema where chave='ffcm.turno.ativo' and valor='true'::jsonb for share;
 autorizado:=autorizado and found;
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 perform 1 from identidade.configuracao_sistema where chave='ffcm.turno.ativo' and valor='true'::jsonb for share;
 autorizado:=autorizado and found;
$fragmento$)),'20261125140000_turno_escala_passagem.sql',array['api.turno_privado(jsonb)']);
-- operacao.turno_barreira_composicao_privada: 20261125080000_turno_execucao_privada.sql
select pg_temp.substituir_autenticador('operacao.turno_barreira_composicao_privada(jsonb)','16e40222325d6e7eabfcd5d7c6e3567c','1a7f127a2c96e405f6e67adbbff900da',jsonb_build_array(jsonb_build_object('antes',$fragmento$  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('profissional') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;
 perform 1 from identidade.configuracao_sistema where chave='ffcm.turno.ativo' and valor='true'::jsonb for share;
 autorizado:=autorizado and found;
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu

 perform 1 from identidade.configuracao_sistema where chave='ffcm.turno.ativo' and valor='true'::jsonb for share;
 autorizado:=autorizado and found;
$fragmento$)),'20261125080000_turno_execucao_privada.sql',array['api.turno_barreira_composicao(jsonb)']);
-- operacao.turno_grupo3_privada: 20261125140000_turno_escala_passagem.sql
select pg_temp.substituir_autenticador('operacao.turno_grupo3_privada(jsonb)','27e6d99f5bbd011f7b36d428cbe6d991','9ee83ac9799ab5942deff0c94a7ae017',jsonb_build_array(jsonb_build_object('antes',$fragmento$ or inicio>clock_timestamp() or fim<=clock_timestamp() or fim<=inicio or fim-inicio>interval '30 seconds'
 or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$,'depois',$fragmento$ or inicio>clock_timestamp() or fim<=clock_timestamp() or fim<=inicio or fim-inicio>interval '30 seconds'
 or identidade.verificar_assinatura_atestado(p_transporte->>'entrada_canonica',p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
 -- DF-023: autenticação real compartilhada; autorização abaixo preservada.
 declare contexto_gerenciado jsonb; begin
  contexto_gerenciado:=identidade.contexto_acesso_vigente(false);
  if contexto_gerenciado->>'perfil' in ('administrador','profissional') then
   autorizado:=true;
   concessao:=(contexto_gerenciado->>'concessao_id')::uuid;
   perfil:=contexto_gerenciado->>'perfil';
  end if;
 end;
 if not autorizado and not identidade.cadastro_gerenciado_proprio(false) then
 if bloqueios_auth.travar(ator,sessao) is true then
 select dominio_workspace into dominio from identidade.configuracao_auth_nativo where google_unico_oauth_confirmado for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$ end if;
 end if;

 perform 1 from identidade.configuracao_sistema where chave='ffcm.turno.ativo' and tipo='booleano' and valor='true'::jsonb for share;
$fragmento$,'depois',$fragmento$ end if;
 end if;
 end if; -- autenticador legado só quando contexto não admitiu


 perform 1 from identidade.configuracao_sistema where chave='ffcm.turno.ativo' and tipo='booleano' and valor='true'::jsonb for share;
$fragmento$),
jsonb_build_object('antes',$fragmento$    begin previsto:=(e->>'profissional_previsto_usuario_id')::uuid;janela_inicio:=(e->>'inicio_previsto')::timestamptz;janela_fim:=(e->>'fim_previsto')::timestamptz;exception when others then raise exception using errcode='22023',message='ENTRADA_INVALIDA';end;
    if previsto is null or janela_inicio is null or janela_fim is null or janela_fim<=janela_inicio then raise exception using errcode='22023',message='ENTRADA_INVALIDA';end if;
    perform 1 from cadastro.acesso_paciente ap join public.usuario u on u.id=ap.usuario_id join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil where ap.paciente_id=paciente and ap.usuario_id=previsto and ap.revogada_em is null and u.ativo and u.perfil='profissional' and c.estado='vinculada' and c.metodo='google_workspace' for share of ap,u,c;
    if not found then raise exception using errcode='PZ057',message='GRUPO3_RECUSADO',detail='sem_permissao';end if;
    insert into cadastro.turno_escala_versao(escala_id,paciente_id,versao,profissional_previsto_usuario_id,inicio_previsto,fim_previsto,tipo,autor_usuario_id) values(escala,paciente,1,previsto,janela_inicio,janela_fim,'previsto',ator) returning * into escala_atual;
$fragmento$,'depois',$fragmento$    begin previsto:=(e->>'profissional_previsto_usuario_id')::uuid;janela_inicio:=(e->>'inicio_previsto')::timestamptz;janela_fim:=(e->>'fim_previsto')::timestamptz;exception when others then raise exception using errcode='22023',message='ENTRADA_INVALIDA';end;
    if previsto is null or janela_inicio is null or janela_fim is null or janela_fim<=janela_inicio then raise exception using errcode='22023',message='ENTRADA_INVALIDA';end if;
    perform 1 from cadastro.acesso_paciente ap join public.usuario u on u.id=ap.usuario_id join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil where ap.paciente_id=paciente and ap.usuario_id=previsto and ap.revogada_em is null and u.ativo and u.perfil='profissional' and c.estado='vinculada' and (c.metodo='google_workspace' or (c.metodo='interno' and identidade.concessao_interna_ativa(c.id,c.usuario_id))) for share of ap,u,c;
    if not found then raise exception using errcode='PZ057',message='GRUPO3_RECUSADO',detail='sem_permissao';end if;
    insert into cadastro.turno_escala_versao(escala_id,paciente_id,versao,profissional_previsto_usuario_id,inicio_previsto,fim_previsto,tipo,autor_usuario_id) values(escala,paciente,1,previsto,janela_inicio,janela_fim,'previsto',ator) returning * into escala_atual;
$fragmento$),
jsonb_build_object('antes',$fragmento$     or e->'motivo'-array['formato','key_id','nonce','ciphertext','tag']<>'{}'::jsonb or e#>'{motivo,formato}' is distinct from '1'::jsonb or coalesce(e#>>'{motivo,ciphertext}','')=''
     or e->'aad_motivo' is distinct from jsonb_build_object('tabela','cadastro.turno_escala_versao','paciente_id',paciente,'escala_id',escala,'versao',esperada+1,'campo','motivo','formato',1) then raise exception using errcode='22023',message='ENTRADA_INVALIDA';end if;
    perform 1 from cadastro.acesso_paciente ap join public.usuario u on u.id=ap.usuario_id join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil where ap.paciente_id=paciente and ap.usuario_id=assumiu and ap.revogada_em is null and u.ativo and u.perfil='profissional' and c.estado='vinculada' and c.metodo='google_workspace' for share of ap,u,c;
    if not found then raise exception using errcode='PZ057',message='GRUPO3_RECUSADO',detail='sem_permissao';end if;
    insert into cadastro.turno_escala_versao(escala_id,paciente_id,versao,anterior,profissional_previsto_usuario_id,profissional_assumiu_usuario_id,inicio_previsto,fim_previsto,tipo,motivo_cifrado,autor_usuario_id) values(escala,paciente,escala_atual.versao+1,escala_atual.versao,escala_atual.profissional_previsto_usuario_id,assumiu,escala_atual.inicio_previsto,escala_atual.fim_previsto,e->>'tipo',e->'motivo',ator) returning * into escala_atual;
$fragmento$,'depois',$fragmento$     or e->'motivo'-array['formato','key_id','nonce','ciphertext','tag']<>'{}'::jsonb or e#>'{motivo,formato}' is distinct from '1'::jsonb or coalesce(e#>>'{motivo,ciphertext}','')=''
     or e->'aad_motivo' is distinct from jsonb_build_object('tabela','cadastro.turno_escala_versao','paciente_id',paciente,'escala_id',escala,'versao',esperada+1,'campo','motivo','formato',1) then raise exception using errcode='22023',message='ENTRADA_INVALIDA';end if;
    perform 1 from cadastro.acesso_paciente ap join public.usuario u on u.id=ap.usuario_id join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil where ap.paciente_id=paciente and ap.usuario_id=assumiu and ap.revogada_em is null and u.ativo and u.perfil='profissional' and c.estado='vinculada' and (c.metodo='google_workspace' or (c.metodo='interno' and identidade.concessao_interna_ativa(c.id,c.usuario_id))) for share of ap,u,c;
    if not found then raise exception using errcode='PZ057',message='GRUPO3_RECUSADO',detail='sem_permissao';end if;
    insert into cadastro.turno_escala_versao(escala_id,paciente_id,versao,anterior,profissional_previsto_usuario_id,profissional_assumiu_usuario_id,inicio_previsto,fim_previsto,tipo,motivo_cifrado,autor_usuario_id) values(escala,paciente,escala_atual.versao+1,escala_atual.versao,escala_atual.profissional_previsto_usuario_id,assumiu,escala_atual.inicio_previsto,escala_atual.fim_previsto,e->>'tipo',e->'motivo',ator) returning * into escala_atual;
$fragmento$),
jsonb_build_object('antes',$fragmento$  select coalesce(jsonb_agg(to_jsonb(q)-'anterior'-'motivo_cifrado'||jsonb_build_object('motivo',q.motivo_cifrado) order by q.escala_id,q.versao),'[]'::jsonb) into pagina from (select * from cadastro.turno_escala_versao where paciente_id=paciente and (cursor_escala is null or (escala_id,versao)>(cursor_escala,cursor_versao)) order by escala_id,versao limit 50) q;
  if jsonb_array_length(pagina)=50 and exists(select 1 from cadastro.turno_escala_versao where paciente_id=paciente and (escala_id,versao)>((pagina->49->>'escala_id')::uuid,(pagina->49->>'versao')::integer)) then proximo:=jsonb_build_object('escala_id',pagina->49->>'escala_id','versao',pagina->49->'versao');end if;
  select jsonb_build_object('pode_gerir',gestor,'itens',pagina,'proximo_cursor',proximo,'profissionais',case when gestor then coalesce((select jsonb_agg(jsonb_build_object('usuario_id',u.id,'concessao_id',c.id,'email',c.email_cifrado) order by u.id) from public.usuario u join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil where u.ativo and u.perfil='profissional' and c.estado='vinculada' and c.metodo='google_workspace' and exists(select 1 from cadastro.acesso_paciente ap where ap.paciente_id=paciente and ap.usuario_id=u.id and ap.revogada_em is null)),'[]'::jsonb) else '[]'::jsonb end) into resultado;
 else
  if e ?| array['cursor_escala_id','cursor_versao'] then raise exception using errcode='22023',message='ENTRADA_INVALIDA';end if;
$fragmento$,'depois',$fragmento$  select coalesce(jsonb_agg(to_jsonb(q)-'anterior'-'motivo_cifrado'||jsonb_build_object('motivo',q.motivo_cifrado) order by q.escala_id,q.versao),'[]'::jsonb) into pagina from (select * from cadastro.turno_escala_versao where paciente_id=paciente and (cursor_escala is null or (escala_id,versao)>(cursor_escala,cursor_versao)) order by escala_id,versao limit 50) q;
  if jsonb_array_length(pagina)=50 and exists(select 1 from cadastro.turno_escala_versao where paciente_id=paciente and (escala_id,versao)>((pagina->49->>'escala_id')::uuid,(pagina->49->>'versao')::integer)) then proximo:=jsonb_build_object('escala_id',pagina->49->>'escala_id','versao',pagina->49->'versao');end if;
  select jsonb_build_object('pode_gerir',gestor,'itens',pagina,'proximo_cursor',proximo,'profissionais',case when gestor then coalesce((select jsonb_agg(jsonb_build_object('usuario_id',u.id,'concessao_id',c.id,'email',c.email_cifrado) order by u.id) from public.usuario u join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil where u.ativo and u.perfil='profissional' and c.estado='vinculada' and (c.metodo='google_workspace' or (c.metodo='interno' and identidade.concessao_interna_ativa(c.id,c.usuario_id))) and exists(select 1 from cadastro.acesso_paciente ap where ap.paciente_id=paciente and ap.usuario_id=u.id and ap.revogada_em is null)),'[]'::jsonb) else '[]'::jsonb end) into resultado;
 else
  if e ?| array['cursor_escala_id','cursor_versao'] then raise exception using errcode='22023',message='ENTRADA_INVALIDA';end if;
$fragmento$)),'20261125140000_turno_escala_passagem.sql',array['api.turno_grupo3_privado(jsonb)']);
-- api.listar_pacientes_familiar_privado: 20261119200000_auditoria_obrigatoria_carteira_familiar.sql
select pg_temp.substituir_autenticador('api.listar_pacientes_familiar_privado(uuid,integer,uuid)','659dea259f3d50bde0c207052cb904d1','621544076b0ef23248b50a6fbf49db9e',jsonb_build_array(jsonb_build_object('antes',$fragmento$  if v_ator is not null and v_sessao is not null and bloqueios_auth.travar(v_ator, v_sessao) is true
    and exists (select 1 from auth_privado.sessoes() s where s.id = v_sessao and s.user_id = v_ator and (s.not_after is null or s.not_after > clock_timestamp()))
    and exists (select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'password') then
    perform 1 from public.usuario u where u.id = v_ator and u.ativo and u.perfil = 'familia' for share;
    if found then
      perform 1 from cadastro.acesso_paciente a where a.usuario_id = v_ator and a.revogada_em is null order by a.id limit 1 for share;
      if found then
        perform 1 from identidade.sessao s where s.session_id = v_sessao and s.usuario_id = v_ator and s.metodo = 'familia' and s.concessao_id is null and s.concessao_versao_admissao is null and s.revogada_em is null and s.encerrada_em is null for share;
        v_autorizado := found;
      end if;
    end if;
  end if;
  if v_autorizado and p_cursor is not null then
    perform 1 from cadastro.acesso_paciente a where a.usuario_id = v_ator and a.paciente_id = p_cursor and a.revogada_em is null for share;
$fragmento$,'depois',$fragmento$  if v_ator is not null and v_sessao is not null and bloqueios_auth.travar(v_ator, v_sessao) is true
    and exists (select 1 from auth_privado.sessoes() s where s.id = v_sessao and s.user_id = v_ator and (s.not_after is null or s.not_after > clock_timestamp()))
    and (exists (select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'password') or identidade.contexto_acesso_vigente(false)->>'perfil'='familia') then
    perform 1 from public.usuario u where u.id = v_ator and u.ativo and u.perfil = 'familia' for share;
    if found then
      perform 1 from cadastro.acesso_paciente a where a.usuario_id = v_ator and a.revogada_em is null order by a.id limit 1 for share;
      if found then
        perform 1 from identidade.sessao s where s.session_id = v_sessao and s.usuario_id = v_ator and ((s.metodo = 'familia' and not identidade.cadastro_gerenciado_proprio(false)) or (identidade.contexto_acesso_vigente(false)->>'perfil'='familia' and s.metodo=identidade.contexto_acesso_vigente(false)->>'metodo')) and s.concessao_id is null and s.concessao_versao_admissao is null and s.revogada_em is null and s.encerrada_em is null for share;
        v_autorizado := found;
      end if;
    end if;
  end if;
  -- Conta familiar gerenciada autentica sem caso; SELECT abaixo ainda filtra vínculos.
  v_autorizado:=v_autorizado or (identidade.contexto_acesso_vigente(false)->>'perfil'='familia') is true;
  if v_autorizado and p_cursor is not null then
    perform 1 from cadastro.acesso_paciente a where a.usuario_id = v_ator and a.paciente_id = p_cursor and a.revogada_em is null for share;
$fragmento$)),'20261119200000_auditoria_obrigatoria_carteira_familiar.sql');
-- api.consultar_paciente_familiar_privado: 20261119210000_auditoria_obrigatoria_consulta_paciente_familiar.sql
select pg_temp.substituir_autenticador('api.consultar_paciente_familiar_privado(uuid,uuid)','72993e21c42222a6c96ce9d1d12a7a28','c9194049221a92f4215ac4cc75f7ca3b',jsonb_build_array(jsonb_build_object('antes',$fragmento$  if v_ator is not null and v_sessao is not null and bloqueios_auth.travar(v_ator, v_sessao) is true
    and exists (select 1 from auth_privado.sessoes() s where s.id = v_sessao and s.user_id = v_ator and (s.not_after is null or s.not_after > clock_timestamp()))
    and exists (select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'password') then
    perform 1 from public.usuario u where u.id = v_ator and u.ativo and u.perfil = 'familia' for share;
    if found then
      perform 1 from cadastro.acesso_paciente a where a.usuario_id = v_ator and a.paciente_id = p_paciente_id and a.revogada_em is null for share;
      if found then
        perform 1 from identidade.sessao s where s.session_id = v_sessao and s.usuario_id = v_ator and s.metodo = 'familia' and s.concessao_id is null and s.concessao_versao_admissao is null and s.revogada_em is null and s.encerrada_em is null for share;
        v_autorizado := found;
      end if;
$fragmento$,'depois',$fragmento$  if v_ator is not null and v_sessao is not null and bloqueios_auth.travar(v_ator, v_sessao) is true
    and exists (select 1 from auth_privado.sessoes() s where s.id = v_sessao and s.user_id = v_ator and (s.not_after is null or s.not_after > clock_timestamp()))
    and (exists (select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr') = 'array' then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method' = 'password') or identidade.contexto_acesso_vigente(false)->>'perfil'='familia') then
    perform 1 from public.usuario u where u.id = v_ator and u.ativo and u.perfil = 'familia' for share;
    if found then
      perform 1 from cadastro.acesso_paciente a where a.usuario_id = v_ator and a.paciente_id = p_paciente_id and a.revogada_em is null for share;
      if found then
        perform 1 from identidade.sessao s where s.session_id = v_sessao and s.usuario_id = v_ator and ((s.metodo = 'familia' and not identidade.cadastro_gerenciado_proprio(false)) or (identidade.contexto_acesso_vigente(false)->>'perfil'='familia' and s.metodo=identidade.contexto_acesso_vigente(false)->>'metodo')) and s.concessao_id is null and s.concessao_versao_admissao is null and s.revogada_em is null and s.encerrada_em is null for share;
        v_autorizado := found;
      end if;
$fragmento$)),'20261119210000_auditoria_obrigatoria_consulta_paciente_familiar.sql');
-- api.admitir_sessao_nativa: 20261110120000_admissao_tecnica_nativa.sql
select pg_temp.substituir_autenticador('api.admitir_sessao_nativa(uuid)','800fc4e5fe5a85f44bd0e9f65fee0880','144e184e2c386b1122dcc2f10f21f29b',jsonb_build_array(jsonb_build_object('antes',$fragmento$  select case when exists (select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array'
    then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password')
    then identidade.sessao_tecnica_nativa(p_request_id,true) else identidade.sessao_nativa(p_request_id,true) end;
$fragmento$,'depois',$fragmento$  select case when exists (select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array'
    then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password')
    then identidade.sessao_tecnica_nativa(p_request_id,true) else case when identidade.cadastro_gerenciado_proprio(true) then identidade.sessao_gerenciada_nativa(p_request_id,true) else identidade.sessao_nativa(p_request_id,true) end end;
$fragmento$)),'20261110120000_admissao_tecnica_nativa.sql');
-- api.consultar_sessao_nativa: 20261110120000_admissao_tecnica_nativa.sql
select pg_temp.substituir_autenticador('api.consultar_sessao_nativa(uuid)','958b7cdba71140c75834da2e4fa30735','a0e6e8bd72e86909cfad8933c13edb71',jsonb_build_array(jsonb_build_object('antes',$fragmento$
  select case when exists (select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array'
    then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password')
    then identidade.sessao_tecnica_nativa(p_request_id,false) else identidade.sessao_nativa(p_request_id,false) end;
$fragmento$,'depois',$fragmento$
  select case when identidade.cadastro_gerenciado_proprio(false) then identidade.sessao_gerenciada_nativa(p_request_id,false) else case when exists (select 1 from jsonb_array_elements(case when jsonb_typeof(auth_privado.jwt()->'amr')='array'
    then auth_privado.jwt()->'amr' else '[]'::jsonb end) m where m->>'method'='password')
    then identidade.sessao_tecnica_nativa(p_request_id,false) else identidade.sessao_nativa(p_request_id,false) end end;
$fragmento$)),'20261110120000_admissao_tecnica_nativa.sql');
-- api.admitir_sessao_familiar_nativa: 20261119230000_owner_sessao_familiar.sql
select pg_temp.substituir_autenticador('api.admitir_sessao_familiar_nativa(uuid)','2e7c0958d0d9fdb5496bf1892dac8421','efcbe192d31a76e9d0831168df276ee6',jsonb_build_array(jsonb_build_object('antes',$fragmento$
  select identidade.sessao_familiar_privada(p_request_id, true);
$fragmento$,'depois',$fragmento$
  select case when identidade.cadastro_gerenciado_proprio(false) then identidade.recusar_admissao_familiar_gerenciada(p_request_id) else identidade.sessao_familiar_privada(p_request_id, true) end;
$fragmento$)),'20261119230000_owner_sessao_familiar.sql');
-- Comparação do AST canônico; policy esperada transitória no mesmo papel.
create function pg_temp.substituir_policy_autenticacao(p_tabela text,p_nome text,p_role text,p_antes text,p_depois text) returns void language plpgsql as $guard$
declare antes record; esperado text; migrador text:=current_user;
begin
 select pg_get_expr(p.polqual,p.polrelid) as polqual,p.polroles,p.polcmd,p.polpermissive into antes from pg_policy p where p.polrelid=to_regclass(p_tabela) and p.polname=p_nome;
 if not found or antes.polcmd<>'r' or not antes.polpermissive or antes.polroles<>array[p_role::regrole::oid] then raise exception 'POLICY_INESPERADA: %',p_nome;end if;
 execute format('create policy acessos_predicado_esperado on %s for select to %I using (%s)',p_tabela,p_role,p_antes);
 select pg_get_expr(p.polqual,p.polrelid) into esperado from pg_policy p where p.polrelid=to_regclass(p_tabela) and p.polname='acessos_predicado_esperado';
 if antes.polqual<>esperado then raise exception 'PREDICADO_POLICY_DIVERGENTE: %',p_nome;end if;
 execute format('drop policy acessos_predicado_esperado on %s',p_tabela);
 perform set_config('role','ffcmapp_acessos_owner',true);
 execute format('grant execute on function identidade.contexto_acesso_vigente(boolean),identidade.cadastro_gerenciado_proprio(boolean) to %I',p_role);
 perform set_config('role',migrador,true);
 execute format('alter policy %I on %s using (%s)',p_nome,p_tabela,p_depois);
 if not exists(select 1 from pg_policy p where p.polrelid=to_regclass(p_tabela) and p.polname=p_nome and p.polroles=antes.polroles and p.polcmd=antes.polcmd and p.polpermissive=antes.polpermissive) then raise exception 'METADADOS_POLICY_ALTERADOS';end if;
end $guard$;
-- anamnese_owner_paciente: 20261107110000_isolar_owner_anamnese.sql; caso/audiência/perfil mantidos.
select pg_temp.substituir_policy_autenticacao('cadastro.paciente','anamnese_owner_paciente','ffcmapp_anamnese_owner',$antes$(
 exists (
  select 1 from public.usuario u
  join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil
  join identidade.sessao s on s.usuario_id=u.id and s.concessao_id=c.id
  join identidade.configuracao_auth_nativo cfg on cfg.google_unico_oauth_confirmado
  join auth_privado.identidades() i on i.user_id=u.id and i.provider='google'
  where u.id=(select auth_privado.uid()) and u.ativo and u.perfil in ('administrador','profissional')
   and c.estado='vinculada' and c.metodo='google_workspace' and c.subject_google=i.provider_id
   and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo='google_workspace'
   and s.revogada_em is null and s.encerrada_em is null
   and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after>clock_timestamp()))
   and (select count(*) from auth_privado.identidades() j where j.user_id=u.id and j.provider='google')=1
   and i.identity_data->>'sub'=i.provider_id and i.identity_data->>'email_verified'='true'
   and i.identity_data#>>'{custom_claims,hd}'=cfg.dominio_workspace
   and exists(select 1 from jsonb_array_elements(case when jsonb_typeof((select auth_privado.jwt())->'amr')='array' then (select auth_privado.jwt())->'amr' else '[]'::jsonb end) m where m->>'method'='oauth')
 )
)$antes$,$depois$(exists(select 1 from public.usuario u join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil join identidade.sessao s on s.usuario_id=u.id and s.concessao_id=c.id where u.id=(select auth_privado.uid()) and u.ativo and u.perfil in ('administrador','profissional') and c.estado='vinculada' and c.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.revogada_em is null and s.encerrada_em is null and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after>clock_timestamp())) and identidade.contexto_acesso_vigente(false)->>'perfil'=u.perfil))$depois$);
-- audio_transcricao_paciente: 20261119130000_audio_transcricao_operacoes_privadas.sql; caso/audiência/perfil mantidos.
select pg_temp.substituir_policy_autenticacao('cadastro.paciente','audio_transcricao_paciente','ffcmapp_audio_transcricao_owner',$antes$(
  exists (
    select 1
    from public.usuario u
    join identidade.concessao_equipe c on c.usuario_id = u.id and c.perfil = u.perfil
    join identidade.sessao s on s.usuario_id = u.id and s.concessao_id = c.id
    join identidade.configuracao_auth_nativo cfg on cfg.google_unico_oauth_confirmado
    join auth_privado.identidades() i on i.user_id = u.id and i.provider = 'google'
    where u.id = (select auth_privado.uid())
      and u.ativo
      and u.perfil in ('administrador', 'profissional')
      and c.estado = 'vinculada'
      and c.metodo = 'google_workspace'
      and c.subject_google = i.provider_id
      and s.session_id::text = (select auth_privado.jwt() ->> 'session_id')
      and s.metodo = 'google_workspace'
      and s.revogada_em is null
      and s.encerrada_em is null
      and exists (
        select 1 from auth_privado.sessoes() a
        where a.id = s.session_id and a.user_id = u.id
          and (a.not_after is null or a.not_after > clock_timestamp())
      )
      and (select count(*) from auth_privado.identidades() j where j.user_id = u.id and j.provider = 'google') = 1
      and i.identity_data ->> 'sub' = i.provider_id
      and i.identity_data ->> 'email_verified' = 'true'
      and i.identity_data #>> '{custom_claims,hd}' = cfg.dominio_workspace
      and exists (
        select 1 from jsonb_array_elements(
          case when jsonb_typeof((select auth_privado.jwt()) -> 'amr') = 'array'
            then (select auth_privado.jwt()) -> 'amr' else '[]'::jsonb end
        ) m where m ->> 'method' = 'oauth'
      )
  )
)$antes$,$depois$(exists(select 1 from public.usuario u join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil join identidade.sessao s on s.usuario_id=u.id and s.concessao_id=c.id where u.id=(select auth_privado.uid()) and u.ativo and u.perfil in ('administrador', 'profissional') and c.estado='vinculada' and c.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.revogada_em is null and s.encerrada_em is null and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after > clock_timestamp())) and identidade.contexto_acesso_vigente(false)->>'perfil'=u.perfil))$depois$);
-- carteira_nativa_paciente: 20261107100000_restringir_rls_carteira.sql; caso/audiência/perfil mantidos.
select pg_temp.substituir_policy_autenticacao('cadastro.paciente','carteira_nativa_paciente','ffcmapp_carteira_owner',$antes$(
 exists (
  select 1 from public.usuario u
  join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil
  join identidade.sessao s on s.usuario_id=u.id and s.concessao_id=c.id
  join identidade.configuracao_auth_nativo cfg on cfg.google_unico_oauth_confirmado
  join auth_privado.identidades() i on i.user_id=u.id and i.provider='google'
  where u.id=(select auth_privado.uid()) and u.ativo and u.perfil in ('administrador','profissional')
   and c.estado='vinculada' and c.metodo='google_workspace' and c.subject_google=i.provider_id
   and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo='google_workspace'
   and s.revogada_em is null and s.encerrada_em is null
   and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after>clock_timestamp()))
   and (select count(*) from auth_privado.identidades() j where j.user_id=u.id and j.provider='google')=1
   and i.identity_data->>'sub'=i.provider_id and i.identity_data->>'email_verified'='true'
   and i.identity_data#>>'{custom_claims,hd}'=cfg.dominio_workspace
   and exists(select 1 from jsonb_array_elements(case when jsonb_typeof((select auth_privado.jwt())->'amr')='array' then (select auth_privado.jwt())->'amr' else '[]'::jsonb end) m where m->>'method'='oauth')
   and (u.perfil='administrador' or exists(select 1 from cadastro.acesso_paciente x where x.paciente_id=paciente.id and x.usuario_id=u.id and x.revogada_em is null))
 )
)$antes$,$depois$(exists(select 1 from public.usuario u join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil join identidade.sessao s on s.usuario_id=u.id and s.concessao_id=c.id where u.id=(select auth_privado.uid()) and u.ativo and u.perfil in ('administrador','profissional') and c.estado='vinculada' and c.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.revogada_em is null and s.encerrada_em is null and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after>clock_timestamp())) and identidade.contexto_acesso_vigente(false)->>'perfil'=u.perfil and (u.perfil='administrador' or exists(select 1 from cadastro.acesso_paciente x where x.paciente_id=paciente.id and x.usuario_id=u.id and x.revogada_em is null))))$depois$);
-- contexto_owner_paciente: 20261117310000_contexto_cuidado_operacoes_privadas.sql; caso/audiência/perfil mantidos.
select pg_temp.substituir_policy_autenticacao('cadastro.paciente','contexto_owner_paciente','ffcmapp_contexto_cuidado_owner',$antes$(
  exists (
    select 1 from public.usuario u
    join identidade.concessao_equipe c on c.usuario_id = u.id and c.perfil = u.perfil
    join identidade.sessao s on s.usuario_id = u.id and s.concessao_id = c.id
    join identidade.configuracao_auth_nativo cfg on cfg.google_unico_oauth_confirmado
    join auth_privado.identidades() i on i.user_id = u.id and i.provider = 'google'
    where u.id = (select auth_privado.uid()) and u.ativo and u.perfil in ('administrador', 'profissional')
      and c.estado = 'vinculada' and c.metodo = 'google_workspace' and c.subject_google = i.provider_id
      and s.session_id::text = (select auth_privado.jwt()->>'session_id') and s.metodo = 'google_workspace'
      and s.revogada_em is null and s.encerrada_em is null
      and exists(select 1 from auth_privado.sessoes() a where a.id = s.session_id and a.user_id = u.id and (a.not_after is null or a.not_after > clock_timestamp()))
      and (select count(*) from auth_privado.identidades() j where j.user_id = u.id and j.provider = 'google') = 1
      and i.identity_data->>'sub' = i.provider_id and i.identity_data->>'email_verified' = 'true'
      and i.identity_data#>>'{custom_claims,hd}' = cfg.dominio_workspace
      and exists(select 1 from jsonb_array_elements(case when jsonb_typeof((select auth_privado.jwt())->'amr') = 'array' then (select auth_privado.jwt())->'amr' else '[]'::jsonb end) m where m->>'method' = 'oauth')
  )
)$antes$,$depois$(exists(select 1 from public.usuario u join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil join identidade.sessao s on s.usuario_id=u.id and s.concessao_id=c.id where u.id=(select auth_privado.uid()) and u.ativo and u.perfil in ('administrador', 'profissional') and c.estado='vinculada' and c.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.revogada_em is null and s.encerrada_em is null and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after > clock_timestamp())) and identidade.contexto_acesso_vigente(false)->>'perfil'=u.perfil))$depois$);
-- diario_owner_paciente: 20261118210000_diario_operacoes_privadas.sql; caso/audiência/perfil mantidos.
select pg_temp.substituir_policy_autenticacao('cadastro.paciente','diario_owner_paciente','ffcmapp_diario_owner',$antes$(
 exists (
  select 1 from public.usuario u
  join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil
  join identidade.sessao s on s.usuario_id=u.id and s.concessao_id=c.id
  join identidade.configuracao_auth_nativo cfg on cfg.google_unico_oauth_confirmado
  join auth_privado.identidades() i on i.user_id=u.id and i.provider='google'
  where u.id=(select auth_privado.uid()) and u.ativo and u.perfil in ('administrador','profissional')
   and c.estado='vinculada' and c.metodo='google_workspace' and c.subject_google=i.provider_id
   and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo='google_workspace'
   and s.revogada_em is null and s.encerrada_em is null
   and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after>clock_timestamp()))
   and (select count(*) from auth_privado.identidades() j where j.user_id=u.id and j.provider='google')=1
   and i.identity_data->>'sub'=i.provider_id and i.identity_data->>'email_verified'='true'
   and i.identity_data#>>'{custom_claims,hd}'=cfg.dominio_workspace
   and exists(select 1 from jsonb_array_elements(case when jsonb_typeof((select auth_privado.jwt())->'amr')='array' then (select auth_privado.jwt())->'amr' else '[]'::jsonb end) m where m->>'method'='oauth')
 )
 or exists (
  select 1 from public.usuario u
  join cadastro.acesso_paciente ap on ap.usuario_id=u.id and ap.paciente_id=cadastro.paciente.id and ap.revogada_em is null
  join identidade.sessao s on s.usuario_id=u.id
  where u.id=(select auth_privado.uid()) and u.ativo and u.perfil='familia'
   and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo='familia'
   and s.concessao_id is null and s.concessao_versao_admissao is null
   and s.revogada_em is null and s.encerrada_em is null
   and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after>clock_timestamp()))
   and exists(select 1 from jsonb_array_elements(case when jsonb_typeof((select auth_privado.jwt())->'amr')='array' then (select auth_privado.jwt())->'amr' else '[]'::jsonb end) m where m->>'method'='password')
 )
)$antes$,$depois$(exists(select 1 from public.usuario u join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil join identidade.sessao s on s.usuario_id=u.id and s.concessao_id=c.id where u.id=(select auth_privado.uid()) and u.ativo and u.perfil in ('administrador','profissional') and c.estado='vinculada' and c.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.revogada_em is null and s.encerrada_em is null and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after>clock_timestamp())) and identidade.contexto_acesso_vigente(false)->>'perfil'=u.perfil) or exists(select 1 from public.usuario u join cadastro.acesso_paciente ap on ap.usuario_id=u.id and ap.paciente_id=cadastro.paciente.id and ap.revogada_em is null join identidade.sessao s on s.usuario_id=u.id where u.id=(select auth_privado.uid()) and u.ativo and u.perfil='familia' and s.session_id::text=(select auth_privado.jwt()->>'session_id') and ((s.metodo='familia' and not identidade.cadastro_gerenciado_proprio(false)) or (identidade.contexto_acesso_vigente(false)->>'perfil'='familia' and s.metodo=identidade.contexto_acesso_vigente(false)->>'metodo')) and s.concessao_id is null and s.concessao_versao_admissao is null and s.revogada_em is null and s.encerrada_em is null and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after>clock_timestamp())) and (exists(select 1 from jsonb_array_elements(case when jsonb_typeof((select auth_privado.jwt())->'amr')='array' then (select auth_privado.jwt())->'amr' else '[]'::jsonb end) m where m->>'method'='password') or identidade.contexto_acesso_vigente(false)->>'perfil'='familia')))$depois$);
-- documento_owner_paciente: 20261120120000_documento_caso_operacoes_privadas.sql; caso/audiência/perfil mantidos.
select pg_temp.substituir_policy_autenticacao('cadastro.paciente','documento_owner_paciente','ffcmapp_documento_owner',$antes$(
  exists (
    select 1
    from public.usuario u
    join identidade.concessao_equipe c on c.usuario_id = u.id and c.perfil = u.perfil
    join identidade.sessao s on s.usuario_id = u.id and s.concessao_id = c.id
    join identidade.configuracao_auth_nativo cfg on cfg.google_unico_oauth_confirmado
    join auth_privado.identidades() i on i.user_id = u.id and i.provider = 'google'
    where u.id = (select auth_privado.uid())
      and u.ativo
      and u.perfil in ('administrador', 'profissional')
      and c.estado = 'vinculada'
      and c.metodo = 'google_workspace'
      and c.subject_google = i.provider_id
      and s.session_id::text = (select auth_privado.jwt() ->> 'session_id')
      and s.metodo = 'google_workspace'
      and s.revogada_em is null
      and s.encerrada_em is null
      and exists (
        select 1 from auth_privado.sessoes() a
        where a.id = s.session_id and a.user_id = u.id
          and (a.not_after is null or a.not_after > clock_timestamp())
      )
      and (select count(*) from auth_privado.identidades() j where j.user_id = u.id and j.provider = 'google') = 1
      and i.identity_data ->> 'sub' = i.provider_id
      and i.identity_data ->> 'email_verified' = 'true'
      and i.identity_data #>> '{custom_claims,hd}' = cfg.dominio_workspace
      and exists (
        select 1 from jsonb_array_elements(
          case when jsonb_typeof((select auth_privado.jwt()) -> 'amr') = 'array'
            then (select auth_privado.jwt()) -> 'amr' else '[]'::jsonb end
        ) m where m ->> 'method' = 'oauth'
      )
  )
)$antes$,$depois$(exists(select 1 from public.usuario u join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil join identidade.sessao s on s.usuario_id=u.id and s.concessao_id=c.id where u.id=(select auth_privado.uid()) and u.ativo and u.perfil in ('administrador', 'profissional') and c.estado='vinculada' and c.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.revogada_em is null and s.encerrada_em is null and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after > clock_timestamp())) and identidade.contexto_acesso_vigente(false)->>'perfil'=u.perfil))$depois$);
-- encaminhamento_owner_paciente: 20261117110000_encaminhamento_operacoes_privadas.sql; caso/audiência/perfil mantidos.
select pg_temp.substituir_policy_autenticacao('cadastro.paciente','encaminhamento_owner_paciente','ffcmapp_encaminhamento_owner',$antes$(
 exists (
  select 1 from public.usuario u
  join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil
  join identidade.sessao s on s.usuario_id=u.id and s.concessao_id=c.id
  join identidade.configuracao_auth_nativo cfg on cfg.google_unico_oauth_confirmado
  join auth_privado.identidades() i on i.user_id=u.id and i.provider='google'
  where u.id=(select auth_privado.uid()) and u.ativo and u.perfil in ('administrador','profissional')
   and c.estado='vinculada' and c.metodo='google_workspace' and c.subject_google=i.provider_id
   and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo='google_workspace'
   and s.revogada_em is null and s.encerrada_em is null
   and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after>clock_timestamp()))
   and (select count(*) from auth_privado.identidades() j where j.user_id=u.id and j.provider='google')=1
   and i.identity_data->>'sub'=i.provider_id and i.identity_data->>'email_verified'='true'
   and i.identity_data#>>'{custom_claims,hd}'=cfg.dominio_workspace
   and exists(select 1 from jsonb_array_elements(case when jsonb_typeof((select auth_privado.jwt())->'amr')='array' then (select auth_privado.jwt())->'amr' else '[]'::jsonb end) m where m->>'method'='oauth')
 )
)$antes$,$depois$(exists(select 1 from public.usuario u join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil join identidade.sessao s on s.usuario_id=u.id and s.concessao_id=c.id where u.id=(select auth_privado.uid()) and u.ativo and u.perfil in ('administrador','profissional') and c.estado='vinculada' and c.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.revogada_em is null and s.encerrada_em is null and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after>clock_timestamp())) and identidade.contexto_acesso_vigente(false)->>'perfil'=u.perfil))$depois$);
-- exportacao_paciente: 20261120340000_exportacao_operacoes_privadas.sql; caso/audiência/perfil mantidos.
select pg_temp.substituir_policy_autenticacao('cadastro.paciente','exportacao_paciente','ffcmapp_exportacao_owner',$antes$(
 exists (
  select 1 from public.usuario u
  join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil
  join identidade.sessao s on s.usuario_id=u.id and s.concessao_id=c.id
  join identidade.configuracao_auth_nativo cfg on cfg.google_unico_oauth_confirmado
  join auth_privado.identidades() i on i.user_id=u.id and i.provider='google'
  where u.id=(select auth_privado.uid()) and u.ativo and u.perfil in ('administrador','profissional')
   and c.estado='vinculada' and c.metodo='google_workspace' and c.subject_google=i.provider_id
   and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo='google_workspace'
   and s.revogada_em is null and s.encerrada_em is null
   and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after>clock_timestamp()))
   and (select count(*) from auth_privado.identidades() j where j.user_id=u.id and j.provider='google')=1
   and i.identity_data->>'sub'=i.provider_id and i.identity_data->>'email_verified'='true'
   and i.identity_data#>>'{custom_claims,hd}'=cfg.dominio_workspace
   and exists(select 1 from jsonb_array_elements(case when jsonb_typeof((select auth_privado.jwt())->'amr')='array' then (select auth_privado.jwt())->'amr' else '[]'::jsonb end) m where m->>'method'='oauth')
 )
)$antes$,$depois$(exists(select 1 from public.usuario u join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil join identidade.sessao s on s.usuario_id=u.id and s.concessao_id=c.id where u.id=(select auth_privado.uid()) and u.ativo and u.perfil in ('administrador','profissional') and c.estado='vinculada' and c.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.revogada_em is null and s.encerrada_em is null and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after>clock_timestamp())) and identidade.contexto_acesso_vigente(false)->>'perfil'=u.perfil))$depois$);
-- linha_tempo_leitura_paciente: 20261120310000_linha_tempo_operacoes_privadas.sql; caso/audiência/perfil mantidos.
select pg_temp.substituir_policy_autenticacao('cadastro.paciente','linha_tempo_leitura_paciente','ffcmapp_linha_tempo_leitura_owner',$antes$(
 exists (
  select 1 from public.usuario u
  join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil
  join identidade.sessao s on s.usuario_id=u.id and s.concessao_id=c.id
  join identidade.configuracao_auth_nativo cfg on cfg.google_unico_oauth_confirmado
  join auth_privado.identidades() i on i.user_id=u.id and i.provider='google'
  where u.id=(select auth_privado.uid()) and u.ativo and u.perfil in ('administrador','profissional')
   and c.estado='vinculada' and c.metodo='google_workspace' and c.subject_google=i.provider_id
   and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo='google_workspace'
   and s.revogada_em is null and s.encerrada_em is null
   and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after>clock_timestamp()))
   and (select count(*) from auth_privado.identidades() j where j.user_id=u.id and j.provider='google')=1
   and i.identity_data->>'sub'=i.provider_id and i.identity_data->>'email_verified'='true'
   and i.identity_data#>>'{custom_claims,hd}'=cfg.dominio_workspace
   and exists(select 1 from jsonb_array_elements(case when jsonb_typeof((select auth_privado.jwt())->'amr')='array' then (select auth_privado.jwt())->'amr' else '[]'::jsonb end) m where m->>'method'='oauth')
 )
 or exists (
  select 1 from public.usuario u
  join cadastro.acesso_paciente ap on ap.usuario_id=u.id and ap.paciente_id=cadastro.paciente.id and ap.revogada_em is null
  join identidade.sessao s on s.usuario_id=u.id
  where u.id=(select auth_privado.uid()) and u.ativo and u.perfil='familia'
   and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo='familia'
   and s.concessao_id is null and s.concessao_versao_admissao is null
   and s.revogada_em is null and s.encerrada_em is null
   and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after>clock_timestamp()))
   and exists(select 1 from jsonb_array_elements(case when jsonb_typeof((select auth_privado.jwt())->'amr')='array' then (select auth_privado.jwt())->'amr' else '[]'::jsonb end) m where m->>'method'='password')
 )
)$antes$,$depois$(exists(select 1 from public.usuario u join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil join identidade.sessao s on s.usuario_id=u.id and s.concessao_id=c.id where u.id=(select auth_privado.uid()) and u.ativo and u.perfil in ('administrador','profissional') and c.estado='vinculada' and c.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.revogada_em is null and s.encerrada_em is null and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after>clock_timestamp())) and identidade.contexto_acesso_vigente(false)->>'perfil'=u.perfil) or exists(select 1 from public.usuario u join cadastro.acesso_paciente ap on ap.usuario_id=u.id and ap.paciente_id=cadastro.paciente.id and ap.revogada_em is null join identidade.sessao s on s.usuario_id=u.id where u.id=(select auth_privado.uid()) and u.ativo and u.perfil='familia' and s.session_id::text=(select auth_privado.jwt()->>'session_id') and ((s.metodo='familia' and not identidade.cadastro_gerenciado_proprio(false)) or (identidade.contexto_acesso_vigente(false)->>'perfil'='familia' and s.metodo=identidade.contexto_acesso_vigente(false)->>'metodo')) and s.concessao_id is null and s.concessao_versao_admissao is null and s.revogada_em is null and s.encerrada_em is null and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after>clock_timestamp())) and (exists(select 1 from jsonb_array_elements(case when jsonb_typeof((select auth_privado.jwt())->'amr')='array' then (select auth_privado.jwt())->'amr' else '[]'::jsonb end) m where m->>'method'='password') or identidade.contexto_acesso_vigente(false)->>'perfil'='familia')))$depois$);
-- orientacao_owner_paciente: 20261117140000_orientacao_operacoes_privadas.sql; caso/audiência/perfil mantidos.
select pg_temp.substituir_policy_autenticacao('cadastro.paciente','orientacao_owner_paciente','ffcmapp_orientacao_owner',$antes$(
 exists (
  select 1 from public.usuario u
  join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil
  join identidade.sessao s on s.usuario_id=u.id and s.concessao_id=c.id
  join identidade.configuracao_auth_nativo cfg on cfg.google_unico_oauth_confirmado
  join auth_privado.identidades() i on i.user_id=u.id and i.provider='google'
  where u.id=(select auth_privado.uid()) and u.ativo and u.perfil in ('administrador','profissional')
   and c.estado='vinculada' and c.metodo='google_workspace' and c.subject_google=i.provider_id
   and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo='google_workspace'
   and s.revogada_em is null and s.encerrada_em is null
   and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after>clock_timestamp()))
   and (select count(*) from auth_privado.identidades() j where j.user_id=u.id and j.provider='google')=1
   and i.identity_data->>'sub'=i.provider_id and i.identity_data->>'email_verified'='true'
   and i.identity_data#>>'{custom_claims,hd}'=cfg.dominio_workspace
   and exists(select 1 from jsonb_array_elements(case when jsonb_typeof((select auth_privado.jwt())->'amr')='array' then (select auth_privado.jwt())->'amr' else '[]'::jsonb end) m where m->>'method'='oauth')
 )
)$antes$,$depois$(exists(select 1 from public.usuario u join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil join identidade.sessao s on s.usuario_id=u.id and s.concessao_id=c.id where u.id=(select auth_privado.uid()) and u.ativo and u.perfil in ('administrador','profissional') and c.estado='vinculada' and c.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.revogada_em is null and s.encerrada_em is null and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after>clock_timestamp())) and identidade.contexto_acesso_vigente(false)->>'perfil'=u.perfil))$depois$);
-- pendencia_owner_paciente: 20261118310000_pendencia_caso_operacoes_privadas.sql; caso/audiência/perfil mantidos.
select pg_temp.substituir_policy_autenticacao('cadastro.paciente','pendencia_owner_paciente','ffcmapp_pendencia_owner',$antes$(
  exists (
    select 1
    from public.usuario u
    join identidade.concessao_equipe c on c.usuario_id = u.id and c.perfil = u.perfil
    join identidade.sessao s on s.usuario_id = u.id and s.concessao_id = c.id
    join identidade.configuracao_auth_nativo cfg on cfg.google_unico_oauth_confirmado
    join auth_privado.identidades() i on i.user_id = u.id and i.provider = 'google'
    where u.id = (select auth_privado.uid())
      and u.ativo
      and u.perfil in ('administrador', 'profissional')
      and c.estado = 'vinculada'
      and c.metodo = 'google_workspace'
      and c.subject_google = i.provider_id
      and s.session_id::text = (select auth_privado.jwt() ->> 'session_id')
      and s.metodo = 'google_workspace'
      and s.revogada_em is null
      and s.encerrada_em is null
      and exists (
        select 1 from auth_privado.sessoes() a
        where a.id = s.session_id and a.user_id = u.id
          and (a.not_after is null or a.not_after > clock_timestamp())
      )
      and (select count(*) from auth_privado.identidades() j where j.user_id = u.id and j.provider = 'google') = 1
      and i.identity_data ->> 'sub' = i.provider_id
      and i.identity_data ->> 'email_verified' = 'true'
      and i.identity_data #>> '{custom_claims,hd}' = cfg.dominio_workspace
      and exists (
        select 1 from jsonb_array_elements(
          case when jsonb_typeof((select auth_privado.jwt()) -> 'amr') = 'array'
            then (select auth_privado.jwt()) -> 'amr' else '[]'::jsonb end
        ) m where m ->> 'method' = 'oauth'
      )
  )
)$antes$,$depois$(exists(select 1 from public.usuario u join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil join identidade.sessao s on s.usuario_id=u.id and s.concessao_id=c.id where u.id=(select auth_privado.uid()) and u.ativo and u.perfil in ('administrador', 'profissional') and c.estado='vinculada' and c.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.revogada_em is null and s.encerrada_em is null and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after > clock_timestamp())) and identidade.contexto_acesso_vigente(false)->>'perfil'=u.perfil))$depois$);
-- plano_crise_owner_paciente: 20261118120000_plano_crise_operacoes_privadas.sql; caso/audiência/perfil mantidos.
select pg_temp.substituir_policy_autenticacao('cadastro.paciente','plano_crise_owner_paciente','ffcmapp_plano_crise_owner',$antes$(
  exists (
    select 1
    from public.usuario u
    join identidade.concessao_equipe c on c.usuario_id = u.id and c.perfil = u.perfil
    join identidade.sessao s on s.usuario_id = u.id and s.concessao_id = c.id
    join identidade.configuracao_auth_nativo cfg on cfg.google_unico_oauth_confirmado
    join auth_privado.identidades() i on i.user_id = u.id and i.provider = 'google'
    where u.id = (select auth_privado.uid())
      and u.ativo
      and u.perfil in ('administrador', 'profissional')
      and c.estado = 'vinculada'
      and c.metodo = 'google_workspace'
      and c.subject_google = i.provider_id
      and s.session_id::text = (select auth_privado.jwt() ->> 'session_id')
      and s.metodo = 'google_workspace'
      and s.revogada_em is null
      and s.encerrada_em is null
      and exists (
        select 1 from auth_privado.sessoes() a
        where a.id = s.session_id and a.user_id = u.id
          and (a.not_after is null or a.not_after > clock_timestamp())
      )
      and (select count(*) from auth_privado.identidades() j where j.user_id = u.id and j.provider = 'google') = 1
      and i.identity_data ->> 'sub' = i.provider_id
      and i.identity_data ->> 'email_verified' = 'true'
      and i.identity_data #>> '{custom_claims,hd}' = cfg.dominio_workspace
      and exists (
        select 1 from jsonb_array_elements(
          case when jsonb_typeof((select auth_privado.jwt()) -> 'amr') = 'array'
            then (select auth_privado.jwt()) -> 'amr' else '[]'::jsonb end
        ) m where m ->> 'method' = 'oauth'
      )
  )
)$antes$,$depois$(exists(select 1 from public.usuario u join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil join identidade.sessao s on s.usuario_id=u.id and s.concessao_id=c.id where u.id=(select auth_privado.uid()) and u.ativo and u.perfil in ('administrador', 'profissional') and c.estado='vinculada' and c.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.revogada_em is null and s.encerrada_em is null and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after > clock_timestamp())) and identidade.contexto_acesso_vigente(false)->>'perfil'=u.perfil))$depois$);
-- plano_owner_paciente: 20261107130000_plano_cuidado_operacoes_privadas.sql; caso/audiência/perfil mantidos.
select pg_temp.substituir_policy_autenticacao('cadastro.paciente','plano_owner_paciente','ffcmapp_plano_owner',$antes$(
 exists (
  select 1 from public.usuario u
  join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil
  join identidade.sessao s on s.usuario_id=u.id and s.concessao_id=c.id
  join identidade.configuracao_auth_nativo cfg on cfg.google_unico_oauth_confirmado
  join auth_privado.identidades() i on i.user_id=u.id and i.provider='google'
  where u.id=(select auth_privado.uid()) and u.ativo and u.perfil in ('administrador','profissional')
   and c.estado='vinculada' and c.metodo='google_workspace' and c.subject_google=i.provider_id
   and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo='google_workspace'
   and s.revogada_em is null and s.encerrada_em is null
   and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after>clock_timestamp()))
   and (select count(*) from auth_privado.identidades() j where j.user_id=u.id and j.provider='google')=1
   and i.identity_data->>'sub'=i.provider_id and i.identity_data->>'email_verified'='true'
   and i.identity_data#>>'{custom_claims,hd}'=cfg.dominio_workspace
   and exists(select 1 from jsonb_array_elements(case when jsonb_typeof((select auth_privado.jwt())->'amr')='array' then (select auth_privado.jwt())->'amr' else '[]'::jsonb end) m where m->>'method'='oauth')
 )
)$antes$,$depois$(exists(select 1 from public.usuario u join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil join identidade.sessao s on s.usuario_id=u.id and s.concessao_id=c.id where u.id=(select auth_privado.uid()) and u.ativo and u.perfil in ('administrador','profissional') and c.estado='vinculada' and c.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.revogada_em is null and s.encerrada_em is null and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after>clock_timestamp())) and identidade.contexto_acesso_vigente(false)->>'perfil'=u.perfil))$depois$);
-- rede_owner_paciente: 20261117340000_rede_cuidado_operacoes_privadas.sql; caso/audiência/perfil mantidos.
select pg_temp.substituir_policy_autenticacao('cadastro.paciente','rede_owner_paciente','ffcmapp_rede_cuidado_owner',$antes$(
  exists (
    select 1 from public.usuario u
    join identidade.concessao_equipe c on c.usuario_id = u.id and c.perfil = u.perfil
    join identidade.sessao s on s.usuario_id = u.id and s.concessao_id = c.id
    join identidade.configuracao_auth_nativo cfg on cfg.google_unico_oauth_confirmado
    join auth_privado.identidades() i on i.user_id = u.id and i.provider = 'google'
    where u.id = (select auth_privado.uid()) and u.ativo and u.perfil in ('administrador', 'profissional')
      and c.estado = 'vinculada' and c.metodo = 'google_workspace' and c.subject_google = i.provider_id
      and s.session_id::text = (select auth_privado.jwt()->>'session_id') and s.metodo = 'google_workspace'
      and s.revogada_em is null and s.encerrada_em is null
      and exists(select 1 from auth_privado.sessoes() a where a.id = s.session_id and a.user_id = u.id and (a.not_after is null or a.not_after > clock_timestamp()))
      and (select count(*) from auth_privado.identidades() j where j.user_id = u.id and j.provider = 'google') = 1
      and i.identity_data->>'sub' = i.provider_id and i.identity_data->>'email_verified' = 'true'
      and i.identity_data#>>'{custom_claims,hd}' = cfg.dominio_workspace
      and exists(select 1 from jsonb_array_elements(case when jsonb_typeof((select auth_privado.jwt())->'amr') = 'array' then (select auth_privado.jwt())->'amr' else '[]'::jsonb end) m where m->>'method' = 'oauth')
  )
)$antes$,$depois$(exists(select 1 from public.usuario u join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil join identidade.sessao s on s.usuario_id=u.id and s.concessao_id=c.id where u.id=(select auth_privado.uid()) and u.ativo and u.perfil in ('administrador', 'profissional') and c.estado='vinculada' and c.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.revogada_em is null and s.encerrada_em is null and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after > clock_timestamp())) and identidade.contexto_acesso_vigente(false)->>'perfil'=u.perfil))$depois$);
-- saude_owner_paciente: 20261117210000_saude_operacoes_privadas.sql; caso/audiência/perfil mantidos.
select pg_temp.substituir_policy_autenticacao('cadastro.paciente','saude_owner_paciente','ffcmapp_saude_owner',$antes$(
  exists (
    select 1
    from public.usuario u
    join identidade.concessao_equipe c on c.usuario_id = u.id and c.perfil = u.perfil
    join identidade.sessao s on s.usuario_id = u.id and s.concessao_id = c.id
    join identidade.configuracao_auth_nativo cfg on cfg.google_unico_oauth_confirmado
    join auth_privado.identidades() i on i.user_id = u.id and i.provider = 'google'
    where u.id = (select auth_privado.uid())
      and u.ativo
      and u.perfil in ('administrador', 'profissional')
      and c.estado = 'vinculada'
      and c.metodo = 'google_workspace'
      and c.subject_google = i.provider_id
      and s.session_id::text = (select auth_privado.jwt() ->> 'session_id')
      and s.metodo = 'google_workspace'
      and s.revogada_em is null
      and s.encerrada_em is null
      and exists (
        select 1 from auth_privado.sessoes() a
        where a.id = s.session_id and a.user_id = u.id
          and (a.not_after is null or a.not_after > clock_timestamp())
      )
      and (select count(*) from auth_privado.identidades() j where j.user_id = u.id and j.provider = 'google') = 1
      and i.identity_data ->> 'sub' = i.provider_id
      and i.identity_data ->> 'email_verified' = 'true'
      and i.identity_data #>> '{custom_claims,hd}' = cfg.dominio_workspace
      and exists (
        select 1 from jsonb_array_elements(
          case when jsonb_typeof((select auth_privado.jwt()) -> 'amr') = 'array'
            then (select auth_privado.jwt()) -> 'amr' else '[]'::jsonb end
        ) m where m ->> 'method' = 'oauth'
      )
  )
)$antes$,$depois$(exists(select 1 from public.usuario u join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil join identidade.sessao s on s.usuario_id=u.id and s.concessao_id=c.id where u.id=(select auth_privado.uid()) and u.ativo and u.perfil in ('administrador', 'profissional') and c.estado='vinculada' and c.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.revogada_em is null and s.encerrada_em is null and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after > clock_timestamp())) and identidade.contexto_acesso_vigente(false)->>'perfil'=u.perfil))$depois$);
-- tarefa_owner_paciente: 20261111150000_tarefa_cuidado_operacoes_privadas.sql; caso/audiência/perfil mantidos.
select pg_temp.substituir_policy_autenticacao('cadastro.paciente','tarefa_owner_paciente','ffcmapp_tarefa_owner',$antes$(
 exists (
  select 1 from public.usuario u
  join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil
  join identidade.sessao s on s.usuario_id=u.id and s.concessao_id=c.id
  join identidade.configuracao_auth_nativo cfg on cfg.google_unico_oauth_confirmado
  join auth_privado.identidades() i on i.user_id=u.id and i.provider='google'
  where exists(select 1 from cadastro.acesso_paciente ap where ap.paciente_id=cadastro.paciente.id and ap.usuario_id=u.id and ap.revogada_em is null)
   and u.id=(select auth_privado.uid()) and u.ativo and u.perfil = 'profissional'
   and c.estado='vinculada' and c.metodo='google_workspace' and c.subject_google=i.provider_id
   and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo='google_workspace'
   and s.revogada_em is null and s.encerrada_em is null
   and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after>clock_timestamp()))
   and (select count(*) from auth_privado.identidades() j where j.user_id=u.id and j.provider='google')=1
   and i.identity_data->>'sub'=i.provider_id and i.identity_data->>'email_verified'='true'
   and i.identity_data#>>'{custom_claims,hd}'=cfg.dominio_workspace
   and exists(select 1 from jsonb_array_elements(case when jsonb_typeof((select auth_privado.jwt())->'amr')='array' then (select auth_privado.jwt())->'amr' else '[]'::jsonb end) m where m->>'method'='oauth')
 )
)$antes$,$depois$(exists(select 1 from public.usuario u join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil join identidade.sessao s on s.usuario_id=u.id and s.concessao_id=c.id where exists(select 1 from cadastro.acesso_paciente ap where ap.paciente_id=cadastro.paciente.id and ap.usuario_id=u.id and ap.revogada_em is null) and u.id=(select auth_privado.uid()) and u.ativo and u.perfil='profissional' and c.estado='vinculada' and c.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.revogada_em is null and s.encerrada_em is null and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after>clock_timestamp())) and identidade.contexto_acesso_vigente(false)->>'perfil'=u.perfil))$depois$);
-- turno_owner_paciente: 20261125080000_turno_execucao_privada.sql; caso/audiência/perfil mantidos.
select pg_temp.substituir_policy_autenticacao('cadastro.paciente','turno_owner_paciente','ffcmapp_turno_owner',$antes$(
 exists (
  select 1 from public.usuario u
  join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil
  join identidade.sessao s on s.usuario_id=u.id and s.concessao_id=c.id
  join identidade.configuracao_auth_nativo cfg on cfg.google_unico_oauth_confirmado
  join auth_privado.identidades() i on i.user_id=u.id and i.provider='google'
  where exists(select 1 from cadastro.acesso_paciente ap where ap.paciente_id=cadastro.paciente.id and ap.usuario_id=u.id and ap.revogada_em is null)
   and u.id=(select auth_privado.uid()) and u.ativo and u.perfil = 'profissional'
   and c.estado='vinculada' and c.metodo='google_workspace' and c.subject_google=i.provider_id
   and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo='google_workspace'
   and s.revogada_em is null and s.encerrada_em is null
   and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after>clock_timestamp()))
   and (select count(*) from auth_privado.identidades() j where j.user_id=u.id and j.provider='google')=1
   and i.identity_data->>'sub'=i.provider_id and i.identity_data->>'email_verified'='true'
   and i.identity_data#>>'{custom_claims,hd}'=cfg.dominio_workspace
   and exists(select 1 from jsonb_array_elements(case when jsonb_typeof((select auth_privado.jwt())->'amr')='array' then (select auth_privado.jwt())->'amr' else '[]'::jsonb end) m where m->>'method'='oauth')
 )
)$antes$,$depois$(exists(select 1 from public.usuario u join identidade.concessao_equipe c on c.usuario_id=u.id and c.perfil=u.perfil join identidade.sessao s on s.usuario_id=u.id and s.concessao_id=c.id where exists(select 1 from cadastro.acesso_paciente ap where ap.paciente_id=cadastro.paciente.id and ap.usuario_id=u.id and ap.revogada_em is null) and u.id=(select auth_privado.uid()) and u.ativo and u.perfil='profissional' and c.estado='vinculada' and c.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.session_id::text=(select auth_privado.jwt()->>'session_id') and s.metodo=identidade.contexto_acesso_vigente(false)->>'metodo' and s.revogada_em is null and s.encerrada_em is null and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after>clock_timestamp())) and identidade.contexto_acesso_vigente(false)->>'perfil'=u.perfil))$depois$);
-- plano_owner_paciente_familiar: 20261124110000_plano_cuidado_familia_privada.sql; caso/audiência/perfil mantidos.
select pg_temp.substituir_policy_autenticacao('cadastro.paciente','plano_owner_paciente_familiar','ffcmapp_plano_owner',$antes$(
    exists (
      select 1 from public.usuario u
      join cadastro.acesso_paciente ap on ap.usuario_id = u.id and ap.paciente_id = cadastro.paciente.id and ap.revogada_em is null
      join identidade.sessao s on s.usuario_id = u.id
      where u.id = (select auth_privado.uid()) and u.ativo and u.perfil = 'familia'
        and s.session_id::text = (select auth_privado.jwt() ->> 'session_id') and s.metodo = 'familia'
        and s.concessao_id is null and s.concessao_versao_admissao is null
        and s.revogada_em is null and s.encerrada_em is null
        and exists (select 1 from auth_privado.sessoes() a where a.id = s.session_id and a.user_id = u.id and (a.not_after is null or a.not_after > clock_timestamp()))
        and exists (select 1 from jsonb_array_elements(case when jsonb_typeof((select auth_privado.jwt()) -> 'amr') = 'array' then (select auth_privado.jwt()) -> 'amr' else '[]'::jsonb end) m where m ->> 'method' = 'password')
    )
  )$antes$,$depois$(exists(select 1 from public.usuario u join cadastro.acesso_paciente ap on ap.usuario_id=u.id and ap.paciente_id=cadastro.paciente.id and ap.revogada_em is null join identidade.sessao s on s.usuario_id=u.id where u.id=(select auth_privado.uid()) and u.ativo and u.perfil='familia' and s.session_id::text=(select auth_privado.jwt()->>'session_id') and ((s.metodo='familia' and not identidade.cadastro_gerenciado_proprio(false)) or (identidade.contexto_acesso_vigente(false)->>'perfil'='familia' and s.metodo=identidade.contexto_acesso_vigente(false)->>'metodo')) and s.concessao_id is null and s.concessao_versao_admissao is null and s.revogada_em is null and s.encerrada_em is null and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after > clock_timestamp())) and (exists(select 1 from jsonb_array_elements(case when jsonb_typeof((select auth_privado.jwt())->'amr')='array' then (select auth_privado.jwt())->'amr' else '[]'::jsonb end) m where m->>'method'='password') or identidade.contexto_acesso_vigente(false)->>'perfil'='familia')))$depois$);
-- documento_owner_paciente_familiar: 20261124120000_documento_caso_familia_privada.sql; caso/audiência/perfil mantidos.
select pg_temp.substituir_policy_autenticacao('cadastro.paciente','documento_owner_paciente_familiar','ffcmapp_documento_owner',$antes$(
    exists (
      select 1 from public.usuario u
      join cadastro.acesso_paciente ap on ap.usuario_id = u.id and ap.paciente_id = cadastro.paciente.id and ap.revogada_em is null
      join identidade.sessao s on s.usuario_id = u.id
      where u.id = (select auth_privado.uid()) and u.ativo and u.perfil = 'familia'
        and s.session_id::text = (select auth_privado.jwt() ->> 'session_id') and s.metodo = 'familia'
        and s.concessao_id is null and s.concessao_versao_admissao is null
        and s.revogada_em is null and s.encerrada_em is null
        and exists (select 1 from auth_privado.sessoes() a where a.id = s.session_id and a.user_id = u.id and (a.not_after is null or a.not_after > clock_timestamp()))
        and exists (select 1 from jsonb_array_elements(case when jsonb_typeof((select auth_privado.jwt()) -> 'amr') = 'array' then (select auth_privado.jwt()) -> 'amr' else '[]'::jsonb end) m where m ->> 'method' = 'password')
    )
  )$antes$,$depois$(exists(select 1 from public.usuario u join cadastro.acesso_paciente ap on ap.usuario_id=u.id and ap.paciente_id=cadastro.paciente.id and ap.revogada_em is null join identidade.sessao s on s.usuario_id=u.id where u.id=(select auth_privado.uid()) and u.ativo and u.perfil='familia' and s.session_id::text=(select auth_privado.jwt()->>'session_id') and ((s.metodo='familia' and not identidade.cadastro_gerenciado_proprio(false)) or (identidade.contexto_acesso_vigente(false)->>'perfil'='familia' and s.metodo=identidade.contexto_acesso_vigente(false)->>'metodo')) and s.concessao_id is null and s.concessao_versao_admissao is null and s.revogada_em is null and s.encerrada_em is null and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after > clock_timestamp())) and (exists(select 1 from jsonb_array_elements(case when jsonb_typeof((select auth_privado.jwt())->'amr')='array' then (select auth_privado.jwt())->'amr' else '[]'::jsonb end) m where m->>'method'='password') or identidade.contexto_acesso_vigente(false)->>'perfil'='familia')))$depois$);
-- orientacao_owner_paciente_familiar: 20261124140000_orientacao_familia_privada.sql; caso/audiência/perfil mantidos.
select pg_temp.substituir_policy_autenticacao('cadastro.paciente','orientacao_owner_paciente_familiar','ffcmapp_orientacao_owner',$antes$(
    exists (
      select 1 from public.usuario u
      join cadastro.acesso_paciente ap on ap.usuario_id = u.id and ap.paciente_id = cadastro.paciente.id and ap.revogada_em is null
      join identidade.sessao s on s.usuario_id = u.id
      where u.id = (select auth_privado.uid()) and u.ativo and u.perfil = 'familia'
        and s.session_id::text = (select auth_privado.jwt() ->> 'session_id') and s.metodo = 'familia'
        and s.concessao_id is null and s.concessao_versao_admissao is null
        and s.revogada_em is null and s.encerrada_em is null
        and exists (select 1 from auth_privado.sessoes() a where a.id = s.session_id and a.user_id = u.id and (a.not_after is null or a.not_after > clock_timestamp()))
        and exists (select 1 from jsonb_array_elements(case when jsonb_typeof((select auth_privado.jwt()) -> 'amr') = 'array' then (select auth_privado.jwt()) -> 'amr' else '[]'::jsonb end) m where m ->> 'method' = 'password')
    )
  )$antes$,$depois$(exists(select 1 from public.usuario u join cadastro.acesso_paciente ap on ap.usuario_id=u.id and ap.paciente_id=cadastro.paciente.id and ap.revogada_em is null join identidade.sessao s on s.usuario_id=u.id where u.id=(select auth_privado.uid()) and u.ativo and u.perfil='familia' and s.session_id::text=(select auth_privado.jwt()->>'session_id') and ((s.metodo='familia' and not identidade.cadastro_gerenciado_proprio(false)) or (identidade.contexto_acesso_vigente(false)->>'perfil'='familia' and s.metodo=identidade.contexto_acesso_vigente(false)->>'metodo')) and s.concessao_id is null and s.concessao_versao_admissao is null and s.revogada_em is null and s.encerrada_em is null and exists(select 1 from auth_privado.sessoes() a where a.id=s.session_id and a.user_id=u.id and (a.not_after is null or a.not_after > clock_timestamp())) and (exists(select 1 from jsonb_array_elements(case when jsonb_typeof((select auth_privado.jwt())->'amr')='array' then (select auth_privado.jwt())->'amr' else '[]'::jsonb end) m where m->>'method'='password') or identidade.contexto_acesso_vigente(false)->>'perfil'='familia')))$depois$);

do $$ declare p record;begin select * into p from acessos_privilegios_migracao;
 if not p.tinha_api then revoke create on schema api from ffcmapp_acessos_owner;end if;
 if not p.tinha_identidade then revoke create on schema identidade from ffcmapp_acessos_owner;end if;
 if not p.tinha_set then execute format('revoke ffcmapp_acessos_owner from %I granted by %I',p.migrador,p.migrador);end if;
end $$;

commit;
