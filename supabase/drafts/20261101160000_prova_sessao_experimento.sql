-- EXPERIMENTO isolado; NÃO integra política SQL nem rotas reais.
-- Prova em argumentos SQL é segredo e pode aparecer em logs/telemetria: não usar
-- no runtime antes de definir canal, privilégios e configuração de logs seguros.
-- Não há Vault, JWT nem modelo real de concessão; esta tabela simula autoridade.
create function experimento_prova.autorizar(p_s uuid,p_u uuid,p_g bigint,p_prova bytea) returns boolean
language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if p_prova is null or octet_length(p_prova) <> 32 or p_g is null then return false; end if;
 perform 1 from experimento_prova.sessao s where s.id=p_s and s.usuario=p_u and s.ativa
   and s.geracao=p_g and s.estado='disponivel' and s.prova_hash=extensions.digest(p_prova,'sha256') for update;
 return found;
end $$;

create function experimento_prova.iniciar(p_s uuid,p_u uuid,p_g bigint,p_prova bytea,p_t uuid) returns boolean
language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if p_t is null or experimento_prova.autorizar(p_s,p_u,p_g,p_prova) is not true then return false; end if;
 update experimento_prova.sessao set estado='em_troca',tentativa=p_t where id=p_s and estado='disponivel';
 if not found then return false; end if;
 insert into experimento_prova.tentativa (sessao,id,geracao,estado) values (p_s,p_t,p_g,'em_troca');
 if not found then raise exception using errcode='P0002',message='TENTATIVA_NAO_REGISTRADA'; end if;
 return true;
end $$;

create function experimento_prova.liberar(p_s uuid,p_u uuid,p_g bigint,p_prova bytea,p_t uuid,p_novo_hash bytea,p_envelope jsonb) returns boolean
language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if p_prova is null or octet_length(p_prova)<>32 or p_novo_hash is null or octet_length(p_novo_hash)<>32 or p_t is null
    or jsonb_typeof(p_envelope) is distinct from 'object' then return false; end if;
 update experimento_prova.sessao s set estado='disponivel',geracao=s.geracao+1,prova_hash=p_novo_hash,envelope=p_envelope
 where s.id=p_s and s.usuario=p_u and s.ativa and s.geracao=p_g and s.estado='em_troca'
   and s.tentativa=p_t and s.prova_hash=extensions.digest(p_prova,'sha256') and s.prova_hash<>p_novo_hash;
 if not found then return false; end if;
 update experimento_prova.tentativa set estado='concluida' where sessao=p_s and id=p_t and geracao=p_g and estado='em_troca';
 if not found then raise exception using errcode='P0002',message='TENTATIVA_NAO_CONCLUIDA'; end if;
 return true;
end $$;
revoke all on all functions in schema experimento_prova from public;
