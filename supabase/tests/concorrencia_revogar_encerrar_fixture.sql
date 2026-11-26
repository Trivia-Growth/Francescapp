\set ON_ERROR_STOP on
\ir anamnese_operacoes_local.sql
\ir ../migrations/20261109100000_editar_paciente_privado.sql
\ir ../migrations/20261112050000_conceder_acesso_paciente_privado.sql
\ir ../migrations/20261112060000_revogar_acesso_paciente_privado.sql
\ir ../migrations/20261112070000_owners_acesso_paciente_privado.sql
\ir ../drafts/20261112150000_barreira_acesso_paciente.sql
create function public.revogar_concorrencia_fixture(reserva uuid, acesso uuid, epoca bigint, pedido uuid, auditoria uuid, chave text) returns jsonb language sql as $$
 select api.revogar_acesso_paciente_privado(public.assinar_anamnese_fixture(jsonb_build_object(
 'request_id',pedido,'paciente_id','40000000-0000-4000-8000-000000000002','acesso_id',acesso,'reserva_id',reserva,'geracao_reserva',epoca,
 'auditoria_id',auditoria,'chave_idempotencia',chave,'digest_idempotencia',repeat('a',43),'versao_esperada',1,
 'motivo',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)),
 'motivo_auditoria',jsonb_build_object('formato',1,'key_id','auditoria','nonce',repeat('b',16),'ciphertext','Yg','tag',repeat('b',22))),
 'api.revogar_acesso_paciente','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'))
$$;
