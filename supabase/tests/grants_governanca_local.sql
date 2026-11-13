-- Exercita os grants de ativação que NENHUM teste alcançava.
--
-- Achado de 13/11/2026: das 25 migrations `grant_*_teste.sql`, dez nunca eram exercitadas por
-- teste algum — entre elas as da auditoria, das regras e das solicitações do titular. Uma
-- concessão que não pega passa despercebida localmente e só aparece como
-- `servico_indisponivel` em produção, que foi exatamente o que aconteceu.
--
-- O que este arquivo prova: depois do grant, `authenticated` CHAMA o wrapper; antes, não
-- chamava; e `anon` e `service_role` continuam de fora em qualquer momento. Chamar o wrapper
-- não é ler: a autorização de quem pode o quê continua dentro da função, em SQL.
\ir governanca_auditoria_lgpd_regras_local.sql

-- Estado anterior ao grant: a cadeia acima monta tudo menos a liberação.
do $$
begin
 if has_function_privilege('authenticated','api.consultar_auditoria(jsonb)','execute')
  or has_function_privilege('authenticated','api.consultar_regras_atendimento(jsonb)','execute')
  or has_function_privilege('authenticated','api.solicitacao_titular_privado(jsonb)','execute') then
  raise exception 'ACL_ANTES_DO_GRANT_INESPERADA';
 end if;
end $$;

\ir ../migrations/20261119310000_grant_consulta_auditoria_teste.sql
\ir ../migrations/20261119330000_grant_regras_atendimento_teste.sql
\ir ../migrations/20261119360000_grant_solicitacao_titular_teste.sql

do $$
declare
 alvo text;
begin
 -- Positivo: cada wrapper passa a ser chamável por `authenticated`.
 foreach alvo in array array[
   'api.consultar_auditoria(jsonb)',
   'api.consultar_regras_atendimento(jsonb)',
   'api.solicitacao_titular_privado(jsonb)'
 ] loop
  if not has_function_privilege('authenticated', alvo, 'execute') then
   raise exception 'GRANT_NAO_PEGOU: %', alvo;
  end if;
  -- Negativos: a liberação é só para sessão autenticada.
  if has_function_privilege('anon', alvo, 'execute') then
   raise exception 'ANON_ALCANCOU: %', alvo;
  end if;
  if has_function_privilege('service_role', alvo, 'execute') then
   raise exception 'SERVICE_ROLE_ALCANCOU: %', alvo;
  end if;
 end loop;

 -- A operação interna continua fora do alcance: só o wrapper é liberado, e ele é
 -- SECURITY DEFINER com dono sem login. Liberar a interna seria contornar a autorização.
 foreach alvo in array array[
   'operacao.consultar_auditoria_privado(jsonb)',
   'operacao.consultar_regras_atendimento_privado(jsonb)',
   'operacao.solicitacao_titular_operacao_privada(jsonb)'
 ] loop
  if to_regprocedure(alvo) is null then continue; end if;
  if has_function_privilege('authenticated', alvo, 'execute')
   or has_function_privilege('anon', alvo, 'execute')
   or has_function_privilege('service_role', alvo, 'execute') then
   raise exception 'OPERACAO_INTERNA_EXPOSTA: %', alvo;
  end if;
 end loop;

 raise notice 'GRANTS_GOVERNANCA_OK';
end $$;
