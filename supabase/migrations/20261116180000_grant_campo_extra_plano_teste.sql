-- Grant de TESTE LOCAL apenas: exercita a camada HTTP (vitest + PostgreSQL descartável)
-- como o papel `authenticated` real exerceria via PostgREST. NUNCA aplicar remotamente
-- sem antes decidir ativar a fatia em produção/teste real (S-02 e revisão independente).
do $$ begin
  if has_function_privilege('authenticated', 'api.campo_extra_plano_privado(jsonb)', 'EXECUTE') then
    raise exception 'ACL_INICIAL_INESPERADA';
  end if;
end $$;
grant execute on function api.campo_extra_plano_privado(jsonb) to authenticated;
