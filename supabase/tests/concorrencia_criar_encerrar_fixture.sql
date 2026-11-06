\set ON_ERROR_STOP on
\ir criar_paciente_privado_local.sql
create schema teste_concorrencia;
insert into public.usuario(id) values ('10000000-0000-4000-8000-000000000003'),('10000000-0000-4000-8000-000000000004');
insert into identidade.concessao_equipe select gen_random_uuid(), id, 'vinculada', 'google_workspace', 'administrador', 'google-'||id from public.usuario where id in ('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004');
insert into identidade.sessao select c.usuario_id, c.usuario_id, c.id, 'google_workspace', null, null from identidade.concessao_equipe c where c.usuario_id in ('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004');
insert into auth.sessions select id,id,null from public.usuario where id in ('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004');
insert into auth.identities select id,'google','google-'||id,jsonb_build_object('sub','google-'||id,'email_verified',true,'custom_claims',jsonb_build_object('hd','exemplo.test')) from public.usuario where id in ('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004');
create function teste_concorrencia.criar(a uuid, r uuid, p uuid, pedido uuid, aud uuid) returns jsonb language plpgsql as $$
declare e jsonb;
begin
 e:=jsonb_build_object('request_id',pedido,'paciente_id',p,'reserva_id',r,'geracao_reserva',1,'auditoria_id',aud,'chave_idempotencia','concorrencia','digest_idempotencia',repeat('a',43),
 'nome',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)),
 'aad',jsonb_build_object('nome',jsonb_build_object('tabela','cadastro.paciente','registro_id',p::text,'campo','nome','formato',1)),
 'atestado',jsonb_build_object('usuario_id',a,'session_id',a,'request_id',pedido,'operacao','api.criar_paciente','emitido_em',clock_timestamp()-interval '1 second','expira_em',clock_timestamp()+interval '25 seconds','mac','valido'));
 return operacao.criar_paciente_privado(jsonb_build_object('entrada',e,'entrada_canonica','{}','dados_canonicos','{}'));
end $$;
