\set ON_ERROR_STOP on
\ir anamnese_operacoes_local.sql
\ir ../migrations/20261117100000_encaminhamento_versoes_privadas.sql
\ir ../migrations/20261117110000_encaminhamento_operacoes_privadas.sql

-- Familiar não existe no fixture base; criado aqui para o negativo de perfil. Família nunca
-- recebe concessão de equipe (a constraint de `concessao_equipe.perfil` só aceita
-- administrador/profissional), então a negativa vem da ausência de concessão vigente.
insert into auth.users values ('10000000-0000-4000-8000-000000000009');
insert into public.usuario(id,perfil) values ('10000000-0000-4000-8000-000000000009','familia');
insert into auth.identities values ('10000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000009','google','google-10000000-0000-4000-8000-000000000009',jsonb_build_object('sub','google-10000000-0000-4000-8000-000000000009','email_verified',true,'custom_claims',jsonb_build_object('hd','example.test')));
insert into auth.sessions values ('20000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000009',null);

-- Acesso direto negado para todo papel de aplicação.
do $$
declare papel text;
begin
 foreach papel in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(papel,'api.encaminhamento_privado(jsonb)','execute')
   or has_function_privilege(papel,'api.encaminhamento_operacao_privada(jsonb)','execute')
   or has_table_privilege(papel,'cadastro.encaminhamento','select')
   or has_table_privilege(papel,'cadastro.encaminhamento_versao','insert') then
   raise exception 'ACESSO_INDEVIDO: %', papel;
  end if;
 end loop;
end $$;

do $$
#variable_conflict use_variable
declare
 profissional uuid:='10000000-0000-4000-8000-000000000002';
 sessao_prof uuid:='20000000-0000-4000-8000-000000000002';
 familia uuid:='10000000-0000-4000-8000-000000000009';
 sessao_familia uuid:='20000000-0000-4000-8000-000000000009';
 paciente uuid:='40000000-0000-4000-8000-000000000001';
 enc_a uuid:=gen_random_uuid(); enc_b uuid:=gen_random_uuid();
 registro uuid; req uuid; e jsonb; r jsonb;
 envelope jsonb:=jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22));
 aad jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',profissional,'session_id',sessao_prof,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);

 -- Lista inicial vazia.
 req:=gen_random_uuid();
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente);
 r:=api.encaminhamento_privado(public.assinar_anamnese_fixture(e,'api.ler_encaminhamentos',profissional,sessao_prof));
 if r->>'ok' is distinct from 'true' or r->'dados' <> '[]'::jsonb then raise exception 'LISTA_INICIAL: %',r; end if;

 -- Cria encaminhamento A como "sugerido".
 registro:=gen_random_uuid(); req:=gen_random_uuid();
 aad:=jsonb_build_object('tabela','cadastro.encaminhamento_versao','paciente_id',paciente::text,'encaminhamento_id',enc_a::text,'registro_id',registro::text,'versao',1,'campo','conteudo','formato',1);
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'encaminhamento_id',enc_a,'registro_id',registro,'versao_esperada',0,'etapa','sugerido','conteudo',envelope,'aad',aad);
 r:=api.encaminhamento_privado(public.assinar_anamnese_fixture(e,'api.gravar_encaminhamento',profissional,sessao_prof));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,versao}' is distinct from '1' or r#>>'{dados,etapa}' is distinct from 'sugerido' then
  raise exception 'CRIACAO: %',r;
 end if;
 if not exists(select 1 from auditoria.evento where request_id=req and resultado='permitido' and acao='api.gravar_encaminhamento') then
  raise exception 'AUDITORIA_CRIACAO_AUSENTE';
 end if;

 -- Conflito: mesma versão esperada de novo.
 req:=gen_random_uuid();
 e:=jsonb_set(jsonb_set(e,'{request_id}',to_jsonb(req)),'{registro_id}',to_jsonb(gen_random_uuid()));
 e:=jsonb_set(e,'{aad,registro_id}',to_jsonb(e->>'registro_id'));
 r:=api.encaminhamento_privado(public.assinar_anamnese_fixture(e,'api.gravar_encaminhamento',profissional,sessao_prof));
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'CONFLITO_VERSAO: %',r; end if;
 if not exists(select 1 from auditoria.evento where request_id=req and resultado='negado') then
  raise exception 'AUDITORIA_CONFLITO_AUSENTE';
 end if;

 -- Avança A para "retorno_pendente" (versão 2).
 registro:=gen_random_uuid(); req:=gen_random_uuid();
 aad:=jsonb_build_object('tabela','cadastro.encaminhamento_versao','paciente_id',paciente::text,'encaminhamento_id',enc_a::text,'registro_id',registro::text,'versao',2,'campo','conteudo','formato',1);
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'encaminhamento_id',enc_a,'registro_id',registro,'versao_esperada',1,'etapa','retorno_pendente','conteudo',envelope,'aad',aad);
 r:=api.encaminhamento_privado(public.assinar_anamnese_fixture(e,'api.gravar_encaminhamento',profissional,sessao_prof));
 if r#>>'{dados,versao}' is distinct from '2' or r#>>'{dados,etapa}' is distinct from 'retorno_pendente' then
  raise exception 'REVISAO: %',r;
 end if;

 -- Cria encaminhamento B já "concluido".
 registro:=gen_random_uuid(); req:=gen_random_uuid();
 aad:=jsonb_build_object('tabela','cadastro.encaminhamento_versao','paciente_id',paciente::text,'encaminhamento_id',enc_b::text,'registro_id',registro::text,'versao',1,'campo','conteudo','formato',1);
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'encaminhamento_id',enc_b,'registro_id',registro,'versao_esperada',0,'etapa','concluido','conteudo',envelope,'aad',aad);
 r:=api.encaminhamento_privado(public.assinar_anamnese_fixture(e,'api.gravar_encaminhamento',profissional,sessao_prof));
 if r->>'ok' is distinct from 'true' then raise exception 'CRIACAO_B: %',r; end if;

 -- Lista completa devolve os dois, com a etapa vigente de cada um.
 req:=gen_random_uuid();
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente);
 r:=api.encaminhamento_privado(public.assinar_anamnese_fixture(e,'api.ler_encaminhamentos',profissional,sessao_prof));
 if jsonb_array_length(r->'dados')<>2 then raise exception 'LISTA_COMPLETA: %',r; end if;
 if not exists(select 1 from jsonb_array_elements(r->'dados') x where x->>'encaminhamento_id'=enc_a::text and x->>'etapa'='retorno_pendente')
  or not exists(select 1 from jsonb_array_elements(r->'dados') x where x->>'encaminhamento_id'=enc_b::text and x->>'etapa'='concluido') then
  raise exception 'ETAPA_VIGENTE_ERRADA: %',r;
 end if;

 -- FR-018: localizar encaminhamentos SEM RETORNO é filtro do banco, não do cliente.
 req:=gen_random_uuid();
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'apenas_sem_retorno',true);
 r:=api.encaminhamento_privado(public.assinar_anamnese_fixture(e,'api.ler_encaminhamentos',profissional,sessao_prof));
 if jsonb_array_length(r->'dados')<>1 or r#>>'{dados,0,encaminhamento_id}' is distinct from enc_a::text then
  raise exception 'SEM_RETORNO: %',r;
 end if;

 -- Etapa fora do conjunto previsto é recusada.
 begin
  registro:=gen_random_uuid(); req:=gen_random_uuid();
  aad:=jsonb_build_object('tabela','cadastro.encaminhamento_versao','paciente_id',paciente::text,'encaminhamento_id',enc_a::text,'registro_id',registro::text,'versao',3,'campo','conteudo','formato',1);
  perform api.encaminhamento_privado(public.assinar_anamnese_fixture(jsonb_build_object('request_id',req,'paciente_id',paciente,'encaminhamento_id',enc_a,'registro_id',registro,'versao_esperada',2,'etapa','inventada','conteudo',envelope,'aad',aad),'api.gravar_encaminhamento',profissional,sessao_prof));
  raise exception 'ETAPA_INVALIDA_ACEITA';
 exception when invalid_parameter_value then null;
 end;

 -- AAD adulterado (outro encaminhamento) é recusado.
 begin
  registro:=gen_random_uuid(); req:=gen_random_uuid();
  aad:=jsonb_build_object('tabela','cadastro.encaminhamento_versao','paciente_id',paciente::text,'encaminhamento_id',enc_b::text,'registro_id',registro::text,'versao',3,'campo','conteudo','formato',1);
  perform api.encaminhamento_privado(public.assinar_anamnese_fixture(jsonb_build_object('request_id',req,'paciente_id',paciente,'encaminhamento_id',enc_a,'registro_id',registro,'versao_esperada',2,'etapa','concluido','conteudo',envelope,'aad',aad),'api.gravar_encaminhamento',profissional,sessao_prof));
  raise exception 'AAD_ADULTERADO_ACEITO';
 exception when invalid_parameter_value then null;
 end;

 -- Família não lê nem grava.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',familia,'session_id',sessao_familia,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 req:=gen_random_uuid();
 r:=api.encaminhamento_privado(public.assinar_anamnese_fixture(jsonb_build_object('request_id',req,'paciente_id',paciente),'api.ler_encaminhamentos',familia,sessao_familia));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'FAMILIA_LEU: %',r; end if;

 -- Sessão encerrada do profissional não lê.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',profissional,'session_id',sessao_prof,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=sessao_prof;
 req:=gen_random_uuid();
 r:=api.encaminhamento_privado(public.assinar_anamnese_fixture(jsonb_build_object('request_id',req,'paciente_id',paciente),'api.ler_encaminhamentos',profissional,sessao_prof));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'SESSAO_ENCERRADA_LEU: %',r; end if;
 update identidade.sessao set encerrada_em=null where session_id=sessao_prof;
end $$;

-- Imutabilidade: versão gravada não pode ser alterada nem apagada.
do $$
declare alvo uuid;
begin
 select id into alvo from cadastro.encaminhamento_versao limit 1;
 begin
  update cadastro.encaminhamento_versao set etapa='concluido' where id=alvo;
  raise exception 'UPDATE_ACEITO';
 exception when raise_exception then
  if sqlerrm <> 'Encaminhamentos e versões são imutáveis' then raise; end if;
 end;
 begin
  delete from cadastro.encaminhamento_versao where id=alvo;
  raise exception 'DELETE_ACEITO';
 exception when raise_exception then
  if sqlerrm <> 'Encaminhamentos e versões são imutáveis' then raise; end if;
 end;
end $$;
