\set ON_ERROR_STOP on
\ir plano_cuidado_reserva_local.sql
\ir ../migrations/20261107170000_plano_composicao_privada.sql

do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002'; paciente uuid:='40000000-0000-4000-8000-000000000001'; reserva uuid:=gen_random_uuid(); comando uuid:=gen_random_uuid(); req uuid:=gen_random_uuid(); e jsonb; t jsonb; r jsonb;
begin
 if has_function_privilege('authenticated','api.plano_composicao_privada(jsonb)','execute') or has_function_privilege('service_role','api.plano_composicao_privada(jsonb)','execute') then raise exception 'GRANT_INDEVIDO'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 -- Limpa apenas dados fictícios da preparação para exercitar época inicial.
 delete from operacao.reserva_plano where ator_usuario_id=ator;
 delete from operacao.recibo_barreira_plano where ator_usuario_id=ator;
 delete from operacao.barreira_plano where ator_usuario_id=ator;
 e:=jsonb_build_object('request_id',req,'operacao','api.reservar_plano','epoca',1,'reserva_id',reserva,'paciente_id',paciente);
 t:=public.assinar_anamnese_fixture(e,'api.reservar_plano',ator,sessao);
 perform set_config('fixture.falhar_auditoria','sim',true);
 begin
  perform api.plano_composicao_privada(t);
  raise exception 'AUDITORIA_NAO_EXIGIDA';
 exception when raise_exception then
  if sqlerrm <> 'FALHA_AUDITORIA_FIXTURE' then raise; end if;
 end;
 perform set_config('fixture.falhar_auditoria','nao',true);
 if exists(select 1 from operacao.reserva_plano where id=reserva) then raise exception 'RESERVA_NAO_REVERTIDA'; end if;
 r:=api.plano_composicao_privada(t);
 if r#>>'{dados,estado}' is distinct from 'aberta' then raise exception 'RESERVA: %',r; end if;
 if not exists(select 1 from auditoria.evento where request_id=req and resultado='permitido') then raise exception 'AUDITORIA_AUSENTE'; end if;
 update identidade.sessao set encerrada_em=clock_timestamp() where session_id=sessao;
 r:=api.plano_composicao_privada(t);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'REVOGACAO: %',r; end if;
 update identidade.sessao set encerrada_em=null where session_id=sessao;
 -- Uma reserva não pode sobreviver à perda de autorização do ator.
 update public.usuario set ativo=false where id=ator;
 r:=api.plano_composicao_privada(t);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'USUARIO_INATIVO: %',r; end if;
 update public.usuario set ativo=true, perfil='familia' where id=ator;
 r:=api.plano_composicao_privada(t);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'FAMILIA: %',r; end if;
 update public.usuario set perfil='profissional' where id=ator;
 update identidade.concessao_equipe set estado='revogada', revogada_em=clock_timestamp(), revogada_por_usuario_id=ator, motivo_revogacao_cifrado=motivo_cifrado where usuario_id=ator;
 r:=api.plano_composicao_privada(t);
 if r#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'CONCESSAO_REVOGADA: %',r; end if;
 update identidade.concessao_equipe set estado='vinculada', revogada_em=null, revogada_por_usuario_id=null, motivo_revogacao_cifrado=null where usuario_id=ator;
 t:=jsonb_set(t,'{entrada,paciente_id}',to_jsonb(gen_random_uuid()::text));
 begin
  perform api.plano_composicao_privada(t);
  raise exception 'ATESTADO_ADULTERADO_ACEITO';
 exception when insufficient_privilege then null; end;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.encerrar_plano','epoca',1,'reserva_id',reserva,'comando_id',comando);
 r:=api.plano_composicao_privada(public.assinar_anamnese_fixture(e,'api.encerrar_plano',ator,sessao));
 if r#>>'{dados,estado}' is distinct from 'cancelada' then raise exception 'ENCERRAMENTO: %',r; end if;
 e:=jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.consultar_barreira_plano');
 r:=api.plano_composicao_privada(public.assinar_anamnese_fixture(e,'api.consultar_barreira_plano',ator,sessao));
 if r#>>'{dados,resultado_pendente,paciente_id}' is distinct from paciente::text then raise exception 'CONSULTA: %',r; end if;
end $$;
