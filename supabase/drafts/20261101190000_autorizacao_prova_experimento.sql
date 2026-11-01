-- EXPERIMENTO ISOLADO: não instala RLS nem protege RPCs reais.
-- Identidade depende de gateway JWT verificado; fixtures não provam isso.
-- Prova bruta em SQL pode ser registrada em logs/telemetria. NÃO integrar.
-- Sem Vault, transação de renovação real ou garantia de tempo constante.
create function experimento_atestado.sessao_com_prova_fixture(p_geracao bigint,p_prova bytea)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v_usuario uuid; v_sessao uuid; v_concessao uuid;
begin
 if p_geracao is null or p_geracao < 1 or p_prova is null or octet_length(p_prova)<>32 then return false; end if;
 begin
   v_usuario:=auth.uid();
   v_sessao:=(auth.jwt() ->> 'session_id')::uuid;
 exception when invalid_text_representation then return false; end;
 if v_usuario is null or v_sessao is null then return false; end if;
 select s.concessao_id into v_concessao from identidade.sessao s where s.session_id=v_sessao and s.usuario_id=v_usuario;
 if v_concessao is null then return false; end if;
 perform 1 from identidade.concessao_equipe c where c.id=v_concessao for update;
 if not found then return false; end if;
 perform 1 from public.usuario u where u.id=v_usuario for update;
 if not found then return false; end if;
 perform 1 from identidade.sessao s where s.session_id=v_sessao for update;
 if not found then return false; end if;
 perform 1 from identidade.prova_fixture p where p.session_id=v_sessao for update;
 if not found then return false; end if;
 return identidade.sessao_atual_valida() is true and exists (
   select 1 from identidade.sessao s join identidade.concessao_equipe c on c.id=s.concessao_id
   join public.usuario u on u.id=s.usuario_id join identidade.prova_fixture p on p.session_id=s.session_id
   where s.session_id=v_sessao and s.usuario_id=v_usuario and s.revogada_em is null
     and s.concessao_id=v_concessao and c.estado='vinculada' and c.usuario_id=v_usuario and u.ativo
     and p.usuario_id=v_usuario and p.geracao=p_geracao and p.verificador=extensions.digest(p_prova,'sha256')
 );
end $$;
revoke all on function experimento_atestado.sessao_com_prova_fixture(bigint,bytea) from public;
