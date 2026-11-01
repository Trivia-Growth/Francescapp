-- EXPERIMENTO: JWT no teste é sintético; gateway real ainda não foi provado.
-- O verificador é credencial sensível e não deve ser registrado em logs.
-- Não expor como RPC: os locks só duram até o fim da transação. A operação
-- protegida deve chamar esta função e produzir o efeito na mesma transação.
-- Não usar em operações reais antes de resolver gateway, canal e S-02.
create function saida_fixture.autorizar_prova(p_geracao bigint,p_verificador bytea)
returns boolean language plpgsql security definer set search_path=pg_catalog set row_security=on as $$
declare v_usuario uuid; v_sessao uuid;
begin
 if p_geracao is null or p_geracao<1 or p_verificador is null or octet_length(p_verificador)<>32 then return false; end if;
 begin
   v_usuario:=auth.uid();
   v_sessao:=nullif(auth.jwt() ->> 'session_id','')::uuid;
 exception when invalid_text_representation then return false; end;
 if v_usuario is null or v_sessao is null or identidade.travar_renovacao_prova_fixture(v_sessao,v_usuario) is not true then return false; end if;
 return exists(select 1 from identidade.credencial_sessao c join identidade.prova_saida_fixture p on p.session_id=c.session_id
   where c.session_id=v_sessao and c.estado='disponivel' and c.geracao=p_geracao
   and p.usuario_id=v_usuario and p.geracao=p_geracao and p.verificador=p_verificador);
end $$;
revoke all on function saida_fixture.autorizar_prova(bigint,bytea) from public,anon,authenticated,ffcm_saida_runtime;
