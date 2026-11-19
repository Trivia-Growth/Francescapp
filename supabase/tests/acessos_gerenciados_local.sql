\set ON_ERROR_STOP on
-- PREPARADO, NÃO EXECUTADO. Auth/Vault fictícios, banco descartável sem TCP.
-- Bootstrap da ponte Auth usa owner plataforma. NÃO é prova da cadeia inteira NOSUPER.
\ir cadeia_migrations_completa_local.sql
-- Adapter fictício das interfaces Vault exigidas pela cadeia, sem integração externa.
create table vault.secrets(id uuid primary key default gen_random_uuid(),name text unique,secret text);
revoke all on vault.secrets from public,anon,authenticated,service_role;
create function vault.create_secret(new_secret text,new_name text default null,new_description text default '',new_key_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$ declare resultado uuid;begin insert into vault.secrets(name,secret) values(new_name,new_secret) returning id into resultado;return resultado;end $$;
revoke all on function vault.create_secret(text,text,text,uuid) from public,anon,authenticated,service_role;
alter table auth.users add column email text,add column email_confirmed_at timestamptz,add column raw_app_meta_data jsonb default '{}'::jsonb;
\ir ../migrations/20261110200000_edicao_paciente_wrappers_privados.sql
\ir ../migrations/20261110210000_consultar_paciente_edicao_privado.sql
\ir ../migrations/20261111100000_criar_contato_privado.sql
\ir ../migrations/20261111110000_contato_wrapper_privado.sql
\ir ../migrations/20261111120000_contato_owner_privado.sql
\ir ../migrations/20261111130000_auth_tecnico_sem_dominio.sql
\ir ../migrations/20261111140000_tarefa_cuidado_versoes_privadas.sql
\ir ../migrations/20261111150000_tarefa_cuidado_operacoes_privadas.sql
\ir ../migrations/20261111160000_admissao_familiar_privada.sql
\ir ../migrations/20261111170000_consulta_saida_familiar_privada.sql
\ir ../migrations/20261111180000_vinculo_familiar_privado.sql
\ir ../migrations/20261111190000_tarefa_cuidado_idempotencia_privada.sql
\ir ../migrations/20261111200000_barreira_criacao_contato_privada.sql
\ir ../migrations/20261111210000_barreira_contato_composicao_privada.sql
\ir ../migrations/20261111220000_vinculo_familiar_sessao_tecnica_privado.sql
\ir ../migrations/20261111230000_contato_barreira_owner_privado.sql
\ir ../migrations/20261111240000_owner_vinculo_familiar_privado.sql
\ir ../migrations/20261112010000_consultar_vinculo_familiar_privado.sql
\ir ../migrations/20261112020000_wrapper_consulta_vinculo_familiar_privado.sql
\ir ../migrations/20261112030000_listar_pacientes_familiar_privado.sql
\ir ../migrations/20261112040000_consultar_paciente_familiar_privado.sql
\ir ../migrations/20261112050000_conceder_acesso_paciente_privado.sql
\ir ../migrations/20261112060000_revogar_acesso_paciente_privado.sql
\ir ../migrations/20261112070000_owners_acesso_paciente_privado.sql
\ir ../migrations/20261112080000_listar_concessoes_equipe_privado.sql
\ir ../migrations/20261112090000_owner_listar_concessoes_equipe_privado.sql
\ir ../migrations/20261112100000_auditoria_carteira_auth_nao_admitido.sql
\ir ../migrations/20261112110000_corrigir_aad_auditoria_acesso.sql
\ir ../migrations/20261112120000_corrigir_reserva_barreira_contato.sql
\ir ../migrations/20261112121000_anamnese_auditoria_obrigatoria.sql
\ir ../migrations/20261112122000_plano_auditoria_obrigatoria.sql
\ir ../migrations/20261112140000_auditoria_edicao_contato_auth_nao_admitido.sql
\ir ../migrations/20261112160000_grants_edicao_contato_teste.sql
\ir ../migrations/20261112170000_listar_vinculos_profissionais_privado.sql
\ir ../migrations/20261112180000_barreira_acesso_paciente.sql
\ir ../migrations/20261112190000_anamnese_auditoria_auth_nao_admitido.sql
\ir ../migrations/20261112200000_auditoria_plano_auth_nao_admitido.sql
\ir ../migrations/20261112210000_grant_anamnese_teste.sql
\ir ../migrations/20261112220000_auditoria_vinculos_auth_nao_admitido.sql
\ir ../migrations/20261112230000_auditoria_equipe_auth_nao_admitido.sql
\ir ../migrations/20261112240000_grant_plano_cuidado_teste.sql
\ir ../migrations/20261112250000_grants_vinculos_teste.sql
\ir ../migrations/20261112260000_grant_equipe_teste.sql
\ir ../migrations/20261112270000_auditoria_tarefas_auth_nao_admitido.sql
\ir ../migrations/20261112280000_leitura_tarefas_cuidado_privada.sql
\ir ../migrations/20261112290000_grant_leitura_tarefas_teste.sql
\ir ../migrations/20261112300000_barreira_tarefa_cuidado_privada.sql
\ir ../migrations/20261112310000_criar_concessao_equipe_privado.sql
\ir ../migrations/20261112320000_replay_concessao_equipe_versionado.sql
\ir ../migrations/20261112330000_auditoria_criar_equipe_auth.sql
\ir ../migrations/20261112340000_historico_anamnese_privado.sql
\ir ../migrations/20261112350000_barreira_concessao_equipe_privada.sql
\ir ../migrations/20261113100000_acompanhamento_caso.sql
\ir ../migrations/20261113110000_situacao_na_lista.sql
\ir ../migrations/20261113120000_criar_caso_atomico.sql
\ir ../migrations/20261116100000_fechar_privilegios_padrao.sql
\ir ../migrations/20261116130000_campo_extra_plano_catalogo.sql
\ir ../migrations/20261116140000_campo_extra_plano_operacoes_privadas.sql
\ir ../migrations/20261116150000_aprovador_plano_catalogo.sql
\ir ../migrations/20261116160000_aprovador_plano_operacoes_privadas.sql
\ir ../migrations/20261116170000_aprovar_objetivo_plano_privado.sql
\ir ../migrations/20261116180000_grant_campo_extra_plano_teste.sql
\ir ../migrations/20261116190000_grant_aprovador_plano_teste.sql
\ir ../migrations/20261116200000_grant_escrita_tarefas_cuidado.sql
\ir ../migrations/20261116210000_grant_barreira_tarefas_cuidado.sql
\ir ../migrations/20261117100000_encaminhamento_versoes_privadas.sql
\ir ../migrations/20261117110000_encaminhamento_operacoes_privadas.sql
\ir ../migrations/20261117120000_grant_encaminhamento_teste.sql
\ir ../migrations/20261117130000_orientacao_versoes_privadas.sql
\ir ../migrations/20261117140000_orientacao_operacoes_privadas.sql
\ir ../migrations/20261117150000_grant_orientacao_teste.sql
\ir ../migrations/20261117200000_saude_versoes_privadas.sql
\ir ../migrations/20261117210000_saude_operacoes_privadas.sql
\ir ../migrations/20261117220000_grant_saude_teste.sql
\ir ../migrations/20261117300000_contexto_cuidado_versoes_privadas.sql
\ir ../migrations/20261117310000_contexto_cuidado_operacoes_privadas.sql
\ir ../migrations/20261117330000_rede_cuidado_versoes_privadas.sql
\ir ../migrations/20261117340000_rede_cuidado_operacoes_privadas.sql
\ir ../migrations/20261117350000_grant_contexto_rede_teste.sql
\ir ../migrations/20261117400000_configuracao_sistema.sql
\ir ../migrations/20261117410000_configuracao_sistema_operacoes_privadas.sql
\ir ../migrations/20261117420000_configuracao_sistema_leitor_servidor.sql
\ir ../migrations/20261117430000_grant_configuracao_sistema_teste.sql
\ir ../migrations/20261118100000_habilitacao_plano_crise_concessao.sql
\ir ../migrations/20261118110000_plano_crise_versoes_privadas.sql
\ir ../migrations/20261118120000_plano_crise_operacoes_privadas.sql
\ir ../migrations/20261118130000_grant_plano_crise_teste.sql
\ir ../migrations/20261118200000_diario_versoes_privadas.sql
\ir ../migrations/20261118210000_diario_operacoes_privadas.sql
\ir ../migrations/20261118220000_grant_diario_teste.sql
\ir ../migrations/20261118230000_configuracao_diario.sql
\ir ../migrations/20261118300000_sinal_operacional_caso.sql
\ir ../migrations/20261118310000_pendencia_caso_operacoes_privadas.sql
\ir ../migrations/20261118320000_grant_pendencia_teste.sql
\ir ../migrations/20261118330000_carteira_filtros_sinal.sql
\ir ../migrations/20261119100000_vault_segredo_integracao.sql
\ir ../migrations/20261119110000_configuracao_sistema_opcoes.sql
\ir ../migrations/20261119120000_audio_transcricao_privado.sql
\ir ../migrations/20261119130000_audio_transcricao_operacoes_privadas.sql
\ir ../migrations/20261119140000_configuracao_transcricao.sql
\ir ../migrations/20261119150000_grant_audio_transcricao_teste.sql
\ir ../migrations/20261119200000_auditoria_obrigatoria_carteira_familiar.sql
\ir ../migrations/20261119210000_auditoria_obrigatoria_consulta_paciente_familiar.sql
\ir ../migrations/20261119220000_auditoria_obrigatoria_sessao_familiar.sql
\ir ../migrations/20261119230000_owner_sessao_familiar.sql
\ir ../migrations/20261119240000_grant_familiar_teste.sql
\ir ../migrations/20261119250000_convite_familiar.sql
\ir ../migrations/20261119260000_ativar_convite_familiar.sql
\ir ../migrations/20261119270000_grant_convite_familiar_teste.sql
\ir ../migrations/20261119300000_consulta_auditoria_privada.sql
\ir ../migrations/20261119310000_grant_consulta_auditoria_teste.sql
\ir ../migrations/20261119320000_regras_atendimento_publicas.sql
\ir ../migrations/20261119330000_grant_regras_atendimento_teste.sql
\ir ../migrations/20261119340000_solicitacao_titular.sql
\ir ../migrations/20261119350000_solicitacao_titular_operacoes_privadas.sql
\ir ../migrations/20261119360000_grant_solicitacao_titular_teste.sql
\ir ../migrations/20261120100000_vault_segredo_integracao_json.sql
\ir ../migrations/20261120110000_documento_caso_privado.sql
\ir ../migrations/20261120120000_documento_caso_operacoes_privadas.sql
\ir ../migrations/20261120130000_grant_documento_caso_teste.sql
\ir ../migrations/20261120200000_auditoria_paciente_id.sql
\ir ../migrations/20261120210000_consulta_auditoria_por_caso.sql
\ir ../migrations/20261120300000_linha_tempo_caso.sql
\ir ../migrations/20261120310000_linha_tempo_operacoes_privadas.sql
\ir ../migrations/20261120320000_grant_linha_tempo_teste.sql
\ir ../migrations/20261120330000_exportacao_caso.sql
\ir ../migrations/20261120340000_exportacao_operacoes_privadas.sql
\ir ../migrations/20261120350000_grant_exportacao_teste.sql
\ir ../migrations/20261120360000_diario_acontecimento_area_em_claro.sql
\ir ../migrations/20261120370000_linha_tempo_area_acontecimento.sql
\ir ../migrations/20261120380000_linha_tempo_filtros_area_objetivo.sql
\ir ../migrations/20261120390000_exportacao_escopo_e_terceiros.sql
\ir ../migrations/20261120400000_materializar_acesso_familiar.sql
\ir ../migrations/20261120410000_grant_materializar_familiar_teste.sql
\ir ../migrations/20261120420000_cancelar_preautorizacao_revoga_acesso.sql
\ir ../migrations/20261120430000_cancelar_preautorizacao_wrapper.sql
\ir ../migrations/20261120440000_listar_preautorizacoes_familiares.sql
\ir ../migrations/20261120450000_grant_cancelar_preautorizacao_teste.sql
\ir ../migrations/20261121100000_configuracao_servicos.sql
\ir ../migrations/20261122100000_ligar_diario_linha_tempo_exportacao.sql
\ir ../migrations/20261123100000_configuracao_anamnese.sql
\ir ../migrations/20261124100000_objetivo_cuidado_visibilidade.sql
\ir ../migrations/20261124110000_plano_cuidado_familia_privada.sql
\ir ../migrations/20261124120000_documento_caso_familia_privada.sql
\ir ../migrations/20261124130000_orientacao_visibilidade.sql
\ir ../migrations/20261124140000_orientacao_familia_privada.sql
\ir ../migrations/20261125010000_anamnese_vinculo_caso.sql
\ir ../migrations/20261125020000_segredos_integracoes.sql
\ir ../migrations/20261125030000_audio_expurgo_privado.sql
\ir ../migrations/20261125030100_audio_expurgo_cron.sql
\ir ../migrations/20261125040000_plano_crise_case_manager_atual.sql
\ir ../migrations/20261125050000_agenda_google_conexao.sql
\ir ../migrations/20261125060000_configuracao_transcricao_catalogo.sql
\ir ../migrations/20261125070000_audio_expurgo_aviso_admin.sql
\ir ../migrations/20261125080000_turno_execucao_privada.sql
\ir ../migrations/20261125090000_documento_entrega_privada.sql
\ir ../migrations/20261125100000_grant_turno_execucao_teste.sql
\ir ../migrations/20261125110000_tarefa_autorizacao_somente.sql
\ir ../migrations/20261125120000_conversao_diario_tarefa_atomica.sql
\ir ../migrations/20261125130000_turno_consulta_atual.sql
\ir ../migrations/20261125140000_turno_escala_passagem.sql

-- Snapshot antes da feature: funções, ACLs e roles legados não podem mudar.
create temp table acessos_acl_antes as select oid,proowner,proacl,proconfig,prosecdef,proargtypes,prorettype from pg_proc where pronamespace in ('api'::regnamespace,'operacao'::regnamespace,'identidade'::regnamespace);
create temp table acessos_members_antes as select * from pg_auth_members;
\ir ../migrations/20261125150000_acessos_gerenciados.sql
-- A etapa nativa Auth acima é explícita; negócio/contexto/consumidores abaixo NOSUPER.
create role acessos_migrador_fixture nologin nosuperuser createrole inherit;
grant acessos_migrador_fixture to current_user with inherit false,set true;
do $$ declare dono text;begin
 for dono in select distinct r.rolname from pg_roles r where r.oid in (
 select relowner from pg_class where relnamespace in ('public'::regnamespace,'identidade'::regnamespace,'cadastro'::regnamespace,'auditoria'::regnamespace,'operacao'::regnamespace)
 union select nspowner from pg_namespace where nspname in ('public','api','identidade','cadastro','operacao','auditoria')) loop
  execute format('grant %I to acessos_migrador_fixture with inherit true,set false',dono);
 end loop;
 -- ADMIN/SET apenas roles NOSUPER necessários; nunca SET postgres.
 for dono in select rolname from pg_roles where rolname like 'ffcmapp_%' and not rolsuper and not rolbypassrls loop
  execute format('grant %I to acessos_migrador_fixture with admin true,inherit false,set false',dono);
 end loop;
end $$;
set role acessos_migrador_fixture;
do $$ begin if (select rolsuper from pg_roles where rolname=current_user) then raise exception 'MIGRADOR_SUPERUSER';end if;end $$;
\ir ../migrations/20261125160000_contexto_acessos_gerenciados.sql
\ir ../migrations/20261125170000_acessos_consumidores_autenticacao.sql
reset role;
do $$ begin
 if exists(select * from acessos_acl_antes except select oid,proowner,proacl,proconfig,prosecdef,proargtypes,prorettype from pg_proc) then raise exception 'ACL_OWNER_CONFIG_LEGADOS_ALTERADOS';end if;
 if exists(select * from acessos_members_antes except select * from pg_auth_members) then raise exception 'MEMBERSHIP_LEGADO_REMOVIDO';end if;
 if has_table_privilege('authenticated','identidade.acesso_gerenciado','SELECT,INSERT,UPDATE,DELETE') or has_function_privilege('authenticated','identidade.contexto_acesso_vigente(boolean)','EXECUTE') or has_function_privilege('authenticated','auth_privado.conta_gerenciada(uuid)','EXECUTE') or has_function_privilege('anon','api.acesso_gerenciado_privado(jsonb)','EXECUTE') or pg_has_role('authenticated','ffcmapp_acessos_owner','MEMBER') then raise exception 'ACESSO_DIRETO_NOVO';end if;
 if pg_has_role('acessos_migrador_fixture','ffcmapp_acessos_owner','SET') then raise exception 'SET_TEMPORARIO_PERSISTIU';end if;
 if has_column_privilege('ffcmapp_acessos_owner','cadastro.paciente','nome_cifrado','SELECT') then raise exception 'CONTEUDO_CLINICO_CONCEDIDO';end if;
 if exists(select 1 from information_schema.columns where table_schema='identidade' and table_name='acesso_gerenciado' and column_name ~ '(senha|password|token)') then raise exception 'SEGREDO_PERSISTIDO';end if;
end $$;
insert into identidade.configuracao_auth_nativo(dominio_workspace,google_unico_oauth_confirmado) values('example.test',true);
insert into vault.segredos_fixture values('ffcmapp.hmac.email.v1',encode(decode(repeat('41',32),'hex'),'base64')),('ffcmapp.atestado.teste',encode(decode(repeat('42',32),'hex'),'base64'));
insert into identidade.referencias_atestado_vault(referencia) values('ffcmapp.atestado.teste');
update identidade.configuracao_sistema set valor='true' where chave='ffcm.acessos.ativo';
create function public.acessos_envelope_fixture() returns jsonb language sql as $$ select '{"formato":1,"key_id":"teste","nonce":"aaaaaaaaaaaaaaaa","ciphertext":"YQ","tag":"aaaaaaaaaaaaaaaaaaaaaa"}'::jsonb $$;
create function public.acessos_claims_fixture(ator uuid,sid uuid,metodo text) returns void language sql as $$ select set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sid,'amr',jsonb_build_array(jsonb_build_object('method',metodo)))::text,true)::void $$;
create function public.acessos_hmac_fixture(email text) returns text language sql as $$ select rtrim(translate(encode(extensions.hmac(convert_to('ffcmapp:hmac:v1:email-concessao:'||email,'UTF8'),decode(repeat('41',32),'hex'),'sha256'),'base64'),'+/','-_'),'=') $$;
create function public.acessos_assinar_fixture(e jsonb,acao text) returns jsonb language plpgsql as $$
declare entrada text:=e::text;d jsonb;texto text;mac text;begin
 d:=jsonb_build_object('key_id','teste','usuario_id',auth.uid(),'session_id',auth.jwt()->>'session_id','request_id',e->>'request_id','operacao',acao,'emitido_em',clock_timestamp()-interval '1 second','expira_em',clock_timestamp()+interval '20 seconds','digest_entrada',rtrim(translate(encode(extensions.digest(convert_to(entrada,'UTF8'),'sha256'),'base64'),'+/','-_'),'='));
 texto:=d::text;mac:=rtrim(translate(encode(extensions.hmac(convert_to('ffcmapp:atestado:v1:'||texto,'UTF8'),decode(repeat('42',32),'hex'),'sha256'),'base64'),'+/','-_'),'=');
 return jsonb_build_object('entrada',e||jsonb_build_object('atestado',d||jsonb_build_object('mac',mac)),'entrada_canonica',entrada,'dados_canonicos',texto);
end $$;
create function public.acessos_pedir_fixture(e jsonb,acao text) returns jsonb language plpgsql as $$ declare t jsonb;r jsonb;begin t:=public.acessos_assinar_fixture(e,acao);set local role authenticated;r:=api.acesso_gerenciado_privado(t);reset role;return r;end $$;
-- Helpers fictícios nunca ficam disponíveis aos papéis aplicação.
revoke all on function public.acessos_assinar_fixture(jsonb,text),public.acessos_pedir_fixture(jsonb,text),public.acessos_hmac_fixture(text),public.acessos_claims_fixture(uuid,uuid,text),public.acessos_envelope_fixture() from public,anon,authenticated,service_role;

-- Administrador legado Google, com identidade institucional real da fixture.
insert into auth.users(id,email,email_confirmed_at) values('11000000-0000-4000-8000-000000000001','admin@example.test',clock_timestamp());
insert into auth.sessions values('22000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',null);
insert into auth.identities values(gen_random_uuid(),'11000000-0000-4000-8000-000000000001','google','admin-google-fixture',jsonb_build_object('sub','admin-google-fixture','email','admin@example.test','email_verified',true,'custom_claims',jsonb_build_object('hd','example.test')));
insert into public.usuario(id,perfil) values('11000000-0000-4000-8000-000000000001','administrador');
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,vinculada_em) values('33000000-0000-4000-8000-000000000001',public.acessos_envelope_fixture(),public.acessos_hmac_fixture('admin@example.test'),'administrador','google_workspace','vinculada','11000000-0000-4000-8000-000000000001','admin-google-fixture',public.acessos_envelope_fixture(),clock_timestamp());
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo) values('22000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001',1,'google_workspace');
create temp table acessos_contas_fixture(operacao_id uuid,usuario_id uuid,sid uuid,funcao text,metodo text,email text);

-- Matriz completa quatro funções × dois métodos. Exercita as RPCs reais, não aceita
-- public.usuario como prova de Auth; assinatura/Vault e provedor são fictícios.
do $$
#variable_conflict use_variable
declare funcao text;metodo text;op uuid;usuario uuid;sid uuid;email text;e jsonb;r jsonb;sessao jsonb;perfil text;req uuid;
begin
 foreach funcao in array array['administrador','case_manager','familia','profissional'] loop
  foreach metodo in array array['interno','google_workspace'] loop
   op:=gen_random_uuid();usuario:=gen_random_uuid();sid:=gen_random_uuid();email:=funcao||'-'||metodo||'@example.test';perfil:=case funcao when 'case_manager' then 'profissional' else funcao end;
   perform public.acessos_claims_fixture('11000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','oauth');
   e:=jsonb_build_object('request_id',gen_random_uuid(),'operacao_id',op,'nome_cifrado',public.acessos_envelope_fixture(),'email_cifrado',public.acessos_envelope_fixture(),'motivo_cifrado',public.acessos_envelope_fixture(),'email_hmac',public.acessos_hmac_fixture(email),'funcao',funcao,'metodo',metodo,'chave_idempotencia',op::text,'digest_idempotencia',repeat('a',43),'email_concessao_cifrado',public.acessos_envelope_fixture(),'motivo_concessao_cifrado',public.acessos_envelope_fixture());
   if metodo='interno' then e:=e||jsonb_build_object('usuario_id',usuario);else e:=e||jsonb_build_object('dominio_email','example.test');end if;
   r:=public.acessos_pedir_fixture(e,'api.reservar_acesso_gerenciado');
   if r->>'ok' is distinct from 'true' or r->>'repeticao' is distinct from 'false' then raise exception 'PRIMEIRA_RESERVA: % % %',funcao,metodo,r;end if;
   r:=public.acessos_pedir_fixture(e,'api.reservar_acesso_gerenciado');if r->>'repeticao' is distinct from 'true' then raise exception 'RESERVA_DUPLICOU';end if;
   if exists(select 1 from cadastro.acesso_paciente where usuario_id=usuario) or exists(select 1 from public.usuario where id=usuario) then raise exception 'RESERVA_CONCEDEU_CASO_OU_PERFIL';end if;
   -- Efeito do provedor reproduzido no UUID reservado, sem chamada externa.
   insert into auth.users(id,email,raw_app_meta_data) values(usuario,email,jsonb_build_object('ffcm_provisionamento_id',op));
   insert into auth.sessions values(sid,usuario,null);
   if metodo='interno' then
    -- Marker alheio nunca materializa conta de negócio, mesmo com atestado válido.
    update auth.users set raw_app_meta_data=jsonb_build_object('ffcm_provisionamento_id',gen_random_uuid()) where id=usuario;
    r:=public.acessos_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'operacao_id',op,'usuario_id',usuario,'resultado_auth','criado'),'api.confirmar_acesso_gerenciado');
    if r->>'ok'='true' or exists(select 1 from public.usuario where id=usuario) then raise exception 'MARKER_ALHEIO_ACEITO';end if;
    update auth.users set raw_app_meta_data=jsonb_build_object('ffcm_provisionamento_id',op) where id=usuario;
    r:=public.acessos_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'operacao_id',op,'usuario_id',usuario,'resultado_auth','criado'),'api.confirmar_acesso_gerenciado');
    if r#>>'{dados,estado}' is distinct from 'aguardando_confirmacao_email' then raise exception 'CONFIRMACAO_AUTH: %',r;end if;
    perform public.acessos_claims_fixture(usuario,sid,'password');
    set local role authenticated;sessao:=api.admitir_sessao_interna_nativa(gen_random_uuid());reset role;
    if sessao is not null or exists(select 1 from identidade.sessao where session_id=sid) then raise exception 'EMAIL_NAO_CONFIRMADO_ADMITIDO';end if;
    update auth.users set email_confirmed_at=clock_timestamp() where id=usuario;
    perform public.acessos_claims_fixture(usuario,sid,'otp');req:=gen_random_uuid();
    set local role authenticated;r:=api.confirmar_email_acesso_interno_nativo(req);reset role;
    if r->>'ok' is distinct from 'true' or r->>'request_id' is distinct from req::text or exists(select 1 from identidade.sessao where session_id=sid) then raise exception 'OTP_ADMITIU_SESSAO_OU_NAO_CONFIRMOU';end if;
    set local role authenticated;sessao:=api.admitir_sessao_interna_nativa(gen_random_uuid());reset role;
    if sessao is not null then raise exception 'OTP_USADO_COMO_PASSWORD';end if;
    perform public.acessos_claims_fixture(usuario,sid,'password');
    set local role authenticated;sessao:=api.admitir_sessao_interna_nativa(gen_random_uuid());reset role;
    if sessao#>>'{usuario,funcao}' is distinct from funcao or sessao#>>'{usuario,perfil}' is distinct from perfil then raise exception 'MAPEAMENTO_FUNCAO_INTERNO: %',sessao;end if;
    -- Rota técnica não é entrada interna normal, nem com sessão interna já admitida.
    set local role authenticated;r:=api.admitir_sessao_nativa(gen_random_uuid());reset role;
    if r is not null then raise exception 'INTERNO_BYPASS_TECNICO';end if;
   else
    insert into auth.identities values(gen_random_uuid(),usuario,'google','subject-'||usuario,jsonb_build_object('sub','subject-'||usuario,'email',email,'email_verified',true,'custom_claims',jsonb_build_object('hd','example.test')));
    perform public.acessos_claims_fixture(usuario,sid,'oauth');
    set local role authenticated;sessao:=api.admitir_sessao_nativa(gen_random_uuid());reset role;
    if sessao#>>'{usuario,funcao}' is distinct from funcao or sessao#>>'{usuario,perfil}' is distinct from perfil then raise exception 'MAPEAMENTO_FUNCAO_GOOGLE: %',sessao;end if;
   end if;
   if exists(select 1 from cadastro.acesso_paciente where usuario_id=usuario) then raise exception 'CRIACAO_ATRIBUIU_CASO';end if;
   set local role authenticated;r:=api.consultar_sessao_nativa(gen_random_uuid());reset role;
   if r#>>'{usuario,funcao}' is distinct from funcao then raise exception 'CONSULTA_GENERICA_PERDEU_FUNCAO';end if;
   if funcao='familia' then
    set local role authenticated;r:=api.admitir_sessao_familiar_nativa(gen_random_uuid());reset role;
    if r is not null then raise exception 'FAMILIAR_GERENCIADO_ENTROU_POR_LEGADO';end if;
    set local role authenticated;r:=api.listar_pacientes_familiar_privado(gen_random_uuid(),25,null);reset role;
    if r->>'ok' is distinct from 'true' or r#>'{dados,itens}' is distinct from '[]'::jsonb then raise exception 'FAMILIAR_SEM_CASO_NAO_VAZIO: %',r;end if;
   end if;
   if funcao<>'administrador' then
    r:=public.acessos_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid()),'api.listar_acessos_gerenciados');
    if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'FUNCAO_NAO_ADMIN_LISTOU';end if;
    r:=public.acessos_pedir_fixture(e||jsonb_build_object('request_id',gen_random_uuid(),'operacao_id',gen_random_uuid(),'chave_idempotencia',gen_random_uuid()::text),'api.reservar_acesso_gerenciado');
    if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'FUNCAO_NAO_ADMIN_CRIOU';end if;
   end if;
   insert into acessos_contas_fixture values(op,usuario,sid,funcao,metodo,email);
  end loop;
 end loop;
end $$;

-- Caso A permitido, caso B negado para CM/Prof/Familiar dos dois métodos.
insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id) values('44000000-0000-4000-8000-000000000001',public.acessos_envelope_fixture(),'11000000-0000-4000-8000-000000000001'),('44000000-0000-4000-8000-000000000002',public.acessos_envelope_fixture(),'11000000-0000-4000-8000-000000000001');
insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado) select gen_random_uuid(),'44000000-0000-4000-8000-000000000001',usuario_id,'11000000-0000-4000-8000-000000000001',public.acessos_envelope_fixture() from acessos_contas_fixture where funcao<>'administrador';
update identidade.configuracao_sistema set valor='true' where chave in ('ffcm.turno.ativo','ffcm.diario.ativo');
do $$ declare c record;r jsonb;t jsonb;alvo uuid;acao text;begin
 for c in select * from acessos_contas_fixture where funcao<>'administrador' loop
  perform public.acessos_claims_fixture(c.usuario_id,c.sid,case when c.metodo='interno' then 'password' else 'oauth' end);
  foreach alvo in array array['44000000-0000-4000-8000-000000000001'::uuid,'44000000-0000-4000-8000-000000000002'::uuid] loop
   if c.funcao='familia' then
    set local role authenticated;r:=api.consultar_paciente_familiar_privado(gen_random_uuid(),alvo);reset role;
   else
    t:=public.acessos_assinar_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',alvo),'api.consultar_turno');
    set local role authenticated;r:=api.turno_privado(t);reset role;
   end if;
   if alvo='44000000-0000-4000-8000-000000000001' and r->>'ok' is distinct from 'true' then raise exception 'VINCULO_A_NEGADO: % % %',c.funcao,c.metodo,r;end if;
   if alvo='44000000-0000-4000-8000-000000000002' and r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'CASO_B_ACEITO';end if;
  end loop;
  if c.funcao='familia' then
   -- Os filtros RLS mistos precisam aceitar família gerenciada, não apenas a RPC.
   foreach acao in array array['api.ler_diario','api.ler_linha_tempo','api.ler_documentos','api.ler_orientacoes','api.ler_plano_cuidado'] loop
    t:=public.acessos_assinar_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id','44000000-0000-4000-8000-000000000001')||case when acao='api.ler_plano_cuidado' then jsonb_build_object('limite',20,'cursor',null) else '{}'::jsonb end,acao);
    set local role authenticated;
    case acao when 'api.ler_diario' then r:=api.diario_privado(t);when 'api.ler_linha_tempo' then r:=api.linha_tempo_privado(t);when 'api.ler_documentos' then r:=api.documento_privado(t);when 'api.ler_orientacoes' then r:=api.orientacao_privado(t);else r:=api.plano_cuidado_privado(t);end case;
    reset role;
    if r->>'ok' is distinct from 'true' then raise exception 'FAMILIA_GERENCIADA_RLS: % % %',c.metodo,acao,r;end if;
   end loop;
  end if;
  update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id='11000000-0000-4000-8000-000000000001',motivo_revogacao_cifrado=public.acessos_envelope_fixture() where usuario_id=c.usuario_id and paciente_id='44000000-0000-4000-8000-000000000001';
  if c.funcao='familia' then set local role authenticated;r:=api.consultar_paciente_familiar_privado(gen_random_uuid(),'44000000-0000-4000-8000-000000000001');reset role;
  else t:=public.acessos_assinar_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id','44000000-0000-4000-8000-000000000001'),'api.consultar_turno');set local role authenticated;r:=api.turno_privado(t);reset role;end if;
  if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'VINCULO_REVOGADO_ACEITO';end if;
 end loop;
end $$;

-- Regressões R-04/R-05: papel não administrador e contexto recusado nunca ok:true.
do $$ declare c record;t jsonb;r jsonb;begin
 for c in select * from acessos_contas_fixture where funcao in ('case_manager','profissional','familia') loop
  perform public.acessos_claims_fixture(c.usuario_id,c.sid,case when c.metodo='interno' then 'password' else 'oauth' end);
  t:=public.acessos_assinar_fixture(jsonb_build_object('request_id',gen_random_uuid()),'api.consultar_expurgo_audio');
  set local role authenticated;r:=api.consultar_expurgo_audio(t);reset role;
  if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'R04_EXPURGO_GLOBAL_PAPEL_INDEVIDO';end if;
  perform public.acessos_claims_fixture(c.usuario_id,c.sid,case when c.metodo='interno' then 'oauth' else 'password' end);
  set local role authenticated;r:=api.listar_pacientes_familiar_privado(gen_random_uuid(),25,null);reset role;
  if r->>'ok' is distinct from 'false' or r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'R05_CONTEXTO_NULL_OK_TRUE';end if;
 end loop;
end $$;

-- Mudança externa do login não adota e-mail novo; flags de gestão não trancam Auth aprovado.
do $$ declare c record;r jsonb;begin
 for c in select * from acessos_contas_fixture loop
  perform public.acessos_claims_fixture(c.usuario_id,c.sid,case when c.metodo='interno' then 'password' else 'oauth' end);
  if c.metodo='interno' then update auth.users set email='outro-'||c.email where id=c.usuario_id;
  else update auth.identities set identity_data=jsonb_set(identity_data,'{email}',to_jsonb('outro-'||c.email)) where user_id=c.usuario_id;end if;
  set local role authenticated;r:=api.consultar_sessao_nativa(gen_random_uuid());reset role;
  if r is not null then raise exception 'LOGIN_ALTERADO_ADOTADO';end if;
  r:=public.acessos_assinar_fixture(jsonb_build_object('request_id',gen_random_uuid()),'api.consultar_expurgo_audio');
  set local role authenticated;r:=api.consultar_expurgo_audio(r);reset role;
  if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'FALLBACK_LEGADO_ADOTOU_LOGIN_ALTERADO';end if;
  if c.metodo='interno' then update auth.users set email=c.email where id=c.usuario_id;
  else update auth.identities set identity_data=jsonb_set(identity_data,'{email}',to_jsonb(c.email)) where user_id=c.usuario_id;end if;
  update identidade.configuracao_sistema set valor='false' where chave='ffcm.acessos.ativo';
  set local role authenticated;r:=api.consultar_sessao_nativa(gen_random_uuid());reset role;
  if r#>>'{usuario,id}' is distinct from c.usuario_id::text then raise exception 'FLAG_GESTAO_TRANCOU_AUTH';end if;
  update identidade.configuracao_sistema set valor='true' where chave='ffcm.acessos.ativo';
  -- Expiração e revogação são conferidas em cada consulta, antes de recibos.
  update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=c.sid;
  set local role authenticated;r:=api.consultar_sessao_nativa(gen_random_uuid());reset role;
  if r is not null then raise exception 'AUTH_EXPIRADO_ADMITIDO';end if;
  update auth.sessions set not_after=null where id=c.sid;
  update identidade.sessao set encerrada_em=clock_timestamp() where session_id=c.sid;
  set local role authenticated;r:=api.consultar_sessao_nativa(gen_random_uuid());reset role;
  if r is not null then raise exception 'SESSAO_ENCERRADA_ACEITA';end if;
 end loop;
end $$;

-- Reautorização antes do recibo administrativo e colisão sem sobrescrever identidade.
do $$ declare op uuid:=gen_random_uuid();alvo uuid:=gen_random_uuid();e jsonb;r jsonb;antes bigint;begin
 perform public.acessos_claims_fixture('11000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','oauth');
 e:=jsonb_build_object('request_id',gen_random_uuid(),'operacao_id',op,'usuario_id',alvo,'nome_cifrado',public.acessos_envelope_fixture(),'email_cifrado',public.acessos_envelope_fixture(),'motivo_cifrado',public.acessos_envelope_fixture(),'email_hmac',public.acessos_hmac_fixture('pendente@example.test'),'funcao','familia','metodo','interno','chave_idempotencia',op::text,'digest_idempotencia',repeat('b',43));
 r:=public.acessos_pedir_fixture(e,'api.reservar_acesso_gerenciado');if r->>'ok' is distinct from 'true' then raise exception 'RESERVA_PENDENTE_FALHOU';end if;
 r:=public.acessos_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'operacao_id',op),'api.consultar_operacao_acesso');
 if r#>>'{dados,estado}' is distinct from 'reservado' or r#>>'{dados,usuario_id}' is distinct from alvo::text then raise exception 'RESULTADO_PERDIDO_NAO_RECUPERAVEL';end if;
 r:=public.acessos_pedir_fixture(e||jsonb_build_object('operacao_id',gen_random_uuid(),'usuario_id',gen_random_uuid(),'chave_idempotencia',gen_random_uuid()::text),'api.reservar_acesso_gerenciado');
 if r->>'ok'='true' or exists(select 1 from public.usuario where id=alvo) then raise exception 'COLISAO_ALTEROU_CONTA';end if;
 update public.usuario set ativo=false where id='11000000-0000-4000-8000-000000000001';
 r:=public.acessos_pedir_fixture(e,'api.reservar_acesso_gerenciado');if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'REPLAY_ADMIN_REVOGADO';end if;
 update public.usuario set ativo=true where id='11000000-0000-4000-8000-000000000001';
end $$;

-- R-07: somente falha definitiva confirmada libera o login para NOVA operação manual.
do $$ declare op uuid:=gen_random_uuid();alvo uuid:=gen_random_uuid();novo uuid:=gen_random_uuid();e jsonb;r jsonb;begin
 perform public.acessos_claims_fixture('11000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','oauth');
 e:=jsonb_build_object('request_id',gen_random_uuid(),'operacao_id',op,'usuario_id',alvo,'nome_cifrado',public.acessos_envelope_fixture(),'email_cifrado',public.acessos_envelope_fixture(),'motivo_cifrado',public.acessos_envelope_fixture(),'email_hmac',public.acessos_hmac_fixture('recusado@example.test'),'funcao','familia','metodo','interno','chave_idempotencia',op::text,'digest_idempotencia',repeat('r',43));
 r:=public.acessos_pedir_fixture(e,'api.reservar_acesso_gerenciado');if r->>'ok' is distinct from 'true' then raise exception 'R07_RESERVA';end if;
 -- Timeout/ausência do UUID não é recusa: consulta mantém reservado e unicidade.
 r:=public.acessos_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'operacao_id',op),'api.consultar_operacao_acesso');if r#>>'{dados,estado}' is distinct from 'reservado' then raise exception 'R07_INCERTO_VIROU_FALHA';end if;
 r:=public.acessos_pedir_fixture(e||jsonb_build_object('operacao_id',novo,'usuario_id',gen_random_uuid(),'chave_idempotencia',novo::text),'api.reservar_acesso_gerenciado');if r->>'ok'='true' then raise exception 'R07_INCERTO_LIBEROU_EMAIL';end if;
 r:=public.acessos_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'operacao_id',op,'usuario_id',alvo,'resultado_auth','recusado'),'api.confirmar_acesso_gerenciado');if r#>>'{dados,estado}' is distinct from 'falha_confirmada' or exists(select 1 from public.usuario where id=alvo) then raise exception 'R07_FALHA_CONFIRMADA';end if;
 r:=public.acessos_pedir_fixture(e,'api.reservar_acesso_gerenciado');if r->>'repeticao' is distinct from 'true' or r#>>'{dados,estado}' is distinct from 'falha_confirmada' then raise exception 'R07_REPLAY_REABRIU';end if;
 r:=public.acessos_pedir_fixture(e||jsonb_build_object('operacao_id',novo,'usuario_id',gen_random_uuid(),'chave_idempotencia',novo::text),'api.reservar_acesso_gerenciado');if r->>'ok' is distinct from 'true' or r->>'repeticao' is distinct from 'false' then raise exception 'R07_NOVA_OPERACAO_BLOQUEADA';end if;
 -- UUID efetivamente criado não pode ser marcado recusado nem liberar o e-mail.
 alvo:=(r#>>'{dados,usuario_id}')::uuid;insert into auth.users(id,email,raw_app_meta_data) values(alvo,'recusado@example.test',jsonb_build_object('ffcm_provisionamento_id',novo));
 r:=public.acessos_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'operacao_id',novo,'usuario_id',alvo,'resultado_auth','recusado'),'api.confirmar_acesso_gerenciado');if r->>'ok'='true' then raise exception 'R07_AUTH_EXISTENTE_MARCADO_RECUSADO';end if;
end $$;

-- Auditoria suprimida aborta transação; não deixa reserva nem concede Auth.
create function public.acessos_suprimir_auditoria_fixture() returns trigger language plpgsql as $$ begin if current_setting('fixture.acessos_suprimir',true)='sim' then return null;end if;return new;end $$;
create trigger acessos_suprimir_auditoria before insert on auditoria.evento for each row execute function public.acessos_suprimir_auditoria_fixture();
do $$ declare op uuid:=gen_random_uuid();r jsonb;begin
 perform public.acessos_claims_fixture('11000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','oauth');perform set_config('fixture.acessos_suprimir','sim',true);
 begin
  r:=public.acessos_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'operacao_id',op,'usuario_id',gen_random_uuid(),'nome_cifrado',public.acessos_envelope_fixture(),'email_cifrado',public.acessos_envelope_fixture(),'motivo_cifrado',public.acessos_envelope_fixture(),'email_hmac',public.acessos_hmac_fixture('audit@example.test'),'funcao','familia','metodo','interno','chave_idempotencia',op::text,'digest_idempotencia',repeat('c',43)),'api.reservar_acesso_gerenciado');
  raise exception 'AUDITORIA_SUPRIMIDA_ACEITA';
 exception when no_data_found then if sqlerrm<>'AUDITORIA_NAO_INSERIDA' then raise;end if;end;
 if exists(select 1 from identidade.acesso_gerenciado where operacao_id=op) then raise exception 'RESERVA_SEM_AUDITORIA';end if;
end $$;
-- Limite explícito: concorrência do Auth, e-mail real, OAuth real e gates legados
-- após as migrations novas continuam NÃO EXECUTADOS. Este harness não os certifica.
