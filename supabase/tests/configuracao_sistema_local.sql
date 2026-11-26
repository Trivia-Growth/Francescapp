\set ON_ERROR_STOP on
\ir anamnese_operacoes_local.sql
\ir ../migrations/20261117400000_configuracao_sistema.sql
\ir ../migrations/20261117410000_configuracao_sistema_operacoes_privadas.sql
\ir ../migrations/20261117420000_configuracao_sistema_leitor_servidor.sql

insert into auth.users values ('10000000-0000-4000-8000-000000000004');
insert into public.usuario(id,perfil) values ('10000000-0000-4000-8000-000000000004','familia');
insert into auth.sessions values ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004',null);

-- Chave só da tela de administração, para provar que o leitor do servidor não a enxerga.
insert into identidade.configuracao_sistema(id,chave,valor,tipo,rotulo,descricao,exposicao)
values(gen_random_uuid(),'ffcm.equipe.rotulo','"Equipe de cuidado"'::jsonb,'texto','Rótulo da equipe',null,'administracao');

do $$
declare
 administrador uuid := '10000000-0000-4000-8000-000000000001';
 sessao_admin uuid := '20000000-0000-4000-8000-000000000001';
 profissional uuid := '10000000-0000-4000-8000-000000000002';
 sessao_prof uuid := '20000000-0000-4000-8000-000000000002';
 familia uuid := '10000000-0000-4000-8000-000000000004';
 sessao_familia uuid := '20000000-0000-4000-8000-000000000004';
 alvo uuid;
 e jsonb; r jsonb;
begin
 if has_function_privilege('authenticated','api.configuracao_sistema_privado(jsonb)','execute')
  or has_function_privilege('anon','api.configuracao_sistema_privado(jsonb)','execute')
  or has_function_privilege('service_role','api.configuracao_sistema_privado(jsonb)','execute')
  or has_function_privilege('authenticated','operacao.configuracao_sistema_operacao_privada(jsonb)','execute')
  or has_function_privilege('anon','operacao.configuracao_sistema_operacao_privada(jsonb)','execute')
  or has_function_privilege('service_role','operacao.configuracao_sistema_operacao_privada(jsonb)','execute')
  or has_function_privilege('authenticated','identidade.ler_configuracao_sistema_publica()','execute')
  or has_function_privilege('anon','identidade.ler_configuracao_sistema_publica()','execute')
  or has_function_privilege('service_role','identidade.ler_configuracao_sistema_publica()','execute') then
  raise exception 'EXECUCAO_DIRETA_PERMITIDA';
 end if;

 select id into alvo from identidade.configuracao_sistema where chave='ffcm.contato.ativo';

 perform set_config('request.jwt.claims',jsonb_build_object('sub',administrador,'session_id',sessao_admin,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);

 -- Listagem traz o catálogo semeado pela migration, inclusive a chave de administração.
 r:=api.configuracao_sistema_privado(public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid()),'api.listar_configuracao_sistema',administrador,sessao_admin));
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r->'dados')<>3 then raise exception 'LISTAGEM_INICIAL: %',r; end if;
 if not exists(select 1 from jsonb_array_elements(r->'dados') d where d->>'chave'='ffcm.contato.ativo' and d->'valor'='true'::jsonb) then raise exception 'LISTAGEM_SEM_SEMENTE: %',r; end if;

 -- Desliga o serviço de contatos pela tela.
 e:=jsonb_build_object('request_id',gen_random_uuid(),'configuracao_chave','ffcm.contato.ativo','valor',to_jsonb(false),'versao_esperada',1,'chave_idempotencia','contato-desliga','digest_idempotencia',repeat('a',43),'auditoria_id',gen_random_uuid());
 r:=api.configuracao_sistema_privado(public.assinar_anamnese_fixture(e,'api.gravar_configuracao_sistema',administrador,sessao_admin));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,versao}' is distinct from '2' or r#>'{dados,valor}' <> 'false'::jsonb then raise exception 'GRAVACAO: %',r; end if;
 if r#>>'{dados,atualizado_por_usuario_id}' is distinct from administrador::text then raise exception 'AUTORIA_NAO_REGISTRADA: %',r; end if;
 if not exists(select 1 from auditoria.evento where tipo_objeto='configuracao_sistema' and objeto_id=alvo and resultado='permitido') then raise exception 'AUDITORIA_GRAVACAO_AUSENTE'; end if;

 -- Replay com a mesma chave de idempotência não grava de novo nem incrementa versão.
 r:=api.configuracao_sistema_privado(public.assinar_anamnese_fixture(e,'api.gravar_configuracao_sistema',administrador,sessao_admin));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,versao}' is distinct from '2' then raise exception 'REPLAY_FALHOU: %',r; end if;
 if (select versao from identidade.configuracao_sistema where id=alvo)<>2 then raise exception 'REPLAY_INCREMENTOU'; end if;

 -- Mesma chave de idempotência, digest diferente: conflito.
 r:=api.configuracao_sistema_privado(public.assinar_anamnese_fixture(jsonb_set(e,'{digest_idempotencia}',to_jsonb(repeat('b',43))),'api.gravar_configuracao_sistema',administrador,sessao_admin));
 if r#>>'{erro,codigo}' is distinct from 'conflito_idempotencia' then raise exception 'CONFLITO_IDEMPOTENCIA: %',r; end if;

 -- Versão esperada desatualizada: conflito, sem alterar e sem deixar recibo.
 r:=api.configuracao_sistema_privado(public.assinar_anamnese_fixture(jsonb_set(e,'{chave_idempotencia}',to_jsonb('contato-desliga-atrasado'::text)),'api.gravar_configuracao_sistema',administrador,sessao_admin));
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'CONFLITO_VERSAO: %',r; end if;
 if (select valor from identidade.configuracao_sistema where id=alvo)<>'false'::jsonb then raise exception 'CONFLITO_ALTEROU_VALOR'; end if;
 if exists(select 1 from operacao.requisicao where chave_idempotencia='contato-desliga-atrasado') then raise exception 'CONFLITO_DEIXOU_RECIBO'; end if;

 -- Chave inexistente: conflito, nunca criação.
 r:=api.configuracao_sistema_privado(public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid(),'configuracao_chave','ffcm.inventada','valor',to_jsonb(true),'versao_esperada',1,'chave_idempotencia','chave-inventada','digest_idempotencia',repeat('c',43),'auditoria_id',gen_random_uuid()),'api.gravar_configuracao_sistema',administrador,sessao_admin));
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'CHAVE_INEXISTENTE_ACEITA: %',r; end if;
 if exists(select 1 from identidade.configuracao_sistema where chave='ffcm.inventada') then raise exception 'CHAVE_INEXISTENTE_CRIADA'; end if;

 -- Valor de tipo errado para a chave: entrada inválida (o tipo vem do catálogo, não da entrada).
 begin
  perform api.configuracao_sistema_privado(public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid(),'configuracao_chave','ffcm.contato.ativo','valor',to_jsonb('sim'::text),'versao_esperada',2,'chave_idempotencia','contato-tipo-errado','digest_idempotencia',repeat('d',43),'auditoria_id',gen_random_uuid()),'api.gravar_configuracao_sistema',administrador,sessao_admin));
  raise exception 'TIPO_ERRADO_ACEITO';
 exception when invalid_parameter_value then
  if sqlerrm <> 'ENTRADA_INVALIDA' then raise; end if;
 end;

 -- Texto vazio numa chave de texto: entrada inválida.
 begin
  perform api.configuracao_sistema_privado(public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid(),'configuracao_chave','ffcm.equipe.rotulo','valor',to_jsonb(''::text),'versao_esperada',1,'chave_idempotencia','rotulo-vazio','digest_idempotencia',repeat('e',43),'auditoria_id',gen_random_uuid()),'api.gravar_configuracao_sistema',administrador,sessao_admin));
  raise exception 'TEXTO_VAZIO_ACEITO';
 exception when invalid_parameter_value then
  if sqlerrm <> 'ENTRADA_INVALIDA' then raise; end if;
 end;

 -- versao_esperada = 0 (tentativa de criar) é recusada na validação de entrada.
 begin
  perform api.configuracao_sistema_privado(public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid(),'configuracao_chave','ffcm.contato.ativo','valor',to_jsonb(true),'versao_esperada',0,'chave_idempotencia','contato-versao-zero','digest_idempotencia',repeat('f',43),'auditoria_id',gen_random_uuid()),'api.gravar_configuracao_sistema',administrador,sessao_admin));
  raise exception 'VERSAO_ZERO_ACEITA';
 exception when invalid_parameter_value then
  if sqlerrm <> 'ENTRADA_INVALIDA' then raise; end if;
 end;

 -- Campo fora da lista branca da entrada não passa.
 begin
  perform api.configuracao_sistema_privado(public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid(),'tipo','booleano'),'api.listar_configuracao_sistema',administrador,sessao_admin));
  raise exception 'CAMPO_DESCONHECIDO_ACEITO';
 exception when insufficient_privilege then
  if sqlerrm <> 'SEM_PERMISSAO' then raise; end if;
 end;

 -- Profissional não administra configuração.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',profissional,'session_id',sessao_prof,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 r:=api.configuracao_sistema_privado(public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid()),'api.listar_configuracao_sistema',profissional,sessao_prof));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'PROFISSIONAL_ACEITO: %',r; end if;
 r:=api.configuracao_sistema_privado(public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid(),'configuracao_chave','ffcm.contato.ativo','valor',to_jsonb(true),'versao_esperada',2,'chave_idempotencia','prof-tenta','digest_idempotencia',repeat('g',43),'auditoria_id',gen_random_uuid()),'api.gravar_configuracao_sistema',profissional,sessao_prof));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'PROFISSIONAL_GRAVOU: %',r; end if;
 if (select valor from identidade.configuracao_sistema where id=alvo)<>'false'::jsonb then raise exception 'PROFISSIONAL_ALTEROU_VALOR'; end if;
 if not exists(select 1 from auditoria.evento where ator_usuario_id=profissional and tipo_objeto='configuracao_sistema' and resultado='negado') then raise exception 'AUDITORIA_NEGACAO_AUSENTE'; end if;

 -- Família não administra configuração.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',familia,'session_id',sessao_familia,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 r:=api.configuracao_sistema_privado(public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid()),'api.listar_configuracao_sistema',familia,sessao_familia));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'FAMILIA_ACEITA: %',r; end if;

 -- Sessão do administrador encerrada: nega mesmo com atestado válido.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',administrador,'session_id',sessao_admin,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=sessao_admin;
 r:=api.configuracao_sistema_privado(public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid()),'api.listar_configuracao_sistema',administrador,sessao_admin));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'SESSAO_ENCERRADA_ACEITA: %',r; end if;
 update identidade.sessao set encerrada_em=null where session_id=sessao_admin;
end $$;

-- Leitor do servidor: cadeia de papéis, só chaves de exposição 'servidor'.
do $$
declare leitura jsonb;
begin
 set local role ffcmapp_configuracao_leitor_executor;
 leitura := identidade.ler_configuracao_sistema_publica();
 if leitura #> '{ffcm.contato.ativo,valor}' <> 'false'::jsonb then raise exception 'LEITOR_VALOR_DESATUALIZADO: %',leitura; end if;
 if not leitura ? 'ffcm.campo_extra_plano.ativo' then raise exception 'LEITOR_SEM_CHAVE_SERVIDOR: %',leitura; end if;
 if leitura ? 'ffcm.equipe.rotulo' then raise exception 'LEITOR_VAZOU_CHAVE_ADMINISTRACAO: %',leitura; end if;
 begin
  perform 1 from identidade.configuracao_sistema;
  raise exception 'EXECUTOR_LE_TABELA_DIRETO';
 exception when insufficient_privilege then null;
 end;
 reset role;
end $$;

-- Grant de ativação: só depois dele `authenticated` alcança o wrapper.
\ir ../migrations/20261117430000_grant_configuracao_sistema_teste.sql

do $$
begin
 if not has_function_privilege('authenticated','api.configuracao_sistema_privado(jsonb)','execute') then
  raise exception 'GRANT_NAO_APLICADO';
 end if;
 if has_function_privilege('anon','api.configuracao_sistema_privado(jsonb)','execute')
  or has_function_privilege('service_role','api.configuracao_sistema_privado(jsonb)','execute')
  or has_function_privilege('authenticated','operacao.configuracao_sistema_operacao_privada(jsonb)','execute')
  or has_function_privilege('authenticated','identidade.ler_configuracao_sistema_publica()','execute') then
  raise exception 'GRANT_VAZOU';
 end if;
end $$;
