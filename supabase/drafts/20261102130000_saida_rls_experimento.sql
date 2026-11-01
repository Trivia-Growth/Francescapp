-- SOMENTE FIXTURE: papéis e tabela de prova não são identidade de runtime real.
-- O owner é NOLOGIN, não é membro do runtime e só expõe a função revisada.
-- As políticas permitem que a função consulte e bloqueie linhas; o acesso
-- direto permanece vedado ao runtime. Não aplicar fora do banco de teste.
create policy saida_owner_usuario_select on public.usuario for select to ffcm_saida_owner using (true);
create policy saida_owner_usuario_lock on public.usuario for update to ffcm_saida_owner using (true) with check (true);
create policy saida_owner_usuario_sem_escrita on public.usuario as restrictive for update to ffcm_saida_owner using (true) with check (false);
create policy saida_owner_concessao_select on identidade.concessao_equipe for select to ffcm_saida_owner using (true);
create policy saida_owner_concessao_lock on identidade.concessao_equipe for update to ffcm_saida_owner using (true) with check (true);
create policy saida_owner_concessao_sem_escrita on identidade.concessao_equipe as restrictive for update to ffcm_saida_owner using (true) with check (false);
create policy saida_owner_sessao_select on identidade.sessao for select to ffcm_saida_owner using (true);
create policy saida_owner_sessao_update on identidade.sessao for update to ffcm_saida_owner
  using (true) with check (true);
create policy saida_owner_sessao_so_revogar on identidade.sessao as restrictive for update to ffcm_saida_owner
  using (true) with check (revogada_em is not null and revogada_por_usuario_id=usuario_id);
create policy saida_owner_prova_select on identidade.prova_saida_fixture for select to ffcm_saida_owner using (true);
create policy saida_owner_prova_lock on identidade.prova_saida_fixture for update to ffcm_saida_owner using (true) with check (true);
create policy saida_owner_prova_sem_escrita on identidade.prova_saida_fixture as restrictive for update to ffcm_saida_owner using (true) with check (false);
create policy saida_owner_auditoria_insert on auditoria.evento for insert to ffcm_saida_owner with check (true);
