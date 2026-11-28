-- FR-010, "pessoa sem autorização vigente para o caso, inclusive após revogação". Decidido
-- pelo dono em 27/11/2026 (tasks.md 7.3, opção (a)): profissional exige acesso vigente ao
-- caso em `cadastro.acesso_paciente`; administrador alcança todos os casos (decisão de
-- 24/11/2026, 20261124200000/20261128240000).
--
-- Uma policy RESTRITIVA em `cadastro.paciente` para o owner da fatia soma-se (AND) à policy
-- permissiva `audio_transcricao_paciente`, sem reescrevê-la. Todas as operações do áudio
-- passam por ela: a pré-autorização (`api.autorizar_transcricao_audio`), a operação privada
-- (`perform 1 from cadastro.paciente`) e as policies de `cadastro.audio_transcricao`, que
-- exigem o paciente visível. Logo o autor também deixa de ouvir, revisar ou excluir o próprio
-- áudio quando perde o caso; o expurgo de 30 dias continua cobrindo o áudio abandonado.
-- Rollback: drop policy audio_transcricao_paciente_caso on cadastro.paciente;
--           drop policy audio_transcricao_acesso_caso on cadastro.acesso_paciente;
--           revoke select (usuario_id,paciente_id,revogada_em) on cadastro.acesso_paciente from ffcmapp_audio_transcricao_owner;
begin;
grant select (usuario_id, paciente_id, revogada_em) on cadastro.acesso_paciente to ffcmapp_audio_transcricao_owner;
create policy audio_transcricao_acesso_caso on cadastro.acesso_paciente for select to ffcmapp_audio_transcricao_owner
  using (usuario_id = (select auth_privado.uid()));
create policy audio_transcricao_paciente_caso on cadastro.paciente as restrictive for select to ffcmapp_audio_transcricao_owner
  using (
    exists (
      select 1 from public.usuario u
      where u.id = (select auth_privado.uid()) and u.ativo and u.perfil = 'administrador'
    )
    or exists (
      select 1 from cadastro.acesso_paciente ap
      where ap.usuario_id = (select auth_privado.uid()) and ap.paciente_id = paciente.id and ap.revogada_em is null
    )
  );
commit;
