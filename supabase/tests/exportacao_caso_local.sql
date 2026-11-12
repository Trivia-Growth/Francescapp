\set ON_ERROR_STOP on
-- Prova local da exportação de caso (FR-032/FR-033). PostgreSQL descartável; Auth, Vault e
-- assinatura são fixtures fictícias e não comprovam serviço real. Reaproveita toda a fixture
-- da linha do tempo porque o manifesto da exportação sai do mesmo derivador: provar as duas
-- com fontes diferentes esconderia justamente a divergência que se quer impedir.
\ir linha_tempo_caso_local.sql
\ir ../migrations/20261120330000_exportacao_caso.sql
\ir ../migrations/20261120340000_exportacao_operacoes_privadas.sql

-- Antes do grant, nenhum papel do PostgREST alcança o wrapper nem as tabelas.
do $$
declare papel text; tabela text;
begin
 foreach papel in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(papel,'api.exportacao_operacao_privada(jsonb)','execute') then
   raise exception 'ACESSO_INDEVIDO_FUNCAO: %', papel;
  end if;
  foreach tabela in array array['cadastro.exportacao_caso','cadastro.exportacao_item','cadastro.exportacao_entrega'] loop
   if has_table_privilege(papel,tabela,'select') or has_table_privilege(papel,tabela,'insert') then
    raise exception 'ACESSO_INDEVIDO_TABELA: % %', papel, tabela;
   end if;
  end loop;
 end loop;
 -- O CONTROLE CENTRAL DESTA FATIA: a exportação não é ponto de decifragem. O owner não tem
 -- privilégio sobre nenhuma coluna cifrada de nenhuma fatia, nem sobre o destinatário e o
 -- propósito que ele próprio gravou.
 foreach tabela in array array['cadastro.diario_registro_versao','cadastro.documento_caso_versao',
   'cadastro.anamnese_versao','cadastro.saude_versao','cadastro.tarefa_cuidado_versao',
   'cadastro.objetivo_cuidado_versao','cadastro.encaminhamento_versao','cadastro.orientacao_versao',
   'cadastro.contexto_cuidado_versao','cadastro.rede_cuidado_versao'] loop
  if has_column_privilege('ffcmapp_exportacao_owner',tabela,'conteudo_cifrado','SELECT')
   or has_table_privilege('ffcmapp_exportacao_owner',tabela,'SELECT') then
   raise exception 'EXPORTACAO_DECIFRA: %', tabela;
  end if;
 end loop;
 if has_column_privilege('ffcmapp_exportacao_owner','cadastro.exportacao_caso','destinatario_cifrado','SELECT')
  or has_column_privilege('ffcmapp_exportacao_owner','cadastro.exportacao_caso','proposito_cifrado','SELECT')
  or has_column_privilege('ffcmapp_exportacao_owner','cadastro.paciente','nome_cifrado','SELECT')
  or exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid where r.rolname='ffcmapp_exportacao_owner') then
  raise exception 'OWNER_NAO_ISOLADO';
 end if;
end $$;

\ir ../migrations/20261120350000_grant_exportacao_teste.sql

do $$ begin
 if not has_function_privilege('authenticated','api.exportacao_operacao_privada(jsonb)','execute') then
  raise exception 'GRANT_NAO_APLICADO';
 end if;
 if has_function_privilege('anon','api.exportacao_operacao_privada(jsonb)','execute')
  or has_function_privilege('service_role','api.exportacao_operacao_privada(jsonb)','execute') then
  raise exception 'GRANT_AMPLO_DEMAIS';
 end if;
end $$;

create function public.exportar(ator uuid, sessao uuid, acao text, campos jsonb, metodo text default 'oauth') returns jsonb
language plpgsql as $$
declare r jsonb;
begin
 perform public.claims_linha_fixture(ator,sessao,metodo);
 r:=api.exportacao_operacao_privada(public.assinar_linha_fixture(
   jsonb_build_object('request_id',gen_random_uuid(),'paciente_id','40000000-0000-4000-8000-000000000001')||campos,
   acao,ator,sessao));
 return r;
end $$;

-- 1. Administrador registra exportação; o manifesto preserva autoria e datas e identifica o
-- conteúdo indisponível sem revelar nada filtrado por audiência.
do $$
#variable_conflict use_variable
declare r jsonb; ex jsonb; registro uuid:='80000000-0000-4000-8000-000000000001';
begin
 r:=public.exportar('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
   'api.registrar_exportacao',jsonb_build_object(
     'registro_id',registro,'chave_idempotencia','exp-1','digest_idempotencia',repeat('a',43),
     'finalidade','acompanhamento',
     'destinatario_cifrado',public.envelope_linha_fixture(),
     'proposito_cifrado',public.envelope_linha_fixture()));
 if r->>'ok' is distinct from 'true' then raise exception 'REGISTRAR: %',r; end if;
 select x into ex from jsonb_array_elements(r#>'{dados,exportacoes}') x where x->>'id'=registro::text;
 if ex is null then raise exception 'EXPORTACAO_AUSENTE: %',r; end if;
 -- Mesmo conjunto que a linha do tempo entrega a ESTE leitor: 8 itens. O rascunho do
 -- profissional 0002 não entra, porque rascunho é privado do autor (FR-012) e o
 -- administrador não é o autor. A exportação não alcança o que a leitura não alcança.
 if jsonb_array_length(ex->'itens') <> 8 then raise exception 'MANIFESTO: %',ex->'itens'; end if;
 if exists(select 1 from jsonb_array_elements(ex->'itens') i
    where i->>'registro_id'='61000000-0000-4000-8000-000000000001') then
  raise exception 'RASCUNHO_ALHEIO_EXPORTADO: %',ex->'itens';
 end if;
 -- Autoria e datas preservadas (FR-032).
 if exists(select 1 from jsonb_array_elements(ex->'itens') i where i->>'registrado_em' is null) then
  raise exception 'DATA_PERDIDA: %',ex->'itens';
 end if;
 if (select i->>'aconteceu_em' from jsonb_array_elements(ex->'itens') i
     where i->>'registro_id'='71000000-0000-4000-8000-000000000001') is null then
  raise exception 'ACONTECIMENTO_PERDIDO: %',ex->'itens';
 end if;
 -- Conteúdo indisponível identificado, com motivo que nunca é audiência.
 if (select i->>'disponibilidade' from jsonb_array_elements(ex->'itens') i
     where i->>'registro_id'='71000000-0000-4000-8000-000000000002') is distinct from 'indisponivel'
  or (select i->>'motivo_indisponibilidade' from jsonb_array_elements(ex->'itens') i
     where i->>'registro_id'='71000000-0000-4000-8000-000000000002') is distinct from 'documento_indisponivel' then
  raise exception 'INDISPONIVEL: %',ex->'itens';
 end if;
 if exists(select 1 from cadastro.exportacao_item where motivo_indisponibilidade is not null
    and motivo_indisponibilidade not in ('documento_indisponivel','anexo_nao_recuperado')) then
  raise exception 'MOTIVO_DE_AUDIENCIA';
 end if;
 -- O documento removido não entra nem como metadado.
 if exists(select 1 from cadastro.exportacao_item where registro_id='70000000-0000-4000-8000-000000000003') then
  raise exception 'REMOVIDO_EXPORTADO';
 end if;
 if not exists(select 1 from auditoria.evento where acao='api.registrar_exportacao' and resultado='permitido') then
  raise exception 'AUDITORIA_AUSENTE';
 end if;
end $$;

-- 2. Destinatário e propósito ficam gravados, cifrados, antes de o manifesto sair.
do $$ begin
 if not exists(select 1 from cadastro.exportacao_caso
   where id='80000000-0000-4000-8000-000000000001'
    and destinatario_cifrado ? 'ciphertext' and proposito_cifrado ? 'ciphertext'
    and finalidade='acompanhamento') then
  raise exception 'DESTINATARIO_OU_PROPOSITO_AUSENTE';
 end if;
end $$;

-- 3. Idempotência: repetir a chave não cria segunda exportação; chave igual com entrada
-- diferente é conflito, nunca sobrescrita.
do $$
#variable_conflict use_variable
declare r jsonb; campos jsonb;
begin
 campos:=jsonb_build_object('registro_id','80000000-0000-4000-8000-000000000001',
   'chave_idempotencia','exp-1','digest_idempotencia',repeat('a',43),'finalidade','acompanhamento',
   'destinatario_cifrado',public.envelope_linha_fixture(),'proposito_cifrado',public.envelope_linha_fixture());
 r:=public.exportar('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','api.registrar_exportacao',campos);
 if r->>'ok' is distinct from 'true' or r->>'repeticao' is distinct from 'true'
  or (select count(*) from cadastro.exportacao_caso)<>1 then raise exception 'REPLAY: %',r; end if;
 r:=public.exportar('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','api.registrar_exportacao',
   jsonb_set(campos,'{digest_idempotencia}',to_jsonb(repeat('b',43))));
 if r#>>'{erro,codigo}' is distinct from 'conflito_idempotencia' then raise exception 'CONFLITO: %',r; end if;
end $$;

-- 4. FR-033: entrega e conferência registradas, append-only, sem repetir o mesmo ato.
do $$
#variable_conflict use_variable
declare r jsonb;
begin
 r:=public.exportar('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
   'api.confirmar_entrega_exportacao',jsonb_build_object(
     'registro_id','81000000-0000-4000-8000-000000000001','chave_idempotencia','ent-1',
     'digest_idempotencia',repeat('c',43),'exportacao_id','80000000-0000-4000-8000-000000000001',
     'ato','entregue','observacao_cifrada',public.envelope_linha_fixture()));
 if r->>'ok' is distinct from 'true' then raise exception 'ENTREGA: %',r; end if;
 r:=public.exportar('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
   'api.confirmar_entrega_exportacao',jsonb_build_object(
     'registro_id','81000000-0000-4000-8000-000000000002','chave_idempotencia','ent-2',
     'digest_idempotencia',repeat('d',43),'exportacao_id','80000000-0000-4000-8000-000000000001',
     'ato','conferida'));
 if r->>'ok' is distinct from 'true' then raise exception 'CONFERENCIA: %',r; end if;
 if (select count(*) from cadastro.exportacao_entrega where exportacao_id='80000000-0000-4000-8000-000000000001')<>2 then
  raise exception 'ENTREGA_INCOMPLETA';
 end if;
 -- Mesmo ato de novo, com outra chave, é recusado pela unicidade: conferir duas vezes não
 -- reescreve a trilha.
 begin
  r:=public.exportar('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
    'api.confirmar_entrega_exportacao',jsonb_build_object(
      'registro_id','81000000-0000-4000-8000-000000000003','chave_idempotencia','ent-3',
      'digest_idempotencia',repeat('e',43),'exportacao_id','80000000-0000-4000-8000-000000000001','ato','conferida'));
  raise exception 'ATO_REPETIDO_ACEITO';
 exception when unique_violation then null;
 end;
end $$;

-- 5. A trilha é imutável: nem UPDATE nem DELETE passam.
do $$ begin
 begin
  update cadastro.exportacao_caso set finalidade='encerramento_uso' where id='80000000-0000-4000-8000-000000000001';
  raise exception 'UPDATE_ACEITO';
 exception when insufficient_privilege then null;
 end;
 begin
  delete from cadastro.exportacao_item;
  raise exception 'DELETE_ACEITO';
 exception when insufficient_privilege then null;
 end;
end $$;

-- 6. Profissional vinculado NÃO exporta (decisão provisória: administrador apenas), e a
-- recusa é auditada.
do $$
#variable_conflict use_variable
declare r jsonb;
begin
 r:=public.exportar('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002',
   'api.registrar_exportacao',jsonb_build_object(
     'registro_id',gen_random_uuid(),'chave_idempotencia','exp-prof','digest_idempotencia',repeat('f',43),
     'finalidade','acompanhamento','destinatario_cifrado',public.envelope_linha_fixture(),
     'proposito_cifrado',public.envelope_linha_fixture()));
 if r->>'ok' is distinct from 'false' or r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then
  raise exception 'PROFISSIONAL_EXPORTOU: %',r;
 end if;
 if not exists(select 1 from auditoria.evento where acao='api.registrar_exportacao' and resultado='negado') then
  raise exception 'AUDITORIA_NEGATIVA_AUSENTE';
 end if;
 if (select count(*) from cadastro.exportacao_caso)<>1 then raise exception 'EXPORTACAO_CRIADA_SEM_PERMISSAO'; end if;
end $$;

-- 7. Família não exporta de jeito nenhum, nem do próprio caso.
do $$
#variable_conflict use_variable
declare r jsonb;
begin
 r:=public.exportar('10000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000004',
   'api.listar_exportacoes','{}'::jsonb,'password');
 if r->>'ok' is distinct from 'false' or r ? 'dados' then raise exception 'FAMILIA_EXPORTOU: %',r; end if;
end $$;

-- 8. Exportação de outro caso não vaza: listar o caso B não traz a exportação do caso A.
do $$
#variable_conflict use_variable
declare r jsonb;
begin
 perform public.claims_linha_fixture('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','oauth');
 r:=api.exportacao_operacao_privada(public.assinar_linha_fixture(
   jsonb_build_object('request_id',gen_random_uuid(),'paciente_id','40000000-0000-4000-8000-000000000002'),
   'api.listar_exportacoes','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'));
 if r->>'ok' is distinct from 'true' then raise exception 'LISTAR_B: %',r; end if;
 if jsonb_array_length(r#>'{dados,exportacoes}')<>0 then raise exception 'VAZAMENTO_ENTRE_CASOS: %',r; end if;
end $$;

-- 9. Período recorta o manifesto, e confirmar entrega de exportação de outro caso é entrada
-- inválida, não sucesso silencioso.
do $$
#variable_conflict use_variable
declare r jsonb; corte text; ex jsonb;
begin
 select to_char(v.criado_em - interval '1 second','YYYY-MM-DD"T"HH24:MI:SS.USOF') into corte
  from cadastro.documento_caso_versao v where v.id='71000000-0000-4000-8000-000000000002';
 r:=public.exportar('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
   'api.registrar_exportacao',jsonb_build_object(
     'registro_id','80000000-0000-4000-8000-000000000002','chave_idempotencia','exp-2',
     'digest_idempotencia',repeat('9',43),'finalidade','encerramento_uso',
     'periodo_de',corte,'periodo_ate',to_char(clock_timestamp()+interval '1 day','YYYY-MM-DD"T"HH24:MI:SS.USOF'),
     'destinatario_cifrado',public.envelope_linha_fixture(),'proposito_cifrado',public.envelope_linha_fixture()));
 if r->>'ok' is distinct from 'true' then raise exception 'PERIODO: %',r; end if;
 select x into ex from jsonb_array_elements(r#>'{dados,exportacoes}') x where x->>'id'='80000000-0000-4000-8000-000000000002';
 if jsonb_array_length(ex->'itens')<>1 then raise exception 'PERIODO_NAO_RECORTOU: %',ex->'itens'; end if;
 begin
  r:=api.exportacao_operacao_privada(public.assinar_linha_fixture(
    jsonb_build_object('request_id',gen_random_uuid(),'paciente_id','40000000-0000-4000-8000-000000000002',
      'registro_id',gen_random_uuid(),'chave_idempotencia','ent-x','digest_idempotencia',repeat('8',43),
      'exportacao_id','80000000-0000-4000-8000-000000000001','ato','entregue'),
    'api.confirmar_entrega_exportacao','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'));
  raise exception 'ENTREGA_CRUZADA_ACEITA';
 exception when invalid_parameter_value then null;
 end;
end $$;

do $$ begin raise notice 'EXPORTACAO_OK'; end $$;
