\set ON_ERROR_STOP on
\ir cadastro_conta_tecnica_local.sql
\ir ../migrations/20261110150000_cadastro_rpc_nativa.sql
-- Grants efetivos e fronteiras: apenas wrappers são executáveis pelo JWT.
do $$ begin
 if not has_function_privilege('authenticated','api.criar_paciente(jsonb)','execute')
 or not has_function_privilege('authenticated','api.cadastro_composicao(jsonb)','execute')
 or has_function_privilege('anon','api.criar_paciente(jsonb)','execute')
 or has_function_privilege('anon','api.cadastro_composicao(jsonb)','execute')
 or has_function_privilege('service_role','api.criar_paciente(jsonb)','execute')
 or has_function_privilege('service_role','api.cadastro_composicao(jsonb)','execute')
 or has_function_privilege('authenticated','operacao.criar_paciente_privado(jsonb)','execute')
 or has_function_privilege('authenticated','operacao.cadastro_composicao_privada(jsonb)','execute')
 or has_table_privilege('authenticated','cadastro.paciente','select') then raise exception 'GRANT_INDEVIDO'; end if;
end $$;
update identidade.sessao set encerrada_em=null where usuario_id=auth.uid();
select set_config('teste.transporte',pg_temp.assinar(jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.consultar_barreira_cadastro'),'api.consultar_barreira_cadastro',auth.uid(),(auth.jwt()->>'session_id')::uuid)::text,false);
set role authenticated;
do $$ begin
 if api.cadastro_composicao(current_setting('teste.transporte')::jsonb)->>'ok' is distinct from 'true' then raise exception 'CONSULTA_NEGADA'; end if;
end $$;
reset role;
update identidade.sessao set encerrada_em=clock_timestamp() where usuario_id=auth.uid();
set role authenticated;
do $$ begin
 if api.cadastro_composicao(current_setting('teste.transporte')::jsonb)#>>'{erro,codigo}' is distinct from 'sem_permissao' then raise exception 'REVOGACAO_IGNORADA'; end if;
end $$;
reset role;

-- Novo ator lógico e reserva: a criação deve ocorrer sob o papel exposto.
update identidade.sessao set encerrada_em=null where usuario_id=auth.uid();
do $$
declare reserva uuid:=gen_random_uuid(); paciente uuid:=gen_random_uuid(); e jsonb; t jsonb; epoca bigint;
begin
 select b.epoca into epoca from operacao.barreira_cadastro b where b.ator_usuario_id=auth.uid();
 -- A fixture anterior deixou uma reserva confirmada; encerra e reconhece seu recibo.
 declare b operacao.barreira_cadastro; recibo uuid:=gen_random_uuid(); begin
  select * into b from operacao.barreira_cadastro where ator_usuario_id=auth.uid();
  t:=pg_temp.assinar(jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.encerrar_cadastro','epoca',b.epoca,'reserva_id',b.reserva_atual,'comando_id',recibo),'api.encerrar_cadastro',auth.uid(),(auth.jwt()->>'session_id')::uuid);
  perform api.cadastro_composicao(t);
  t:=pg_temp.assinar(jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.reconhecer_barreira_cadastro','comando_id',recibo),'api.reconhecer_barreira_cadastro',auth.uid(),(auth.jwt()->>'session_id')::uuid);
  perform api.cadastro_composicao(t);
 end;
 select b.epoca into epoca from operacao.barreira_cadastro b where b.ator_usuario_id=auth.uid();
 t:=pg_temp.assinar(jsonb_build_object('request_id',gen_random_uuid(),'operacao','api.reservar_cadastro','epoca',epoca,'reserva_id',reserva),'api.reservar_cadastro',auth.uid(),(auth.jwt()->>'session_id')::uuid);
 perform set_config('teste.reserva',t::text,false);
 e:=jsonb_build_object('request_id',gen_random_uuid(),'paciente_id',paciente,'reserva_id',reserva,'geracao_reserva',epoca,'auditoria_id',gen_random_uuid(),'chave_idempotencia','rpc-autenticada','digest_idempotencia',repeat('a',43),
  'nome',jsonb_build_object('formato',1,'key_id','teste','nonce',repeat('a',16),'ciphertext','YQ','tag',repeat('a',22)),
  'aad',jsonb_build_object('nome',jsonb_build_object('tabela','cadastro.paciente','registro_id',paciente::text,'campo','nome','formato',1)));
 t:=pg_temp.assinar(e,'api.criar_paciente',auth.uid(),(auth.jwt()->>'session_id')::uuid);
 perform set_config('teste.criacao',t::text,false);
 perform set_config('teste.paciente',paciente::text,false);
end $$;
set role authenticated;
do $$ declare t jsonb:=current_setting('teste.criacao')::jsonb; begin
 if api.cadastro_composicao(current_setting('teste.reserva')::jsonb)#>>'{dados,estado}' is distinct from 'aberta' then raise exception 'RESERVA_AUTENTICADA'; end if;
 begin
  perform api.criar_paciente(jsonb_set(t,'{entrada,nome,ciphertext}','"Yg"'::jsonb));
  raise exception 'ADULTERACAO_ACEITA';
 exception when insufficient_privilege then null; end;
 if api.criar_paciente(t)->>'ok' is distinct from 'true' then raise exception 'CRIACAO_AUTENTICADA'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from cadastro.paciente where id=current_setting('teste.paciente')::uuid) <> 1 then raise exception 'PERSISTENCIA_INCORRETA'; end if;
end $$;
