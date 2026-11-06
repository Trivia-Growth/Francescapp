-- Experimento isolado: não representa Auth, RLS, grants ou wrappers reais.
\set ON_ERROR_STOP on
create temporary table efeito_fixture (id integer primary key);
create temporary table auditoria_fixture (request_id uuid primary key, resultado text not null check (resultado = 'negado'));

create function pg_temp.operacao_fixture(p_caso text, p_request_id uuid)
returns text language plpgsql as $$
begin
  begin
    insert into efeito_fixture values (1);
    if p_caso = 'expirada' or p_caso = 'falha_auditoria' then
      raise exception using errcode = 'PZ001', message = 'EXPIRACAO_INTERNA';
    elsif p_caso = 'outro_erro' then
      raise exception using errcode = '42501', message = 'SEM_PERMISSAO';
    end if;
    return 'permitido';
  exception when sqlstate 'PZ001' then
    -- O bloco interno já foi revertido antes de gravar a negativa.
    if p_caso = 'falha_auditoria' then
      raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA';
    end if;
    insert into auditoria_fixture values (p_request_id, 'negado');
    if not found then raise exception using errcode = 'P0002', message = 'AUDITORIA_NAO_INSERIDA'; end if;
    return 'negado';
  end;
end $$;

do $$
declare resposta text; negada boolean := false; falhou boolean := false;
begin
  resposta := pg_temp.operacao_fixture('expirada', '10000000-0000-4000-8000-000000000001');
  if resposta <> 'negado' or exists(select 1 from efeito_fixture)
     or (select count(*) from auditoria_fixture where request_id = '10000000-0000-4000-8000-000000000001' and resultado = 'negado') <> 1 then
    raise exception 'EXPIRACAO_NAO_ATOMICA';
  end if;
  begin
    perform pg_temp.operacao_fixture('outro_erro', '10000000-0000-4000-8000-000000000002');
  exception when insufficient_privilege then negada := true;
  end;
  if not negada or exists(select 1 from efeito_fixture) or (select count(*) from auditoria_fixture) <> 1 then
    raise exception 'ERRO_INDEVIDAMENTE_CAPTURADO';
  end if;
  begin
    perform pg_temp.operacao_fixture('falha_auditoria', '10000000-0000-4000-8000-000000000003');
  exception when no_data_found then falhou := true;
  end;
  if not falhou or exists(select 1 from efeito_fixture) or (select count(*) from auditoria_fixture) <> 1 then
    raise exception 'FALHA_AUDITORIA_ACEITA';
  end if;
  resposta := pg_temp.operacao_fixture('normal', '10000000-0000-4000-8000-000000000004');
  if resposta <> 'permitido' or (select count(*) from efeito_fixture) <> 1 or (select count(*) from auditoria_fixture) <> 1 then
    raise exception 'OPERACAO_NORMAL_ALTERADA';
  end if;
end $$;
