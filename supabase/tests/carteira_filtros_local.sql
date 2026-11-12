\set ON_ERROR_STOP on
-- Prova local da carteira filtrável e do sinal operacional (FR-026/FR-028). PostgreSQL
-- descartável; Auth, Vault e assinatura são fixtures fictícias e não comprovam serviço real.
-- A chamada passa por api.listar_pacientes, que executa a função privada como papel dono da
-- carteira, então grants e políticas do papel são exercitados.
\ir criar_caso_atomico_local.sql
\ir ../migrations/20261107120000_plano_cuidado_versoes_privadas.sql
\ir ../migrations/20261111140000_tarefa_cuidado_versoes_privadas.sql
\ir ../migrations/20261117100000_encaminhamento_versoes_privadas.sql
\ir ../migrations/20261117130000_orientacao_versoes_privadas.sql
\ir ../migrations/20261117200000_saude_versoes_privadas.sql
\ir ../migrations/20261117300000_contexto_cuidado_versoes_privadas.sql
\ir ../migrations/20261117330000_rede_cuidado_versoes_privadas.sql
\ir ../migrations/20261118300000_sinal_operacional_caso.sql
\ir ../migrations/20261118330000_carteira_filtros_sinal.sql

create function public.listar_filtrado_fixture(p_ator uuid,p_sessao uuid,p_filtros jsonb default null,
 p_limite integer default 10,p_cursor uuid default null) returns jsonb language plpgsql as $$
declare e jsonb:=jsonb_build_object('request_id',gen_random_uuid(),'limite',p_limite);
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_ator,'session_id',p_sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 if p_cursor is not null then e:=e||jsonb_build_object('cursor',p_cursor); end if;
 if p_filtros is not null then e:=e||jsonb_build_object('filtros',p_filtros); end if;
 return api.listar_pacientes(public.assinar_anamnese_fixture(e,'api.listar_pacientes',p_ator,p_sessao));
end $$;

create function public.caso_fixture(p_paciente uuid,p_versao integer,p_situacao text,p_responsavel uuid,p_ator uuid) returns void language plpgsql as $$
declare aud uuid:=gen_random_uuid();
begin
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
 values (aud,p_ator,'api.editar_paciente','paciente',p_paciente,'permitido',gen_random_uuid());
 insert into cadastro.acompanhamento_caso(id,paciente_id,versao,situacao,responsavel_usuario_id,auditoria_id,ator_usuario_id)
 values (gen_random_uuid(),p_paciente,p_versao,p_situacao,p_responsavel,aud,p_ator);
end $$;

-- A carteira passa a ler `responsavel_usuario_id` porque FR-026 exige filtrar por
-- responsável; o resto de `cadastro.acompanhamento_caso` continua fora do alcance do papel.
do $$
declare coluna text;
begin
 if not has_column_privilege('ffcmapp_carteira_owner','cadastro.acompanhamento_caso','responsavel_usuario_id','select') then
  raise exception 'OWNER_SEM_LEITURA_DO_RESPONSAVEL';
 end if;
 foreach coluna in array array['auditoria_id','ator_usuario_id','id'] loop
  if has_column_privilege('ffcmapp_carteira_owner','cadastro.acompanhamento_caso',coluna,'select') then
   raise exception 'OWNER_LE_COLUNA_NAO_PREVISTA: %',coluna;
  end if;
 end loop;
 if has_table_privilege('ffcmapp_carteira_owner','cadastro.acompanhamento_caso','insert')
  or has_table_privilege('ffcmapp_carteira_owner','cadastro.acompanhamento_caso','update')
  or has_table_privilege('ffcmapp_carteira_owner','cadastro.acompanhamento_caso','delete') then
  raise exception 'OWNER_ESCREVE_ACOMPANHAMENTO';
 end if;
 -- O papel da carteira executa o derivador, mas não alcança as tabelas que ele lê.
 if not has_function_privilege('ffcmapp_carteira_owner','cadastro.sinal_operacional_caso(uuid)','execute')
  or has_table_privilege('ffcmapp_carteira_owner','cadastro.saude_versao','select')
  or has_table_privilege('ffcmapp_carteira_owner','cadastro.acordo_acompanhamento','select')
  or has_function_privilege('authenticated','cadastro.sinal_operacional_caso(uuid)','execute') then
  raise exception 'ALCANCE_INDEVIDO_DO_DERIVADOR';
 end if;
end $$;

do $$
#variable_conflict use_variable
declare
 admin uuid:='10000000-0000-4000-8000-000000000001'; s_admin uuid:='20000000-0000-4000-8000-000000000001';
 prof uuid:='10000000-0000-4000-8000-000000000002'; s_prof uuid:='20000000-0000-4000-8000-000000000002';
 p1 uuid; p2 uuid; ordem uuid[]; r jsonb; n integer;
begin
 select array_agg(id order by criado_em,id) into ordem from cadastro.paciente;
 if coalesce(array_length(ordem,1),0)<2 then raise exception 'FIXTURE_COM_POUCOS_PACIENTES'; end if;
 p1:=ordem[1]; p2:=ordem[2];
 perform public.caso_fixture(p1,1,'ativo',prof,admin);
 perform public.caso_fixture(p2,1,'pausado',null,admin);
 -- p1 tem periodicidade acordada e revisão vencida; p2 não tem acordo nenhum.
 insert into cadastro.acordo_acompanhamento(id,paciente_id,versao,dias_entre_atualizacoes,dias_antecedencia_revisao,dias_retorno_encaminhamento,proxima_revisao_em,ator_usuario_id)
  values (gen_random_uuid(),p1,1,30,14,21,current_date-5,admin);

 -- Sem filtro, a lista continua trazendo todo mundo, agora com sinal e motivo visíveis.
 r:=public.listar_filtrado_fixture(admin,s_admin,null,50);
 if r->>'ok' is distinct from 'true' then raise exception 'LISTA: %',r; end if;
 if not exists(select 1 from jsonb_array_elements(r#>'{dados,itens}') i
   where i->>'paciente_id'=p1::text and i#>>'{sinal,estado}'='atencao_operacional'
     and jsonb_array_length(i#>'{sinal,motivos}')>0) then
  raise exception 'SINAL_P1: %',r#>'{dados,itens}';
 end if;
 -- FR-026/FR-028: caso sem periodicidade acordada é "informação insuficiente", com motivo,
 -- e nunca "em dia". "Em dia" aqui nunca significa ausência de risco clínico.
 if not exists(select 1 from jsonb_array_elements(r#>'{dados,itens}') i
   where i->>'paciente_id'=p2::text and i#>>'{sinal,estado}'='informacao_insuficiente'
     and jsonb_array_length(i#>'{sinal,motivos}')=1) then
  raise exception 'SINAL_P2: %',r#>'{dados,itens}';
 end if;

 -- Filtro por situação, responsável, revisão e pendências, cada um no banco.
 r:=public.listar_filtrado_fixture(admin,s_admin,jsonb_build_object('situacao','pausado'),50);
 if not exists(select 1 from jsonb_array_elements(r#>'{dados,itens}') i where i->>'paciente_id'=p2::text)
  or exists(select 1 from jsonb_array_elements(r#>'{dados,itens}') i where i->>'situacao' is distinct from 'pausado')
  or exists(select 1 from jsonb_array_elements(r#>'{dados,itens}') i where i->>'paciente_id'=p1::text) then
  raise exception 'FILTRO_SITUACAO: %',r#>'{dados,itens}';
 end if;
 r:=public.listar_filtrado_fixture(admin,s_admin,jsonb_build_object('responsavel',prof::text),50);
 if jsonb_array_length(r#>'{dados,itens}')<>1 or r#>>'{dados,itens,0,paciente_id}' is distinct from p1::text then
  raise exception 'FILTRO_RESPONSAVEL: %',r#>'{dados,itens}';
 end if;
 r:=public.listar_filtrado_fixture(admin,s_admin,jsonb_build_object('responsavel','nenhum'),50);
 if exists(select 1 from jsonb_array_elements(r#>'{dados,itens}') i where i->>'paciente_id'=p1::text) then
  raise exception 'FILTRO_SEM_RESPONSAVEL: %',r#>'{dados,itens}';
 end if;
 r:=public.listar_filtrado_fixture(admin,s_admin,jsonb_build_object('revisao','vencida'),50);
 if jsonb_array_length(r#>'{dados,itens}')<>1 or r#>>'{dados,itens,0,paciente_id}' is distinct from p1::text then
  raise exception 'FILTRO_REVISAO_VENCIDA: %',r#>'{dados,itens}';
 end if;
 r:=public.listar_filtrado_fixture(admin,s_admin,jsonb_build_object('revisao','sem_data'),50);
 if exists(select 1 from jsonb_array_elements(r#>'{dados,itens}') i where i->>'paciente_id'=p1::text) then
  raise exception 'FILTRO_REVISAO_SEM_DATA: %',r#>'{dados,itens}';
 end if;
 r:=public.listar_filtrado_fixture(admin,s_admin,jsonb_build_object('pendencia','abertas'),50);
 if not exists(select 1 from jsonb_array_elements(r#>'{dados,itens}') i where i->>'paciente_id'=p1::text) then
  raise exception 'FILTRO_PENDENCIA_ABERTAS: %',r#>'{dados,itens}';
 end if;
 r:=public.listar_filtrado_fixture(admin,s_admin,jsonb_build_object('pendencia','nenhuma'),50);
 if exists(select 1 from jsonb_array_elements(r#>'{dados,itens}') i where i->>'paciente_id'=p1::text) then
  raise exception 'FILTRO_PENDENCIA_NENHUMA: %',r#>'{dados,itens}';
 end if;

 -- Combinação de filtros: situação que não casa com o responsável devolve lista vazia,
 -- nunca a lista inteira.
 r:=public.listar_filtrado_fixture(admin,s_admin,jsonb_build_object('situacao','pausado','responsavel',prof::text),50);
 if jsonb_array_length(r#>'{dados,itens}')<>0 then raise exception 'FILTRO_COMBINADO: %',r#>'{dados,itens}'; end if;

 -- Filtro desconhecido ou valor fora da lista é recusado, não ignorado.
 begin
  r:=public.listar_filtrado_fixture(admin,s_admin,jsonb_build_object('inexistente','x'));
  raise exception 'FILTRO_DESCONHECIDO_ACEITO: %',r;
 exception when insufficient_privilege then null;
 end;
 begin
  r:=public.listar_filtrado_fixture(admin,s_admin,jsonb_build_object('revisao','qualquer'));
  raise exception 'VALOR_INVALIDO_ACEITO: %',r;
 exception when insufficient_privilege then null;
 end;

 -- Profissional continua vendo só os casos a que tem acesso, agora com sinal; e pedir
 -- filtro de responsável ou situação no ramo dele é entrada inválida, não lista diferente.
 r:=public.listar_filtrado_fixture(prof,s_prof);
 if r->>'ok' is distinct from 'true' then raise exception 'LISTA_PROFISSIONAL: %',r; end if;
 if exists(select 1 from jsonb_array_elements(r#>'{dados,itens}') i where i ? 'situacao' or i ? 'responsavel_usuario_id') then
  raise exception 'PROFISSIONAL_RECEBEU_SITUACAO: %',r#>'{dados,itens}';
 end if;
 begin
  r:=public.listar_filtrado_fixture(prof,s_prof,jsonb_build_object('situacao','ativo'));
  raise exception 'PROFISSIONAL_FILTROU_SITUACAO: %',r;
 exception when invalid_parameter_value then
  if sqlerrm <> 'ENTRADA_INVALIDA' then raise; end if;
 end;
 begin
  r:=public.listar_filtrado_fixture(prof,s_prof,jsonb_build_object('responsavel',prof::text));
  raise exception 'PROFISSIONAL_FILTROU_RESPONSAVEL: %',r;
 exception when invalid_parameter_value then
  if sqlerrm <> 'ENTRADA_INVALIDA' then raise; end if;
 end;
end $$;

-- Paginação com filtro: o cursor continua selado por identidade e a página respeita o limite.
do $$
#variable_conflict use_variable
declare admin uuid:='10000000-0000-4000-8000-000000000001'; s_admin uuid:='20000000-0000-4000-8000-000000000001';
 r jsonb; cursor_p text; vistos text[];
begin
 r:=public.listar_filtrado_fixture(admin,s_admin,jsonb_build_object('pendencia','nenhuma'),1);
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r#>'{dados,itens}')>1 then
  raise exception 'PAGINA_FILTRADA: %',r;
 end if;
 cursor_p:=r#>>'{dados,proximo_cursor}';
 vistos:=array(select i->>'paciente_id' from jsonb_array_elements(r#>'{dados,itens}') i);
 while cursor_p is not null loop
  r:=public.listar_filtrado_fixture(admin,s_admin,jsonb_build_object('pendencia','nenhuma'),1,cursor_p::uuid);
  if r->>'ok' is distinct from 'true' then raise exception 'PAGINA_SEGUINTE: %',r; end if;
  if exists(select 1 from jsonb_array_elements(r#>'{dados,itens}') i where i->>'paciente_id' = any(vistos)) then
   raise exception 'PAGINA_REPETIU_ITEM: %',r;
  end if;
  vistos:=vistos||array(select i->>'paciente_id' from jsonb_array_elements(r#>'{dados,itens}') i);
  cursor_p:=r#>>'{dados,proximo_cursor}';
 end loop;
end $$;

-- Sessão encerrada perde a carteira mesmo com atestado recém-emitido.
do $$
#variable_conflict use_variable
declare admin uuid:='10000000-0000-4000-8000-000000000001'; s_admin uuid:='20000000-0000-4000-8000-000000000001'; r jsonb;
begin
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=s_admin;
 r:=public.listar_filtrado_fixture(admin,s_admin,jsonb_build_object('revisao','vencida'));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'SESSAO_ENCERRADA: %',r; end if;
 update identidade.sessao set encerrada_em=null where session_id=s_admin;
end $$;
