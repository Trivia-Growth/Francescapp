\set ON_ERROR_STOP on
-- A preparação antiga não é evidência: toda matriz abaixo roda após a migration nova.
\ir historico_anamnese_local.sql
\ir ../migrations/20261125010000_anamnese_vinculo_caso.sql
update identidade.sessao set encerrada_em=null,revogada_em=null;
insert into cadastro.acesso_paciente(id,paciente_id,usuario_id,concedido_por_usuario_id,motivo_concessao_cifrado)
select gen_random_uuid(),'40000000-0000-4000-8000-000000000001',id,'10000000-0000-4000-8000-000000000001',
 '{"formato":1,"key_id":"teste","nonce":"n","ciphertext":"c","tag":"t"}'::jsonb
from public.usuario where id in ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');
create function public.provar_anamnese_vinculo(ator uuid, paciente uuid, permitido boolean) returns void language plpgsql as $$
#variable_conflict use_variable
declare sessao uuid; acao text; e jsonb; r jsonb; registro uuid; v integer; req uuid;
begin
 select s.session_id into sessao from identidade.sessao s where s.usuario_id=ator;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 foreach acao in array array['leitura','historico','escrita'] loop
  req:=gen_random_uuid(); e:=jsonb_build_object('request_id',req,'paciente_id',paciente);
  if acao='escrita' then
   registro:=gen_random_uuid(); select coalesce(max(versao),0) into v from cadastro.anamnese_versao where paciente_id=paciente;
   e:=e||jsonb_build_object('registro_id',registro,'versao_esperada',v,'chave_idempotencia',gen_random_uuid()::text,'digest_idempotencia',repeat('c',43),
    'conteudo',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)),
    'aad',jsonb_build_object('tabela','cadastro.anamnese_versao','paciente_id',paciente::text,'registro_id',registro::text,'versao',v+1,'campo','conteudo','formato',1));
  end if;
  if acao='historico' then
   r:=api.historico_anamnese_privada(public.assinar_anamnese_fixture(e,'api.ler_anamnese',ator,sessao));
  else
   r:=api.anamnese_privada(public.assinar_anamnese_fixture(e,case acao when 'escrita' then 'api.gravar_anamnese' else 'api.ler_anamnese' end,ator,sessao));
  end if;
  if permitido and r->>'ok' is distinct from 'true' then raise exception 'POSITIVA %: %',acao,r; end if;
  if not permitido and (r#>>'{erro,codigo}' is distinct from 'sem_permissao' or r ? 'dados') then raise exception 'NEGATIVA %: %',acao,r; end if;
  if not exists(select 1 from auditoria.evento where request_id=req and resultado=case when permitido then 'permitido' else 'negado' end) then raise exception 'AUDITORIA %',acao; end if;
 end loop;
end $$;
do $$
declare ator uuid; papel text;
begin
 foreach ator in array array['10000000-0000-4000-8000-000000000001'::uuid,'10000000-0000-4000-8000-000000000002'::uuid] loop
  perform public.provar_anamnese_vinculo(ator,'40000000-0000-4000-8000-000000000001',true);
  perform public.provar_anamnese_vinculo(ator,'40000000-0000-4000-8000-000000000002',false);
  update cadastro.acesso_paciente set revogada_em=clock_timestamp(),revogado_por_usuario_id=ator,motivo_revogacao_cifrado=motivo_concessao_cifrado where usuario_id=ator;
  perform public.provar_anamnese_vinculo(ator,'40000000-0000-4000-8000-000000000001',false);
  update cadastro.acesso_paciente set revogada_em=null,revogado_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id=ator;
  update public.usuario set ativo=false where id=ator;
  perform public.provar_anamnese_vinculo(ator,'40000000-0000-4000-8000-000000000001',false);
  update public.usuario set ativo=true where id=ator;
  update identidade.sessao set encerrada_em=clock_timestamp() where usuario_id=ator;
  perform public.provar_anamnese_vinculo(ator,'40000000-0000-4000-8000-000000000001',false);
  update identidade.sessao set encerrada_em=null where usuario_id=ator;
  update identidade.concessao_equipe set estado='revogada',revogada_em=clock_timestamp(),revogada_por_usuario_id=ator,motivo_revogacao_cifrado=motivo_cifrado where usuario_id=ator;
  perform public.provar_anamnese_vinculo(ator,'40000000-0000-4000-8000-000000000001',false);
  update identidade.concessao_equipe set estado='vinculada',revogada_em=null,revogada_por_usuario_id=null,motivo_revogacao_cifrado=null where usuario_id=ator;
 end loop;
 update public.usuario set perfil='familia' where id=ator;
 perform public.provar_anamnese_vinculo(ator,'40000000-0000-4000-8000-000000000001',false);
 update public.usuario set perfil='profissional' where id=ator;
 foreach papel in array array['anon','authenticated','service_role','ffcmapp_carteira_owner'] loop
  if has_table_privilege(papel,'cadastro.anamnese_versao','SELECT') or has_table_privilege(papel,'cadastro.anamnese_versao','INSERT')
   or has_function_privilege(papel,'api.anamnese_operacao_privada(jsonb)','EXECUTE')
   or has_function_privilege(papel,'api.historico_anamnese_operacao_privada(jsonb)','EXECUTE') then raise exception 'ACESSO_DIRETO %',papel; end if;
 end loop;
 -- UPDATE foi concedido somente para FOR SHARE. Nem o owner pode revogar vínculo.
 begin
  execute 'set local role ffcmapp_anamnese_owner';
  update cadastro.acesso_paciente set revogada_em=clock_timestamp();
  if found then raise exception 'OWNER_ALTEROU_VINCULO'; end if;
 exception when insufficient_privilege then null;
 end;
 execute 'reset role';
end $$;

\ir anamnese_vinculo_revogacao_concorrente_local.sql
