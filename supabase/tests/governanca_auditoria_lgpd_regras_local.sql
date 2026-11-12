-- PostgreSQL descartável; Auth e Vault são fixtures fictícias, sem serviço remoto.
-- Provas de FR-039 (consulta de auditoria), FR-040 (solicitações do titular) e FR-041 (regras).
-- Positivos e negativos de autorização, imutabilidade da trilha e isolamento entre casos.
\set ON_ERROR_STOP on
\ir configuracao_sistema_local.sql
-- `cadeia_migrations_local.sql` está congelada antes desta migration e 11 testes dependem dela,
-- então a coluna `ator_auth_id` entra aqui em vez de mutar a base compartilhada. A consulta de
-- auditoria precisa dela: identidade Auth não admitida também é um ator da trilha.
\ir ../migrations/20261112100000_auditoria_carteira_auth_nao_admitido.sql
\ir ../migrations/20261119300000_consulta_auditoria_privada.sql
\ir ../migrations/20261119320000_regras_atendimento_publicas.sql
\ir ../migrations/20261119340000_solicitacao_titular.sql
\ir ../migrations/20261119350000_solicitacao_titular_operacoes_privadas.sql

-- Terceiro paciente, para provar que o filtro por caso isola de verdade. Os ids ...0001 e
-- ...0002 já vêm da cadeia herdada; este é exclusivo deste teste.
insert into cadastro.paciente(id,nome_cifrado,criado_por_usuario_id) values
 ('40000000-0000-4000-8000-000000000009','{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}','10000000-0000-4000-8000-000000000001');

-- NOTA DE INTEGRAÇÃO (ver tasks.md): o usuário `familia` da cadeia herdada não tem sessão de
-- aplicação. Não é descuido da fixture: `identidade.concessao_equipe.perfil` só aceita
-- 'administrador' e 'profissional' (migration 20261017113000), e `identidade.sessao.concessao_id`
-- referencia essa tabela — ou seja, a sessão de FAMÍLIA não vive aqui. A jornada familiar tem
-- mecanismo próprio, em construção em paralelo (20261119200000–20261119240000).
-- Portanto este teste prova FR-041 com PROFISSIONAL (não-administrador), que já demonstra que a
-- regra não exige perfil de administração, e registra a família como caminho a provar quando a
-- sessão familiar existir.

do $$
declare
 administrador uuid := '10000000-0000-4000-8000-000000000001';
 sessao_admin uuid := '20000000-0000-4000-8000-000000000001';
 profissional uuid := '10000000-0000-4000-8000-000000000002';
 sessao_prof uuid := '20000000-0000-4000-8000-000000000002';
 familia uuid := '10000000-0000-4000-8000-000000000004';
 sessao_familia uuid := '20000000-0000-4000-8000-000000000004';
 paciente_a uuid := '40000000-0000-4000-8000-000000000001';
 paciente_b uuid := '40000000-0000-4000-8000-000000000009';
 solicitacao_a uuid := gen_random_uuid();
 solicitacao_b uuid := gen_random_uuid();
 envelope jsonb := '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}'::jsonb;
 e jsonb; r jsonb; antes bigint; depois bigint; alvo_evento uuid;
begin
 -- ---------------------------------------------------------------------------
 -- Nenhum papel de aplicação alcança as funções direto.
 -- ---------------------------------------------------------------------------
 if has_function_privilege('authenticated','api.consultar_auditoria(jsonb)','execute')
  or has_function_privilege('anon','api.consultar_auditoria(jsonb)','execute')
  or has_function_privilege('service_role','api.consultar_auditoria(jsonb)','execute')
  or has_function_privilege('authenticated','operacao.consultar_auditoria_privado(jsonb)','execute')
  or has_function_privilege('authenticated','api.consultar_regras_atendimento(jsonb)','execute')
  or has_function_privilege('anon','api.consultar_regras_atendimento(jsonb)','execute')
  or has_function_privilege('authenticated','api.solicitacao_titular_privado(jsonb)','execute')
  or has_function_privilege('anon','api.solicitacao_titular_privado(jsonb)','execute')
  or has_function_privilege('service_role','api.solicitacao_titular_privado(jsonb)','execute') then
  raise exception 'EXECUCAO_DIRETA_PERMITIDA';
 end if;

 -- ---------------------------------------------------------------------------
 -- FR-039. Positivo: administrador consulta e recebe página.
 -- ---------------------------------------------------------------------------
 perform set_config('request.jwt.claims',jsonb_build_object('sub',administrador,'session_id',sessao_admin,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'limite',25);
 r:=api.consultar_auditoria(public.assinar_anamnese_fixture(e,'api.consultar_auditoria',administrador,sessao_admin));
 if r->>'ok' is distinct from 'true' or jsonb_typeof(r#>'{dados,itens}') is distinct from 'array' then
  raise exception 'AUDITORIA_ADMIN_NEGADA: %',r;
 end if;
 -- A própria consulta é auditada (FR-039 manda registrar consultas).
 if not exists(select 1 from auditoria.evento where acao='api.consultar_auditoria' and ator_usuario_id=administrador and resultado='permitido') then
  raise exception 'AUDITORIA_DA_CONSULTA_AUSENTE';
 end if;
 -- Nenhuma coluna de conteúdo sai na resposta: o schema do item é fechado.
 if exists(select 1 from jsonb_array_elements(r#>'{dados,itens}') i
   where i ?| array['motivo_cifrado','request_id']) then
  raise exception 'AUDITORIA_VAZOU_CONTEUDO: %',r;
 end if;

 -- Negativo: profissional não administrador.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',profissional,'session_id',sessao_prof,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'limite',25);
 r:=api.consultar_auditoria(public.assinar_anamnese_fixture(e,'api.consultar_auditoria',profissional,sessao_prof));
 if r->>'ok' is distinct from 'false' or r#>>'{erro,codigo}' is distinct from 'sem_permissao' then
  raise exception 'AUDITORIA_PROFISSIONAL_PERMITIDA: %',r;
 end if;
 if not exists(select 1 from auditoria.evento where acao='api.consultar_auditoria' and ator_usuario_id=profissional and resultado='negado') then
  raise exception 'AUDITORIA_NEGATIVA_NAO_REGISTRADA';
 end if;

 -- Negativo: família.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',familia,'session_id',sessao_familia,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'limite',25);
 r:=api.consultar_auditoria(public.assinar_anamnese_fixture(e,'api.consultar_auditoria',familia,sessao_familia));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then
  raise exception 'AUDITORIA_FAMILIA_PERMITIDA: %',r;
 end if;

 -- ---------------------------------------------------------------------------
 -- FR-041. Positivo: profissional comum lê as regras (é o ponto do requisito).
 -- ---------------------------------------------------------------------------
 perform set_config('request.jwt.claims',jsonb_build_object('sub',profissional,'session_id',sessao_prof,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid());
 r:=api.consultar_regras_atendimento(public.assinar_anamnese_fixture(e,'api.consultar_regras_atendimento',profissional,sessao_prof));
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r->'dados') <> 4 then
  raise exception 'REGRAS_PROFISSIONAL_NEGADAS: %',r;
 end if;
 -- Negativo: sem sessão de aplicação, ninguém lê — nem com JWT válido. É o caso do usuário
 -- `familia` hoje (ver nota de integração no topo).
 perform set_config('request.jwt.claims',jsonb_build_object('sub',familia,'session_id',sessao_familia,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid());
 if api.consultar_regras_atendimento(public.assinar_anamnese_fixture(e,'api.consultar_regras_atendimento',familia,sessao_familia))#>>'{erro,codigo}' is distinct from 'sem_permissao' then
  raise exception 'REGRAS_SEM_SESSAO_PERMITIDAS';
 end if;
 -- Volta ao profissional para as checagens de conteúdo da resposta.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',profissional,'session_id',sessao_prof,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid());
 r:=api.consultar_regras_atendimento(public.assinar_anamnese_fixture(e,'api.consultar_regras_atendimento',profissional,sessao_prof));
 -- Negativo que importa: nenhuma chave de 'servidor' ou 'administracao' escapa por aqui.
 if exists(select 1 from jsonb_array_elements(r->'dados') i where i->>'chave' not like 'ffcm.regras.%') then
  raise exception 'REGRAS_VAZARAM_CONFIGURACAO: %',r;
 end if;

 -- ---------------------------------------------------------------------------
 -- FR-040. Positivo: administrador registra solicitação no caso A.
 -- ---------------------------------------------------------------------------
 perform set_config('request.jwt.claims',jsonb_build_object('sub',administrador,'session_id',sessao_admin,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente_a,'registro_id',solicitacao_a,
   'tipo','exclusao','descricao',envelope,'recebida_em',clock_timestamp()-interval '1 hour',
   'aad',jsonb_build_object('tabela','cadastro.solicitacao_titular','paciente_id',paciente_a::text,'registro_id',solicitacao_a::text,'versao',1,'campo','descricao','formato',1),
   'chave_idempotencia','solicitacao-a','digest_idempotencia',repeat('a',43),'auditoria_id',gen_random_uuid());
 r:=api.solicitacao_titular_privado(public.assinar_anamnese_fixture(e,'api.registrar_solicitacao_titular',administrador,sessao_admin));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,estado}' is distinct from 'recebida' or r#>>'{dados,versao}' is distinct from '1' then
  raise exception 'REGISTRO_SOLICITACAO: %',r;
 end if;

 -- Replay com a mesma chave e mesmo digest não duplica.
 r:=api.solicitacao_titular_privado(public.assinar_anamnese_fixture(e,'api.registrar_solicitacao_titular',administrador,sessao_admin));
 if r->>'ok' is distinct from 'true' or (select count(*) from cadastro.solicitacao_titular where id=solicitacao_a)<>1 then
  raise exception 'REPLAY_SOLICITACAO: %',r;
 end if;

 -- Mesma chave com digest diferente: conflito de idempotência.
 r:=api.solicitacao_titular_privado(public.assinar_anamnese_fixture(jsonb_set(e,'{digest_idempotencia}',to_jsonb(repeat('b',43))),'api.registrar_solicitacao_titular',administrador,sessao_admin));
 if r#>>'{erro,codigo}' is distinct from 'conflito_idempotencia' then
  raise exception 'CONFLITO_IDEMPOTENCIA_SOLICITACAO: %',r;
 end if;

 -- AAD de outro paciente é recusado: envelope não pode ser replantado em outra linha.
 begin
  r:=api.solicitacao_titular_privado(public.assinar_anamnese_fixture(
    jsonb_set(jsonb_set(e,'{chave_idempotencia}',to_jsonb('solicitacao-aad-torto'::text)),
      '{aad,paciente_id}',to_jsonb(paciente_b::text)),
    'api.registrar_solicitacao_titular',administrador,sessao_admin));
  raise exception 'AAD_TORTO_ACEITO: %',r;
 exception when invalid_parameter_value then null;
 end;

 -- Solicitação no caso B, para o teste de isolamento.
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente_b,'registro_id',solicitacao_b,
   'tipo','acesso','descricao',envelope,'recebida_em',clock_timestamp()-interval '30 minutes',
   'aad',jsonb_build_object('tabela','cadastro.solicitacao_titular','paciente_id',paciente_b::text,'registro_id',solicitacao_b::text,'versao',1,'campo','descricao','formato',1),
   'chave_idempotencia','solicitacao-b','digest_idempotencia',repeat('c',43),'auditoria_id',gen_random_uuid());
 r:=api.solicitacao_titular_privado(public.assinar_anamnese_fixture(e,'api.registrar_solicitacao_titular',administrador,sessao_admin));
 if r->>'ok' is distinct from 'true' then raise exception 'REGISTRO_SOLICITACAO_B: %',r; end if;

 -- Isolamento entre casos: filtrar pelo caso A não traz a solicitação do caso B.
 e:=jsonb_build_object('request_id',gen_random_uuid(),'limite',25,'paciente_id',paciente_a);
 r:=api.solicitacao_titular_privado(public.assinar_anamnese_fixture(e,'api.listar_solicitacao_titular',administrador,sessao_admin));
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r#>'{dados,itens}')<>1
  or r#>>'{dados,itens,0,solicitacao_id}' is distinct from solicitacao_a::text then
  raise exception 'VAZAMENTO_ENTRE_CASOS: %',r;
 end if;
 -- A listagem não devolve o texto cifrado de ninguém.
 if exists(select 1 from jsonb_array_elements(r#>'{dados,itens}') i where i ?| array['descricao','resposta','descricao_cifrada','resposta_cifrada']) then
  raise exception 'LISTAGEM_VAZOU_TEXTO: %',r;
 end if;

 -- Negativo: profissional comum não lista nem registra.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',profissional,'session_id',sessao_prof,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'limite',25);
 r:=api.solicitacao_titular_privado(public.assinar_anamnese_fixture(e,'api.listar_solicitacao_titular',profissional,sessao_prof));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then
  raise exception 'SOLICITACAO_PROFISSIONAL_PERMITIDA: %',r;
 end if;

 -- Responder: administrador grava medida e fundamento.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',administrador,'session_id',sessao_admin,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 antes:=(select count(*) from cadastro.solicitacao_titular);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'solicitacao_id',solicitacao_a,'medida','recusada',
   'resposta',envelope,'versao_esperada',1,
   'aad',jsonb_build_object('tabela','cadastro.solicitacao_titular','paciente_id',paciente_a::text,'registro_id',solicitacao_a::text,'versao',2,'campo','resposta','formato',1),
   'chave_idempotencia','resposta-a','digest_idempotencia',repeat('d',43),'auditoria_id',gen_random_uuid());
 r:=api.solicitacao_titular_privado(public.assinar_anamnese_fixture(e,'api.responder_solicitacao_titular',administrador,sessao_admin));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,estado}' is distinct from 'respondida'
  or r#>>'{dados,medida}' is distinct from 'recusada' or r#>>'{dados,versao}' is distinct from '2' then
  raise exception 'RESPOSTA_SOLICITACAO: %',r;
 end if;
 -- Responder uma exclusão NÃO apaga nada: nenhum paciente e nenhuma solicitação some.
 depois:=(select count(*) from cadastro.solicitacao_titular);
 if depois <> antes or (select count(*) from cadastro.paciente) < 2 then
  raise exception 'RESPOSTA_APAGOU_DADO: antes=% depois=%',antes,depois;
 end if;

 -- Responder de novo (versão já consumida) é conflito, não sobrescrita.
 e:=jsonb_build_object('request_id',gen_random_uuid(),'solicitacao_id',solicitacao_a,'medida','atendida',
   'resposta',envelope,'versao_esperada',1,
   'aad',jsonb_build_object('tabela','cadastro.solicitacao_titular','paciente_id',paciente_a::text,'registro_id',solicitacao_a::text,'versao',2,'campo','resposta','formato',1),
   'chave_idempotencia','resposta-a-2','digest_idempotencia',repeat('e',43),'auditoria_id',gen_random_uuid());
 r:=api.solicitacao_titular_privado(public.assinar_anamnese_fixture(e,'api.responder_solicitacao_titular',administrador,sessao_admin));
 if r#>>'{erro,codigo}' is distinct from 'conflito' then
  raise exception 'RESPOSTA_SOBRESCRITA: %',r;
 end if;
 if (select medida from cadastro.solicitacao_titular where id=solicitacao_a) is distinct from 'recusada' then
  raise exception 'MEDIDA_ALTERADA_APOS_RESPOSTA';
 end if;

 -- ---------------------------------------------------------------------------
 -- Imutabilidade das trilhas.
 -- ---------------------------------------------------------------------------
 select id into alvo_evento from auditoria.evento limit 1;
 begin
  update auditoria.evento set resultado='permitido' where id=alvo_evento;
  raise exception 'AUDITORIA_UPDATE_ACEITO';
 exception when sqlstate '55000' then null;
 end;
 begin
  delete from auditoria.evento where id=alvo_evento;
  raise exception 'AUDITORIA_DELETE_ACEITO';
 exception when sqlstate '55000' then null;
 end;
 begin
  delete from cadastro.solicitacao_titular where id=solicitacao_a;
  raise exception 'SOLICITACAO_DELETE_ACEITO';
 exception when sqlstate '55000' then null;
 end;
 begin
  update cadastro.solicitacao_titular set tipo='acesso' where id=solicitacao_b;
  raise exception 'SOLICITACAO_PEDIDO_ALTERADO';
 exception when sqlstate '55000' then null;
 end;

 raise notice 'GOVERNANCA_OK';
end $$;
