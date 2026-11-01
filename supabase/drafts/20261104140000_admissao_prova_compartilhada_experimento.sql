-- RASCUNHO: não aplicar em runtime. O verificador é sensível e o executor,
-- canal, logs, identidade, Vault e política de sessão órfã exigem S-02.
-- Depende exclusivamente da tabela experimental usada por renovação/saída.
create function identidade.admitir_tecnica_com_prova(p_entrada jsonb,p_verificador bytea)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare v_usuario uuid; v_sessao uuid; v_resultado jsonb; v_linhas integer;
begin
 if p_verificador is null or octet_length(p_verificador)<>32 then
  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 begin
  v_usuario:=(p_entrada#>>'{identidade,usuario_id}')::uuid;
  v_sessao:=(p_entrada#>>'{identidade,session_id}')::uuid;
 exception when invalid_text_representation then
  raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end;
 v_resultado:=identidade.admitir_sessao_tecnica(p_entrada);
 if v_resultado->>'ok' is distinct from 'true' then return v_resultado; end if;
 if not exists(select 1 from identidade.sessao s join identidade.credencial_sessao c using(session_id)
   where s.session_id=v_sessao and s.usuario_id=v_usuario and s.revogada_em is null
     and c.estado='disponivel' and c.envelope=p_entrada->'credencial_refresh') then
  raise exception using errcode='P0002',message='ADMISSAO_INCOMPLETA';
 end if;
 -- A credencial antiga começa em zero; a prova compartilhada começa em um.
 update identidade.credencial_sessao set geracao=1
 where session_id=v_sessao and estado='disponivel' and geracao=0;
 get diagnostics v_linhas=row_count;
 if v_linhas<>1 then raise exception using errcode='P0002',message='GERACAO_NAO_INICIALIZADA'; end if;
 insert into identidade.prova_saida_fixture(session_id,usuario_id,geracao,verificador)
 values(v_sessao,v_usuario,1,p_verificador);
 get diagnostics v_linhas=row_count;
 if v_linhas<>1 then raise exception using errcode='P0002',message='PROVA_NAO_REGISTRADA'; end if;
 return v_resultado;
end $$;
revoke all on function identidade.admitir_tecnica_com_prova(jsonb,bytea) from public,anon,authenticated;
