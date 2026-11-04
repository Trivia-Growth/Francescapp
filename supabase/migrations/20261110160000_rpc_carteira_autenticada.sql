-- Somente a RPC auditada recebe acesso pelo JWT do solicitante. O atestado,
-- a sessão e os vínculos continuam obrigatórios na função privada.
grant usage on schema api to authenticated;
grant execute on function api.listar_pacientes(jsonb) to authenticated;
