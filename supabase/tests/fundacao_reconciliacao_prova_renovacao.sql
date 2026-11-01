-- Apenas cluster descartável: setup e fixtures são COMMITados.
-- As funções de reconciliação e prova são os rascunhos reais; JWT/Vault são fictícios.
\set ON_ERROR_STOP on
\set ffcm_fixture_concorrente 1
\ir fundacao_cadastro_prova_renovacao_integracao.sql
\ir ../drafts/20261101140000_reconciliacao_cadastro_experimento.sql
\ir ../drafts/20261102170000_reconciliacao_prova_renovacao_experimento.sql
insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id) values('66000000-0000-4000-8000-000000000099','{"formato":1,"key_id":"v1","nonce":"fake","ciphertext":"fake","tag":"fake"}','61000000-0000-4000-8000-000000000001');
insert into operacao.requisicao(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,resultado_id,resultado_versao)
values('69000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','api.criar_paciente','teste-reconciliacao','digest-ficticio','concluida','66000000-0000-4000-8000-000000000099',1);
select set_config('ffcm_fixture.usuario','61000000-0000-4000-8000-000000000001',false);
select set_config('ffcm_fixture.sessao','63000000-0000-4000-8000-000000000001',false);
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000001',false);
select set_config('request.jwt.claims','{"session_id":"63000000-0000-4000-8000-000000000001"}',false);
do $$
declare t jsonb := '{"consulta":{"limite":10},"request_id":"64000000-0000-4000-8000-000000000099"}'; r jsonb;
begin
 r:=experimento_atestado.listar_reconciliacao_com_prova_fixture(t,1,null);
 if r->>'ok' is distinct from 'false' or r ? 'dados' then raise exception 'prova ausente aceita'; end if;
 r:=experimento_atestado.listar_reconciliacao_com_prova_fixture(t,1,decode(repeat('02',32),'hex'));
 if r->>'ok' is distinct from 'false' or r ? 'dados' then raise exception 'prova incorreta aceita'; end if;
 r:=experimento_atestado.listar_reconciliacao_com_prova_fixture(t,1,decode(repeat('01',32),'hex'));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,itens,0,situacao,resultado_id}' is distinct from '66000000-0000-4000-8000-000000000099' then raise exception 'reconciliação com prova válida negada'; end if;
 if not exists(select 1 from auditoria.evento where acao='api.listar_reconciliacao' and resultado='permitido')
   or (select count(*) from auditoria.evento where acao='api.listar_reconciliacao' and resultado='negado') <> 2 then raise exception 'auditoria não refletiu decisões'; end if;
 if exists(select 1 from auditoria.evento where acao='api.listar_reconciliacao' and resultado='negado' and (ator_usuario_id is not null or operador_restrito is distinct from 'reconciliacao_prova_fixture')) then raise exception 'negativa atribuída a identidade não comprovada'; end if;
 update identidade.credencial_sessao set geracao=2 where session_id='63000000-0000-4000-8000-000000000001';
 update identidade.prova_saida_fixture set geracao=2,verificador=decode(repeat('03',32),'hex') where session_id='63000000-0000-4000-8000-000000000001';
 r:=experimento_atestado.listar_reconciliacao_com_prova_fixture(t,1,decode(repeat('01',32),'hex'));
 if r->>'ok' is distinct from 'false' or r ? 'dados' then raise exception 'prova antiga aceita'; end if;
 update identidade.sessao set revogada_em=clock_timestamp(),revogada_por_usuario_id='61000000-0000-4000-8000-000000000001',motivo_revogacao_cifrado='{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}' where session_id='63000000-0000-4000-8000-000000000001';
 r:=experimento_atestado.listar_reconciliacao_com_prova_fixture(t,2,decode(repeat('03',32),'hex'));
 if r->>'ok' is distinct from 'false' or r ? 'dados' then raise exception 'sessão revogada aceita'; end if;
end $$;
