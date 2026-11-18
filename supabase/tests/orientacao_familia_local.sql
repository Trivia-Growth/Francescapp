\set ON_ERROR_STOP on
\ir orientacao_operacoes_local.sql
-- `sessao_metodo_check` só aceita 'familia' a partir desta migration (e torna
-- concessao_id/concessao_versao_admissao opcionais); sem ela o fixture de sessão familiar
-- abaixo violaria a constraint antes de chegar perto da autorização.
\ir ../migrations/20261111160000_admissao_familiar_privada.sql
\ir ../migrations/20261117260000_orientacao_visibilidade.sql
\ir ../migrations/20261117270000_orientacao_familia_privada.sql

-- Paciente próprio deste teste (não o reaproveitado pelo resto da cadeia): evita que
-- orientações de testes anteriores inflem a contagem das asserções de leitura abaixo.
insert into cadastro.paciente(id, nome_cifrado, criado_por_usuario_id) values
 ('40000000-0000-4000-8000-0000000000f0',
  '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}',
  '10000000-0000-4000-8000-000000000002');
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
 ('50000000-0000-4000-8000-0000000000f4','40000000-0000-4000-8000-0000000000f0','10000000-0000-4000-8000-0000000000f4','10000000-0000-4000-8000-000000000002',
  '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');

do $$
#variable_conflict use_variable
declare
 colaborador uuid:='10000000-0000-4000-8000-000000000002'; sessao_colab uuid:='20000000-0000-4000-8000-000000000002';
 familia uuid:='10000000-0000-4000-8000-0000000000f4'; sessao_familia uuid:='20000000-0000-4000-8000-0000000000f4';
 outra_familia uuid:='10000000-0000-4000-8000-0000000000f5'; sessao_outra uuid:='20000000-0000-4000-8000-0000000000f5';
 paciente uuid:='40000000-0000-4000-8000-0000000000f0';
 ori_publica uuid:=gen_random_uuid(); ori_interna uuid:=gen_random_uuid(); ori_tentativa uuid:=gen_random_uuid();
 registro uuid; req uuid; e jsonb; r jsonb;
 envelope jsonb:=jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22));
begin
 -- Colaborador grava uma orientação pública e uma interna no paciente deste teste.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',colaborador,'session_id',sessao_colab,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 registro:=gen_random_uuid(); req:=gen_random_uuid();
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'orientacao_id',ori_publica,'registro_id',registro,'versao_esperada',0,'situacao','vigente','visibilidade','publica',
  'conteudo',envelope,
  'aad',jsonb_build_object('tabela','cadastro.orientacao_versao','paciente_id',paciente::text,'orientacao_id',ori_publica::text,'registro_id',registro::text,'versao',1,'campo','conteudo','formato',1));
 r:=api.orientacao_privada(public.assinar_anamnese_fixture(e,'api.gravar_orientacao',colaborador,sessao_colab));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,visibilidade}' is distinct from 'publica' then
  raise exception 'GRAVACAO_PUBLICA: %',r;
 end if;

 registro:=gen_random_uuid(); req:=gen_random_uuid();
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'orientacao_id',ori_interna,'registro_id',registro,'versao_esperada',0,'situacao','vigente','visibilidade','interna',
  'conteudo',envelope,
  'aad',jsonb_build_object('tabela','cadastro.orientacao_versao','paciente_id',paciente::text,'orientacao_id',ori_interna::text,'registro_id',registro::text,'versao',1,'campo','conteudo','formato',1));
 r:=api.orientacao_privada(public.assinar_anamnese_fixture(e,'api.gravar_orientacao',colaborador,sessao_colab));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,visibilidade}' is distinct from 'interna' then
  raise exception 'GRAVACAO_INTERNA: %',r;
 end if;

 -- 1. Positivo: família com acesso vigente lê só a orientação pública.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',familia,'session_id',sessao_familia,'amr',jsonb_build_array(jsonb_build_object('method','password')))::text,true);
 req:=gen_random_uuid();
 r:=api.orientacao_privada(public.assinar_anamnese_fixture(jsonb_build_object('request_id',req,'paciente_id',paciente),'api.ler_orientacoes',familia,sessao_familia));
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r->'dados') <> 1
  or r#>>'{dados,0,orientacao_id}' is distinct from ori_publica::text
  or r#>>'{dados,0,visibilidade}' is distinct from 'publica' then
  raise exception 'FAMILIA_LEITURA_PUBLICA: %',r;
 end if;

 -- 2. Negativo: família sem `cadastro.acesso_paciente` para este paciente não vê nada.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',outra_familia,'session_id',sessao_outra,'amr',jsonb_build_array(jsonb_build_object('method','password')))::text,true);
 req:=gen_random_uuid();
 r:=api.orientacao_privada(public.assinar_anamnese_fixture(jsonb_build_object('request_id',req,'paciente_id',paciente),'api.ler_orientacoes',outra_familia,sessao_outra));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'OUTRA_FAMILIA_SEM_ACESSO_ACEITA: %',r; end if;

 -- 3. Negativo: família não grava orientação, mesmo com atestado e entrada bem formados.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',familia,'session_id',sessao_familia,'amr',jsonb_build_array(jsonb_build_object('method','password')))::text,true);
 registro:=gen_random_uuid(); req:=gen_random_uuid();
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'orientacao_id',ori_tentativa,'registro_id',registro,'versao_esperada',0,'situacao','vigente','visibilidade','publica',
  'conteudo',envelope,
  'aad',jsonb_build_object('tabela','cadastro.orientacao_versao','paciente_id',paciente::text,'orientacao_id',ori_tentativa::text,'registro_id',registro::text,'versao',1,'campo','conteudo','formato',1));
 r:=api.orientacao_privada(public.assinar_anamnese_fixture(e,'api.gravar_orientacao',familia,sessao_familia));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'FAMILIA_GRAVOU_ORIENTACAO: %',r; end if;
 if exists(select 1 from cadastro.orientacao_versao where id=registro) then
  raise exception 'FAMILIA_GRAVACAO_PERSISTIU';
 end if;

 -- 4. Negativo: acesso revogado derruba a família mesmo com sessão viva.
 update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id=colaborador,motivo_revogacao_cifrado=motivo_concessao_cifrado
  where usuario_id=familia;
 req:=gen_random_uuid();
 r:=api.orientacao_privada(public.assinar_anamnese_fixture(jsonb_build_object('request_id',req,'paciente_id',paciente),'api.ler_orientacoes',familia,sessao_familia));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'ACESSO_REVOGADO_ACEITO: %',r; end if;
 update cadastro.acesso_paciente set revogada_em=null,revogado_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id=familia;

 -- 5. Negativo: sessão de equipe disfarçada (amr=oauth) não passa pela trilha familiar.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',familia,'session_id',sessao_familia,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 req:=gen_random_uuid();
 r:=api.orientacao_privada(public.assinar_anamnese_fixture(jsonb_build_object('request_id',req,'paciente_id',paciente),'api.ler_orientacoes',familia,sessao_familia));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'AMR_TROCADO_ACEITO: %',r; end if;

 -- 6. Regressão: colaborador continua lendo as duas orientações, pública e interna, sem o
 -- filtro de visibilidade que só vale para a família.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',colaborador,'session_id',sessao_colab,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 req:=gen_random_uuid();
 r:=api.orientacao_privada(public.assinar_anamnese_fixture(jsonb_build_object('request_id',req,'paciente_id',paciente),'api.ler_orientacoes',colaborador,sessao_colab));
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r->'dados') <> 2 then
  raise exception 'COLABORADOR_FILTRADO_POR_VISIBILIDADE: %',r;
 end if;
end $$;
