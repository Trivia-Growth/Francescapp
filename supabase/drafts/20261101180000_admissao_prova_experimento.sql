-- EXPERIMENTO: não aplicar remotamente. Nenhuma permissão de runtime concedida.
-- Verificador é credencial sensível; parâmetros podem aparecer em logs SQL.
-- Canal, logging, identidade Auth, Vault e compatibilidade com sessão existentes
-- requerem decisão e revisão S-02 antes de integração.
alter table identidade.sessao add constraint sessao_par_fixture_uq unique(session_id,usuario_id);
create table identidade.prova_sessao_fixture (
 session_id uuid primary key,
 usuario_id uuid not null references public.usuario(id),
 geracao bigint not null check (geracao>0), verificador bytea not null check (octet_length(verificador)=32),
 foreign key(session_id,usuario_id) references identidade.sessao(session_id,usuario_id) on delete restrict
);
alter table identidade.prova_sessao_fixture enable row level security;
revoke all on identidade.prova_sessao_fixture from public, anon, authenticated;
create function identidade.admitir_tecnica_com_prova_fixture(p_entrada jsonb,p_verificador bytea) returns jsonb
language plpgsql security invoker set search_path=pg_catalog as $$
declare v_sessao uuid; v_usuario uuid; v_request uuid; v_resultado jsonb; v_linhas integer;
begin
 if p_verificador is null or octet_length(p_verificador)<>32 then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 begin
   v_sessao := (p_entrada #>> '{identidade,session_id}')::uuid;
   v_usuario := (p_entrada #>> '{identidade,usuario_id}')::uuid;
   v_request := (p_entrada ->> 'request_id')::uuid;
 exception when invalid_text_representation then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end;
 v_resultado := identidade.admitir_sessao_tecnica(p_entrada);
 if v_resultado ->> 'ok' is distinct from 'true' then return v_resultado; end if;
 if not exists (
   select 1 from identidade.sessao s join identidade.credencial_sessao c using(session_id)
   where s.session_id=v_sessao and s.usuario_id=v_usuario and s.revogada_em is null
     and c.estado='disponivel' and c.envelope=p_entrada -> 'credencial_refresh') then
   raise exception using errcode='P0002',message='ADMISSAO_INCOMPLETA';
 end if;
 insert into identidade.prova_sessao_fixture(session_id,usuario_id,geracao,verificador)
 values (v_sessao,v_usuario,1,p_verificador);
 get diagnostics v_linhas=row_count;
 if v_linhas<>1 then raise exception using errcode='P0002',message='PROVA_NAO_REGISTRADA'; end if;
 return v_resultado;
end $$;
revoke all on function identidade.admitir_tecnica_com_prova_fixture(jsonb,bytea) from public, anon, authenticated;
