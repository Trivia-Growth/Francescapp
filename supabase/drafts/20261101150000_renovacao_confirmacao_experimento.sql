-- EXPERIMENTO LOCAL, não migrar. Sem integração Auth, Vault, grants ou sessão real.
-- Autoridade compactada aqui em UMA linha; produção exige locks de concessão,
-- usuário e sessão nessa ordem e releitura, com revogações compatíveis.
-- Após retorno incerto, consultar o primário sob lock; indeterminada NÃO significa
-- rollback: operação ainda em trânsito pode confirmar. Nunca entregar token assim.
create function experimento_renovacao.bloquear(p_s uuid,p_u uuid) returns boolean
language plpgsql security invoker set search_path=pg_catalog as $$
declare v_ativa boolean;
begin
 select s.ativa into v_ativa from experimento_renovacao.sessao s where s.id=p_s and s.usuario_id=p_u for update;
 return coalesce(v_ativa,false);
end $$;

create function experimento_renovacao.iniciar(p_s uuid,p_u uuid,p_t uuid) returns bigint
language plpgsql security invoker set search_path=pg_catalog as $$
declare v_geracao bigint;
begin
 if p_t is null or experimento_renovacao.bloquear(p_s,p_u) is not true then return null; end if;
 update experimento_renovacao.credencial c set estado='em_troca',geracao=c.geracao+1,tentativa=p_t
 where c.sessao_id=p_s and c.estado='disponivel' returning c.geracao into v_geracao;
 return v_geracao;
end $$;

create function experimento_renovacao.persistir(p_s uuid,p_u uuid,p_t uuid,p_g bigint,p_envelope jsonb) returns boolean
language plpgsql security invoker set search_path=pg_catalog as $$
declare c experimento_renovacao.credencial%rowtype;
begin
 if p_t is null or p_g is null or jsonb_typeof(p_envelope) is distinct from 'object'
    or experimento_renovacao.bloquear(p_s,p_u) is not true then return false; end if;
 select * into c from experimento_renovacao.credencial x where x.sessao_id=p_s for update;
 if not found or c.tentativa is distinct from p_t or c.geracao is distinct from p_g then return false; end if;
 if c.estado in ('persistida','disponivel') then return c.envelope=p_envelope; end if;
 if c.estado <> 'em_troca' then return false; end if;
 update experimento_renovacao.credencial set estado='persistida',envelope=p_envelope where sessao_id=p_s and estado='em_troca';
 return found;
end $$;

create function experimento_renovacao.liberar(p_s uuid,p_u uuid,p_t uuid,p_g bigint,p_envelope jsonb) returns boolean
language plpgsql security invoker set search_path=pg_catalog as $$
declare c experimento_renovacao.credencial%rowtype;
begin
 if p_t is null or p_g is null or p_envelope is null or experimento_renovacao.bloquear(p_s,p_u) is not true then return false; end if;
 select * into c from experimento_renovacao.credencial x where x.sessao_id=p_s for update;
 if not found or c.tentativa is distinct from p_t or c.geracao is distinct from p_g
    or c.envelope is distinct from p_envelope then return false; end if;
 if c.estado='disponivel' then return true; end if;
 if c.estado <> 'persistida' then return false; end if;
 update experimento_renovacao.credencial set estado='disponivel' where sessao_id=p_s and estado='persistida';
 return found;
end $$;

create function experimento_renovacao.confirmar(p_s uuid,p_u uuid,p_t uuid,p_g bigint,p_envelope jsonb) returns text
language plpgsql security invoker set search_path=pg_catalog as $$
declare c experimento_renovacao.credencial%rowtype;
begin
 if pg_is_in_recovery() or p_t is null or p_g is null or p_envelope is null
    or experimento_renovacao.bloquear(p_s,p_u) is not true then return 'indeterminada'; end if;
 select * into c from experimento_renovacao.credencial x where x.sessao_id=p_s for update;
 if not found or c.tentativa is distinct from p_t or c.geracao is distinct from p_g
    or c.envelope is distinct from p_envelope then return 'indeterminada'; end if;
 if c.estado='persistida' then return 'persistida'; end if;
 if c.estado='disponivel' then return 'liberada'; end if;
 return 'indeterminada';
end $$;
revoke all on all functions in schema experimento_renovacao from public;
