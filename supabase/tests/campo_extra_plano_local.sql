\set ON_ERROR_STOP on
\ir anamnese_operacoes_local.sql
\ir ../migrations/20261116130000_campo_extra_plano_catalogo.sql
\ir ../migrations/20261116140000_campo_extra_plano_operacoes_privadas.sql

insert into auth.users values ('10000000-0000-4000-8000-000000000004');
insert into public.usuario(id,perfil) values ('10000000-0000-4000-8000-000000000004','familia');
insert into auth.sessions values ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004',null);

do $$
declare
 administrador uuid := '10000000-0000-4000-8000-000000000001';
 sessao_admin uuid := '20000000-0000-4000-8000-000000000001';
 profissional uuid := '10000000-0000-4000-8000-000000000002';
 sessao_prof uuid := '20000000-0000-4000-8000-000000000002';
 familia uuid := '10000000-0000-4000-8000-000000000004';
 sessao_familia uuid := '20000000-0000-4000-8000-000000000004';
 campo uuid := gen_random_uuid();
 campo_lista uuid := gen_random_uuid();
 e jsonb; r jsonb;
begin
 if has_function_privilege('authenticated','api.campo_extra_plano_privado(jsonb)','execute')
  or has_function_privilege('anon','api.campo_extra_plano_privado(jsonb)','execute')
  or has_function_privilege('service_role','api.campo_extra_plano_privado(jsonb)','execute')
  or has_function_privilege('authenticated','operacao.campo_extra_plano_operacao_privada(jsonb)','execute')
  or has_function_privilege('anon','operacao.campo_extra_plano_operacao_privada(jsonb)','execute')
  or has_function_privilege('service_role','operacao.campo_extra_plano_operacao_privada(jsonb)','execute') then
  raise exception 'EXECUCAO_DIRETA_PERMITIDA';
 end if;

 perform set_config('request.jwt.claims',jsonb_build_object('sub',administrador,'session_id',sessao_admin,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);

 -- Listagem vazia.
 e:=jsonb_build_object('request_id',gen_random_uuid());
 r:=api.campo_extra_plano_privado(public.assinar_anamnese_fixture(e,'api.listar_campo_extra_plano',administrador,sessao_admin));
 if r->>'ok' is distinct from 'true' or r->'dados' <> '[]'::jsonb then raise exception 'LISTAGEM_INICIAL: %',r; end if;

 -- Administrador cria campo texto.
 e:=jsonb_build_object('request_id',gen_random_uuid(),'campo_id',campo,'nome','Observação extra','tipo','texto','opcoes',null,'ativo',true,'versao_esperada',0,'chave_idempotencia','campo-texto-criacao','digest_idempotencia',repeat('a',43),'auditoria_id',gen_random_uuid());
 r:=api.campo_extra_plano_privado(public.assinar_anamnese_fixture(e,'api.gravar_campo_extra_plano',administrador,sessao_admin));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,versao}' is distinct from '1' or r#>>'{dados,tipo}' is distinct from 'texto' then raise exception 'CRIACAO_TEXTO: %',r; end if;
 if not exists(select 1 from auditoria.evento where tipo_objeto='campo_extra_plano_catalogo' and objeto_id=campo and resultado='permitido') then raise exception 'AUDITORIA_CRIACAO_AUSENTE'; end if;

 -- Replay idempotente não duplica nem recria.
 r:=api.campo_extra_plano_privado(public.assinar_anamnese_fixture(e,'api.gravar_campo_extra_plano',administrador,sessao_admin));
 if r->>'ok' is distinct from 'true' or (select count(*) from cadastro.campo_extra_plano_catalogo where id=campo)<>1 then raise exception 'REPLAY_FALHOU: %',r; end if;

 -- Mesma chave, digest diferente: conflito de idempotência.
 r:=api.campo_extra_plano_privado(public.assinar_anamnese_fixture(jsonb_set(e,'{digest_idempotencia}',to_jsonb(repeat('b',43))),'api.gravar_campo_extra_plano',administrador,sessao_admin));
 if r#>>'{erro,codigo}' is distinct from 'conflito_idempotencia' then raise exception 'CONFLITO_IDEMPOTENCIA: %',r; end if;

 -- Chave de idempotência diferente mirando o mesmo campo_id já existente, ainda com
 -- versao_esperada=0 (simula duas criações concorrentes do mesmo id com chaves distintas):
 -- deve bater na unicidade do id e devolver conflito tratado, não erro bruto de unique_violation.
 r:=api.campo_extra_plano_privado(public.assinar_anamnese_fixture(jsonb_set(e,'{chave_idempotencia}',to_jsonb('campo-texto-criacao-concorrente'::text)),'api.gravar_campo_extra_plano',administrador,sessao_admin));
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'CRIACAO_CONCORRENTE_MESMO_ID: %',r; end if;
 if (select count(*) from cadastro.campo_extra_plano_catalogo where id=campo)<>1 then raise exception 'CRIACAO_CONCORRENTE_DUPLICOU'; end if;
 if exists(select 1 from operacao.requisicao where chave_idempotencia='campo-texto-criacao-concorrente') then raise exception 'CRIACAO_CONCORRENTE_DEIXOU_RECIBO'; end if;

 -- Edição com versão esperada correta.
 e:=jsonb_build_object('request_id',gen_random_uuid(),'campo_id',campo,'nome','Observação extra (revisada)','tipo','texto','opcoes',null,'ativo',true,'versao_esperada',1,'chave_idempotencia','campo-texto-edicao','digest_idempotencia',repeat('c',43),'auditoria_id',gen_random_uuid());
 r:=api.campo_extra_plano_privado(public.assinar_anamnese_fixture(e,'api.gravar_campo_extra_plano',administrador,sessao_admin));
 if r#>>'{dados,versao}' is distinct from '2' or r#>>'{dados,nome}' is distinct from 'Observação extra (revisada)' then raise exception 'EDICAO: %',r; end if;

 -- Versão esperada desatualizada: conflito, sem alterar o registro.
 r:=api.campo_extra_plano_privado(public.assinar_anamnese_fixture(jsonb_set(jsonb_set(e,'{versao_esperada}','1'::jsonb),'{chave_idempotencia}',to_jsonb('campo-texto-conflito'::text)),'api.gravar_campo_extra_plano',administrador,sessao_admin));
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'CONFLITO_VERSAO: %',r; end if;
 if (select versao from cadastro.campo_extra_plano_catalogo where id=campo)<>2 then raise exception 'CONFLITO_ALTEROU_REGISTRO'; end if;

 -- Campo tipo lista com opções válidas.
 e:=jsonb_build_object('request_id',gen_random_uuid(),'campo_id',campo_lista,'nome','Prioridade customizada','tipo','lista','opcoes',jsonb_build_array('Baixa','Média','Alta'),'ativo',true,'versao_esperada',0,'chave_idempotencia','campo-lista-criacao','digest_idempotencia',repeat('d',43),'auditoria_id',gen_random_uuid());
 r:=api.campo_extra_plano_privado(public.assinar_anamnese_fixture(e,'api.gravar_campo_extra_plano',administrador,sessao_admin));
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r#>'{dados,opcoes}')<>3 then raise exception 'CRIACAO_LISTA: %',r; end if;

 -- Lista sem opções: entrada inválida.
 begin
  perform api.campo_extra_plano_privado(public.assinar_anamnese_fixture(jsonb_set(jsonb_set(e,'{campo_id}',to_jsonb(gen_random_uuid())),'{opcoes}','null'::jsonb) || jsonb_build_object('chave_idempotencia','campo-lista-sem-opcoes'),'api.gravar_campo_extra_plano',administrador,sessao_admin));
  raise exception 'LISTA_SEM_OPCOES_ACEITA';
 exception when invalid_parameter_value then
  if sqlerrm <> 'ENTRADA_INVALIDA' then raise; end if;
 end;

 -- Texto com opções preenchidas: entrada inválida.
 begin
  perform api.campo_extra_plano_privado(public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid(),'campo_id',gen_random_uuid(),'nome','Campo errado','tipo','texto','opcoes',jsonb_build_array('X'),'ativo',true,'versao_esperada',0,'chave_idempotencia','campo-texto-com-opcoes','digest_idempotencia',repeat('e',43),'auditoria_id',gen_random_uuid()),'api.gravar_campo_extra_plano',administrador,sessao_admin));
  raise exception 'TEXTO_COM_OPCOES_ACEITO';
 exception when invalid_parameter_value then
  if sqlerrm <> 'ENTRADA_INVALIDA' then raise; end if;
 end;

 -- Tipo inválido.
 begin
  perform api.campo_extra_plano_privado(public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid(),'campo_id',gen_random_uuid(),'nome','Campo','tipo','booleano','opcoes',null,'ativo',true,'versao_esperada',0,'chave_idempotencia','campo-tipo-invalido','digest_idempotencia',repeat('f',43),'auditoria_id',gen_random_uuid()),'api.gravar_campo_extra_plano',administrador,sessao_admin));
  raise exception 'TIPO_INVALIDO_ACEITO';
 exception when invalid_parameter_value then
  if sqlerrm <> 'ENTRADA_INVALIDA' then raise; end if;
 end;

 -- Listagem reflete os dois campos criados.
 r:=api.campo_extra_plano_privado(public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid()),'api.listar_campo_extra_plano',administrador,sessao_admin));
 if jsonb_array_length(r->'dados')<>2 then raise exception 'LISTAGEM_FINAL: %',r; end if;

 -- Profissional não administra o catálogo.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',profissional,'session_id',sessao_prof,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 r:=api.campo_extra_plano_privado(public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid()),'api.listar_campo_extra_plano',profissional,sessao_prof));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'PROFISSIONAL_ACEITO: %',r; end if;

 -- Família não administra o catálogo.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',familia,'session_id',sessao_familia,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 r:=api.campo_extra_plano_privado(public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid()),'api.listar_campo_extra_plano',familia,sessao_familia));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'FAMILIA_ACEITA: %',r; end if;

 -- Sessão do administrador revogada: nega mesmo com atestado válido.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',administrador,'session_id',sessao_admin,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=sessao_admin;
 r:=api.campo_extra_plano_privado(public.assinar_anamnese_fixture(jsonb_build_object('request_id',gen_random_uuid()),'api.listar_campo_extra_plano',administrador,sessao_admin));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'SESSAO_REVOGADA_ACEITA: %',r; end if;
 update identidade.sessao set encerrada_em=null where session_id=sessao_admin;

 -- Falha de auditoria não deixa efeito parcial (reaproveita o fixture de falha da anamnese).
 perform set_config('fixture.falhar_auditoria','sim',true);
 declare
  campo_falha uuid := gen_random_uuid();
  tentativa jsonb := jsonb_build_object('request_id',gen_random_uuid(),'campo_id',campo_falha,'nome','Nunca persiste','tipo','texto','opcoes',null,'ativo',true,'versao_esperada',0,'chave_idempotencia','campo-falha-auditoria','digest_idempotencia',repeat('g',43),'auditoria_id',gen_random_uuid());
 begin
  begin
   perform api.campo_extra_plano_privado(public.assinar_anamnese_fixture(tentativa,'api.gravar_campo_extra_plano',administrador,sessao_admin));
   raise exception 'FALHA_AUDITORIA_NAO_PROPAGADA';
  exception when raise_exception then
   if sqlerrm <> 'FALHA_AUDITORIA_FIXTURE' then raise; end if;
  end;
  if exists(select 1 from cadastro.campo_extra_plano_catalogo where id=campo_falha)
   or exists(select 1 from operacao.requisicao where chave_idempotencia='campo-falha-auditoria') then
   raise exception 'FALHA_AUDITORIA_DEIXOU_EFEITOS';
  end if;
 end;
 perform set_config('fixture.falhar_auditoria','nao',true);
end $$;
