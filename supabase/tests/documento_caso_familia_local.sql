\set ON_ERROR_STOP on
\ir documento_caso_operacoes_local.sql
-- `sessao_metodo_check` só aceita 'familia' a partir desta migration (e torna
-- concessao_id/concessao_versao_admissao opcionais); sem ela o fixture de sessão familiar
-- abaixo violaria a constraint antes de chegar perto da autorização.
\ir ../migrations/20261111160000_admissao_familiar_privada.sql
\ir ../migrations/20261124120000_documento_caso_familia_privada.sql

-- Paciente próprio deste teste (não o reaproveitado pelo resto da cadeia): evita que documentos
-- de testes anteriores inflem a contagem das asserções de leitura abaixo.
insert into cadastro.paciente(id, nome_cifrado, criado_por_usuario_id) values
 ('40000000-0000-4000-8000-0000000000f0',
  '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',
  '10000000-0000-4000-8000-000000000001');
insert into auth.users values
 ('10000000-0000-4000-8000-0000000000f4'),
 ('10000000-0000-4000-8000-0000000000f5');
insert into auth.sessions values
 ('20000000-0000-4000-8000-0000000000f4','10000000-0000-4000-8000-0000000000f4',null),
 ('20000000-0000-4000-8000-0000000000f5','10000000-0000-4000-8000-0000000000f5',null);
insert into public.usuario(id, perfil) values
 ('10000000-0000-4000-8000-0000000000f4','familia'),
 ('10000000-0000-4000-8000-0000000000f5','familia');
insert into identidade.sessao(session_id, usuario_id, concessao_id, concessao_versao_admissao, metodo)
 select replace(id::text,'10000000-','20000000-')::uuid, id, null, null, 'familia'
 from public.usuario where id in ('10000000-0000-4000-8000-0000000000f4','10000000-0000-4000-8000-0000000000f5');
-- Só a primeira família tem acesso ao paciente; a segunda fica sem `cadastro.acesso_paciente`
-- nenhum, para o negativo "sem vínculo" (distinto de "vínculo revogado", testado depois).
insert into cadastro.acesso_paciente(id, paciente_id, usuario_id, concedido_por_usuario_id, motivo_concessao_cifrado) values
 ('50000000-0000-4000-8000-0000000000f4','40000000-0000-4000-8000-0000000000f0','10000000-0000-4000-8000-0000000000f4','10000000-0000-4000-8000-000000000001',
  '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');

do $$
#variable_conflict use_variable
declare
 colaborador uuid:='10000000-0000-4000-8000-000000000001'; sessao_colab uuid:='20000000-0000-4000-8000-000000000001';
 familia uuid:='10000000-0000-4000-8000-0000000000f4'; sessao_familia uuid:='20000000-0000-4000-8000-0000000000f4';
 outra_familia uuid:='10000000-0000-4000-8000-0000000000f5'; sessao_outra uuid:='20000000-0000-4000-8000-0000000000f5';
 paciente uuid:='40000000-0000-4000-8000-0000000000f0';
 doc_publico uuid:=gen_random_uuid(); doc_interno uuid:=gen_random_uuid(); doc_tentativa uuid:=gen_random_uuid();
 registro uuid; req uuid; e jsonb; r jsonb;
begin
 -- Colaborador grava um documento público e um interno no paciente deste teste.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',colaborador,'session_id',sessao_colab,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 registro:=gen_random_uuid(); req:=gen_random_uuid();
 e:=public.entrada_documento_fixture(paciente,doc_publico,registro,req,0,'Laudo','equipe_e_familia','disponivel','fam-publico',repeat('a',43));
 r:=api.documento_operacao_privada(public.assinar_documento_fixture(e,'api.gravar_documento',colaborador,sessao_colab));
 if r->>'ok' is distinct from 'true' then raise exception 'GRAVACAO_PUBLICA: %',r; end if;

 registro:=gen_random_uuid(); req:=gen_random_uuid();
 e:=public.entrada_documento_fixture(paciente,doc_interno,registro,req,0,'Laudo','equipe','disponivel','fam-interno',repeat('b',43));
 r:=api.documento_operacao_privada(public.assinar_documento_fixture(e,'api.gravar_documento',colaborador,sessao_colab));
 if r->>'ok' is distinct from 'true' then raise exception 'GRAVACAO_INTERNA: %',r; end if;

 -- 1. Positivo: família com acesso vigente lê só o documento público.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',familia,'session_id',sessao_familia,'amr',jsonb_build_array(jsonb_build_object('method','password')))::text,true);
 req:=gen_random_uuid();
 r:=api.documento_operacao_privada(public.assinar_documento_fixture(jsonb_build_object('request_id',req,'paciente_id',paciente),'api.ler_documentos',familia,sessao_familia));
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r#>'{dados,documentos}') <> 1
  or r#>>'{dados,documentos,0,documento_id}' is distinct from doc_publico::text
  or r#>>'{dados,documentos,0,audiencia}' is distinct from 'equipe_e_familia' then
  raise exception 'FAMILIA_LEITURA_PUBLICA: %',r;
 end if;

 -- 2. Negativo: família sem `cadastro.acesso_paciente` para este paciente não vê nada.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',outra_familia,'session_id',sessao_outra,'amr',jsonb_build_array(jsonb_build_object('method','password')))::text,true);
 req:=gen_random_uuid();
 r:=api.documento_operacao_privada(public.assinar_documento_fixture(jsonb_build_object('request_id',req,'paciente_id',paciente),'api.ler_documentos',outra_familia,sessao_outra));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'OUTRA_FAMILIA_SEM_ACESSO_ACEITA: %',r; end if;

 -- 3. Negativo: família não grava documento, mesmo com atestado e entrada bem formados.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',familia,'session_id',sessao_familia,'amr',jsonb_build_array(jsonb_build_object('method','password')))::text,true);
 registro:=gen_random_uuid(); req:=gen_random_uuid();
 e:=public.entrada_documento_fixture(paciente,doc_tentativa,registro,req,0,'Laudo','equipe_e_familia','disponivel','fam-tenta-gravar',repeat('c',43));
 r:=api.documento_operacao_privada(public.assinar_documento_fixture(e,'api.gravar_documento',familia,sessao_familia));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'FAMILIA_GRAVOU_DOCUMENTO: %',r; end if;
 if exists(select 1 from cadastro.documento_caso_versao where id=registro) then
  raise exception 'FAMILIA_GRAVACAO_PERSISTIU';
 end if;

 -- 4. Negativo: acesso revogado derruba a família mesmo com sessão viva.
 update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id=colaborador,motivo_revogacao_cifrado=motivo_concessao_cifrado
  where usuario_id=familia;
 req:=gen_random_uuid();
 r:=api.documento_operacao_privada(public.assinar_documento_fixture(jsonb_build_object('request_id',req,'paciente_id',paciente),'api.ler_documentos',familia,sessao_familia));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'ACESSO_REVOGADO_ACEITO: %',r; end if;
 update cadastro.acesso_paciente set revogada_em=null,revogado_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id=familia;

 -- 5. Negativo: sessão de equipe disfarçada (amr=oauth) não passa pela trilha familiar.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',familia,'session_id',sessao_familia,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 req:=gen_random_uuid();
 r:=api.documento_operacao_privada(public.assinar_documento_fixture(jsonb_build_object('request_id',req,'paciente_id',paciente),'api.ler_documentos',familia,sessao_familia));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'AMR_TROCADO_ACEITO: %',r; end if;

 -- 6. Regressão: colaborador continua lendo os dois documentos, público e interno, sem o
 -- filtro de audiência que só vale para a família.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',colaborador,'session_id',sessao_colab,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 req:=gen_random_uuid();
 r:=api.documento_operacao_privada(public.assinar_documento_fixture(jsonb_build_object('request_id',req,'paciente_id',paciente),'api.ler_documentos',colaborador,sessao_colab));
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r#>'{dados,documentos}') <> 2 then
  raise exception 'COLABORADOR_FILTRADO_POR_AUDIENCIA: %',r;
 end if;

 -- 7. Positivo: colaborador troca a audiência do documento interno para público (nova versão
 -- de metadado, mesmo `drive_file_id`) e a família passa a enxergá-lo — confirma que "o admin
 -- altera em qualquer arquivo a qualquer momento" não precisa de mecanismo novo, só da trilha
 -- de leitura familiar enxergar a versão mais recente.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',colaborador,'session_id',sessao_colab,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 registro:=gen_random_uuid(); req:=gen_random_uuid();
 e:=public.entrada_documento_fixture(paciente,doc_interno,registro,req,1,'Laudo','equipe_e_familia','disponivel','fam-interno-vira-publico',repeat('d',43));
 r:=api.documento_operacao_privada(public.assinar_documento_fixture(e,'api.gravar_documento',colaborador,sessao_colab));
 if r->>'ok' is distinct from 'true' then raise exception 'TROCA_AUDIENCIA: %',r; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',familia,'session_id',sessao_familia,'amr',jsonb_build_array(jsonb_build_object('method','password')))::text,true);
 req:=gen_random_uuid();
 r:=api.documento_operacao_privada(public.assinar_documento_fixture(jsonb_build_object('request_id',req,'paciente_id',paciente),'api.ler_documentos',familia,sessao_familia));
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r#>'{dados,documentos}') <> 2 then
  raise exception 'FAMILIA_NAO_VIU_TROCA: %',r;
 end if;
end $$;
