-- RPCs autenticadas, com autorização, atestado e auditoria no banco.
-- A aplicação e as rotas continuam desativadas até revisão e provas de ativação.
grant execute on function api.criar_paciente(jsonb), api.cadastro_composicao(jsonb) to authenticated;
