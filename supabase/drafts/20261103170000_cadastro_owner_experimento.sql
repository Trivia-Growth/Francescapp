-- SOMENTE FIXTURE: políticas amplas para owner interno exigem revisão S-02.
-- Não concede execução ao runtime, não comprova gateway ou geração confiável.
create role ffcm_cadastro_owner_local nologin nosuperuser nobypassrls;
grant usage on schema auth,public,identidade,cadastro,operacao,auditoria,saida_fixture,experimento_atestado,reserva_fixture to ffcm_cadastro_owner_local;
grant execute on function saida_fixture.autorizar_prova(bigint,bytea),
 reserva_fixture.capacidade_vigente_fixture(bigint,bigint,bytea),
 experimento_atestado.verificar_criar_paciente(text,text,jsonb,jsonb,text),
 experimento_atestado.verificar_com_chave_interna(text,text,jsonb,jsonb,text),
 experimento_atestado.auditar_negacao_confiavel(jsonb),
 experimento_atestado.registrar_negacao_fixture(uuid,uuid,uuid,uuid),
 experimento_atestado.projetar_paciente_fixture(uuid) to ffcm_cadastro_owner_local;
grant select(id,perfil,ativo), update(id) on public.usuario to ffcm_cadastro_owner_local;
grant select(session_id,usuario_id,concessao_id,revogada_em), update(session_id) on identidade.sessao to ffcm_cadastro_owner_local;
grant select(id,usuario_id,estado), update(id) on identidade.concessao_equipe to ffcm_cadastro_owner_local;
grant select(id,geracao), update(id) on reserva_fixture.ator to ffcm_cadastro_owner_local;
grant select(session_id,usuario_id,geracao) on reserva_fixture.capacidade_fixture to ffcm_cadastro_owner_local;
grant select, update(estado,chave_paciente,digest_paciente,paciente_resultado) on reserva_fixture.reserva to ffcm_cadastro_owner_local;
grant insert(reserva_id) on reserva_fixture.efeito to ffcm_cadastro_owner_local;
grant select(id,nome_cifrado,nome_preferencia_cifrado,data_nascimento_cifrada,versao),
 insert(id,nome_cifrado,nome_preferencia_cifrado,data_nascimento_cifrada,criado_por_usuario_id) on cadastro.paciente to ffcm_cadastro_owner_local;
grant select(id,paciente_id,tipo,valor_cifrado,versao,criado_em) on cadastro.contato_paciente to ffcm_cadastro_owner_local;
grant select, insert(id,ator_usuario_id,operacao,chave_idempotencia,digest_entrada,estado,resultado_id,resultado_versao),
 update(estado) on operacao.requisicao to ffcm_cadastro_owner_local;
grant select(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id),
 insert(id,operador_restrito,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id) on auditoria.evento to ffcm_cadastro_owner_local;
do $$ declare t regclass; begin
 foreach t in array array['public.usuario'::regclass,'identidade.sessao'::regclass,'identidade.concessao_equipe'::regclass,
  'reserva_fixture.ator'::regclass,'reserva_fixture.capacidade_fixture'::regclass,'reserva_fixture.reserva'::regclass,
  'reserva_fixture.efeito'::regclass,'cadastro.paciente'::regclass,'cadastro.contato_paciente'::regclass,
  'operacao.requisicao'::regclass,'auditoria.evento'::regclass] loop
  execute format('alter table %s enable row level security',t);
  execute format('create policy cadastro_local on %s to ffcm_cadastro_owner_local using (true) with check (true)',t);
 end loop;
 foreach t in array array['public.usuario'::regclass,'identidade.sessao'::regclass,'identidade.concessao_equipe'::regclass,'reserva_fixture.ator'::regclass] loop
  execute format('create policy cadastro_lock_sem_alterar_local on %s as restrictive for update to ffcm_cadastro_owner_local using (true) with check (false)',t);
 end loop;
end $$;
grant create on schema experimento_atestado,reserva_fixture to ffcm_cadastro_owner_local;
alter function experimento_atestado.criar_paciente(jsonb) owner to ffcm_cadastro_owner_local;
alter function reserva_fixture.criar_paciente_reservado_fixture(jsonb,bigint,bytea) owner to ffcm_cadastro_owner_local;
alter function reserva_fixture.criar_paciente_reservado_fixture(jsonb,bigint,bytea) security definer;
revoke create on schema experimento_atestado,reserva_fixture from ffcm_cadastro_owner_local;
