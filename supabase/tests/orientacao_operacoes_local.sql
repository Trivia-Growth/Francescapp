\set ON_ERROR_STOP on
\ir anamnese_operacoes_local.sql
\ir ../migrations/20261117130000_orientacao_versoes_privadas.sql
\ir ../migrations/20261117140000_orientacao_operacoes_privadas.sql

-- Familiar não existe no fixture base; criado aqui para o negativo de perfil. Família nunca
-- recebe concessão de equipe (a constraint de `concessao_equipe.perfil` só aceita
-- administrador/profissional), então a negativa vem da ausência de concessão vigente.
insert into auth.users values ('10000000-0000-4000-8000-000000000019');
insert into public.usuario(id,perfil) values ('10000000-0000-4000-8000-000000000019','familia');
insert into auth.identities values ('10000000-0000-4000-8000-000000000019','10000000-0000-4000-8000-000000000019','google','google-10000000-0000-4000-8000-000000000019',jsonb_build_object('sub','google-10000000-0000-4000-8000-000000000019','email_verified',true,'custom_claims',jsonb_build_object('hd','example.test')));
insert into auth.sessions values ('20000000-0000-4000-8000-000000000019','10000000-0000-4000-8000-000000000019',null);

-- Acesso direto negado para todo papel de aplicação.
do $$
declare papel text;
begin
 foreach papel in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(papel,'api.orientacao_privada(jsonb)','execute')
   or has_function_privilege(papel,'api.orientacao_operacao_privada(jsonb)','execute')
   or has_table_privilege(papel,'cadastro.orientacao','select')
   or has_table_privilege(papel,'cadastro.orientacao_versao','insert') then
   raise exception 'ACESSO_INDEVIDO: %', papel;
  end if;
 end loop;
end $$;

do $$
#variable_conflict use_variable
declare
 profissional uuid:='10000000-0000-4000-8000-000000000002';
 sessao_prof uuid:='20000000-0000-4000-8000-000000000002';
 familia uuid:='10000000-0000-4000-8000-000000000019';
 sessao_familia uuid:='20000000-0000-4000-8000-000000000019';
 paciente uuid:='40000000-0000-4000-8000-000000000001';
 ori_a uuid:=gen_random_uuid(); ori_b uuid:=gen_random_uuid();
 registro uuid; req uuid; e jsonb; r jsonb;
 envelope jsonb:=jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22));
 aad jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',profissional,'session_id',sessao_prof,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);

 -- Lista inicial vazia.
 req:=gen_random_uuid();
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente);
 r:=api.orientacao_privada(public.assinar_anamnese_fixture(e,'api.ler_orientacoes',profissional,sessao_prof));
 if r->>'ok' is distinct from 'true' or r->'dados' <> '[]'::jsonb then raise exception 'LISTA_INICIAL: %',r; end if;

 -- Orientação A nasce vigente.
 registro:=gen_random_uuid(); req:=gen_random_uuid();
 aad:=jsonb_build_object('tabela','cadastro.orientacao_versao','paciente_id',paciente::text,'orientacao_id',ori_a::text,'registro_id',registro::text,'versao',1,'campo','conteudo','formato',1);
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'orientacao_id',ori_a,'registro_id',registro,'versao_esperada',0,'situacao','vigente','conteudo',envelope,'aad',aad);
 r:=api.orientacao_privada(public.assinar_anamnese_fixture(e,'api.gravar_orientacao',profissional,sessao_prof));
 if r->>'ok' is distinct from 'true' or r#>>'{dados,versao}' is distinct from '1' or r#>>'{dados,situacao}' is distinct from 'vigente' then
  raise exception 'CRIACAO: %',r;
 end if;
 -- Autor e data vêm do banco, não do cliente (FR-019).
 if r#>>'{dados,criado_em}' is null then raise exception 'DATA_AUSENTE: %',r; end if;
 if not exists(select 1 from cadastro.orientacao_versao v where v.id=(r#>>'{dados,registro_id}')::uuid and v.criado_por_usuario_id=profissional) then
  raise exception 'AUTOR_NAO_REGISTRADO';
 end if;
 if not exists(select 1 from auditoria.evento where request_id=req and resultado='permitido' and acao='api.gravar_orientacao') then
  raise exception 'AUDITORIA_CRIACAO_AUSENTE';
 end if;

 -- Nascer superada é recusado: superada é sempre revisão do que já valia.
 begin
  registro:=gen_random_uuid(); req:=gen_random_uuid();
  aad:=jsonb_build_object('tabela','cadastro.orientacao_versao','paciente_id',paciente::text,'orientacao_id',ori_b::text,'registro_id',registro::text,'versao',1,'campo','conteudo','formato',1);
  perform api.orientacao_privada(public.assinar_anamnese_fixture(jsonb_build_object('request_id',req,'paciente_id',paciente,'orientacao_id',ori_b,'registro_id',registro,'versao_esperada',0,'situacao','superada','conteudo',envelope,'aad',aad),'api.gravar_orientacao',profissional,sessao_prof));
  raise exception 'NASCEU_SUPERADA';
 exception when invalid_parameter_value then null;
 end;

 -- Conflito: mesma versão esperada de novo.
 registro:=gen_random_uuid(); req:=gen_random_uuid();
 aad:=jsonb_build_object('tabela','cadastro.orientacao_versao','paciente_id',paciente::text,'orientacao_id',ori_a::text,'registro_id',registro::text,'versao',1,'campo','conteudo','formato',1);
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'orientacao_id',ori_a,'registro_id',registro,'versao_esperada',0,'situacao','vigente','conteudo',envelope,'aad',aad);
 r:=api.orientacao_privada(public.assinar_anamnese_fixture(e,'api.gravar_orientacao',profissional,sessao_prof));
 if r#>>'{erro,codigo}' is distinct from 'conflito' then raise exception 'CONFLITO_VERSAO: %',r; end if;

 -- Orientação B também vigente.
 registro:=gen_random_uuid(); req:=gen_random_uuid();
 aad:=jsonb_build_object('tabela','cadastro.orientacao_versao','paciente_id',paciente::text,'orientacao_id',ori_b::text,'registro_id',registro::text,'versao',1,'campo','conteudo','formato',1);
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'orientacao_id',ori_b,'registro_id',registro,'versao_esperada',0,'situacao','vigente','conteudo',envelope,'aad',aad);
 r:=api.orientacao_privada(public.assinar_anamnese_fixture(e,'api.gravar_orientacao',profissional,sessao_prof));
 if r->>'ok' is distinct from 'true' then raise exception 'CRIACAO_B: %',r; end if;

 -- Superar A: versão 2 marca a orientação como anterior, sem apagar nada.
 registro:=gen_random_uuid(); req:=gen_random_uuid();
 aad:=jsonb_build_object('tabela','cadastro.orientacao_versao','paciente_id',paciente::text,'orientacao_id',ori_a::text,'registro_id',registro::text,'versao',2,'campo','conteudo','formato',1);
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'orientacao_id',ori_a,'registro_id',registro,'versao_esperada',1,'situacao','superada','conteudo',envelope,'aad',aad);
 r:=api.orientacao_privada(public.assinar_anamnese_fixture(e,'api.gravar_orientacao',profissional,sessao_prof));
 if r#>>'{dados,versao}' is distinct from '2' or r#>>'{dados,situacao}' is distinct from 'superada' then
  raise exception 'SUPERACAO: %',r;
 end if;
 -- A versão 1 continua existindo: histórico preservado.
 if (select count(*) from cadastro.orientacao_versao v where v.orientacao_id=ori_a) <> 2 then
  raise exception 'HISTORICO_PERDIDO';
 end if;

 -- Lista completa devolve as duas com a situação vigente de cada uma.
 req:=gen_random_uuid();
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente);
 r:=api.orientacao_privada(public.assinar_anamnese_fixture(e,'api.ler_orientacoes',profissional,sessao_prof));
 if jsonb_array_length(r->'dados')<>2 then raise exception 'LISTA_COMPLETA: %',r; end if;
 if not exists(select 1 from jsonb_array_elements(r->'dados') x where x->>'orientacao_id'=ori_a::text and x->>'situacao'='superada')
  or not exists(select 1 from jsonb_array_elements(r->'dados') x where x->>'orientacao_id'=ori_b::text and x->>'situacao'='vigente') then
  raise exception 'SITUACAO_VIGENTE_ERRADA: %',r;
 end if;

 -- FR-019: a superada não pode parecer atual; filtrar vigentes é consulta do banco.
 req:=gen_random_uuid();
 e:=jsonb_build_object('request_id',req,'paciente_id',paciente,'apenas_vigentes',true);
 r:=api.orientacao_privada(public.assinar_anamnese_fixture(e,'api.ler_orientacoes',profissional,sessao_prof));
 if jsonb_array_length(r->'dados')<>1 or r#>>'{dados,0,orientacao_id}' is distinct from ori_b::text then
  raise exception 'APENAS_VIGENTES: %',r;
 end if;

 -- Situação fora do conjunto previsto é recusada.
 begin
  registro:=gen_random_uuid(); req:=gen_random_uuid();
  aad:=jsonb_build_object('tabela','cadastro.orientacao_versao','paciente_id',paciente::text,'orientacao_id',ori_b::text,'registro_id',registro::text,'versao',2,'campo','conteudo','formato',1);
  perform api.orientacao_privada(public.assinar_anamnese_fixture(jsonb_build_object('request_id',req,'paciente_id',paciente,'orientacao_id',ori_b,'registro_id',registro,'versao_esperada',1,'situacao','inventada','conteudo',envelope,'aad',aad),'api.gravar_orientacao',profissional,sessao_prof));
  raise exception 'SITUACAO_INVALIDA_ACEITA';
 exception when invalid_parameter_value then null;
 end;

 -- AAD adulterado (outra orientação) é recusado.
 begin
  registro:=gen_random_uuid(); req:=gen_random_uuid();
  aad:=jsonb_build_object('tabela','cadastro.orientacao_versao','paciente_id',paciente::text,'orientacao_id',ori_a::text,'registro_id',registro::text,'versao',2,'campo','conteudo','formato',1);
  perform api.orientacao_privada(public.assinar_anamnese_fixture(jsonb_build_object('request_id',req,'paciente_id',paciente,'orientacao_id',ori_b,'registro_id',registro,'versao_esperada',1,'situacao','superada','conteudo',envelope,'aad',aad),'api.gravar_orientacao',profissional,sessao_prof));
  raise exception 'AAD_ADULTERADO_ACEITO';
 exception when invalid_parameter_value then null;
 end;

 -- Família não lê nem grava.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',familia,'session_id',sessao_familia,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 req:=gen_random_uuid();
 r:=api.orientacao_privada(public.assinar_anamnese_fixture(jsonb_build_object('request_id',req,'paciente_id',paciente),'api.ler_orientacoes',familia,sessao_familia));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'FAMILIA_LEU: %',r; end if;

 -- Sessão encerrada do profissional não lê.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',profissional,'session_id',sessao_prof,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=sessao_prof;
 req:=gen_random_uuid();
 r:=api.orientacao_privada(public.assinar_anamnese_fixture(jsonb_build_object('request_id',req,'paciente_id',paciente),'api.ler_orientacoes',profissional,sessao_prof));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'SESSAO_ENCERRADA_LEU: %',r; end if;
 update identidade.sessao set encerrada_em=null where session_id=sessao_prof;
end $$;

-- Imutabilidade: versão gravada não pode ser alterada nem apagada.
do $$
declare alvo uuid;
begin
 select id into alvo from cadastro.orientacao_versao limit 1;
 begin
  update cadastro.orientacao_versao set situacao='superada' where id=alvo;
  raise exception 'UPDATE_ACEITO';
 exception when raise_exception then
  if sqlerrm <> 'Orientações e versões são imutáveis' then raise; end if;
 end;
 begin
  delete from cadastro.orientacao_versao where id=alvo;
  raise exception 'DELETE_ACEITO';
 exception when raise_exception then
  if sqlerrm <> 'Orientações e versões são imutáveis' then raise; end if;
 end;
end $$;
