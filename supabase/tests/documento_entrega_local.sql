\set ON_ERROR_STOP on
\ir documento_caso_familia_local.sql
\ir ../migrations/20261125090000_documento_entrega_privada.sql

-- Prova dirigida ao wrapper real; fixture Auth e assinatura local são fictícios.
-- Não comprova Google/Vault remoto. Nenhum novo privilégio direto é concedido.
do $$
#variable_conflict use_variable
declare
 colaborador uuid:='10000000-0000-4000-8000-000000000001'; sessao_colab uuid:='20000000-0000-4000-8000-000000000001';
 familia uuid:='10000000-0000-4000-8000-0000000000f4'; sessao_familia uuid:='20000000-0000-4000-8000-0000000000f4';
 outra_familia uuid:='10000000-0000-4000-8000-0000000000f5'; sessao_outra uuid:='20000000-0000-4000-8000-0000000000f5';
 paciente uuid:='40000000-0000-4000-8000-0000000000f0';
 publico uuid:=gen_random_uuid(); interno uuid:=gen_random_uuid(); req uuid; e jsonb; r jsonb; alvo uuid;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',colaborador,'session_id',sessao_colab,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 foreach alvo in array array[publico,interno] loop
  req:=gen_random_uuid();
  e:=public.entrada_documento_fixture(paciente,alvo,gen_random_uuid(),req,0,'Laudo',case when alvo=publico then 'equipe_e_familia' else 'equipe' end,'disponivel',alvo::text,repeat('a',43));
  r:=api.documento_operacao_privada(public.assinar_documento_fixture(e,'api.gravar_documento',colaborador,sessao_colab));
  if r->>'ok' is distinct from 'true' then raise exception 'ENTREGA_PREPARACAO'; end if;
  req:=gen_random_uuid();
  r:=api.documento_operacao_privada(public.assinar_documento_fixture(jsonb_build_object('request_id',req,'paciente_id',paciente,'documento_id',alvo),'api.ler_documentos',colaborador,sessao_colab));
  if r->>'ok' is distinct from 'true' or jsonb_array_length(r#>'{dados,documentos}')<>1 or r#>>'{dados,documentos,0,documento_id}' is distinct from alvo::text then raise exception 'ENTREGA_COLABORADOR'; end if;
  if not exists(select 1 from auditoria.evento where request_id=req and tipo_objeto='documento' and objeto_id=alvo and resultado='permitido') then raise exception 'ENTREGA_SEM_AUDITORIA'; end if;
 end loop;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',familia,'session_id',sessao_familia,'amr',jsonb_build_array(jsonb_build_object('method','password')))::text,true);
 req:=gen_random_uuid();
 r:=api.documento_operacao_privada(public.assinar_documento_fixture(jsonb_build_object('request_id',req,'paciente_id',paciente,'documento_id',publico),'api.ler_documentos',familia,sessao_familia));
 if r->>'ok' is distinct from 'true' or jsonb_array_length(r#>'{dados,documentos}')<>1 then raise exception 'ENTREGA_FAMILIA_PUBLICO'; end if;
 -- Interno e documento inexistente têm mesma negativa, com auditoria do alvo.
 foreach alvo in array array[interno,gen_random_uuid()] loop
  req:=gen_random_uuid();
  r:=api.documento_operacao_privada(public.assinar_documento_fixture(jsonb_build_object('request_id',req,'paciente_id',paciente,'documento_id',alvo),'api.ler_documentos',familia,sessao_familia));
  if r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados' then raise exception 'ENTREGA_FAMILIA_INTERNO'; end if;
  if not exists(select 1 from auditoria.evento where request_id=req and tipo_objeto='documento' and objeto_id=alvo and resultado='negado') then raise exception 'ENTREGA_NEGATIVA_SEM_AUDITORIA'; end if;
 end loop;
 -- Mesmo arquivo não pode ser pedido sob outro paciente, nem por colaborador.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',colaborador,'session_id',sessao_colab,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 req:=gen_random_uuid();
 r:=api.documento_operacao_privada(public.assinar_documento_fixture(jsonb_build_object('request_id',req,'paciente_id','40000000-0000-4000-8000-000000000001','documento_id',publico),'api.ler_documentos',colaborador,sessao_colab));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'ENTREGA_OUTRO_PACIENTE'; end if;
 -- Nova versão de audiência prevalece; a versão familiar antiga não autoriza download.
 req:=gen_random_uuid();
 e:=public.entrada_documento_fixture(paciente,publico,gen_random_uuid(),req,1,'Laudo','equipe','disponivel','entrega-internalizar',repeat('b',43));
 r:=api.documento_operacao_privada(public.assinar_documento_fixture(e,'api.gravar_documento',colaborador,sessao_colab));
 if r->>'ok' is distinct from 'true' then raise exception 'ENTREGA_INTERNALIZAR'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',familia,'session_id',sessao_familia,'amr',jsonb_build_array(jsonb_build_object('method','password')))::text,true);
 req:=gen_random_uuid();
 r:=api.documento_operacao_privada(public.assinar_documento_fixture(jsonb_build_object('request_id',req,'paciente_id',paciente,'documento_id',publico),'api.ler_documentos',familia,sessao_familia));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'ENTREGA_AUDIENCIA_REVOGADA'; end if;
 -- Perfil correto sem vínculo não recebe nenhum arquivo.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',outra_familia,'session_id',sessao_outra,'amr',jsonb_build_array(jsonb_build_object('method','password')))::text,true);
 req:=gen_random_uuid();
 r:=api.documento_operacao_privada(public.assinar_documento_fixture(jsonb_build_object('request_id',req,'paciente_id',paciente,'documento_id',publico),'api.ler_documentos',outra_familia,sessao_outra));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'ENTREGA_SEM_VINCULO'; end if;
 -- Revogação de vínculo da família nega leitura antes de tocar Google.
 update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id=colaborador,motivo_revogacao_cifrado=motivo_concessao_cifrado where usuario_id=familia;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',familia,'session_id',sessao_familia,'amr',jsonb_build_array(jsonb_build_object('method','password')))::text,true);
 req:=gen_random_uuid();
 r:=api.documento_operacao_privada(public.assinar_documento_fixture(jsonb_build_object('request_id',req,'paciente_id',paciente,'documento_id',publico),'api.ler_documentos',familia,sessao_familia));
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'ENTREGA_VINCULO_REVOGADO'; end if;
end $$;
do $$ begin raise notice 'DOCUMENTO_ENTREGA_OK'; end $$;
