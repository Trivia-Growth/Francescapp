\set ON_ERROR_STOP on
-- 20261128270000_convergencia_df023_concessao_cofre sobre o ESQUEMA DE PRODUÇÃO restaurado.
-- Executar com:
--   scripts/ensaiar-esquema-producao-local.sh ensaiar <dump> supabase/tests/convergencia_df023_producao_local.sql
-- Fase A (contraprova): o corpo vivo de produção recusa a concessão com reserva e a conta
-- interna gerenciada. Fase B: a migration como `postgres`, positivos e negativos, reexecução e
-- guarda. Dados fictícios; Vault real com chaves fictícias; Auth com stand-ins mínimos.

-- 0. Os corpos de destino são reconstruíveis a partir das fontes versionadas.
create temp table cf_corpo(nome text primary key, corpo text);
create temp table cf_arquivo(linha text);
create function pg_temp.cf_ler(arquivo text) returns text language plpgsql as $$
declare t text; begin
 truncate cf_arquivo;
 execute format($c$copy cf_arquivo from program %L with (format text, delimiter E'\x01')$c$, 'cat /repo/supabase/migrations/'||arquivo||' | sed -e ''s/\\/\\\\/g''');
 select string_agg(linha, E'\n') into t from (select linha, row_number() over () n from cf_arquivo) s;
 return t||E'\n';
end $$;
create function pg_temp.cf_corpo_funcao(t text, assinatura text) returns text language plpgsql as $cf$
declare i int; j int; k int; resto text; begin
 i:=strpos(t, assinatura); resto:=substr(t,i); j:=strpos(resto,'$$'); resto:=substr(resto,j+2); k:=strpos(resto,'$$');
 return substr(resto,1,k-1);
end $cf$;
create function pg_temp.cf_fragmentos(t text, nome text) returns text[] language plpgsql as $$
declare i int; resto text; begin
 i:=strpos(t, format($f$select pg_temp.substituir_autenticador('%s'$f$, nome)); resto:=substr(t,i);
 resto:=substr(resto,1,strpos(substr(resto,2),E'\n-- ')+1);
 return (select array_agg(p order by n) from (select p, n from unnest(string_to_array(resto,'$fragmento$')) with ordinality u(p,n) where n%2=0) s);
end $$;
create function pg_temp.cf_aplicar(b text, f text[]) returns text language plpgsql as $$
declare x int:=1; begin
 while x < array_length(f,1) loop
  if (length(b)-length(replace(b,f[x],'')))/length(f[x]) <> 1 then raise exception 'ANCORA_NAO_UNICA'; end if;
  b:=replace(b,f[x],f[x+1]); x:=x+2;
 end loop; return b;
end $$;
do $cf$
declare df023 text; c220 text; c160 text; conv text; alvo_c text; alvo_s text; f text[];
begin
 df023:=pg_temp.cf_ler('20261125170000_acessos_consumidores_autenticacao.sql');
 c220:=pg_temp.cf_corpo_funcao(pg_temp.cf_ler('20261112220000_auditoria_vinculos_auth_nao_admitido.sql'),'function operacao.conceder_acesso_paciente_privado');
 if md5(c220)<>'2a6759ee0abf06037afc8a6c82018005' then raise exception 'BASE_220_DIVERGENTE: %',md5(c220); end if;
 alvo_c:=pg_temp.cf_aplicar(c220,pg_temp.cf_fragmentos(df023,'operacao.conceder_acesso_paciente_privado(jsonb)'));
 if md5(alvo_c)<>'6cbb09b406a4586968885a132ffcea8b' then raise exception 'DF023_CONCEDER_DIVERGENTE: %',md5(alvo_c); end if;
 alvo_c:=replace(alvo_c,$a$ perform 1 from public.usuario u where u.id=destinatario and u.ativo and u.perfil='profissional' for update;$a$,
  $a$ perform 1 from public.usuario u where u.id=destinatario and u.ativo
   and u.perfil in ('profissional','administrador') for update;$a$);
 c160:=pg_temp.cf_corpo_funcao(pg_temp.cf_ler('20261124160000_segredos_integracoes_cofre_gerenciado.sql'),'function operacao.segredos_integracoes_operacao_privada');
 if md5(c160)<>'8684da5c2d6cfa09614aae1127669122' then raise exception 'BASE_160_DIVERGENTE'; end if;
 alvo_s:=pg_temp.cf_aplicar(c160,pg_temp.cf_fragmentos(df023,'operacao.segredos_integracoes_operacao_privada(jsonb)'));
 conv:=pg_temp.cf_ler('20261128270000_convergencia_df023_concessao_cofre.sql');
 if pg_temp.cf_corpo_funcao(replace(conv,'$fn$','$$'),'function operacao.conceder_acesso_paciente_privado(p_transporte jsonb)') is distinct from alvo_c
  or pg_temp.cf_corpo_funcao(replace(conv,'$fn$','$$'),'function operacao.segredos_integracoes_operacao_privada(p_transporte jsonb)') is distinct from alvo_s then
  raise exception 'MIGRATION_NAO_E_A_RECONSTRUCAO';
 end if;
 if md5(alvo_c)<>'83e3e5cbe3a16c645d5935af17087ea3' or md5(alvo_s)<>'2afd7dcbac1e89eecd00264f2376e7fe' then raise exception 'HASH_ALVO_INESPERADO'; end if;
 if md5((select prosrc from pg_proc where oid='operacao.conceder_acesso_paciente_privado(jsonb)'::regprocedure))<>'34e955842072e19ad68f52c54f9d41db'
  or md5((select prosrc from pg_proc where oid='operacao.segredos_integracoes_operacao_privada(jsonb)'::regprocedure))<>'8684da5c2d6cfa09614aae1127669122' then
  raise exception 'PONTO_DE_PARTIDA_NAO_E_PRODUCAO';
 end if;
 raise notice 'CORPOS_RECONSTRUIDOS_OK';
end $cf$;

-- Fixture: chaves fictícias no Vault real, domínio, lote de teste.
insert into identidade.configuracao_auth_nativo(dominio_workspace,google_unico_oauth_confirmado) values('example.test',true);
select vault.create_secret(encode(decode(repeat('42',32),'hex'),'base64'),'ffcmapp.atestado.teste','fixture') is not null;
select vault.create_secret(encode(decode(repeat('41',32),'hex'),'base64'),'ffcmapp.hmac.email.v1','fixture') is not null;
insert into identidade.referencias_atestado_vault(referencia) values('ffcmapp.atestado.teste');
insert into identidade.segredos_integracoes(chave) values('fixture.integracao');

create function public.cf_env() returns jsonb language sql as $$ select '{"formato":1,"key_id":"teste","nonce":"aaaaaaaaaaaaaaaa","ciphertext":"YQ","tag":"aaaaaaaaaaaaaaaaaaaaaa"}'::jsonb $$;
create function public.cf_claims(ator uuid,sid uuid,metodo text) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub',ator,'role','authenticated','session_id',sid,'amr',jsonb_build_array(jsonb_build_object('method',metodo)))::text,true)::void $$;
create function public.cf_assinar(e jsonb,acao text) returns jsonb language plpgsql as $$
declare entrada text:=e::text;d jsonb;texto text;mac text;begin
 d:=jsonb_build_object('key_id','teste','usuario_id',auth.uid(),'session_id',auth.jwt()->>'session_id','request_id',e->>'request_id','operacao',acao,'emitido_em',clock_timestamp()-interval '1 second','expira_em',clock_timestamp()+interval '20 seconds','digest_entrada',rtrim(translate(encode(extensions.digest(convert_to(entrada,'UTF8'),'sha256'),'base64'),'+/','-_'),'='));
 texto:=d::text;mac:=rtrim(translate(encode(extensions.hmac(convert_to('ffcmapp:atestado:v1:'||texto,'UTF8'),decode(repeat('42',32),'hex'),'sha256'),'base64'),'+/','-_'),'=');
 return jsonb_build_object('entrada',e||jsonb_build_object('atestado',d||jsonb_build_object('mac',mac)),'entrada_canonica',entrada,'dados_canonicos',texto);
end $$;
-- Ator Google legado (concessão google_workspace) ou interno gerenciado (DF-023).
create function public.cf_ator(id uuid,sid uuid,perfil text,metodo text) returns void language plpgsql as $$
#variable_conflict use_variable
declare c uuid:=gen_random_uuid(); op uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email,email_confirmed_at,aud,role,raw_app_meta_data) values(id,id::text||'@example.test',clock_timestamp(),'authenticated','authenticated',
  case when metodo='interno' then jsonb_build_object('ffcm_provisionamento_id',op) else '{}'::jsonb end);
 insert into auth.sessions(id,user_id) values(sid,id);
 if perfil is null then return; end if;
 insert into public.usuario(id,perfil) values(id,perfil);
 if metodo='google_workspace' then
  insert into auth.identities(provider_id,user_id,identity_data,provider) values('g-'||id,id,
   jsonb_build_object('sub','g-'||id,'email',id::text||'@example.test','email_verified',true,'custom_claims',jsonb_build_object('hd','example.test')),'google');
  insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,vinculada_em)
   values(c,public.cf_env(),md5(id::text),perfil,'google_workspace','vinculada',id,'g-'||id,public.cf_env(),clock_timestamp());
 else
  insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,motivo_cifrado,vinculada_em)
   values(c,public.cf_env(),md5(id::text),perfil,'interno','vinculada',id,public.cf_env(),clock_timestamp());
  insert into identidade.acesso_gerenciado(operacao_id,usuario_id,nome_cifrado,email_cifrado,motivo_cifrado,email_hmac,funcao,metodo,estado,concessao_id,criado_por_usuario_id,chave_idempotencia,digest_idempotencia)
   values(op,id,public.cf_env(),public.cf_env(),public.cf_env(),identidade.email_auth_hmac_nativo(id),perfil,'interno','ativo',c,id,'fixture-'||id,repeat('a',43));
 end if;
 insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo) values(sid,id,c,1,metodo);
end $$;
create function public.cf_conceder(ator uuid,sid uuid,amr text,paciente uuid,destinatario uuid,epoca bigint,com_reserva boolean) returns jsonb language plpgsql as $$
declare reserva uuid:=gen_random_uuid(); e jsonb; t jsonb; r jsonb; estado text;
begin
 perform public.cf_claims(ator,sid,amr);
 -- epoca 0: envia reserva inexistente (quem não tem perfil não consegue reservar).
 if com_reserva and epoca=0 then epoca:=1;
 elsif com_reserva then
  estado:=operacao.reservar_concessao_acesso_profissional_privado(ator,epoca,reserva,paciente);
  if estado<>'aberta' then raise exception 'FIXTURE_RESERVA: %',estado; end if;
 end if;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'acesso_id',gen_random_uuid(),'usuario_id',destinatario,
  'auditoria_id',gen_random_uuid(),'chave_idempotencia','conceder-'||reserva,'digest_idempotencia',repeat('a',43),'motivo',public.cf_env());
 if com_reserva then e:=e||jsonb_build_object('reserva_id',reserva,'geracao_reserva',epoca); end if;
 t:=public.cf_assinar(e,'api.conceder_acesso_paciente');
 set local role authenticated; r:=api.conceder_acesso_paciente_privado(t); reset role;
 return r||jsonb_build_object('cf_reserva',reserva);
exception when insufficient_privilege then
 reset role; return jsonb_build_object('cf_excecao',sqlstate,'cf_mensagem',sqlerrm,'cf_reserva',reserva);
end $$;
create function public.cf_segredo(ator uuid,sid uuid,amr text,acao text,versao integer) returns jsonb language plpgsql as $$
declare e jsonb; t jsonb; r jsonb;
begin
 perform public.cf_claims(ator,sid,amr);
 if acao='api.listar_segredos_integracoes' then e:=jsonb_build_object('request_id',gen_random_uuid());
 else e:=jsonb_build_object('request_id',gen_random_uuid(),'segredo_chave','fixture.integracao','valor','valor-ficticio-'||versao,
  'versao_esperada',versao,'chave_idempotencia','segredo-'||gen_random_uuid(),'digest_idempotencia',repeat('b',43),'auditoria_id',gen_random_uuid());
 end if;
 t:=public.cf_assinar(e,acao);
 set local role authenticated; r:=api.segredos_integracoes_privado(t); reset role;
 return r;
exception when insufficient_privilege then
 reset role; return jsonb_build_object('cf_excecao',sqlstate,'cf_mensagem',sqlerrm);
end $$;
revoke all on function public.cf_env(),public.cf_claims(uuid,uuid,text),public.cf_assinar(jsonb,text),public.cf_ator(uuid,uuid,text,text),
 public.cf_conceder(uuid,uuid,text,uuid,uuid,bigint,boolean),public.cf_segredo(uuid,uuid,text,text,integer) from public,anon,authenticated,service_role;

-- Atores: admin Google (A), profissional Google (P), admin interno gerenciado (M), Auth sem perfil (X).
select public.cf_ator('11000000-0000-4000-8000-00000000000a','22000000-0000-4000-8000-00000000000a','administrador','google_workspace');
select public.cf_ator('11000000-0000-4000-8000-00000000000b','22000000-0000-4000-8000-00000000000b','profissional','google_workspace');
select public.cf_ator('11000000-0000-4000-8000-00000000000c','22000000-0000-4000-8000-00000000000c','profissional','google_workspace');
select public.cf_ator('11000000-0000-4000-8000-00000000000d','22000000-0000-4000-8000-00000000000d','administrador','interno');
-- Uma reserva por ator: a barreira exige reconhecimento antes de reservar de novo.
select public.cf_ator('11000000-0000-4000-8000-00000000000f','22000000-0000-4000-8000-00000000000f','administrador','google_workspace');
select public.cf_ator('11000000-0000-4000-8000-000000000010','22000000-0000-4000-8000-000000000010','administrador','google_workspace');
select public.cf_ator('11000000-0000-4000-8000-0000000000ee','22000000-0000-4000-8000-0000000000ee',null,null);
insert into operacao.lote_teste(id,identificacao,responsavel_usuario_id) values('45000000-0000-4000-8000-000000000001','lote-fixture','11000000-0000-4000-8000-00000000000a');
insert into operacao.configuracao_lote_teste(lote_teste_id) values('45000000-0000-4000-8000-000000000001');
insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id) values
 ('44000000-0000-4000-8000-000000000001',public.cf_env(),'11000000-0000-4000-8000-00000000000a'),
 ('44000000-0000-4000-8000-000000000002',public.cf_env(),'11000000-0000-4000-8000-00000000000a');

-- FASE A — contraprova no corpo vivo de produção.
do $$
declare r jsonb; adm uuid:='11000000-0000-4000-8000-00000000000a'; sadm uuid:='22000000-0000-4000-8000-00000000000a';
 ger uuid:='11000000-0000-4000-8000-00000000000d'; sger uuid:='22000000-0000-4000-8000-00000000000d';
begin
 -- A conta interna gerenciada é admitida pelo contexto vigente (prova que a fixture é válida)...
 perform public.cf_claims(ger,sger,'password');
 if identidade.contexto_acesso_vigente(false)->>'perfil' is distinct from 'administrador' then raise exception 'FIXTURE_GERENCIADA_INVALIDA'; end if;
 -- ...mas o corpo vivo não a conhece: grava segredo negado.
 r:=public.cf_segredo(ger,sger,'password','api.gravar_segredos_integracoes',0);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'A1_ESPERAVA_NEGADO: %',r; end if;
 -- A borda envia reserva_id/geracao_reserva: o validador do transporte recusa com 42501.
 r:=public.cf_conceder(adm,sadm,'oauth','44000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-00000000000b',1,true);
 if r->>'cf_excecao' is distinct from '42501' then raise exception 'A2_ESPERAVA_42501: %',r; end if;
 -- E concede SEM reserva, contornando a barreira.
 r:=public.cf_conceder(adm,sadm,'oauth','44000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-00000000000b',1,false);
 if r->>'ok' is distinct from 'true' then raise exception 'A3_ESPERAVA_SEM_BARREIRA: %',r; end if;
 delete from cadastro.acesso_paciente where paciente_id='44000000-0000-4000-8000-000000000002';
 raise notice 'FASE_A_CONTRAPROVA_OK';
end $$;
-- FASE B — a migration como postgres (NOSUPERUSER).
\c - postgres
do $$ begin if (select rolsuper from pg_roles where rolname=current_user) then raise exception 'MIGRADOR_SUPERUSUARIO'; end if; end $$;
\i /repo/supabase/migrations/20261128270000_convergencia_df023_concessao_cofre.sql
-- Reexecução é no-op.
\i /repo/supabase/migrations/20261128270000_convergencia_df023_concessao_cofre.sql
\c - supabase_admin
do $$
declare r jsonb; adm uuid:='11000000-0000-4000-8000-00000000000a'; sadm uuid:='22000000-0000-4000-8000-00000000000a';
 pro uuid:='11000000-0000-4000-8000-00000000000b'; spro uuid:='22000000-0000-4000-8000-00000000000b';
 ger uuid:='11000000-0000-4000-8000-00000000000d'; sger uuid:='22000000-0000-4000-8000-00000000000d';
 epoca bigint; cofre uuid;
begin
 -- B1 admin Google concede com reserva: concedido, reserva confirmada, auditoria permitida.
 select coalesce(max(b.epoca),1) into epoca from operacao.barreira_concessao_acesso_profissional b where ator_usuario_id=adm;
 r:=public.cf_conceder(adm,sadm,'oauth','44000000-0000-4000-8000-000000000001',pro,epoca,true);
 if r->>'ok' is distinct from 'true'
  or not exists(select 1 from operacao.reserva_concessao_acesso_profissional where id=(r->>'cf_reserva')::uuid and estado='confirmada')
  or not exists(select 1 from auditoria.evento where request_id=(r->>'request_id')::uuid and resultado='permitido') then raise exception 'B1_CONCESSAO_COM_RESERVA: %',r; end if;
 -- B2 sem reserva: o transporte volta a exigir a barreira.
 r:=public.cf_conceder(adm,sadm,'oauth','44000000-0000-4000-8000-000000000002',pro,epoca,false);
 if r->>'cf_excecao' is distinct from '42501' then raise exception 'B2_SEM_RESERVA_ACEITO: %',r; end if;
 -- B3 admin interno gerenciado (DF-023) concede.
 select coalesce(max(b.epoca),1) into epoca from operacao.barreira_concessao_acesso_profissional b where ator_usuario_id=ger;
 r:=public.cf_conceder(ger,sger,'password','44000000-0000-4000-8000-000000000002',pro,epoca,true);
 if r->>'ok' is distinct from 'true' then raise exception 'B3_GERENCIADO_NEGADO: %',r; end if;
 -- B4 profissional não concede; negado e auditado.
 r:=public.cf_conceder(pro,spro,'oauth','44000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-00000000000c',1,true);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao'
  or not exists(select 1 from auditoria.evento where request_id=(r->>'request_id')::uuid and resultado='negado' and ator_usuario_id=pro) then raise exception 'B4_PROFISSIONAL_CONCEDE: %',r; end if;
 -- B5 método trocado no JWT: negado.
 r:=public.cf_conceder('11000000-0000-4000-8000-00000000000f','22000000-0000-4000-8000-00000000000f','password','44000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-00000000000c',1,true);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'B5_METODO_TROCADO_ACEITO: %',r; end if;
 -- B6 Auth sem perfil: negado e auditado pelo id Auth (comportamento da 220000 devolvido).
 r:=public.cf_conceder('11000000-0000-4000-8000-0000000000ee','22000000-0000-4000-8000-0000000000ee','oauth','44000000-0000-4000-8000-000000000001',pro,0,true);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao'
  or not exists(select 1 from auditoria.evento where ator_auth_id='11000000-0000-4000-8000-0000000000ee' and resultado='negado') then raise exception 'B6_AUTH_SEM_PERFIL: %',r; end if;
 -- B7 cofre: admin interno gerenciado grava; segunda gravação reaproveita o mesmo registro (20261124160000).
 r:=public.cf_segredo(ger,sger,'password','api.gravar_segredos_integracoes',0);
 if r->>'ok' is distinct from 'true' or (r#>>'{dados,versao}')::int<>1 then raise exception 'B7_GERENCIADO_COFRE: %',r; end if;
 select id into cofre from vault.secrets where name='fixture.integracao';
 r:=public.cf_segredo(adm,sadm,'oauth','api.gravar_segredos_integracoes',1);
 if r->>'ok' is distinct from 'true' or (select count(*) from vault.secrets where name='fixture.integracao')<>1
  or (select decrypted_secret from vault.decrypted_secrets where id=cofre)<>'valor-ficticio-1' then raise exception 'B7_SEGUNDA_GRAVACAO: %',r; end if;
 r:=public.cf_segredo(adm,sadm,'oauth','api.listar_segredos_integracoes',0);
 if r->>'ok' is distinct from 'true' or (r#>>'{dados,0,versao}')::int<>2 then raise exception 'B7_LISTAR: %',r; end if;
 -- B8 profissional não lê nem grava o cofre.
 r:=public.cf_segredo(pro,spro,'oauth','api.listar_segredos_integracoes',0);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'B8_PROFISSIONAL_LISTA: %',r; end if;
 -- B9 anon e authenticated não alcançam as operações privadas diretamente.
 if has_function_privilege('authenticated','operacao.conceder_acesso_paciente_privado(jsonb)','execute')
  or has_function_privilege('authenticated','operacao.segredos_integracoes_operacao_privada(jsonb)','execute')
  or has_function_privilege('anon','api.conceder_acesso_paciente_privado(jsonb)','execute')
  or has_function_privilege('anon','api.segredos_integracoes_privado(jsonb)','execute') then raise exception 'B9_ACESSO_DIRETO'; end if;
 raise notice 'FASE_B_POSITIVOS_E_NEGATIVOS_OK';
end $$;

-- B10 administrador como destinatário: a função aceita, a RLS (sem 20261128240000) ainda recusa.
do $$ declare r jsonb; adm uuid:='11000000-0000-4000-8000-000000000010'; begin
 r:=public.cf_conceder(adm,'22000000-0000-4000-8000-000000000010','oauth','44000000-0000-4000-8000-000000000002',adm,1,true);
 if r->>'cf_mensagem' not like '%row-level security%' then raise exception 'B10_ESPERAVA_RLS: %',r; end if;
 raise notice 'B10_ADMIN_DESTINATARIO_DEPENDE_DA_240_OK';
end $$;

-- B11 guarda: com outro corpo vivo, a migration aborta inteira.
do $$ declare d text:=pg_get_functiondef('operacao.segredos_integracoes_operacao_privada(jsonb)'::regprocedure);
 s text:=(select prosrc from pg_proc where oid='operacao.segredos_integracoes_operacao_privada(jsonb)'::regprocedure);
begin execute replace(d,s,s||'-- divergente'); end $$;
\c - postgres
\set ON_ERROR_STOP off
\i /repo/supabase/migrations/20261128270000_convergencia_df023_concessao_cofre.sql
\set ON_ERROR_STOP on
\c - supabase_admin
do $$ begin
 if (select prosrc from pg_proc where oid='operacao.segredos_integracoes_operacao_privada(jsonb)'::regprocedure) not like '%-- divergente' then raise exception 'B11_GUARDA_SOBRESCREVEU'; end if;
 raise notice 'B11_GUARDA_FONTE_DIVERGENTE_OK';
end $$;
