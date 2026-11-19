-- PREPARADO, NÃO EXECUTADO. Auditoria de recusa não exige cofre nem concede operação.
-- Chamada direta pode registrar só tentativa negada do próprio Auth; isso é permitido.
do $$
#variable_conflict use_variable
declare ator uuid:='10000000-0000-4000-8000-000000000002'; sessao uuid:='20000000-0000-4000-8000-000000000002'; acao text; req uuid; antes bigint; reservas bigint;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 select count(*) into antes from cadastro.turno; select count(*) into reservas from operacao.reserva_turno;
 foreach acao in array array['api.abrir_turno','api.encerrar_turno','api.consultar_turno','api.reservar_turno','api.encerrar_barreira_turno','api.consultar_barreira_turno','api.reconhecer_barreira_turno'] loop
  req:=gen_random_uuid();
  if api.registrar_negacao_turno(req,acao,gen_random_uuid(),gen_random_uuid()) is distinct from true then raise exception 'AUDITORIA_NEGACAO_FALHOU'; end if;
  if not exists(select 1 from auditoria.evento where request_id=req and ator_usuario_id=ator and ator_auth_id is null and resultado='negado' and auditoria.evento.acao=acao) then raise exception 'AUDITORIA_NEGACAO_ATOR_RESULTADO_INVALIDO'; end if;
 end loop;
 -- Não existe argumento para ator/resultado livre; overloading não admite identidade extra.
 begin perform api.registrar_negacao_turno(gen_random_uuid(),'api.abrir_turno',null,null,gen_random_uuid()); raise exception 'ATOR_EXTRA_ACEITO'; exception when undefined_function then null; end;
 begin perform api.registrar_negacao_turno(gen_random_uuid(),'api.operacao_inventada'); raise exception 'ACAO_FORJADA_ACEITA'; exception when insufficient_privilege then null; end;
 begin perform api.registrar_negacao_turno(null,'api.abrir_turno'); raise exception 'REQUEST_AUSENTE_ACEITO'; exception when insufficient_privilege then null; end;
 -- Sub de outra conta com a sessão original não consegue atribuir autoria à vítima.
 perform set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-4000-8000-000000000001','session_id',sessao)::text,true);
 begin perform api.registrar_negacao_turno(gen_random_uuid(),'api.abrir_turno'); raise exception 'ATOR_FORJADO_ACEITO'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao)::text,true);
 req:=gen_random_uuid(); perform set_config('fixture.turno_suprimir','sim',true);
 begin perform api.registrar_negacao_turno(req,'api.abrir_turno'); raise exception 'NEGACAO_SEM_AUDITORIA_ACEITA'; exception when no_data_found then if sqlerrm<>'AUDITORIA_NAO_INSERIDA' then raise; end if; end;
 perform set_config('fixture.turno_suprimir','nao',true);
 if exists(select 1 from auditoria.evento where request_id=req) then raise exception 'NEGACAO_ROLLBACK_FALHOU'; end if;
 if (select count(*) from cadastro.turno)<>antes or (select count(*) from operacao.reserva_turno)<>reservas then raise exception 'AUDITORIA_NEGACAO_MUTOU_DOMINIO'; end if;
 -- Nenhuma identidade anônima pode usar a primitiva, mesmo chamador privilegiado de fixture.
 perform set_config('request.jwt.claims','{}',true);
 begin perform api.registrar_negacao_turno(gen_random_uuid(),'api.abrir_turno'); raise exception 'ANONIMO_ACEITO'; exception when insufficient_privilege then null; end;
 -- Conta Auth sem public.usuario pode auditar a própria negativa sem inventar admissão.
 ator:='10000000-0000-4000-8000-000000000099'; sessao:='20000000-0000-4000-8000-000000000099';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ator,'session_id',sessao)::text,true); req:=gen_random_uuid();
 if api.registrar_negacao_turno(req,'api.abrir_turno') is distinct from true then raise exception 'NEGACAO_AUTH_NAO_ADMITIDO_RETORNO_FALHOU';end if;
 if not exists(select 1 from auditoria.evento where request_id=req and ator_auth_id=ator and ator_usuario_id is null and resultado='negado') or exists(select 1 from public.usuario where id=ator) then raise exception 'NEGACAO_AUTH_NAO_ADMITIDO_FALHOU'; end if;
 update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=sessao;
 begin perform api.registrar_negacao_turno(gen_random_uuid(),'api.abrir_turno'); raise exception 'SESSAO_AUTH_EXPIRADA_ACEITA'; exception when insufficient_privilege then null; end;
 update auth.sessions set not_after=null where id=sessao;
end $$;
