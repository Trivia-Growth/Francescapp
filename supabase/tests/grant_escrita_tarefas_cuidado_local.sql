\set ON_ERROR_STOP on
\ir barreira_tarefa_cuidado_local.sql

-- A partir daqui, prova de que o grant a `authenticated` é necessário e suficiente,
-- e que RLS/autorização seguem valendo quando a chamada não vem mais de superusuário.

create role tarefas_escrita_migrador nologin nosuperuser nocreaterole;
grant usage on schema api to tarefas_escrita_migrador;
grant ffcmapp_tarefa_owner to tarefas_escrita_migrador with inherit false, set true;
grant ffcmapp_tarefa_barreira_owner to tarefas_escrita_migrador with inherit false, set true;
grant tarefas_escrita_migrador to current_user with inherit false, set true;
set role tarefas_escrita_migrador;
\ir ../drafts/grant_escrita_tarefas_cuidado.sql
reset role;
set role tarefas_escrita_migrador;
\ir ../drafts/grant_barreira_tarefas_cuidado.sql
reset role;

do $$ begin
 if not has_function_privilege('authenticated','api.tarefa_cuidado_privado(jsonb)','execute')
  or not has_function_privilege('authenticated','api.tarefa_cuidado_operacao_privada(jsonb)','execute')
  or not has_function_privilege('authenticated','api.tarefa_barreira_composicao(jsonb)','execute')
  or has_function_privilege('anon','api.tarefa_cuidado_privado(jsonb)','execute')
  or has_function_privilege('service_role','api.tarefa_cuidado_privado(jsonb)','execute')
  or has_table_privilege('authenticated','cadastro.tarefa_cuidado','select')
  or has_table_privilege('authenticated','cadastro.tarefa_cuidado_versao','insert')
 then raise exception 'GRANT_INCORRETO'; end if;
end $$;

-- Fixtures isoladas por cenário, para não depender de ordem nem de estado residual.
-- Segue a mesma cadeia de identidade Google usada em anamnese_operacoes_local.sql
-- (auth.users -> public.usuario -> auth.identities/auth.sessions -> concessao_equipe -> identidade.sessao),
-- com o mesmo esquema de prefixos de id, para passar pela RLS real sem atalho.
insert into auth.users values
 ('10000000-0000-4000-8000-000000000010'), -- vinculado ativo (positivo)
 ('10000000-0000-4000-8000-000000000012'), -- vínculo será revogado
 ('10000000-0000-4000-8000-000000000013'), -- sessão será encerrada
 ('10000000-0000-4000-8000-000000000014'); -- perfil família (acesso direto indevido)
insert into public.usuario(id,perfil) values
 ('10000000-0000-4000-8000-000000000010','profissional'),
 ('10000000-0000-4000-8000-000000000012','profissional'),
 ('10000000-0000-4000-8000-000000000013','profissional'),
 ('10000000-0000-4000-8000-000000000014','profissional'); -- perfil muda para família DEPOIS da concessão (concessao_equipe não aceita 'familia')
insert into auth.identities select id,id,'google','google-'||id,jsonb_build_object('sub','google-'||id,'email_verified',true,'custom_claims',jsonb_build_object('hd','example.test')) from auth.users
 where id in ('10000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000014');
insert into auth.sessions select replace(id::text,'10000000-','20000000-')::uuid,id,null from auth.users
 where id in ('10000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000014');
insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,criada_em,vinculada_em)
 select replace(id::text,'10000000-','30000000-')::uuid,'{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}','fixture-'||id,perfil,'google_workspace','vinculada',id,'google-'||id,'{"formato":1,"key_id":"fixture","nonce":"n","ciphertext":"c","tag":"t"}',now()-interval '1 day',now()
 from public.usuario where id in ('10000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000014');
insert into identidade.sessao(session_id,usuario_id,concessao_id,concessao_versao_admissao,metodo)
 select replace(id::text,'10000000-','20000000-')::uuid,id,replace(id::text,'10000000-','30000000-')::uuid,1,'google_workspace'
 from public.usuario where id in ('10000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000014');

insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id) values
 ('40000000-0000-4000-8000-000000000010','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','10000000-0000-4000-8000-000000000001'),
 ('40000000-0000-4000-8000-000000000011','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','10000000-0000-4000-8000-000000000001'), -- paciente alheio: nenhum usuário novo tem vínculo aqui
 ('40000000-0000-4000-8000-000000000012','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','10000000-0000-4000-8000-000000000001'),
 ('40000000-0000-4000-8000-000000000013','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','10000000-0000-4000-8000-000000000001'),
 ('40000000-0000-4000-8000-000000000014','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','10000000-0000-4000-8000-000000000001');

insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado) values
 ('91000000-0000-4000-8000-000000000010','40000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001',jsonb_build_object('formato',1,'key_id','v1','nonce','n','ciphertext','c','tag','t')),
 ('91000000-0000-4000-8000-000000000012','40000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000001',jsonb_build_object('formato',1,'key_id','v1','nonce','n','ciphertext','c','tag','t')),
 ('91000000-0000-4000-8000-000000000013','40000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000001',jsonb_build_object('formato',1,'key_id','v1','nonce','n','ciphertext','c','tag','t')),
 ('91000000-0000-4000-8000-000000000014','40000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000001',jsonb_build_object('formato',1,'key_id','v1','nonce','n','ciphertext','c','tag','t'));

-- Revoga de verdade o vínculo do cenário (c).
update cadastro.acesso_paciente set revogada_em=clock_timestamp(), revogado_por_usuario_id='10000000-0000-4000-8000-000000000001',
 motivo_revogacao_cifrado=motivo_concessao_cifrado where id='91000000-0000-4000-8000-000000000012';

-- Encerra de verdade a sessão do cenário (d).
update identidade.sessao set encerrada_em=clock_timestamp() where usuario_id='10000000-0000-4000-8000-000000000013';

-- Cenário (e): mismatch de perfil pós-concessão, igual ao padrão usado em tarefa_rls_local.sql.
update public.usuario set perfil='familia' where id='10000000-0000-4000-8000-000000000014';

-- Desde a migration da barreira (20261112300000), `api.tarefa_cuidado_privado` (gravar)
-- exige `reserva_id`/`geracao_reserva` de uma reserva aberta por `api.tarefa_barreira_composicao`:
-- escrita direta sem reserva passou a ser ENTRADA_INVALIDA por desenho (não é bug desta prova).
-- Cada cenário abaixo primeiro reserva (prova o gate real de autorização) e, só no positivo,
-- segue para a gravação ligada à mesma reserva. Assinar com o papel atual (como o servidor faria),
-- trocar para `authenticated` só para a chamada da API, e voltar ao papel original ao final.

-- (a) Positivo: profissional vinculado ativo reserva e grava tarefa via authenticated.
do $$
declare paciente uuid:='40000000-0000-4000-8000-000000000010'; tarefa uuid:=gen_random_uuid(); registro uuid:=gen_random_uuid();
 reserva uuid:=gen_random_uuid(); reserva_entrada jsonb; reserva_assinada jsonb; gravar_entrada jsonb; gravar_assinada jsonb; resposta jsonb;
begin
 reserva_entrada:=jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.reservar_tarefa_cuidado','epoca',1,
  'reserva_id',reserva,'paciente_id',paciente,'tarefa_id',tarefa,'versao_esperada',0);
 reserva_assinada:=public.assinar_anamnese_fixture(reserva_entrada,'api.reservar_tarefa_cuidado','10000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000010');
 execute 'set role authenticated';
 perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000010","session_id":"20000000-0000-4000-8000-000000000010","amr":[{"method":"oauth"}]}',true);
 resposta:=api.tarefa_barreira_composicao(reserva_assinada);
 execute 'reset role';
 if resposta#>>'{dados,estado}' is distinct from 'aberta' then raise exception 'RESERVA_POSITIVA_FALHOU_COMO_AUTHENTICATED: %',resposta; end if;
 gravar_entrada:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'tarefa_id',tarefa,'registro_id',registro,
  'versao_esperada',0,'reserva_id',reserva,'geracao_reserva',1,'chave_idempotencia','grant-prova-positivo','digest_idempotencia',repeat('a',43),
  'conteudo',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)),
  'aad',jsonb_build_object('tabela','cadastro.tarefa_cuidado_versao','paciente_id',paciente,'tarefa_id',tarefa,'registro_id',registro,'versao',1,'campo','conteudo','formato',1));
 gravar_assinada:=public.assinar_anamnese_fixture(gravar_entrada,'api.gravar_tarefa_cuidado','10000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000010');
 execute 'set role authenticated';
 perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000010","session_id":"20000000-0000-4000-8000-000000000010","amr":[{"method":"oauth"}]}',true);
 resposta:=api.tarefa_cuidado_privado(gravar_assinada);
 execute 'reset role';
 if resposta->>'ok' is distinct from 'true' then raise exception 'GRAVACAO_POSITIVA_FALHOU_COMO_AUTHENTICATED: %',resposta; end if;
end $$;

-- (b) Negativo: paciente alheio, sem vínculo. Já barrado na própria reserva.
do $$
declare entrada jsonb; assinada jsonb; resposta jsonb;
begin
 entrada:=jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.reservar_tarefa_cuidado','epoca',1,
  'reserva_id',gen_random_uuid(),'paciente_id','40000000-0000-4000-8000-000000000011','tarefa_id',gen_random_uuid(),'versao_esperada',0);
 assinada:=public.assinar_anamnese_fixture(entrada,'api.reservar_tarefa_cuidado','10000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000010');
 execute 'set role authenticated';
 perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000010","session_id":"20000000-0000-4000-8000-000000000010","amr":[{"method":"oauth"}]}',true);
 resposta:=api.tarefa_barreira_composicao(assinada);
 execute 'reset role';
 if resposta#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'PACIENTE_ALHEIO_ACEITO: %',resposta; end if;
end $$;

-- (c) Negativo: vínculo revogado.
do $$
declare entrada jsonb; assinada jsonb; resposta jsonb;
begin
 entrada:=jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.reservar_tarefa_cuidado','epoca',1,
  'reserva_id',gen_random_uuid(),'paciente_id','40000000-0000-4000-8000-000000000012','tarefa_id',gen_random_uuid(),'versao_esperada',0);
 assinada:=public.assinar_anamnese_fixture(entrada,'api.reservar_tarefa_cuidado','10000000-0000-4000-8000-000000000012','20000000-0000-4000-8000-000000000012');
 execute 'set role authenticated';
 perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000012","session_id":"20000000-0000-4000-8000-000000000012","amr":[{"method":"oauth"}]}',true);
 resposta:=api.tarefa_barreira_composicao(assinada);
 execute 'reset role';
 if resposta#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'VINCULO_REVOGADO_ACEITO: %',resposta; end if;
end $$;

-- (d) Negativo: sessão encerrada.
do $$
declare entrada jsonb; assinada jsonb; resposta jsonb;
begin
 entrada:=jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.reservar_tarefa_cuidado','epoca',1,
  'reserva_id',gen_random_uuid(),'paciente_id','40000000-0000-4000-8000-000000000013','tarefa_id',gen_random_uuid(),'versao_esperada',0);
 assinada:=public.assinar_anamnese_fixture(entrada,'api.reservar_tarefa_cuidado','10000000-0000-4000-8000-000000000013','20000000-0000-4000-8000-000000000013');
 execute 'set role authenticated';
 perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000013","session_id":"20000000-0000-4000-8000-000000000013","amr":[{"method":"oauth"}]}',true);
 resposta:=api.tarefa_barreira_composicao(assinada);
 execute 'reset role';
 if resposta#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'SESSAO_ENCERRADA_ACEITA: %',resposta; end if;
end $$;

-- (e) Negativo: perfil família (acesso direto indevido, sem concessão de equipe profissional).
do $$
declare entrada jsonb; assinada jsonb; resposta jsonb;
begin
 entrada:=jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.reservar_tarefa_cuidado','epoca',1,
  'reserva_id',gen_random_uuid(),'paciente_id','40000000-0000-4000-8000-000000000014','tarefa_id',gen_random_uuid(),'versao_esperada',0);
 assinada:=public.assinar_anamnese_fixture(entrada,'api.reservar_tarefa_cuidado','10000000-0000-4000-8000-000000000014','20000000-0000-4000-8000-000000000014');
 execute 'set role authenticated';
 perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000014","session_id":"20000000-0000-4000-8000-000000000014","amr":[{"method":"oauth"}]}',true);
 resposta:=api.tarefa_barreira_composicao(assinada);
 execute 'reset role';
 if resposta#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'PERFIL_FAMILIA_ACEITO: %',resposta; end if;
end $$;

reset role;

-- Rollback dos dois drafts deve ser possível e deixar o estado limpo.
set role tarefas_escrita_migrador;
\ir ../drafts/rollback_grant_barreira_tarefas_cuidado.sql
reset role;
set role tarefas_escrita_migrador;
\ir ../drafts/rollback_grant_escrita_tarefas_cuidado.sql
reset role;

do $$ begin
 if has_function_privilege('authenticated','api.tarefa_cuidado_privado(jsonb)','execute')
  or has_function_privilege('authenticated','api.tarefa_cuidado_operacao_privada(jsonb)','execute')
  or has_function_privilege('authenticated','api.tarefa_barreira_composicao(jsonb)','execute')
 then raise exception 'ROLLBACK_RESIDUAL'; end if;
end $$;
