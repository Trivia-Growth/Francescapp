\set ON_ERROR_STOP on
-- WRITTEN, NOT EXECUTED. Full real SQL authority helper; synthetic Auth/Vault/Storage.
-- Loading prior fixture preserves both authentication methods and existing regressions.
\ir acessos_gerenciados_local.sql
update identidade.sessao set encerrada_em=null,revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id in(select usuario_id from acessos_contas_fixture);
update cadastro.acesso_paciente set revogada_em=null,revogado_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id in(select usuario_id from acessos_contas_fixture);
create schema storage;
create table storage.buckets(id text primary key,name text not null,public boolean not null,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,metadata jsonb,unique(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select,insert,update,delete on storage.objects to authenticated;
-- Mimic an unrelated permissive policy: new restrictive policies must still isolate bucket.
create policy fixture_storage_ampla on storage.objects to authenticated using(true) with check(true);
create temp table turno_core_acl_antes as select oid,proowner,proacl,prosecdef,proconfig from pg_proc where pronamespace in('api'::regnamespace,'identidade'::regnamespace,'operacao'::regnamespace);
create temp table turno_core_members_antes as select * from pg_auth_members;
-- Installation without SUPERUSER; explicit table/schema ownership inherited only in fixture.
create role turno_core_migrador_fixture nologin nosuperuser createrole inherit;
grant turno_core_migrador_fixture to current_user with inherit false,set true;
do $$ declare dono text;begin
 for dono in select distinct r.rolname from pg_roles r where r.oid in(select relowner from pg_class where relnamespace in('public'::regnamespace,'cadastro'::regnamespace,'identidade'::regnamespace,'operacao'::regnamespace,'auditoria'::regnamespace,'storage'::regnamespace) union select nspowner from pg_namespace where nspname in('api','public','cadastro','identidade','operacao','auditoria','storage')) loop execute format('grant %I to turno_core_migrador_fixture with inherit true,set false',dono);end loop;
 for dono in select rolname from pg_roles where rolname like 'ffcmapp_%' and not rolsuper and not rolbypassrls loop execute format('grant %I to turno_core_migrador_fixture with admin true,inherit false,set false',dono);end loop;
end $$;
set role turno_core_migrador_fixture;
\ir ../migrations/20261125180000_documentos_preautorizacao.sql
\ir ../migrations/20261125185000_documentos_pastas.sql
\ir ../migrations/20261125190000_plano_campos_extras.sql
\ir ../migrations/20261125200000_turno_execucao_clinica.sql
-- Subsequent owner transfers need ADMIN without SET/INHERIT on the new dedicated role.
reset role;
grant ffcmapp_turno_execucao_owner to turno_core_migrador_fixture with admin true,inherit false,set false;
set role turno_core_migrador_fixture;
\ir ../migrations/20261125210000_turno_rotina_relatorios.sql
\ir ../migrations/20261125220000_turno_localizacao.sql
\ir ../migrations/20261125230000_turno_anexos.sql
\ir ../migrations/20261125240000_exportacao_metadata_manifesto.sql
\ir ../migrations/20261125250000_exportacao_leitura_versionada.sql
reset role;
do $$ declare t text;begin
 if exists(select * from turno_core_acl_antes except select oid,proowner,proacl,prosecdef,proconfig from pg_proc) then raise exception 'LEGACY_FUNCTION_CHANGED';end if;
 if exists(select * from turno_core_members_antes except select * from pg_auth_members) then raise exception 'LEGACY_MEMBERSHIP_REMOVED';end if;
 foreach t in array array['cadastro.turno_execucao_registro','cadastro.turno_medida_versao','cadastro.turno_prescricao_versao','cadastro.turno_administracao_versao','cadastro.turno_ocorrencia_versao','cadastro.turno_fundamento_familiar_versao','cadastro.turno_consentimento_localizacao','cadastro.turno_localizacao','cadastro.turno_anexo'] loop
  if has_table_privilege('authenticated',t,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('anon',t,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('service_role',t,'SELECT,INSERT,UPDATE,DELETE') then raise exception 'DIRECT_CLINICAL_GRANT: %',t;end if;
 end loop;
 if pg_has_role('authenticated','ffcmapp_turno_execucao_owner','MEMBER') or has_function_privilege('authenticated','operacao.execucao_turno_privada(jsonb)','EXECUTE') or has_function_privilege('authenticated','operacao.expurgar_localizacao_turno()','EXECUTE') then raise exception 'PRIVILEGED_PATH_EXPOSED';end if;
 if exists(select 1 from storage.buckets where id='turno-ocorrencias' and public) then raise exception 'PUBLIC_BUCKET';end if;
end $$;
update identidade.configuracao_sistema set valor='true' where chave='ffcm.turno.ativo';
create function public.turno_core_pedir_fixture(e jsonb,acao text) returns jsonb language plpgsql as $$
declare transporte jsonb;r jsonb;begin
 transporte:=public.acessos_assinar_fixture(e,acao);set local role authenticated;
 if acao in('api.gravar_execucao_turno','api.consultar_execucao_turno','api.consultar_catalogo_turno','api.configurar_catalogo_turno','api.conceder_medicacao_turno','api.consultar_concessoes_medicacao_turno','api.consultar_conversao_ocorrencia_turno','api.converter_ocorrencia_turno') then r:=api.turno_execucao(transporte);
 elsif acao in('api.gravar_fundamento_turno','api.consultar_fundamento_turno','api.consultar_relatorio_turno','api.registrar_exportacao_turno') then r:=api.turno_relatorio(transporte);
 elsif acao in('api.reservar_anexo_turno','api.confirmar_anexo_turno','api.consultar_anexo_turno','api.listar_anexos_turno') then r:=api.turno_anexo(transporte);
 else r:=api.turno_localizacao(transporte);end if;
 reset role;return r;
end $$;
create function public.turno_core_aad_fixture(paciente uuid,turno uuid,registro uuid,versao integer,tabela text,campo text) returns jsonb language sql as $$select jsonb_build_object('paciente_id',paciente,'turno_id',turno,'registro_id',registro,'versao',versao,'tabela',tabela,'campo',campo,'formato',1)$$;
create function public.turno_core_gravacao_fixture(classe text,dados jsonb,registro uuid,versao integer,paciente uuid) returns jsonb language plpgsql as $$
declare e jsonb;aad jsonb:='{}';campo text;cifra jsonb;tabela text;turno uuid:=(dados->>'turno_id')::uuid;
begin
 tabela:=case classe when 'afericao' then 'cadastro.turno_medida_versao' when 'rotina' then 'cadastro.turno_medida_versao' when 'prescricao' then 'cadastro.turno_prescricao_versao' when 'administracao' then 'cadastro.turno_administracao_versao' else 'cadastro.turno_ocorrencia_versao' end;
 foreach campo in array array['nome','dose','via','fonte_documental','descricao','providencia','observacao','executor_nome','executor_vinculo','motivo_situacao','motivo'] loop
  cifra:=case campo when 'executor_nome' then dados#>'{executor,nome}' when 'executor_vinculo' then dados#>'{executor,vinculo}' when 'motivo_situacao' then dados->'motivo' when 'motivo' then case when versao>1 then public.acessos_envelope_fixture() else null end else dados->campo end;
  if cifra is not null then aad:=aad||jsonb_build_object(campo,public.turno_core_aad_fixture(paciente,turno,registro,versao,tabela,campo));end if;
 end loop;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'registro_id',registro,'versao',versao,'versao_esperada',versao-1,'conteudo',jsonb_build_object('classe',classe,'dados',dados),'aad',aad,'chave_idempotencia',registro::text||'-'||versao::text,'digest_idempotencia',repeat('a',43));
 if versao>1 then e:=e||jsonb_build_object('motivo',public.acessos_envelope_fixture());end if;
 return e;
end $$;
revoke all on function public.turno_core_pedir_fixture(jsonb,text),public.turno_core_aad_fixture(uuid,uuid,uuid,integer,text,text),public.turno_core_gravacao_fixture(text,jsonb,uuid,integer,uuid) from public,anon,authenticated,service_role;
create temp table turno_core_estado(profissional uuid,sid uuid,cm uuid,cm_sid uuid,familiar uuid,familiar_sid uuid,paciente uuid,turno uuid,afericao uuid,prescricao uuid,administracao uuid,ocorrencia uuid);
insert into turno_core_estado select p.usuario_id,p.sid,c.usuario_id,c.sid,f.usuario_id,f.sid,'44000000-0000-4000-8000-000000000001',gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid() from acessos_contas_fixture p,acessos_contas_fixture c,acessos_contas_fixture f where p.funcao='profissional' and p.metodo='interno' and c.funcao='case_manager' and c.metodo='interno' and f.funcao='familia' and f.metodo='interno';
-- Fictitious case manager responsibility, with a real immutable audit reference.
with evento as(insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) select gen_random_uuid(),cm,'fixture_case_manager','paciente',paciente,'permitido',gen_random_uuid() from turno_core_estado returning id)
insert into cadastro.acompanhamento_caso(id,paciente_id,versao,responsavel_usuario_id,auditoria_id,ator_usuario_id) select gen_random_uuid(),x.paciente,coalesce((select max(a.versao) from cadastro.acompanhamento_caso a where a.paciente_id=x.paciente),0)+1,x.cm,evento.id,x.cm from turno_core_estado x,evento;
insert into cadastro.turno(id,paciente_id,profissional_usuario_id,aberto_em,parametros) select turno,paciente,profissional,clock_timestamp()-interval '30 minutes','{"duracao_padrao_minutos":480,"tolerancia_atraso_minutos":15,"tratamento_nao_encerrado":"sinalizar_pendencia"}' from turno_core_estado;
-- Structured observations, immutable correction, cursor and chronology moved by correction.
do $$ declare x turno_core_estado;e jsonb;r jsonb;d jsonb;rotina text;antes bigint;begin
 select * into x from turno_core_estado;perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 d:=jsonb_build_object('turno_id',x.turno,'tipo','temperatura','valor',36.5,'unidade','°C','instante_afericao',clock_timestamp()-interval '10 minutes');e:=public.turno_core_gravacao_fixture('afericao',d,x.afericao,1,x.paciente);
 r:=public.turno_core_pedir_fixture(e,'api.gravar_execucao_turno');if r->>'ok' is distinct from 'true' then raise exception 'AFERICAO_POSITIVA: %',r;end if;
 r:=public.turno_core_pedir_fixture(e,'api.gravar_execucao_turno');if r->>'repeticao' is distinct from 'true' or (select count(*) from cadastro.turno_medida_versao where registro_id=x.afericao)<>1 then raise exception 'REPLAY_DUPLICOU';end if;
 r:=public.turno_core_pedir_fixture(public.turno_core_gravacao_fixture('afericao',d||'{"unidade":"bpm"}',gen_random_uuid(),1,x.paciente),'api.gravar_execucao_turno');if r->>'ok' is distinct from 'false' or r#>>'{erro,codigo}' not in ('entrada_invalida','sem_permissao','conflito','conflito_idempotencia') or r ? 'dados' then raise exception 'UNIDADE_ACEITA';end if;
 r:=public.turno_core_pedir_fixture(public.turno_core_gravacao_fixture('afericao',d||jsonb_build_object('instante_afericao',clock_timestamp()-interval '2 hours'),gen_random_uuid(),1,x.paciente),'api.gravar_execucao_turno');if r->>'ok' is distinct from 'false' or r#>>'{erro,codigo}' not in ('entrada_invalida','sem_permissao','conflito','conflito_idempotencia') or r ? 'dados' then raise exception 'JANELA_ACEITA';end if;
 d:=d||jsonb_build_object('valor',36.6,'instante_afericao',clock_timestamp()-interval '2 minutes');e:=public.turno_core_gravacao_fixture('afericao',d,x.afericao,2,x.paciente);
 r:=public.turno_core_pedir_fixture(e-'motivo','api.gravar_execucao_turno');if r->>'ok' is distinct from 'false' or r#>>'{erro,codigo}' not in ('entrada_invalida','sem_permissao','conflito','conflito_idempotencia') or r ? 'dados' then raise exception 'RETIFICACAO_SEM_MOTIVO';end if;
 r:=public.turno_core_pedir_fixture(e,'api.gravar_execucao_turno');if r#>>'{dados,dados,retificada}' is distinct from 'true' then raise exception 'RETIFICACAO_FALHOU: %',r;end if;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'classe','afericao','inicio',clock_timestamp()-interval '1 hour','fim',clock_timestamp(),'limite',1);
 r:=public.turno_core_pedir_fixture(e,'api.consultar_execucao_turno');if jsonb_array_length(r#>'{dados,itens}')<>1 or r#>>'{dados,itens,0,versao}'<>'2' then raise exception 'ORIGINAL_CONTOU_COMO_ATO';end if;
 r:=public.turno_core_pedir_fixture(e||jsonb_build_object('historico',true,'registro_id',x.afericao,'limite',100),'api.consultar_execucao_turno');if jsonb_array_length(r#>'{dados,itens}')<>2 then raise exception 'HISTORICO_PERDIDO';end if;
 -- Every routine category exercises its own structured shape; observations optional.
 foreach rotina in array array['refeicao','hidratacao','sono','eliminacao'] loop
  d:=jsonb_build_object('tipo',rotina,'turno_id',x.turno,'instante_ocorrencia',clock_timestamp()-interval '1 minute')||case rotina when 'refeicao' then '{"momento":"almoco","aceitacao":"parcial"}'::jsonb when 'hidratacao' then '{"mililitros":120}'::jsonb when 'sono' then jsonb_build_object('inicio',clock_timestamp()-interval '20 minutes','fim',clock_timestamp()-interval '10 minutes','qualidade','tranquilo') else '{"eliminacao":"urina","contagem":1}'::jsonb end;
  r:=public.turno_core_pedir_fixture(public.turno_core_gravacao_fixture('rotina',d,gen_random_uuid(),1,x.paciente),'api.gravar_execucao_turno');if r->>'ok' is distinct from 'true' then raise exception 'ROTINA_FALHOU: % %',rotina,r;end if;
 end loop;
 -- No success without audit; rollback includes record, correction and receipt.
 antes:=(select count(*) from cadastro.turno_execucao_registro);perform set_config('fixture.acessos_suprimir','sim',true);
 begin r:=public.turno_core_pedir_fixture(public.turno_core_gravacao_fixture('rotina',d,gen_random_uuid(),1,x.paciente),'api.gravar_execucao_turno');raise exception 'AUDITORIA_SUPRIMIDA_ACEITA';exception when raise_exception then if sqlerrm<>'AUDITORIA_NAO_INSERIDA' then raise;end if;end;
 perform set_config('fixture.acessos_suprimir','nao',true);if (select count(*) from cadastro.turno_execucao_registro)<>antes then raise exception 'ESCRITA_PARCIAL';end if;
end $$;

-- Prescribed item/version, executor distinct from recorder, and live medication concession.
do $$ declare x turno_core_estado;d jsonb;e jsonb;r jsonb;begin
 select * into x from turno_core_estado;perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 d:=jsonb_build_object('nome',public.acessos_envelope_fixture(),'dose',public.acessos_envelope_fixture(),'via',public.acessos_envelope_fixture(),'fonte_documental',public.acessos_envelope_fixture(),'horarios',jsonb_build_array('08:00:00'),'vigencia_inicio',clock_timestamp()-interval '1 day','vigencia_fim',null);
 r:=public.turno_core_pedir_fixture(public.turno_core_gravacao_fixture('prescricao',d,x.prescricao,1,x.paciente),'api.gravar_execucao_turno');if r->>'ok' is distinct from 'true' then raise exception 'PRESCRICAO_POSITIVA: %',r;end if;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'classe','prescricao','vigente_em',clock_timestamp(),'limite',25);
 r:=public.turno_core_pedir_fixture(e,'api.consultar_execucao_turno');if jsonb_array_length(r#>'{dados,itens}')<>1 then raise exception 'VIGENTE_PRESCRITA_ANTES_PERIODO_SUMIU';end if;
 d:=jsonb_build_object('turno_id',x.turno,'item_id',x.prescricao,'versao',1,'executor',jsonb_build_object('nome',public.acessos_envelope_fixture(),'vinculo',public.acessos_envelope_fixture()),'situacao','recusado','motivo',public.acessos_envelope_fixture());
 e:=public.turno_core_gravacao_fixture('administracao',d,x.administracao,1,x.paciente);
 r:=public.turno_core_pedir_fixture(e,'api.gravar_execucao_turno');if r#>>'{dados,dados,registrador_usuario_id}' is distinct from x.profissional::text or r#>'{dados,dados,executor_nome}' is null then raise exception 'EXECUTOR_REGISTRADOR_COLAPSADOS: %',r;end if;
 r:=public.turno_core_pedir_fixture(public.turno_core_gravacao_fixture('administracao',d-'executor',gen_random_uuid(),1,x.paciente),'api.gravar_execucao_turno');if r->>'ok' is distinct from 'false' or r#>>'{erro,codigo}' not in ('entrada_invalida','sem_permissao','conflito','conflito_idempotencia') or r ? 'dados' then raise exception 'EXECUTOR_AUSENTE_ACEITO';end if;
 r:=public.turno_core_pedir_fixture(public.turno_core_gravacao_fixture('administracao',d-'motivo',gen_random_uuid(),1,x.paciente),'api.gravar_execucao_turno');if r->>'ok' is distinct from 'false' or r#>>'{erro,codigo}' not in ('entrada_invalida','sem_permissao','conflito','conflito_idempotencia') or r ? 'dados' then raise exception 'RECUSA_SEM_MOTIVO_ACEITA';end if;
 r:=public.turno_core_pedir_fixture(public.turno_core_gravacao_fixture('administracao',d||jsonb_build_object('item_id',gen_random_uuid()),gen_random_uuid(),1,x.paciente),'api.gravar_execucao_turno');if r->>'ok' is distinct from 'false' or r#>>'{erro,codigo}' not in ('entrada_invalida','sem_permissao','conflito','conflito_idempotencia') or r ? 'dados' then raise exception 'PRESCRICAO_ALHEIA_ACEITA';end if;
 -- Two different reasons have distinct AAD; exchanging them must fail.
 e:=public.turno_core_gravacao_fixture('administracao',d,x.administracao,2,x.paciente);
 r:=public.turno_core_pedir_fixture(jsonb_set(e,'{aad,motivo_situacao}',e#>'{aad,motivo}'),'api.gravar_execucao_turno');if r->>'ok' is distinct from 'false' or r#>>'{erro,codigo}' not in ('entrada_invalida','sem_permissao','conflito','conflito_idempotencia') or r ? 'dados' then raise exception 'AAD_MOTIVOS_INTERCAMBIAVEL';end if;
 r:=public.turno_core_pedir_fixture(e,'api.gravar_execucao_turno');if r->>'ok' is distinct from 'true' or (select count(*) from cadastro.turno_administracao_versao where registro_id=x.administracao)<>2 then raise exception 'ADMIN_RETIFICACAO_PERDEU_HISTORICO';end if;
 perform public.acessos_claims_fixture(x.cm,x.cm_sid,'password');
 r:=public.turno_core_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'usuario_id',x.profissional,'concedida',false),'api.conceder_medicacao_turno');if r->>'ok' is distinct from 'true' then raise exception 'CM_NAO_REVOGOU_CONCESSAO: %',r;end if;
 perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 r:=public.turno_core_pedir_fixture(e,'api.gravar_execucao_turno');if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'REPLAY_APOS_REVOGACAO_CONCESSAO';end if;
 perform public.acessos_claims_fixture(x.cm,x.cm_sid,'password');
 r:=public.turno_core_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'usuario_id',x.profissional,'concedida',true),'api.conceder_medicacao_turno');if r->>'ok' is distinct from 'true' then raise exception 'CM_NAO_CONCEDEU';end if;
end $$;
-- Family foundation is independent, versioned, temporal, revocable; coordinates never leak.
do $$ declare x turno_core_estado;e jsonb;r jsonb;inicio timestamptz:=clock_timestamp()-interval '1 day';begin
 select * into x from turno_core_estado;perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 e:=public.turno_core_gravacao_fixture('ocorrencia',jsonb_build_object('turno_id',x.turno,'descricao',public.acessos_envelope_fixture(),'providencia',public.acessos_envelope_fixture(),'instante_ocorrencia',clock_timestamp()-interval '1 minute'),x.ocorrencia,1,x.paciente);
 r:=public.turno_core_pedir_fixture(e,'api.gravar_execucao_turno');if r->>'ok' is distinct from 'true' then raise exception 'OCORRENCIA_POSITIVA: %',r;end if;
 perform public.acessos_claims_fixture(x.familiar,x.familiar_sid,'password');
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'tipo','diario','inicio',inicio,'fim',inicio+interval '1 day','limite',100);
 r:=public.turno_core_pedir_fixture(e,'api.consultar_relatorio_turno');if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'PARENTESCO_VIROU_FUNDAMENTO';end if;
 perform public.acessos_claims_fixture(x.cm,x.cm_sid,'password');
 r:=public.turno_core_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente),'api.consultar_fundamento_turno');if r#>>'{dados,pode_gerir}' is distinct from 'true' or jsonb_array_length(r#>'{dados,itens}')<1 then raise exception 'CANDIDATOS_FAMILIA_NAO_PROJETADOS';end if;
 r:=public.turno_core_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'familiar_usuario_id',x.familiar,'versao_esperada',0,'estado','vigente','fundamento',public.acessos_envelope_fixture(),'aad_fundamento',public.turno_core_aad_fixture(x.paciente,null,x.familiar,1,'cadastro.turno_fundamento_familiar_versao','fundamento'),'vigencia_inicio',inicio,'vigencia_fim',null,'chave_idempotencia','fundamento-fixture-1','digest_idempotencia',repeat('b',43)),'api.gravar_fundamento_turno');if r->>'ok' is distinct from 'true' then raise exception 'FUNDAMENTO_POSITIVO: %',r;end if;
 perform public.acessos_claims_fixture(x.familiar,x.familiar_sid,'password');r:=public.turno_core_pedir_fixture(e,'api.consultar_relatorio_turno');if r->>'ok' is distinct from 'true' or jsonb_array_length(r#>'{dados,itens}')<1 or r::text~'latitude|longitude|precisao_metros' then raise exception 'RELATORIO_FAMILIAR_AUDIENCIA';end if;
 r:=public.turno_core_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'turno_id',x.turno),'api.consultar_localizacao_turno');if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'FAMILIA_VIU_LOCALIZACAO';end if;
 r:=public.turno_core_pedir_fixture(public.turno_core_gravacao_fixture('ocorrencia',jsonb_build_object('turno_id',x.turno,'descricao',public.acessos_envelope_fixture(),'providencia',public.acessos_envelope_fixture(),'instante_ocorrencia',clock_timestamp()),gen_random_uuid(),1,x.paciente),'api.gravar_execucao_turno');if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'FAMILIA_GRAVOU_EXECUCAO';end if;
 perform public.acessos_claims_fixture(x.cm,x.cm_sid,'password');
 r:=public.turno_core_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'familiar_usuario_id',x.familiar,'versao_esperada',1,'estado','revogado','fundamento',public.acessos_envelope_fixture(),'aad_fundamento',public.turno_core_aad_fixture(x.paciente,null,x.familiar,2,'cadastro.turno_fundamento_familiar_versao','fundamento'),'vigencia_inicio',inicio,'vigencia_fim',null,'chave_idempotencia','fundamento-fixture-2','digest_idempotencia',repeat('c',43)),'api.gravar_fundamento_turno');if r->>'ok' is distinct from 'true' then raise exception 'REVOGACAO_FUNDAMENTO_FALHOU';end if;
 perform public.acessos_claims_fixture(x.familiar,x.familiar_sid,'password');r:=public.turno_core_pedir_fixture(e,'api.consultar_relatorio_turno');if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or (select count(*) from cadastro.turno_fundamento_familiar_versao where familiar_usuario_id=x.familiar)<>2 then raise exception 'REVOGACAO_NAO_IMEDIATA';end if;
end $$;
-- Consent history, declared coordinates, separate coordination view and guarded retention.
do $$ declare x turno_core_estado;e jsonb;r jsonb;begin
 select * into x from turno_core_estado;perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 if not exists(select 1 from cadastro.turno_localizacao where turno_id=x.turno and versao=0 and motivo_ausencia='consentimento_ausente') then raise exception 'ABERTURA_SEM_AUSENCIA';end if;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'versao_esperada',0,'concedido',true,'finalidade','Registrar localização declarada pelo aparelho na abertura e encerramento do turno.','audiencia','Administrador e case manager do caso.','retencao_dias',90,'chave_idempotencia','consentimento-fixture-1','digest_idempotencia',repeat('d',43));
 r:=public.turno_core_pedir_fixture(e,'api.gravar_consentimento_turno');if r->>'ok' is distinct from 'true' then raise exception 'CONSENTIMENTO_FALHOU: %',r;end if;
 r:=public.turno_core_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'turno_id',x.turno,'momento','abertura','latitude',-20.1,'longitude',-40.2,'precisao_metros',25),'api.registrar_localizacao_turno');if r->>'ok' is distinct from 'true' or r::text~'latitude|longitude' then raise exception 'LOCALIZACAO_REGISTRO_FALHOU';end if;
 r:=public.turno_core_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'turno_id',x.turno),'api.consultar_localizacao_turno');if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'PROFISSIONAL_VIU_COORDENADA';end if;
 perform public.acessos_claims_fixture(x.cm,x.cm_sid,'password');r:=public.turno_core_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'turno_id',x.turno),'api.consultar_localizacao_turno');if r#>>'{dados,itens,0,declarada_pelo_aparelho}' is distinct from 'true' then raise exception 'CM_NAO_VIU_DECLARADA';end if;
 perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 r:=public.turno_core_pedir_fixture(e||jsonb_build_object('versao_esperada',1,'concedido',false,'chave_idempotencia','consentimento-fixture-2','digest_idempotencia',repeat('e',43)),'api.gravar_consentimento_turno');if r->>'ok' is distinct from 'true' or (select count(*) from cadastro.turno_consentimento_localizacao where usuario_id=x.profissional)<>2 then raise exception 'CONSENTIMENTO_REVOGACAO_PERDEU_HISTORICO';end if;
 -- Disabled guard must leave even expired coordinates untouched, then explicit fixture activation.
 update cadastro.turno set aberto_em=clock_timestamp()-interval '91 days' where id=x.turno;
 if operacao.expurgar_localizacao_turno()<>0 or not exists(select 1 from cadastro.turno_localizacao where turno_id=x.turno) then raise exception 'EXPURGO_DESLIGADO_APAGOU';end if;
 update identidade.configuracao_sistema set valor='true' where chave='ffcm.turno.expurgo_localizacao_ativo';
 perform operacao.expurgar_localizacao_turno();
 if exists(select 1 from cadastro.turno_localizacao where turno_id=x.turno) or not exists(select 1 from cadastro.turno_medida_versao where registro_id=x.afericao) or not exists(select 1 from cadastro.turno_consentimento_localizacao where usuario_id=x.profissional) then raise exception 'RETENCAO_DANIFICOU_HISTORICO';end if;
 update identidade.configuracao_sistema set valor='false' where chave='ffcm.turno.expurgo_localizacao_ativo';
 update cadastro.turno set aberto_em=clock_timestamp()-interval '30 minutes' where id=x.turno;
end $$;
-- Isolation and revocation include direct tables and replay. Preserved authors remain unchanged.
do $$ declare x turno_core_estado;e jsonb;r jsonb;tab text;begin
 select * into x from turno_core_estado;perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id','44000000-0000-4000-8000-000000000002','classe','afericao','inicio',clock_timestamp()-interval '1 day','fim',clock_timestamp(),'limite',25);
 r:=public.turno_core_pedir_fixture(e,'api.consultar_execucao_turno');if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'OUTRO_CASO_VAZOU';end if;
 foreach tab in array array['cadastro.turno_medida_versao','cadastro.turno_prescricao_versao','cadastro.turno_administracao_versao','cadastro.turno_ocorrencia_versao','cadastro.turno_localizacao'] loop
  begin set local role authenticated;execute format('select count(*) from %s',tab);reset role;raise exception 'TABELA_DIRETA_EXPOSTA';exception when insufficient_privilege then reset role;end;
 end loop;
 update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id=(select cm from turno_core_estado),motivo_revogacao_cifrado=public.acessos_envelope_fixture() where paciente_id=x.paciente and usuario_id=x.profissional;
 e:=e||jsonb_build_object('paciente_id',x.paciente);r:=public.turno_core_pedir_fixture(e,'api.consultar_execucao_turno');if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'VINCULO_REVOGADO_LEU';end if;
 if exists(select 1 from cadastro.turno_execucao_registro where id in(x.afericao,x.ocorrencia,x.prescricao,x.administracao) and autor_usuario_id<>x.profissional) then raise exception 'AUTOR_HISTORICO_REATRIBUIDO';end if;
 update cadastro.acesso_paciente set revogada_em=null,revogado_por_usuario_id=null,motivo_revogacao_cifrado=null where paciente_id=x.paciente and usuario_id=x.profissional;
end $$;
-- These source-level fixtures do not establish real Supabase Storage, Auth, Vault or pg_cron execution.

-- Corrections preserve historical prescription reference after external transcription changes.
do $$ declare x turno_core_estado;d jsonb;r jsonb;begin
 select * into x from turno_core_estado;perform public.acessos_claims_fixture(x.cm,x.cm_sid,'password');
 select jsonb_build_object('nome',nome,'dose',dose,'via',via,'horarios',to_jsonb(horarios),'fonte_documental',fonte_documental,'vigencia_inicio',clock_timestamp()-interval '2 days','vigencia_fim',clock_timestamp()-interval '1 day') into d from cadastro.turno_prescricao_versao where registro_id=x.prescricao and versao=1;
 r:=public.turno_core_pedir_fixture(public.turno_core_gravacao_fixture('prescricao',d,x.prescricao,2,x.paciente),'api.gravar_execucao_turno');if r->>'ok' is distinct from 'true' then raise exception 'PROFISSIONAL_B_NAO_RETIFICOU_PRESCRICAO: %',r;end if;
 if (select autor_usuario_id from cadastro.turno_execucao_registro where id=x.prescricao)<>x.profissional or (select autor_usuario_id from cadastro.turno_prescricao_versao where registro_id=x.prescricao and versao=2)<>x.cm then raise exception 'AUTORES_PRESCRICAO_COLAPSADOS';end if;
 perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 d:=jsonb_build_object('turno_id',x.turno,'item_id',x.prescricao,'versao',1,'executor',jsonb_build_object('nome',public.acessos_envelope_fixture(),'vinculo',public.acessos_envelope_fixture()),'situacao','administrado');
 r:=public.turno_core_pedir_fixture(public.turno_core_gravacao_fixture('administracao',d||jsonb_build_object('versao',2),x.administracao,3,x.paciente),'api.gravar_execucao_turno');if r->>'ok' is distinct from 'false' or r#>>'{erro,codigo}' not in ('entrada_invalida','sem_permissao','conflito','conflito_idempotencia') or r ? 'dados' then raise exception 'REFERENCIA_ORIGINAL_TROCADA';end if;
 r:=public.turno_core_pedir_fixture(public.turno_core_gravacao_fixture('administracao',d,x.administracao,3,x.paciente),'api.gravar_execucao_turno');if r->>'ok' is distinct from 'true' then raise exception 'RETIFICACAO_HISTORICA_EXPIRADA_NEGADA: %',r;end if;
end $$;
-- Storage RLS uses requester authority again, even under an existing permissive policy.
do $$ declare x turno_core_estado;id uuid:=gen_random_uuid();e jsonb;r jsonb;nome text;quantidade integer;begin
 select * into x from turno_core_estado;perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'anexo_id',id,'ocorrencia_id',x.ocorrencia,'ocorrencia_versao',1,'classificacao','execucao_turno','audiencia','equipe_e_familia','mime_type','image/png','tamanho_bytes',12,'chave_idempotencia','anexo-fixture-1','digest_idempotencia',repeat('f',43));
 -- Same 3 MiB boundary at metadata/Storage and HTTP; actual Storage I/O remains separate.
 if (select file_size_limit from storage.buckets where id='turno-ocorrencias') is distinct from 3145728::bigint then raise exception 'BUCKET_LIMITE_DIVERGENTE';end if;
 begin
  r:=public.turno_core_pedir_fixture(e||jsonb_build_object('anexo_id',gen_random_uuid(),'chave_idempotencia','anexo-boundary-fixture','tamanho_bytes',3145728),'api.reservar_anexo_turno');
  if r->>'ok' is distinct from 'true' then raise exception 'ANEXO_LIMITE_EXATO_NEGADO: %',r;end if;
  raise exception using errcode='PZ099',message='ROLLBACK_BOUNDARY_FIXTURE';
 exception when sqlstate 'PZ099' then null;end;
 quantidade:=(select count(*) from cadastro.turno_anexo);
 r:=public.turno_core_pedir_fixture(e||jsonb_build_object('anexo_id',gen_random_uuid(),'chave_idempotencia','anexo-over-boundary-fixture','tamanho_bytes',3145729),'api.reservar_anexo_turno');
 if r->>'ok' is distinct from 'false' or r#>>'{erro,codigo}' is distinct from 'entrada_invalida' or r ? 'dados' or (select count(*) from cadastro.turno_anexo)<>quantidade then raise exception 'ANEXO_ACIMA_LIMITE_ACEITO';end if;
 r:=public.turno_core_pedir_fixture(e,'api.reservar_anexo_turno');if r->>'ok' is distinct from 'true' then raise exception 'ANEXO_RESERVA: %',r;end if;nome:=r#>>'{dados,objeto_nome}';
 set local role authenticated;
 insert into storage.objects(bucket_id,name,metadata) values('turno-ocorrencias',nome,'{"mimetype":"image/png","size":12}');
 select count(*) into quantidade from storage.objects where bucket_id='turno-ocorrencias' and name=nome;
 if quantidade<>1 then raise exception 'AUTOR_PENDENTE_NAO_LEU_RETRY';end if;
 -- Restrictive policies neutralize the broad fixture policy for mutation.
 update storage.objects set metadata='{}' where bucket_id='turno-ocorrencias' and name=nome;
 get diagnostics quantidade=row_count;if quantidade<>0 then raise exception 'OBJETO_MUTAVEL';end if;
 delete from storage.objects where bucket_id='turno-ocorrencias' and name=nome;
 get diagnostics quantidade=row_count;if quantidade<>0 then raise exception 'OBJETO_APAGAVEL';end if;reset role;
 r:=public.turno_core_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'anexo_id',id),'api.confirmar_anexo_turno');if r->>'ok' is distinct from 'true' then raise exception 'ANEXO_CONFIRMACAO: %',r;end if;
 r:=public.turno_core_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'ocorrencia_id',x.ocorrencia),'api.listar_anexos_turno');if jsonb_array_length(r#>'{dados,itens}')<>1 then raise exception 'ANEXO_LISTA_VAZIA';end if;
 update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id=(select cm from turno_core_estado),motivo_revogacao_cifrado=public.acessos_envelope_fixture() where paciente_id=x.paciente and usuario_id=x.profissional;
 set local role authenticated;select count(*) into quantidade from storage.objects where bucket_id='turno-ocorrencias' and name=nome;reset role;
 if quantidade<>0 then raise exception 'STORAGE_POS_REVOGACAO_VAZOU';end if;
 update cadastro.acesso_paciente set revogada_em=null,revogado_por_usuario_id=null,motivo_revogacao_cifrado=null where paciente_id=x.paciente and usuario_id=x.profissional;
 perform public.acessos_claims_fixture(x.familiar,x.familiar_sid,'password');
 set local role authenticated;select count(*) into quantidade from storage.objects where bucket_id='turno-ocorrencias' and name=nome;reset role;
 if quantidade<>0 then raise exception 'STORAGE_FAMILIA_SEM_FUNDAMENTO';end if;
end $$;
-- Legacy invited family remains supported; managed failure cannot use this fallback.
do $$ declare x turno_core_estado;u uuid:=gen_random_uuid();sid uuid:=gen_random_uuid();r jsonb;e jsonb;begin
 select * into x from turno_core_estado;
 insert into auth.users(id,email,email_confirmed_at) values(u,'legacy-family-fixture@example.test',clock_timestamp());insert into auth.sessions values(sid,u,null);
 insert into public.usuario(id,perfil) values(u,'familia');insert into identidade.sessao(session_id,usuario_id,metodo) values(sid,u,'familia');
 insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado) values(gen_random_uuid(),x.paciente,u,x.cm,public.acessos_envelope_fixture());
 perform public.acessos_claims_fixture(x.cm,x.cm_sid,'password');
 r:=public.turno_core_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'familiar_usuario_id',u,'versao_esperada',0,'estado','vigente','fundamento',public.acessos_envelope_fixture(),'aad_fundamento',public.turno_core_aad_fixture(x.paciente,null,u,1,'cadastro.turno_fundamento_familiar_versao','fundamento'),'vigencia_inicio',clock_timestamp()-interval '1 day','vigencia_fim',null,'chave_idempotencia','legacy-fundamento-fixture','digest_idempotencia',repeat('g',43)),'api.gravar_fundamento_turno');if r->>'ok' is distinct from 'true' then raise exception 'LEGACY_FUNDAMENTO: %',r;end if;
 perform public.acessos_claims_fixture(u,sid,'password');e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'tipo','diario','inicio',date_trunc('day',clock_timestamp()),'fim',date_trunc('day',clock_timestamp())+interval '1 day','limite',25);
 r:=public.turno_core_pedir_fixture(e,'api.consultar_relatorio_turno');if r->>'ok' is distinct from 'true' then raise exception 'FAMILIA_LEGADA_NEGADA: %',r;end if;
 perform public.acessos_claims_fixture(u,sid,'oauth');r:=public.turno_core_pedir_fixture(e,'api.consultar_relatorio_turno');if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'LEGACY_AMR_FORJADO';end if;
end $$;
-- CHECK constraints reject incomplete structured data through privileged fixture SQL as well.
do $$ declare x turno_core_estado;begin select * into x from turno_core_estado;
 begin insert into cadastro.turno_localizacao(turno_id,momento,versao,usuario_id) values(x.turno,'abertura',1,x.profissional);raise exception 'COORDENADA_NULL_ACEITA';exception when check_violation then null;end;
 begin insert into cadastro.turno_medida_versao(registro_id,versao,anterior,tipo,instante_ocorrencia,motivo,autor_usuario_id) values(x.afericao,3,2,'refeicao',clock_timestamp(),public.acessos_envelope_fixture(),x.profissional);raise exception 'REFEICAO_INCOMPLETA_ACEITA';exception when check_violation then null;end;
end $$;

-- Matrix: all four account functions, both approved methods, positive case and foreign case.
insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado)
 select gen_random_uuid(),x.paciente,c.usuario_id,x.cm,public.acessos_envelope_fixture() from turno_core_estado x,acessos_contas_fixture c where c.funcao='administrador' and not exists(select 1 from cadastro.acesso_paciente ap where ap.paciente_id=x.paciente and ap.usuario_id=c.usuario_id and ap.revogada_em is null);
do $$ declare x turno_core_estado;c record;r jsonb;e jsonb;versao integer;turno uuid;d jsonb;begin
 select * into x from turno_core_estado;
 for c in select * from acessos_contas_fixture where funcao='familia' loop
  perform public.acessos_claims_fixture(x.cm,x.cm_sid,'password');
  select coalesce(max(f.versao),0) into versao from cadastro.turno_fundamento_familiar_versao f where paciente_id=x.paciente and familiar_usuario_id=c.usuario_id;
  r:=public.turno_core_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'familiar_usuario_id',c.usuario_id,'versao_esperada',versao,'estado','vigente','fundamento',public.acessos_envelope_fixture(),'aad_fundamento',public.turno_core_aad_fixture(x.paciente,null,c.usuario_id,versao+1,'cadastro.turno_fundamento_familiar_versao','fundamento'),'vigencia_inicio',clock_timestamp()-interval '1 day','vigencia_fim',null,'chave_idempotencia',gen_random_uuid()::text,'digest_idempotencia',repeat('h',43)),'api.gravar_fundamento_turno');if r->>'ok' is distinct from 'true' then raise exception 'MATRIZ_FUNDAMENTO: %',r;end if;
 end loop;
 for c in select * from acessos_contas_fixture loop
  perform public.acessos_claims_fixture(c.usuario_id,c.sid,case when c.metodo='interno' then 'password' else 'oauth' end);
  e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'tipo','caso','inicio',clock_timestamp()-interval '1 day','fim',clock_timestamp(),'limite',1);
  if c.funcao='familia' then e:=e||jsonb_build_object('tipo','diario','fim',(e->>'inicio')::timestamptz+interval '1 day');end if;
  r:=public.turno_core_pedir_fixture(e,'api.consultar_relatorio_turno');if r->>'ok' is distinct from 'true' then raise exception 'MATRIZ_LEITURA_POSITIVA: %/% %',c.funcao,c.metodo,r;end if;
  if r#>'{dados,proximo_cursor}' is distinct from 'null'::jsonb then
   r:=public.turno_core_pedir_fixture(e||jsonb_build_object('consulta_id',r#>>'{dados,consulta_id}','cursor_instante',r#>>'{dados,proximo_cursor,instante}','cursor_id',r#>>'{dados,proximo_cursor,id}','cursor_versao',(r#>>'{dados,proximo_cursor,versao}')::integer,'cursor_classe',r#>>'{dados,proximo_cursor,classe}'),'api.consultar_relatorio_turno');if r->>'ok' is distinct from 'true' then raise exception 'MATRIZ_PAGINACAO_SNAPSHOT: %',r;end if;
  end if;
  r:=public.turno_core_pedir_fixture(e||jsonb_build_object('paciente_id','44000000-0000-4000-8000-000000000002'),'api.consultar_relatorio_turno');if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'MATRIZ_CASO_B';end if;
  -- Only linked professionals (including case-manager base role) create execution.
  if c.funcao in ('profissional','case_manager') then
   select t.id into turno from cadastro.turno t where t.profissional_usuario_id=c.usuario_id and situacao='aberto';
   if turno is null then turno:=gen_random_uuid();insert into cadastro.turno(id,paciente_id,profissional_usuario_id,aberto_em,parametros) values(turno,x.paciente,c.usuario_id,clock_timestamp()-interval '5 minutes','{"duracao_padrao_minutos":480,"tolerancia_atraso_minutos":15,"tratamento_nao_encerrado":"sinalizar_pendencia"}');end if;
  else turno:=x.turno;end if;
  d:=jsonb_build_object('turno_id',turno,'tipo','temperatura','valor',36.7,'unidade','°C','instante_afericao',clock_timestamp()-interval '1 minute');
  r:=public.turno_core_pedir_fixture(public.turno_core_gravacao_fixture('afericao',d,gen_random_uuid(),1,x.paciente),'api.gravar_execucao_turno');
  if c.funcao in ('profissional','case_manager') then if r->>'ok' is distinct from 'true' then raise exception 'MATRIZ_PROFISSIONAL_ESCRITA: %/% %',c.funcao,c.metodo,r;end if;
  elsif r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r?'dados' then raise exception 'MATRIZ_ADMIN_FAMILIA_GRAVOU';end if;
  update identidade.sessao set revogada_em=clock_timestamp(),revogada_por_usuario_id=(select cm from turno_core_estado),motivo_revogacao_cifrado=public.acessos_envelope_fixture() where session_id=c.sid;
  r:=public.turno_core_pedir_fixture(e,'api.consultar_relatorio_turno');if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'MATRIZ_SESSAO_REVOGADA';end if;
  update identidade.sessao set revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where session_id=c.sid;
  if c.funcao<>'familia' then
   update identidade.concessao_equipe set estado='revogada',revogada_em=clock_timestamp(),revogada_por_usuario_id=x.cm,motivo_revogacao_cifrado=public.acessos_envelope_fixture() where usuario_id=c.usuario_id;
   r:=public.turno_core_pedir_fixture(e,'api.consultar_relatorio_turno');if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'MATRIZ_CONCESSAO_REVOGADA';end if;
   update identidade.concessao_equipe set estado='vinculada',revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id=c.usuario_id;
  end if;
 end loop;
end $$;

-- FR-014 occurrence conversion: real task/Diary wrappers, all-or-nothing and replay.
update identidade.configuracao_sistema set valor='true' where chave='ffcm.diario.ativo';
update identidade.configuracao_sistema set valor='["Área fictícia"]' where chave='ffcm.diario.areas_sintese';
do $$ declare x turno_core_estado;tarefa uuid:=gen_random_uuid();evolucao uuid:=gen_random_uuid();registro_tarefa uuid:=gen_random_uuid();registro_diario uuid:=gen_random_uuid();reserva uuid:=gen_random_uuid();req uuid:=gen_random_uuid();geracao bigint;estado text;
 e jsonb;te jsonb;de jsonb;filho_tarefa jsonb;filho_diario jsonb;autorizacao jsonb;r jsonb;antes_tarefa bigint;antes_diario bigint;begin
 select * into x from turno_core_estado;perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 insert into operacao.barreira_tarefa_cuidado(ator_usuario_id) values(x.profissional) on conflict do nothing;
 select epoca into geracao from operacao.barreira_tarefa_cuidado where ator_usuario_id=x.profissional;
 estado:=operacao.reservar_tarefa_cuidado_privado(x.profissional,geracao,reserva,x.paciente,tarefa,0);if estado<>'aberta' then raise exception 'RESERVA_CONVERSAO_FIXTURE: %',estado;end if;
 autorizacao:=public.acessos_assinar_fixture(jsonb_build_object('request_id',req,'paciente_id',x.paciente,'autorizacao_somente',true),'api.ler_tarefas_cuidado');
 te:=jsonb_build_object('request_id',req,'paciente_id',x.paciente,'tarefa_id',tarefa,'registro_id',registro_tarefa,'versao_esperada',0,'reserva_id',reserva,'geracao_reserva',geracao,'chave_idempotencia','ocorrencia-conversao-fixture','digest_idempotencia',repeat('i',43),'conteudo',public.acessos_envelope_fixture(),'aad',jsonb_build_object('tabela','cadastro.tarefa_cuidado_versao','paciente_id',x.paciente,'tarefa_id',tarefa,'registro_id',registro_tarefa,'versao',1,'campo','conteudo','formato',1));
 de:=jsonb_build_object('request_id',req,'paciente_id',x.paciente,'diario_registro_id',evolucao,'registro_id',registro_diario,'versao_esperada',0,'tipo','evolucao_profissional','estado','publicado','audiencia','equipe','atencao',true,'retorno_solicitado',false,'origem_conteudo','texto','tarefa_id',tarefa,'chave_idempotencia','ocorrencia-conversao-fixture','digest_idempotencia',repeat('j',43),'conteudo',public.acessos_envelope_fixture(),'aad',jsonb_build_object('tabela','cadastro.diario_registro_versao','paciente_id',x.paciente,'diario_registro_id',evolucao,'registro_id',registro_diario,'versao',1,'campo','conteudo','formato',1),'aconteceu_em',current_date::text,'area','Área fictícia');
 filho_tarefa:=public.acessos_assinar_fixture(te,'api.gravar_tarefa_cuidado');filho_diario:=public.acessos_assinar_fixture(de,'api.gravar_diario');
 e:=jsonb_build_object('request_id',req,'paciente_id',x.paciente,'registro_id',x.ocorrencia,'versao_esperada',1,'chave_idempotencia','ocorrencia-conversao-fixture','digest_idempotencia',repeat('k',43),'autorizacao_tarefa',autorizacao,'tarefa',filho_tarefa,'diario',filho_diario);
 antes_tarefa:=(select count(*) from cadastro.tarefa_cuidado);antes_diario:=(select count(*) from cadastro.diario_registro);
 r:=public.turno_core_pedir_fixture(jsonb_set(e,'{diario,entrada,atestado,mac}',to_jsonb(repeat('z',43))),'api.converter_ocorrencia_turno');
 if r->>'ok' is distinct from 'false' or r#>>'{erro,codigo}' not in ('sem_permissao','conflito') or r ? 'dados' then raise exception 'CONVERSAO_FALHA_NAO_NEGADA: %',r;end if;
 if (select count(*) from cadastro.tarefa_cuidado)<>antes_tarefa or (select count(*) from cadastro.diario_registro)<>antes_diario or exists(select 1 from operacao.turno_ocorrencia_conversao where ocorrencia_id=x.ocorrencia) or (select estado from operacao.reserva_tarefa_cuidado where id=reserva)<>'aberta' then raise exception 'CONVERSAO_PARCIAL_OU_RESERVA_CONFIRMADA';end if;
 r:=public.turno_core_pedir_fixture(e,'api.converter_ocorrencia_turno');if r->>'ok' is distinct from 'true' or r#>>'{dados,tarefa_id}' is distinct from tarefa::text or r#>>'{dados,evolucao_id}' is distinct from evolucao::text then raise exception 'CONVERSAO_POSITIVA: %',r;end if;
 r:=public.turno_core_pedir_fixture(e,'api.converter_ocorrencia_turno');if r->>'repeticao' is distinct from 'true' or (select count(*) from cadastro.tarefa_cuidado where id=tarefa)<>1 or (select count(*) from cadastro.diario_registro where id=evolucao)<>1 then raise exception 'CONVERSAO_REPLAY_DUPLICOU';end if;
 update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id=(select cm from turno_core_estado),motivo_revogacao_cifrado=public.acessos_envelope_fixture() where paciente_id=x.paciente and usuario_id=x.profissional;
 r:=public.turno_core_pedir_fixture(e,'api.converter_ocorrencia_turno');if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'CONVERSAO_REPLAY_REVOGADO';end if;
 update cadastro.acesso_paciente set revogada_em=null,revogado_por_usuario_id=null,motivo_revogacao_cifrado=null where paciente_id=x.paciente and usuario_id=x.profissional;
end $$;

-- Snapshot fixes latest versions before time filters and binds the live audience context.
do $$ declare x turno_core_estado;e jsonb;r jsonb;token uuid;d jsonb;versao integer;antes bigint;begin
 select * into x from turno_core_estado;perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'tipo','caso','inicio',clock_timestamp()-interval '1 day','fim',clock_timestamp(),'limite',100);
 r:=public.turno_core_pedir_fixture(e,'api.consultar_relatorio_turno');if r->>'ok' is distinct from 'true' then raise exception 'SNAPSHOT_INICIAL';end if;token:=(r#>>'{dados,consulta_id}')::uuid;
 d:=jsonb_build_object('turno_id',x.turno,'tipo','temperatura','valor',36.9,'unidade','°C','instante_afericao',clock_timestamp()-interval '25 minutes');
 r:=public.turno_core_pedir_fixture(public.turno_core_gravacao_fixture('afericao',d,x.afericao,3,x.paciente),'api.gravar_execucao_turno');if r->>'ok' is distinct from 'true' then raise exception 'SNAPSHOT_CORRECAO';end if;
 r:=public.turno_core_pedir_fixture(e||jsonb_build_object('consulta_id',token),'api.consultar_relatorio_turno');if not exists(select 1 from jsonb_array_elements(r#>'{dados,itens}')v where v->>'id'=x.afericao::text and v->>'versao'='2') or exists(select 1 from jsonb_array_elements(r#>'{dados,itens}')v where v->>'id'=x.afericao::text and v->>'versao'='3') then raise exception 'RETIFICACAO_MOVEU_ITEM_SNAPSHOT';end if;
 update cadastro.acesso_paciente ap set versao=ap.versao+1 where ap.paciente_id=x.paciente and ap.usuario_id=x.profissional;
 r:=public.turno_core_pedir_fixture(e||jsonb_build_object('consulta_id',token),'api.consultar_relatorio_turno');if r#>>'{erro,codigo}' is distinct from 'conflito' or r?'dados' then raise exception 'SNAPSHOT_REUSOU_VINCULO_NOVO';end if;
 perform public.acessos_claims_fixture(x.familiar,x.familiar_sid,'password');e:=e||jsonb_build_object('tipo','diario','fim',(e->>'inicio')::timestamptz+interval '1 day');
 r:=public.turno_core_pedir_fixture(e,'api.consultar_relatorio_turno');if r->>'ok' is distinct from 'true' then raise exception 'SNAPSHOT_FAMILIAR_INICIAL';end if;token:=(r#>>'{dados,consulta_id}')::uuid;antes:=(select count(*) from cadastro.turno_exportacao_pdf);
 perform public.acessos_claims_fixture(x.cm,x.cm_sid,'password');select max(f.versao) into versao from cadastro.turno_fundamento_familiar_versao f where paciente_id=x.paciente and familiar_usuario_id=x.familiar;
 r:=public.turno_core_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'familiar_usuario_id',x.familiar,'versao_esperada',versao,'estado','vigente','fundamento',public.acessos_envelope_fixture(),'aad_fundamento',public.turno_core_aad_fixture(x.paciente,null,x.familiar,versao+1,'cadastro.turno_fundamento_familiar_versao','fundamento'),'vigencia_inicio',clock_timestamp()-interval '1 second','vigencia_fim',null,'chave_idempotencia','snapshot-fundamento-novo','digest_idempotencia',repeat('l',43)),'api.gravar_fundamento_turno');if r->>'ok' is distinct from 'true' then raise exception 'SNAPSHOT_FUNDAMENTO_NOVO';end if;
 perform public.acessos_claims_fixture(x.familiar,x.familiar_sid,'password');
 r:=public.turno_core_pedir_fixture(e||jsonb_build_object('consulta_id',token),'api.consultar_relatorio_turno');if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'SNAPSHOT_REUSOU_AUDIENCIA_ANTERIOR';end if;
 r:=public.turno_core_pedir_fixture(e||jsonb_build_object('consulta_id',token),'api.registrar_exportacao_turno');if r#>>'{erro,codigo}' is distinct from 'conflito' or (select count(*) from cadastro.turno_exportacao_pdf)<>antes then raise exception 'PDF_AUDIENCIA_ANTERIOR_EXPORTADO';end if;
end $$;

-- Complete legacy case manifest exceeds one 200-item page; replay identifies the exact receipt.
do $$ declare x turno_core_estado;origem uuid;exportacao uuid:=gen_random_uuid();outra uuid:=gen_random_uuid();e jsonb;r jsonb;transporte jsonb;i integer;begin
 select * into x from turno_core_estado;perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 for i in 1..251 loop
  origem:=gen_random_uuid();insert into cadastro.diario_registro(id,paciente_id,tipo,autor_usuario_id) values(origem,x.paciente,'evolucao_profissional',x.profissional);
  insert into cadastro.diario_registro_versao(id,diario_registro_id,versao,estado,audiencia,conteudo_cifrado,criado_por_usuario_id,aconteceu_em,area) values(gen_random_uuid(),origem,1,'publicado','equipe',public.acessos_envelope_fixture(),x.profissional,current_date,'Área fictícia');
 end loop;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'registro_id',exportacao,'finalidade','acompanhamento','destinatario_cifrado',public.acessos_envelope_fixture(),'proposito_cifrado',public.acessos_envelope_fixture(),'chave_idempotencia','manifesto-maior-pagina-fixture','digest_idempotencia',repeat('m',43));
 transporte:=public.acessos_assinar_fixture(e,'api.registrar_exportacao');set local role authenticated;r:=api.exportacao_operacao_privada(transporte);reset role;
 if r->>'ok' is distinct from 'true' or r->>'resultado_id' is distinct from exportacao::text or (select count(*) from cadastro.exportacao_item where exportacao_id=exportacao)<251 then raise exception 'MANIFESTO_TRUNCADO_OU_RESULTADO_AUSENTE: %',r;end if;
 transporte:=public.acessos_assinar_fixture(e||jsonb_build_object('registro_id',outra,'chave_idempotencia','manifesto-outra-emissao-fixture'),'api.registrar_exportacao');set local role authenticated;r:=api.exportacao_operacao_privada(transporte);reset role;if r->>'ok' is distinct from 'true' then raise exception 'SEGUNDA_EXPORTACAO_FIXTURE';end if;
 transporte:=public.acessos_assinar_fixture(e||jsonb_build_object('registro_id',gen_random_uuid()),'api.registrar_exportacao');set local role authenticated;r:=api.exportacao_operacao_privada(transporte);reset role;
 if r->>'resultado_id' is distinct from exportacao::text or r->>'repeticao' is distinct from 'true' or (select count(*) from cadastro.exportacao_caso where id in(exportacao,outra))<>2 then raise exception 'REPLAY_ESCOLHEU_PRIMEIRA_LISTA_OU_DUPLICOU';end if;
end $$;

-- Final PDF receipt is written only for the exact snapshot and digest of generated bytes.
do $$ declare x turno_core_estado;e jsonb;r jsonb;token uuid;id uuid:=gen_random_uuid();antes bigint;begin
 select * into x from turno_core_estado;perform public.acessos_claims_fixture(x.profissional,x.sid,'password');
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'tipo','caso','inicio',clock_timestamp()-interval '1 day','fim',clock_timestamp(),'limite',100);
 r:=public.turno_core_pedir_fixture(e,'api.consultar_relatorio_turno');if r->>'ok' is distinct from 'true' then raise exception 'PDF_SNAPSHOT_INICIAL';end if;token:=(r#>>'{dados,consulta_id}')::uuid;
 e:=e||jsonb_build_object('consulta_id',token,'exportacao_id',id,'destinatario',public.acessos_envelope_fixture(),'proposito',public.acessos_envelope_fixture(),'aad_destinatario',public.turno_core_aad_fixture(x.paciente,null,id,1,'cadastro.turno_exportacao_pdf','destinatario'),'aad_proposito',public.turno_core_aad_fixture(x.paciente,null,id,1,'cadastro.turno_exportacao_pdf','proposito'),'digest_pdf',repeat('n',43),'chave_idempotencia','pdf-receipt-fixture','digest_idempotencia',repeat('o',43));
 r:=public.turno_core_pedir_fixture(e,'api.registrar_exportacao_turno');if r#>>'{dados,exportacao_id}' is distinct from id::text or not exists(select 1 from auditoria.evento where ator_usuario_id=x.profissional and acao='api.registrar_exportacao_turno' and resultado='permitido') then raise exception 'PDF_RECEIPT_SEM_AUDITORIA: %',r;end if;
 antes:=(select count(*) from cadastro.turno_exportacao_pdf);
 r:=public.turno_core_pedir_fixture(e||jsonb_build_object('digest_pdf',repeat('p',43)),'api.registrar_exportacao_turno');if r#>>'{erro,codigo}' is distinct from 'conflito_idempotencia' or (select count(*) from cadastro.turno_exportacao_pdf)<>antes then raise exception 'PDF_REPLAY_APROVOU_OUTROS_BYTES';end if;
 r:=public.turno_core_pedir_fixture(jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente,'exportacao_id',id),'api.consultar_exportacao_turno');if r#>>'{dados,exportacao_id}' is distinct from id::text then raise exception 'PDF_RECIBO_NAO_RECUPERAVEL';end if;
end $$;

-- Exact historical reads use each domain's own wrapper. Latest default is unchanged.
create function public.exportacao_versionada_pedir_fixture(e jsonb,acao text) returns jsonb language plpgsql as $$declare t jsonb;r jsonb;begin
 t:=public.acessos_assinar_fixture(e,acao);set local role authenticated;
 case acao when 'api.ler_diario' then r:=api.diario_operacao_privada(t);when 'api.ler_saude' then r:=api.saude_operacao_privada(t);when 'api.ler_contexto_cuidado' then r:=api.contexto_cuidado_privado(t);when 'api.ler_rede_cuidado' then r:=api.rede_cuidado_privado(t);when 'api.ler_tarefas_cuidado' then r:=api.ler_tarefas_cuidado_privado(t);when 'api.ler_encaminhamentos' then r:=api.encaminhamento_privado(t);when 'api.ler_orientacoes' then r:=api.orientacao_privada(t);when 'api.ler_documentos' then r:=api.documento_operacao_privada(t);when 'api.ler_plano_cuidado' then r:=api.plano_cuidado_privado(t);end case;
 reset role;return r;
end $$;
revoke all on function public.exportacao_versionada_pedir_fixture(jsonb,text) from public,anon,authenticated,service_role;
create temp table exportacao_versoes_fixture(dominio text,acao text,registro_antigo uuid,registro_atual uuid,versao_antiga integer);
do $$ declare x turno_core_estado;domain record;antigo uuid;atual uuid;raiz uuid;versao integer;begin
 select * into x from turno_core_estado;
 for domain in select * from(values('saude','cadastro.saude_versao','api.ler_saude'),('contexto','cadastro.contexto_cuidado_versao','api.ler_contexto_cuidado'),('rede','cadastro.rede_cuidado_versao','api.ler_rede_cuidado'))v(nome,tabela,acao)loop
  execute format('select coalesce(max(versao),0) from %s where paciente_id=$1',domain.tabela) into versao using x.paciente;
  antigo:=gen_random_uuid();atual:=gen_random_uuid();
  execute format('insert into %s(id,paciente_id,versao,versao_esperada,conteudo_cifrado,criado_por_usuario_id) values($1,$2,$3,nullif($3-1,0),$4,$5),($6,$2,$3+1,$3,$4,$5)',domain.tabela) using antigo,x.paciente,versao+1,public.acessos_envelope_fixture(),x.profissional,atual;
  insert into exportacao_versoes_fixture values(domain.nome,domain.acao,antigo,atual,versao+1);
 end loop;
 for domain in select * from(values('tarefa','cadastro.tarefa_cuidado','cadastro.tarefa_cuidado_versao','tarefa_id','api.ler_tarefas_cuidado'),('encaminhamento','cadastro.encaminhamento','cadastro.encaminhamento_versao','encaminhamento_id','api.ler_encaminhamentos'),('orientacao','cadastro.orientacao','cadastro.orientacao_versao','orientacao_id','api.ler_orientacoes'),('plano','cadastro.objetivo_cuidado','cadastro.objetivo_cuidado_versao','objetivo_id','api.ler_plano_cuidado'))v(nome,raiz,tabela,campo,acao)loop
  raiz:=gen_random_uuid();antigo:=gen_random_uuid();atual:=gen_random_uuid();execute format('insert into %s(id,paciente_id) values($1,$2)',domain.raiz) using raiz,x.paciente;
  if domain.nome='encaminhamento' then execute format('insert into %s(id,%I,versao,versao_esperada,conteudo_cifrado,criado_por_usuario_id,etapa) values($1,$2,1,null,$3,$4,''sugerido''),($5,$2,2,1,$3,$4,''concluido'')',domain.tabela,domain.campo) using antigo,raiz,public.acessos_envelope_fixture(),x.profissional,atual;
  elsif domain.nome='orientacao' then execute format('insert into %s(id,%I,versao,versao_esperada,conteudo_cifrado,criado_por_usuario_id,situacao,visibilidade) values($1,$2,1,null,$3,$4,''vigente'',''publica''),($5,$2,2,1,$3,$4,''superada'',''interna'')',domain.tabela,domain.campo) using antigo,raiz,public.acessos_envelope_fixture(),x.profissional,atual;
  else execute format('insert into %s(id,%I,versao,versao_esperada,conteudo_cifrado,criado_por_usuario_id) values($1,$2,1,null,$3,$4),($5,$2,2,1,$3,$4)',domain.tabela,domain.campo) using antigo,raiz,public.acessos_envelope_fixture(),x.profissional,atual;end if;
  insert into exportacao_versoes_fixture values(domain.nome,domain.acao,antigo,atual,1);
 end loop;
 raiz:=gen_random_uuid();antigo:=gen_random_uuid();atual:=gen_random_uuid();insert into cadastro.documento_caso(id,paciente_id,criado_por_usuario_id) values(raiz,x.paciente,x.profissional);
 insert into cadastro.documento_caso_versao(id,documento_id,paciente_id,versao,versao_esperada,categoria,audiencia,estado,conteudo_cifrado,criado_por_usuario_id) values(antigo,raiz,x.paciente,1,null,'fixture','equipe_e_familia','disponivel',public.acessos_envelope_fixture(),x.profissional),(atual,raiz,x.paciente,2,1,'fixture','equipe','disponivel',public.acessos_envelope_fixture(),x.profissional);
 insert into exportacao_versoes_fixture values('documento','api.ler_documentos',antigo,atual,1);
 raiz:=gen_random_uuid();antigo:=gen_random_uuid();atual:=gen_random_uuid();
 insert into cadastro.diario_registro(id,paciente_id,tipo,autor_usuario_id) values(raiz,x.paciente,'evolucao_profissional',x.profissional);
 insert into cadastro.diario_registro_versao(id,diario_registro_id,versao,versao_esperada,estado,audiencia,conteudo_cifrado,justificativa_cifrada,criado_por_usuario_id,aconteceu_em,area) values(antigo,raiz,1,null,'publicado','equipe_e_familia',public.acessos_envelope_fixture(),null,x.profissional,current_date,'Área fictícia'),(atual,raiz,2,1,'retificado','equipe',public.acessos_envelope_fixture(),public.acessos_envelope_fixture(),x.profissional,current_date,'Área fictícia');
 insert into exportacao_versoes_fixture values('diario','api.ler_diario',antigo,atual,1);

end $$;
do $$ declare x turno_core_estado;d record;e jsonb;r jsonb;begin
 select * into x from turno_core_estado;
 for d in select * from exportacao_versoes_fixture loop
  perform public.acessos_claims_fixture(x.profissional,x.sid,'password');e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',x.paciente)||case when d.dominio='plano' then jsonb_build_object('cursor',null,'limite',20) else '{}'::jsonb end;
  r:=public.exportacao_versionada_pedir_fixture(e,d.acao);
  if r->>'ok' is distinct from 'true' or strpos(r::text,d.registro_atual::text)=0 or strpos(r::text,d.registro_antigo::text)>0 then raise exception 'LATEST_DEFAULT_ALTERADO: % %',d.dominio,r;end if;
  e:=e||jsonb_build_object('registro_id_exportacao',d.registro_antigo,'versao_exportacao',d.versao_antiga);r:=public.exportacao_versionada_pedir_fixture(e,d.acao);
  if r->>'ok' is distinct from 'true' or strpos(r::text,d.registro_antigo::text)=0 or strpos(r::text,d.registro_atual::text)>0 then raise exception 'EXACT_VERSION_RETORNOU_LATEST: % %',d.dominio,r;end if;
  r:=public.exportacao_versionada_pedir_fixture(e||jsonb_build_object('registro_id_exportacao',gen_random_uuid()),d.acao);if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'EXACT_AUSENTE_REVELOU: %',d.dominio;end if;
  r:=public.exportacao_versionada_pedir_fixture(e||jsonb_build_object('paciente_id','44000000-0000-4000-8000-000000000002'),d.acao);if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'EXACT_OUTRO_CASO: %',d.dominio;end if;
  perform public.acessos_claims_fixture(x.familiar,x.familiar_sid,'password');r:=public.exportacao_versionada_pedir_fixture(e,d.acao);if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'EXACT_FAMILIA_REABRIU_HISTORICO: %',d.dominio;end if;
 end loop;
end $$;
