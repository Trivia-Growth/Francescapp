-- NÃO PROMOVER: depende de identidade técnica restrita, transporte seguro e S-02.
-- O verificador é credencial; argumentos e parâmetros SQL podem vazar em logs.
-- O chamador confiável deve derivar usuário e sessão do cookie autenticado;
-- jamais aceitar identidade declarada diretamente pelo navegador.
create function saida_fixture.revogar(
 p_sessao uuid, p_usuario uuid, p_geracao bigint, p_verificador bytea,
 p_motivo jsonb, p_request uuid
) returns boolean
language plpgsql security definer set search_path=pg_catalog set row_security=on as $$
declare v_concessao uuid; v_revogada timestamptz; v_linhas integer;
begin
 if p_sessao is null or p_usuario is null or p_geracao is null or p_geracao<1
    or p_verificador is null or octet_length(p_verificador)<>32 or p_request is null then return false; end if;
 select s.concessao_id into v_concessao from identidade.sessao s
   where s.session_id=p_sessao and s.usuario_id=p_usuario;
 if not found then return false; end if;
 perform 1 from identidade.concessao_equipe c where c.id=v_concessao for update;
 if not found then return false; end if;
 perform 1 from public.usuario u where u.id=p_usuario for update;
 if not found then return false; end if;
 select s.revogada_em into v_revogada from identidade.sessao s
   where s.session_id=p_sessao and s.usuario_id=p_usuario and s.concessao_id=v_concessao for update;
 if not found then return false; end if;
 perform 1 from identidade.prova_saida_fixture p where p.session_id=p_sessao and p.usuario_id=p_usuario
   and p.geracao=p_geracao and p.verificador=p_verificador for update;
 if not found then return false; end if;
 if v_revogada is not null then return true; end if;
 update identidade.sessao set revogada_em=clock_timestamp(),revogada_por_usuario_id=p_usuario,
   motivo_revogacao_cifrado=p_motivo where session_id=p_sessao and revogada_em is null;
 get diagnostics v_linhas=row_count;
 if v_linhas<>1 then raise exception using errcode='P0002',message='REVOGACAO_NAO_REGISTRADA'; end if;
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values (gen_random_uuid(),p_usuario,'sessao.sair','sessao',p_sessao,'permitido',p_request);
 get diagnostics v_linhas=row_count;
 if v_linhas<>1 then raise exception using errcode='P0002',message='AUDITORIA_NAO_REGISTRADA'; end if;
 return true;
end $$;
revoke all on function saida_fixture.revogar(uuid,uuid,bigint,bytea,jsonb,uuid) from public, anon, authenticated;
