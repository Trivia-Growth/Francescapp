-- RASCUNHO LOCAL: sem grants para runtime; não integra Auth/Vault nem rotas.
-- Provas e verificadores são credenciais: sua segurança no canal SQL não foi
-- demonstrada. Migração de sessões existentes e revisão S-02 são obrigatórias.
alter table identidade.credencial_sessao add column tentativa_prova_fixture uuid;
alter table identidade.credencial_sessao add column verificador_anterior_fixture bytea;
alter table identidade.credencial_sessao add column verificador_pendente_fixture bytea;
alter table identidade.credencial_sessao add column envelope_pendente_fixture jsonb;
alter table identidade.credencial_sessao add column xid_liberacao_fixture xid8;
alter table identidade.credencial_sessao add column xid_persistencia_fixture xid8;
alter table identidade.credencial_sessao add column xid_inicio_fixture xid8;

-- Ordem comum: concessão, usuário, sessão, credencial, prova.
create function identidade.travar_renovacao_prova_fixture(p_s uuid,p_u uuid) returns boolean
language plpgsql security invoker set search_path=pg_catalog as $$
declare c uuid;
begin
 select concessao_id into c from identidade.sessao where session_id=p_s and usuario_id=p_u;
 if not found then return false; end if;
 perform 1 from identidade.concessao_equipe where id=c for update;
 if not found then return false; end if;
 perform 1 from public.usuario where id=p_u for update;
 if not found then return false; end if;
 perform 1 from identidade.sessao where session_id=p_s and usuario_id=p_u and concessao_id=c for update;
 if not found then return false; end if;
 perform 1 from identidade.credencial_sessao where session_id=p_s for update;
 if not found then return false; end if;
 perform 1 from identidade.prova_saida_fixture where session_id=p_s and usuario_id=p_u for update;
 if not found then return false; end if;
 return exists(select 1 from identidade.sessao s join public.usuario u on u.id=s.usuario_id
   join identidade.concessao_equipe x on x.id=s.concessao_id
   where s.session_id=p_s and s.usuario_id=p_u and s.concessao_id=c and s.revogada_em is null
     and u.ativo and x.usuario_id=p_u and x.estado='vinculada');
end $$;

create function identidade.iniciar_prova_experimento(p_s uuid,p_u uuid,p_g bigint,p_h bytea,p_t uuid) returns jsonb
language plpgsql security invoker set search_path=pg_catalog as $$
declare e jsonb;
begin
 if p_t is null or p_g is null or p_g<1 or p_h is null or octet_length(p_h)<>32
   or identidade.travar_renovacao_prova_fixture(p_s,p_u) is not true then return null; end if;
 if not exists(select 1 from identidade.prova_saida_fixture where session_id=p_s and usuario_id=p_u and geracao=p_g and verificador=p_h) then return null; end if;
 update identidade.credencial_sessao set estado='em_troca',tentativa_prova_fixture=p_t,verificador_anterior_fixture=p_h,
   verificador_pendente_fixture=null,envelope_pendente_fixture=null,xid_liberacao_fixture=null,xid_persistencia_fixture=null,
   xid_inicio_fixture=pg_current_xact_id()
   where session_id=p_s and estado='disponivel' and geracao=p_g returning envelope into e;
 return e;
end $$;

create function identidade.confirmar_inicio_prova_experimento(p_s uuid,p_u uuid,p_g bigint,p_h bytea,p_t uuid,p_e jsonb) returns boolean
language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if pg_is_in_recovery() or p_g is null or p_g<1 or p_t is null or p_h is null or octet_length(p_h)<>32 or p_e is null
   or identidade.travar_renovacao_prova_fixture(p_s,p_u) is not true then return false; end if;
 return exists(select 1 from identidade.credencial_sessao c join identidade.prova_saida_fixture p on p.session_id=c.session_id
   where c.session_id=p_s and p.usuario_id=p_u and c.estado='em_troca' and c.geracao=p_g and c.envelope=p_e
     and c.tentativa_prova_fixture=p_t and c.verificador_anterior_fixture=p_h
     and c.xid_inicio_fixture is not null and c.xid_inicio_fixture is distinct from pg_current_xact_id_if_assigned()
     and p.geracao=p_g and p.verificador=p_h);
end $$;

create function identidade.persistir_prova_experimento(p_s uuid,p_u uuid,p_g bigint,p_h bytea,p_t uuid,p_e jsonb,p_n bytea) returns boolean
language plpgsql security invoker set search_path=pg_catalog as $$
declare c identidade.credencial_sessao%rowtype;
begin
 if p_g is null or p_g<1 or p_t is null or p_h is null or octet_length(p_h)<>32 or p_n is null or octet_length(p_n)<>32
   or p_h=p_n or jsonb_typeof(p_e) is distinct from 'object'
   or identidade.travar_renovacao_prova_fixture(p_s,p_u) is not true then return false; end if;
 if not exists(select 1 from identidade.prova_saida_fixture where session_id=p_s and usuario_id=p_u and geracao=p_g and verificador=p_h) then return false; end if;
 select * into c from identidade.credencial_sessao where session_id=p_s;
 if c.estado<>'em_troca' or c.geracao<>p_g or c.tentativa_prova_fixture is distinct from p_t or c.verificador_anterior_fixture is distinct from p_h then return false; end if;
 if c.envelope_pendente_fixture is not null or c.verificador_pendente_fixture is not null then
   return c.envelope_pendente_fixture is not distinct from p_e and c.verificador_pendente_fixture is not distinct from p_n;
 end if;
 update identidade.credencial_sessao set envelope_pendente_fixture=p_e,verificador_pendente_fixture=p_n,
   xid_persistencia_fixture=pg_current_xact_id() where session_id=p_s;
 return found;
end $$;

create function identidade.confirmar_persistencia_prova_experimento(p_s uuid,p_u uuid,p_g bigint,p_h bytea,p_t uuid,p_e jsonb,p_n bytea) returns boolean
language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if pg_is_in_recovery() or p_g is null or p_g<1 or p_t is null or p_h is null or octet_length(p_h)<>32
   or p_n is null or octet_length(p_n)<>32 or p_h=p_n or p_e is null
   or identidade.travar_renovacao_prova_fixture(p_s,p_u) is not true then return false; end if;
 return exists(select 1 from identidade.credencial_sessao c join identidade.prova_saida_fixture p on p.session_id=c.session_id
   where c.session_id=p_s and p.usuario_id=p_u and c.estado='em_troca' and c.geracao=p_g
     and c.tentativa_prova_fixture=p_t and c.verificador_anterior_fixture=p_h
     and c.envelope_pendente_fixture=p_e and c.verificador_pendente_fixture=p_n
     and p.geracao=p_g and p.verificador=p_h and c.xid_persistencia_fixture is not null
     and c.xid_persistencia_fixture is distinct from pg_current_xact_id_if_assigned());
end $$;

-- TRUE só indica alteração dentro da transação; não comprova commit.
-- O chamador deve confirmar em transação independente antes de entregar prova.
create function identidade.liberar_prova_experimento(p_s uuid,p_u uuid,p_g bigint,p_h bytea,p_t uuid,p_e jsonb,p_n bytea) returns boolean
language plpgsql security invoker set search_path=pg_catalog as $$
declare c identidade.credencial_sessao%rowtype; v_linhas integer;
begin
 if p_g is null or p_g<1 or p_g>=9007199254740991 or p_t is null or p_h is null or octet_length(p_h)<>32
   or p_n is null or octet_length(p_n)<>32 or p_h=p_n or p_e is null
   or identidade.travar_renovacao_prova_fixture(p_s,p_u) is not true then return false; end if;
 select * into c from identidade.credencial_sessao where session_id=p_s;
 if c.tentativa_prova_fixture is distinct from p_t or c.verificador_anterior_fixture is distinct from p_h then return false; end if;
 if c.estado='disponivel' then
   return c.geracao=p_g+1 and c.envelope=p_e and exists(select 1 from identidade.prova_saida_fixture where session_id=p_s and usuario_id=p_u and geracao=p_g+1 and verificador=p_n);
 end if;
 if c.estado<>'em_troca' or c.geracao<>p_g or c.envelope_pendente_fixture is distinct from p_e
   or c.verificador_pendente_fixture is distinct from p_n then return false; end if;
 update identidade.prova_saida_fixture set geracao=p_g+1,verificador=p_n
   where session_id=p_s and usuario_id=p_u and geracao=p_g and verificador=p_h;
 get diagnostics v_linhas=row_count;
 if v_linhas<>1 then return false; end if;
 update identidade.credencial_sessao set estado='disponivel',geracao=p_g+1,envelope=p_e,
   envelope_pendente_fixture=null,verificador_pendente_fixture=null,xid_liberacao_fixture=pg_current_xact_id()
   where session_id=p_s and estado='em_troca';
 get diagnostics v_linhas=row_count;
 if v_linhas<>1 then raise exception using errcode='P0002',message='CREDENCIAL_NAO_LIBERADA'; end if;
 return true;
end $$;

create function identidade.confirmar_prova_experimento(p_s uuid,p_u uuid,p_g bigint,p_h bytea,p_t uuid,p_e jsonb,p_n bytea) returns boolean
language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if pg_is_in_recovery() or p_g is null or p_g<1 or p_g>=9007199254740991 or p_t is null or p_h is null or octet_length(p_h)<>32
   or p_n is null or octet_length(p_n)<>32 or p_h=p_n or p_e is null
   or identidade.travar_renovacao_prova_fixture(p_s,p_u) is not true then return false; end if;
 return exists(select 1 from identidade.credencial_sessao c join identidade.prova_saida_fixture p on p.session_id=c.session_id
   where c.session_id=p_s and p.usuario_id=p_u and c.estado='disponivel' and c.geracao=p_g+1
     and c.tentativa_prova_fixture=p_t and c.verificador_anterior_fixture=p_h and c.envelope=p_e
     and c.xid_liberacao_fixture is not null
     and c.xid_liberacao_fixture is distinct from pg_current_xact_id_if_assigned()
     and p.geracao=p_g+1 and p.verificador=p_n);
end $$;
revoke all on function identidade.travar_renovacao_prova_fixture(uuid,uuid) from public,anon,authenticated;
revoke all on function identidade.iniciar_prova_experimento(uuid,uuid,bigint,bytea,uuid) from public,anon,authenticated;
revoke all on function identidade.confirmar_inicio_prova_experimento(uuid,uuid,bigint,bytea,uuid,jsonb) from public,anon,authenticated;
revoke all on function identidade.persistir_prova_experimento(uuid,uuid,bigint,bytea,uuid,jsonb,bytea) from public,anon,authenticated;
revoke all on function identidade.confirmar_persistencia_prova_experimento(uuid,uuid,bigint,bytea,uuid,jsonb,bytea) from public,anon,authenticated;
revoke all on function identidade.liberar_prova_experimento(uuid,uuid,bigint,bytea,uuid,jsonb,bytea) from public,anon,authenticated;
revoke all on function identidade.confirmar_prova_experimento(uuid,uuid,bigint,bytea,uuid,jsonb,bytea) from public,anon,authenticated;
