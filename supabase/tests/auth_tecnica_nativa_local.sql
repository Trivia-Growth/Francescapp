\set ON_ERROR_STOP on
-- Reutiliza a fixture local, inclusive prova Google; não representa Auth real.
\ir auth_nativo_sessao_local.sql
\ir ../migrations/20261110120000_admissao_tecnica_nativa.sql
insert into auth.users values ('10000000-0000-4000-8000-000000000010'), ('10000000-0000-4000-8000-000000000011');
insert into auth.sessions values
 ('20000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000010',null),
 ('20000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000011',null);
insert into public.usuario(id,perfil) values ('10000000-0000-4000-8000-000000000010','administrador');
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,motivo_cifrado,vinculada_em)
values ('30000000-0000-4000-8000-000000000010',
 '{"formato":1,"key_id":"fixture","nonce":"fixture","ciphertext":"fixture","tag":"fixture"}',
 'hmac-ficticio-tecnico','administrador','tecnica','vinculada','10000000-0000-4000-8000-000000000010',
 '{"formato":1,"key_id":"fixture","nonce":"fixture","ciphertext":"fixture","tag":"fixture"}',clock_timestamp());
insert into identidade.excecao_tecnica(usuario_id,concessao_id,motivo_cifrado)
values ('10000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000010',
 '{"formato":1,"key_id":"fixture","nonce":"fixture","ciphertext":"fixture","tag":"fixture"}');
begin;
set local role authenticated;
set local request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000010","session_id":"20000000-0000-4000-8000-000000000010","amr":[{"method":"password"}]}';
do $$ begin
 if api.consultar_sessao_nativa(gen_random_uuid()) is not null then raise exception 'SESSAO_NAO_ADMITIDA'; end if;
 if api.admitir_sessao_nativa(gen_random_uuid()) #>> '{usuario,perfil}' is distinct from 'administrador' then raise exception 'TECNICA_NEGADA'; end if;
 if api.consultar_sessao_nativa(gen_random_uuid()) is null then raise exception 'CONSULTA_NEGADA'; end if;
end $$;
set local request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000011","session_id":"20000000-0000-4000-8000-000000000011","amr":[{"method":"password"}]}';
do $$ begin if api.admitir_sessao_nativa(gen_random_uuid()) is not null then raise exception 'OUTRA_CONTA_ADMITIDA'; end if; end $$;
rollback;
update identidade.concessao_equipe set estado='revogada', revogada_em=clock_timestamp(),
 revogada_por_usuario_id='10000000-0000-4000-8000-000000000010',
 motivo_revogacao_cifrado='{"formato":1,"key_id":"fixture","nonce":"fixture","ciphertext":"fixture","tag":"fixture"}'
 where id='30000000-0000-4000-8000-000000000010';
begin;
set local role authenticated;
set local request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000010","session_id":"20000000-0000-4000-8000-000000000010","amr":[{"method":"password"}]}';
do $$ begin if api.admitir_sessao_nativa(gen_random_uuid()) is not null then raise exception 'REVOGADA_ADMITIDA'; end if; end $$;
rollback;
