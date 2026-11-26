\set ON_ERROR_STOP on
\ir grant_plano_cuidado_local.sql
-- `sessao_metodo_check` só aceita 'familia' a partir desta migration (e torna
-- concessao_id/concessao_versao_admissao opcionais); sem ela o fixture de sessão familiar
-- abaixo violaria a constraint antes de chegar perto da autorização.
\ir ../migrations/20261111160000_admissao_familiar_privada.sql
\ir ../migrations/20261124100000_objetivo_cuidado_visibilidade.sql
\ir ../migrations/20261124110000_plano_cuidado_familia_privada.sql

-- Paciente próprio deste teste (não o reaproveitado pelo resto da cadeia): evita que objetivos
-- de testes anteriores inflem a contagem das asserções de leitura abaixo.
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
declare
 colaborador uuid:='10000000-0000-4000-8000-000000000002'; sessao_colab uuid:='20000000-0000-4000-8000-000000000002';
 familia uuid:='10000000-0000-4000-8000-0000000000f4'; sessao_familia uuid:='20000000-0000-4000-8000-0000000000f4';
 outra_familia uuid:='10000000-0000-4000-8000-0000000000f5'; sessao_outra uuid:='20000000-0000-4000-8000-0000000000f5';
 paciente uuid:='40000000-0000-4000-8000-0000000000f0';
 objetivo_publico uuid:=gen_random_uuid(); objetivo_interno uuid:=gen_random_uuid();
 objetivo_tentativa uuid:=gen_random_uuid(); reserva uuid; v_epoca bigint;
 registro uuid; req uuid; e jsonb; r jsonb;
 envelope jsonb:=jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22));
begin
 -- Colaborador grava um objetivo público e um interno no paciente deste teste. Cada gravação
 -- com `versao_esperada=0` exige reserva/barreira aberta antes (migration `20261107160000`,
 -- já na cadeia por `grant_plano_cuidado_local.sql`); sem reservar primeiro, a escrita volta
 -- `conflito` em vez de `ok`. A época precisa ser exatamente a corrente da barreira deste
 -- colaborador (reaproveitado por testes anteriores da cadeia) — descoberta aqui, não
 -- suposta, e o resultado pendente de um ciclo anterior é limpo direto na tabela em vez de
 -- replicar `reconhecer_barreira_plano_privado` (mesmo fim, sem o recibo que ele exige).
 perform set_config('request.jwt.claims',jsonb_build_object('sub',colaborador,'session_id',sessao_colab,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 insert into operacao.barreira_plano(ator_usuario_id) values(colaborador) on conflict do nothing;
 update operacao.barreira_plano set resultado_pendente=null, reserva_atual=null where ator_usuario_id=colaborador;
 select epoca into v_epoca from operacao.barreira_plano where ator_usuario_id=colaborador;

 reserva:=gen_random_uuid();
 if operacao.reservar_plano_privado(colaborador,v_epoca,reserva,paciente)<>'aberta' then raise exception 'RESERVA_PUBLICA'; end if;
 registro:=gen_random_uuid(); req:=gen_random_uuid();
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'objetivo_id',objetivo_publico,'registro_id',registro,'versao_esperada',0,'visibilidade','publica',
  'reserva_id',reserva,'geracao_reserva',v_epoca,
  'chave_idempotencia','fam-publico','digest_idempotencia',repeat('a',43),'conteudo',envelope,
  'aad',jsonb_build_object('tabela','cadastro.objetivo_cuidado_versao','paciente_id',paciente::text,'objetivo_id',objetivo_publico::text,'registro_id',registro::text,'versao',1,'campo','conteudo','formato',1));
 r:=api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.gravar_objetivo_cuidado',colaborador,sessao_colab));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,visibilidade}' is distinct from 'publica' then
  raise exception 'GRAVACAO_PUBLICA: %',r;
 end if;
 if operacao.encerrar_plano_privado(colaborador,v_epoca,reserva,gen_random_uuid())<>'confirmada' then raise exception 'ENCERRAR_PUBLICA'; end if;
 update operacao.barreira_plano set resultado_pendente=null where ator_usuario_id=colaborador;
 v_epoca:=v_epoca+1;

 reserva:=gen_random_uuid();
 if operacao.reservar_plano_privado(colaborador,v_epoca,reserva,paciente)<>'aberta' then raise exception 'RESERVA_INTERNA'; end if;
 registro:=gen_random_uuid(); req:=gen_random_uuid();
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'objetivo_id',objetivo_interno,'registro_id',registro,'versao_esperada',0,'visibilidade','interna',
  'reserva_id',reserva,'geracao_reserva',v_epoca,
  'chave_idempotencia','fam-interno','digest_idempotencia',repeat('b',43),'conteudo',envelope,
  'aad',jsonb_build_object('tabela','cadastro.objetivo_cuidado_versao','paciente_id',paciente::text,'objetivo_id',objetivo_interno::text,'registro_id',registro::text,'versao',1,'campo','conteudo','formato',1));
 r:=api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.gravar_objetivo_cuidado',colaborador,sessao_colab));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,visibilidade}' is distinct from 'interna' then
  raise exception 'GRAVACAO_INTERNA: %',r;
 end if;
 if operacao.encerrar_plano_privado(colaborador,v_epoca,reserva,gen_random_uuid())<>'confirmada' then raise exception 'ENCERRAR_INTERNA'; end if;
 update operacao.barreira_plano set resultado_pendente=null where ator_usuario_id=colaborador;

 -- 1. Positivo: família com acesso vigente lê só o objetivo público.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',familia,'session_id',sessao_familia,'amr',jsonb_build_array(jsonb_build_object('method','password')))::text,true);
 req:=gen_random_uuid();
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'cursor',null,'limite',20);
 r:=api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.ler_plano_cuidado',familia,sessao_familia));
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r#>'{dados,itens}') <> 1
  or r#>>'{dados,itens,0,objetivo_id}' is distinct from objetivo_publico::text
  or r#>>'{dados,itens,0,visibilidade}' is distinct from 'publica' then
  raise exception 'FAMILIA_LEITURA_PUBLICA: %',r;
 end if;

 -- 2. Negativo: família sem `cadastro.acesso_paciente` para este paciente não vê nada.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',outra_familia,'session_id',sessao_outra,'amr',jsonb_build_array(jsonb_build_object('method','password')))::text,true);
 req:=gen_random_uuid();
 e:=jsonb_set(e,'{request_id}',to_jsonb(req));
 r:=api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.ler_plano_cuidado',outra_familia,sessao_outra));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'OUTRA_FAMILIA_SEM_ACESSO_ACEITA: %',r; end if;

 -- 3. Negativo: família não grava objetivo, mesmo com atestado e entrada bem formados.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',familia,'session_id',sessao_familia,'amr',jsonb_build_array(jsonb_build_object('method','password')))::text,true);
 registro:=gen_random_uuid(); req:=gen_random_uuid();
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'objetivo_id',objetivo_tentativa,'registro_id',registro,'versao_esperada',0,'visibilidade','publica',
  'chave_idempotencia','fam-tenta-gravar','digest_idempotencia',repeat('c',43),'conteudo',envelope,
  'aad',jsonb_build_object('tabela','cadastro.objetivo_cuidado_versao','paciente_id',paciente::text,'objetivo_id',objetivo_tentativa::text,'registro_id',registro::text,'versao',1,'campo','conteudo','formato',1));
 r:=api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.gravar_objetivo_cuidado',familia,sessao_familia));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'FAMILIA_GRAVOU_OBJETIVO: %',r; end if;
 if exists(select 1 from cadastro.objetivo_cuidado_versao where id=registro) then
  raise exception 'FAMILIA_GRAVACAO_PERSISTIU';
 end if;

 -- 4. Negativo: família não lê histórico, nem do objetivo público que ela já lê na lista.
 req:=gen_random_uuid();
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'objetivo_id',objetivo_publico,'cursor',null,'limite',20);
 r:=api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.ler_historico_objetivo_cuidado',familia,sessao_familia));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'FAMILIA_LEU_HISTORICO: %',r; end if;

 -- 5. Negativo: acesso revogado derruba a família mesmo com sessão viva.
 update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id=colaborador,motivo_revogacao_cifrado=motivo_concessao_cifrado
  where usuario_id=familia;
 req:=gen_random_uuid();
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'cursor',null,'limite',20);
 r:=api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.ler_plano_cuidado',familia,sessao_familia));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'ACESSO_REVOGADO_ACEITO: %',r; end if;
 update cadastro.acesso_paciente set revogada_em=null,revogado_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id=familia;

 -- 6. Negativo: sessão de equipe disfarçada (amr=oauth) não passa pela trilha familiar.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',familia,'session_id',sessao_familia,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 req:=gen_random_uuid();
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'cursor',null,'limite',20);
 r:=api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.ler_plano_cuidado',familia,sessao_familia));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'AMR_TROCADO_ACEITO: %',r; end if;

 -- 7. Regressão: colaborador continua lendo os dois objetivos, sem o filtro de visibilidade
 -- que só vale para a família.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',colaborador,'session_id',sessao_colab,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 req:=gen_random_uuid();
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'cursor',null,'limite',20);
 r:=api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.ler_plano_cuidado',colaborador,sessao_colab));
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r#>'{dados,itens}') <> 2 then
  raise exception 'COLABORADOR_FILTRADO_POR_VISIBILIDADE: %',r;
 end if;
end $$;

-- Paginação filtra pela versão mais recente antes de contar objetivos para a família.
insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id) values
 ('40000000-0000-4000-8000-0000000000f1','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','10000000-0000-4000-8000-000000000002');
insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado) values
 ('50000000-0000-4000-8000-0000000000f6','40000000-0000-4000-8000-0000000000f1','10000000-0000-4000-8000-0000000000f4','10000000-0000-4000-8000-000000000002','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
insert into cadastro.objetivo_cuidado(id,paciente_id) values
 ('60000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-0000000000f1'),
 ('60000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-0000000000f1'),
 ('60000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-0000000000f1'),
 ('60000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-0000000000f1');
insert into cadastro.objetivo_cuidado_versao(id,objetivo_id,versao,versao_esperada,conteudo_cifrado,criado_por_usuario_id,visibilidade) values
 ('70000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',1,null,'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','10000000-0000-4000-8000-000000000002','interna'),
 ('70000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002',1,null,'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','10000000-0000-4000-8000-000000000002','publica'),
 ('70000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000003',1,null,'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','10000000-0000-4000-8000-000000000002','publica'),
 ('70000000-0000-4000-8000-000000000004','60000000-0000-4000-8000-000000000004',1,null,'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','10000000-0000-4000-8000-000000000002','publica');
insert into cadastro.objetivo_cuidado_versao(id,objetivo_id,versao,versao_esperada,conteudo_cifrado,criado_por_usuario_id,visibilidade) values
 ('70000000-0000-4000-8000-000000000005','60000000-0000-4000-8000-000000000003',2,1,'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','10000000-0000-4000-8000-000000000002','interna');

do $$
declare
 familia uuid:='10000000-0000-4000-8000-0000000000f4'; sessao uuid:='20000000-0000-4000-8000-0000000000f4';
 e jsonb; r jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',familia,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','password')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id','40000000-0000-4000-8000-0000000000f1','cursor',null,'limite',1);
 r:=api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.ler_plano_cuidado',familia,sessao));
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r#>'{dados,itens}')<>1
  or r#>>'{dados,itens,0,objetivo_id}' is distinct from '60000000-0000-4000-8000-000000000002'
  or r#>>'{dados,proximo_cursor}' is distinct from '60000000-0000-4000-8000-000000000002' then
  raise exception 'FAMILIA_PAGINA_1: %',r;
 end if;
 e:=jsonb_set(jsonb_set(e,'{request_id}',to_jsonb(gen_random_uuid())),'{cursor}',r#>'{dados,proximo_cursor}');
 r:=api.plano_cuidado_privado(public.assinar_anamnese_fixture(e,'api.ler_plano_cuidado',familia,sessao));
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r#>'{dados,itens}')<>1
  or r#>>'{dados,itens,0,objetivo_id}' is distinct from '60000000-0000-4000-8000-000000000004'
  or r#>'{dados,proximo_cursor}' is distinct from 'null'::jsonb then
  raise exception 'FAMILIA_PAGINA_2: %',r;
 end if;
end $$;
