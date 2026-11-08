\set ON_ERROR_STOP on
\ir cadastro_composicao_local.sql
create role postgres nologin;
create schema api;
alter table public.usuario add column versao integer;
alter table identidade.concessao_equipe add column versao integer;
alter table public.usuario enable row level security;
alter table identidade.configuracao_auth_nativo enable row level security;
alter table identidade.concessao_equipe enable row level security;
alter table identidade.sessao enable row level security;
alter table operacao.requisicao enable row level security;
alter table cadastro.paciente enable row level security;
alter table cadastro.contato_paciente enable row level security;
alter table auditoria.evento enable row level security;
create function identidade.listar_carteira_privada(jsonb) returns jsonb language sql security definer as $$ select $1 $$;
revoke all on function identidade.listar_carteira_privada(jsonb) from public, anon, authenticated, service_role;
-- Como a ponte e o bloqueio reais, os adapters rodam como definer: owners sem USAGE em auth não leem Auth diretamente.
alter function auth_privado.uid() security definer set search_path='';
alter function auth_privado.jwt() security definer set search_path='';
alter function auth_privado.sessoes() security definer set search_path='';
alter function auth_privado.identidades() security definer set search_path='';
alter function bloqueios_auth.travar(uuid,uuid) security definer set search_path='';
-- Papéis donos criados antes por carteira_nativa e verificador; aqui apenas fixtures sem login.
create role ffcmapp_carteira_owner nologin;
create role ffcmapp_atestado_verificador_owner nologin;
grant usage on schema identidade to ffcmapp_carteira_owner, ffcmapp_atestado_verificador_owner;
alter function identidade.listar_carteira_privada(jsonb) owner to ffcmapp_carteira_owner;
alter function identidade.verificar_assinatura_atestado(text,text,jsonb,jsonb,text) owner to ffcmapp_atestado_verificador_owner;
\ir ../migrations/20261106190000_wrappers_privados.sql
update identidade.sessao set revogada_em=null;
do $$
declare t jsonb; resposta jsonb;
begin
 if has_function_privilege('authenticated','api.criar_paciente(jsonb)','execute')
  or has_function_privilege('anon','api.cadastro_composicao(jsonb)','execute')
  or has_function_privilege('service_role','api.listar_pacientes(jsonb)','execute') then raise exception 'GRANT_INDEVIDO'; end if;
 if exists(select 1 from pg_roles where rolname in ('ffcmapp_api_cadastro_owner','ffcmapp_api_carteira_owner') and (rolsuper or rolbypassrls or rolcanlogin)) then raise exception 'OWNER_PRIVILEGIADO'; end if;
 t:=operacao.assinar_fixture(operacao.transporte_fixture('api.consultar_barreira_cadastro'));
 resposta:=api.cadastro_composicao(t);
 if resposta->>'ok' is distinct from 'true' then raise exception 'COMPOSICAO: %', resposta; end if;
 begin
  perform api.cadastro_composicao(jsonb_set(t,'{entrada,atestado,mac}','"invalido"'));
  raise exception 'ATESTADO_ACEITO';
 exception when insufficient_privilege then null; end;
 update identidade.sessao set revogada_em=clock_timestamp();
 if api.cadastro_composicao(t)#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'REVOGACAO_IGNORADA'; end if;
 if api.listar_pacientes('{"fixture":true}') is distinct from '{"fixture":true}'::jsonb then raise exception 'CARTEIRA'; end if;
end $$;
update identidade.sessao set revogada_em=null;
do $$
declare t jsonb; e jsonb; resposta jsonb; paciente uuid:=gen_random_uuid(); reserva uuid:=gen_random_uuid(); recibo uuid:=gen_random_uuid();
begin
 t:=operacao.assinar_fixture(operacao.transporte_fixture('api.encerrar_cadastro',2,(select reserva_atual from operacao.barreira_cadastro where ator_usuario_id=auth.uid()),recibo));
 if api.cadastro_composicao(t)#>>'{dados,estado}' is distinct from 'confirmada' then raise exception 'ENCERRAMENTO'; end if;
 t:=operacao.assinar_fixture(operacao.transporte_fixture('api.reconhecer_barreira_cadastro',null,null,recibo));
 if api.cadastro_composicao(t)#>>'{dados,estado}' is distinct from 'reconhecido' then raise exception 'RECONHECIMENTO'; end if;
 t:=operacao.assinar_fixture(operacao.transporte_fixture('api.reservar_cadastro',3,reserva));
 if api.cadastro_composicao(t)#>>'{dados,estado}' is distinct from 'aberta' then raise exception 'RESERVA'; end if;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'reserva_id',reserva,'geracao_reserva',3,'auditoria_id',gen_random_uuid(),'chave_idempotencia','wrapper-chave','digest_idempotencia',repeat('a',43),
  'nome',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)),
  'aad',jsonb_build_object('nome',jsonb_build_object('tabela','cadastro.paciente','registro_id',paciente::text,'campo','nome','formato',1)));
 e:=e||jsonb_build_object('atestado',jsonb_build_object('usuario_id',auth.uid(),'session_id',auth.jwt()->>'session_id','request_id',e->>'request_id','operacao','api.criar_paciente','emitido_em',clock_timestamp()-interval '1 second','expira_em',clock_timestamp()+interval '20 seconds','mac','valido'));
 t:=jsonb_build_object('entrada',e,'entrada_canonica','{}','dados_canonicos','{}');
 resposta:=api.criar_paciente(t);
 if resposta->>'ok' is distinct from 'true' then raise exception 'CRIACAO: %',resposta; end if;
 if api.criar_paciente(t)->>'ok' is distinct from 'true' then raise exception 'REPETICAO'; end if;
 perform set_config('teste.ator','10000000-0000-4000-8000-000000000001',true);
 begin
  perform api.criar_paciente(t);
  raise exception 'OUTRO_ATOR_ACEITO';
 exception when insufficient_privilege then null; end;
end $$;
