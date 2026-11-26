\set ON_ERROR_STOP on
-- Prova local da situação do caso na lista de pessoas (tarefa 2.10). PostgreSQL descartável; Auth e
-- assinatura são fixtures fictícias e não comprovam serviço real. A chamada passa por api.listar_pacientes,
-- que executa a função privada como papel dono da carteira, então grants e políticas do papel são exercitados.
\ir contato_autorizacao_local.sql
\ir ../migrations/20261109110000_barreira_edicao_paciente_privada.sql
\ir ../migrations/20261109130000_edicao_paciente_composicao.sql
\ir ../migrations/20261110200000_edicao_paciente_wrappers_privados.sql
\ir ../migrations/20261110210000_consultar_paciente_edicao_privado.sql
\ir ../migrations/20261112100000_auditoria_carteira_auth_nao_admitido.sql
\ir ../migrations/20261112120000_corrigir_reserva_barreira_contato.sql
\ir ../migrations/20261112140000_auditoria_edicao_contato_auth_nao_admitido.sql
\ir ../migrations/20261113100000_acompanhamento_caso.sql
\ir ../migrations/20261113110000_situacao_na_lista.sql

create function public.listar_fixture(p_ator uuid,p_sessao uuid,p_limite integer default 10,p_cursor uuid default null)
returns jsonb language plpgsql as $$
declare e jsonb:=jsonb_build_object('request_id',gen_random_uuid(),'limite',p_limite);
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_ator,'session_id',p_sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 if p_cursor is not null then e:=e||jsonb_build_object('cursor',p_cursor); end if;
 return api.listar_pacientes(public.assinar_anamnese_fixture(e,'api.listar_pacientes',p_ator,p_sessao));
end $$;

-- Retrato do caso gravado como fixture; a gravação real é provada em acompanhamento_caso_local.sql.
create function public.caso_fixture(p_paciente uuid,p_versao integer,p_situacao text,p_ator uuid) returns void language plpgsql as $$
declare aud uuid:=gen_random_uuid();
begin
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
 values (aud,p_ator,'api.editar_paciente','paciente',p_paciente,'permitido',gen_random_uuid());
 insert into cadastro.acompanhamento_caso(id,paciente_id,versao,situacao,responsavel_usuario_id,auditoria_id,ator_usuario_id)
 values (gen_random_uuid(),p_paciente,p_versao,p_situacao,p_ator,aud,p_ator);
end $$;

do $$
#variable_conflict use_variable
declare
 admin uuid:='10000000-0000-4000-8000-000000000001'; s_admin uuid:='20000000-0000-4000-8000-000000000001';
 prof uuid:='10000000-0000-4000-8000-000000000002'; s_prof uuid:='20000000-0000-4000-8000-000000000002';
 p1 uuid:='40000000-0000-4000-8000-000000000001'; p2 uuid;
 r jsonb; item jsonb; n integer; ordem uuid[]; cursor_p uuid;
begin
 select array_agg(id order by criado_em,id) into ordem from cadastro.paciente;
 if coalesce(array_length(ordem,1),0)<2 then raise exception 'FIXTURE_COM_POUCOS_PACIENTES'; end if;
 p1:=ordem[1]; p2:=ordem[2];

 -- Privilégios: o papel da carteira lê só paciente_id, versao e situacao; nenhum outro papel lê a tabela.
 if not has_column_privilege('ffcmapp_carteira_owner','cadastro.acompanhamento_caso','situacao','select')
  or not has_column_privilege('ffcmapp_carteira_owner','cadastro.acompanhamento_caso','paciente_id','select')
  or not has_column_privilege('ffcmapp_carteira_owner','cadastro.acompanhamento_caso','versao','select') then
  raise exception 'OWNER_SEM_LEITURA_DA_SITUACAO';
 end if;
 foreach item in array array[to_jsonb('responsavel_usuario_id'::text),to_jsonb('auditoria_id'::text),to_jsonb('ator_usuario_id'::text),to_jsonb('id'::text)] loop
  if has_column_privilege('ffcmapp_carteira_owner','cadastro.acompanhamento_caso',item#>>'{}','select') then
   raise exception 'OWNER_LE_COLUNA_NAO_PREVISTA: %',item#>>'{}';
  end if;
 end loop;
 if has_table_privilege('ffcmapp_carteira_owner','cadastro.acompanhamento_caso','insert')
  or has_table_privilege('ffcmapp_carteira_owner','cadastro.acompanhamento_caso','update')
  or has_table_privilege('ffcmapp_carteira_owner','cadastro.acompanhamento_caso','delete')
  or has_table_privilege('ffcmapp_carteira_owner','cadastro.acompanhamento_caso','truncate') then
  raise exception 'OWNER_ESCREVE_NO_CASO';
 end if;
 if has_table_privilege('authenticated','cadastro.acompanhamento_caso','select')
  or has_table_privilege('anon','cadastro.acompanhamento_caso','select')
  or has_table_privilege('service_role','cadastro.acompanhamento_caso','select') then
  raise exception 'PAPEL_DA_APLICACAO_LE_O_CASO';
 end if;

 -- Positivo: sem registro, o Administrador recebe a chave com valor nulo ("a completar").
 r:=public.listar_fixture(admin,s_admin);
 if r->>'ok' is distinct from 'true' then raise exception 'ADMIN_NEGADO: %',r; end if;
 select i into item from jsonb_array_elements(r#>'{dados,itens}') i where i->>'paciente_id'=p1::text;
 if item is null or not (item ? 'situacao') or jsonb_typeof(item->'situacao') is distinct from 'null' then
  raise exception 'SITUACAO_AUSENTE_DEVERIA_SER_NULA: %',item;
 end if;

 -- Positivo: vigente é a linha de maior versão; um paciente sem registro segue nulo.
 perform public.caso_fixture(p1,1,'entrada',admin);
 perform public.caso_fixture(p1,2,'ativo',admin);
 r:=public.listar_fixture(admin,s_admin);
 select i into item from jsonb_array_elements(r#>'{dados,itens}') i where i->>'paciente_id'=p1::text;
 if item->>'situacao' is distinct from 'ativo' then raise exception 'SITUACAO_VIGENTE_ERRADA: %',item; end if;
 select i into item from jsonb_array_elements(r#>'{dados,itens}') i where i->>'paciente_id'=p2::text;
 if item is null or jsonb_typeof(item->'situacao') is distinct from 'null' then raise exception 'SEGUNDO_PACIENTE_DEVERIA_SER_NULO: %',item; end if;
 if r::text like '%responsavel%' or r::text like '%motivo%' then raise exception 'LISTA_VAZA_RESPONSAVEL_OU_MOTIVO: %',r; end if;

 -- Positivo: a situação acompanha a paginação (cursor) na mesma consulta.
 r:=public.listar_fixture(admin,s_admin,1);
 cursor_p:=(r->'dados'->>'proximo_cursor')::uuid;
 if cursor_p is null or r#>>'{dados,itens,0,paciente_id}' is distinct from p1::text or r#>>'{dados,itens,0,situacao}' is distinct from 'ativo' then
  raise exception 'PRIMEIRA_PAGINA_SEM_SITUACAO: %',r;
 end if;
 r:=public.listar_fixture(admin,s_admin,1,cursor_p);
 if r#>>'{dados,itens,0,paciente_id}' is distinct from p2::text or not (r#>'{dados,itens,0}' ? 'situacao') then
  raise exception 'SEGUNDA_PAGINA_SEM_SITUACAO: %',r;
 end if;

 -- Negativo: Profissional com vínculo vê o paciente, mas sem situação, sem responsável e sem a chave.
 insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado)
 values (gen_random_uuid(),p1,prof,admin,'{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}');
 r:=public.listar_fixture(prof,s_prof);
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r#>'{dados,itens}')<>1 then raise exception 'PROFISSIONAL_COM_VINCULO_ESPERAVA_UM: %',r; end if;
 if r::text like '%situacao%' or r::text like '%responsavel%' then raise exception 'PROFISSIONAL_RECEBEU_SITUACAO: %',r; end if;

 -- Negativo: Profissional sem vínculo não recebe paciente algum.
 update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id=admin,motivo_revogacao_cifrado=motivo_concessao_cifrado where usuario_id=prof;
 r:=public.listar_fixture(prof,s_prof);
 if jsonb_array_length(r#>'{dados,itens}')<>0 then raise exception 'VINCULO_REVOGADO_ACEITO: %',r; end if;

 -- Negativo: a política do caso só admite o Administrador ativo no contexto do papel da carteira.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',prof,'session_id',s_prof,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 execute 'set local role ffcmapp_carteira_owner';
 select count(*) into n from cadastro.acompanhamento_caso;
 execute 'reset role';
 if n<>0 then raise exception 'POLITICA_ADMITE_PROFISSIONAL: %',n; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'session_id',s_admin,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 execute 'set local role ffcmapp_carteira_owner';
 select count(*) into n from cadastro.acompanhamento_caso;
 execute 'reset role';
 if n<>2 then raise exception 'POLITICA_NEGA_ADMINISTRADOR: %',n; end if;

 -- Negativo: sessão encerrada do Administrador não lista nem recebe situação.
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=s_admin;
 r:=public.listar_fixture(admin,s_admin);
 if r->>'ok' is distinct from 'false' or r::text like '%situacao%' then raise exception 'SESSAO_ENCERRADA_RECEBEU_DADOS: %',r; end if;
 update identidade.sessao set encerrada_em=null where session_id=s_admin;

 -- Negativo: perfil Família não é admitido pela lista da carteira.
 update public.usuario set perfil='familia' where id=prof;
 r:=public.listar_fixture(prof,s_prof);
 if r->>'ok' is distinct from 'false' or r::text like '%situacao%' then raise exception 'FAMILIA_ADMITIDA_NA_CARTEIRA: %',r; end if;
 update public.usuario set perfil='profissional' where id=prof;
end $$;
