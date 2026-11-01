-- EXPERIMENTO: não instalar em produção. JWT/Vault/runtime são simulados.
-- Cursor UUID é decisão técnica somente do teste, ainda sem contrato operacional.
-- request_id deve ser gerado no servidor; não é identidade nem autorização.
-- NÃO é snapshot completo: transação com criada_em anterior pode confirmar após cursor.
-- Lista vazia, ou ausência em uma página, nunca comprova falha de cadastro.
create function experimento_atestado.listar_reconciliacao(p_transporte jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare
 v_ator uuid; v_sessao uuid; v_concessao uuid; v_cursor uuid; v_cursor_criado timestamptz;
 v_limite integer; v_resultado jsonb; v_linhas integer; v_request uuid;
 p_consulta jsonb := p_transporte -> 'consulta';
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
    or p_transporte - array['consulta','request_id'] <> '{}'::jsonb
    or jsonb_typeof(p_transporte -> 'request_id') is distinct from 'string'
    or not (coalesce(p_transporte ->> 'request_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or lower(coalesce(p_transporte ->> 'request_id','')) in ('00000000-0000-0000-0000-000000000000','ffffffff-ffff-ffff-ffff-ffffffffffff'))
    or jsonb_typeof(p_consulta) is distinct from 'object'
    or p_consulta - array['cursor','limite'] <> '{}'::jsonb
    or jsonb_typeof(p_consulta -> 'limite') is distinct from 'number'
    or coalesce(p_consulta ->> 'limite','') !~ '^(100|[1-9][0-9]?)$'
    or (p_consulta ? 'cursor' and jsonb_typeof(p_consulta -> 'cursor') is distinct from 'string') then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end if;
 begin
   v_limite := (p_consulta ->> 'limite')::integer;
   v_request := (p_transporte ->> 'request_id')::uuid;
   v_cursor := (p_consulta ->> 'cursor')::uuid;
   v_ator := auth.uid();
   v_sessao := (auth.jwt() ->> 'session_id')::uuid;
 exception when invalid_text_representation then
   raise exception using errcode='22023',message='ENTRADA_INVALIDA';
 end;
 if v_ator is null or v_sessao is null then raise exception using errcode='42501',message='SEM_PERMISSAO'; end if;
 select s.concessao_id into v_concessao from identidade.sessao s where s.session_id=v_sessao and s.usuario_id=v_ator;
 if v_concessao is null then
   if not exists (select 1 from public.usuario u where u.id=v_ator) then
     raise exception using errcode='42501',message='SEM_PERMISSAO';
   end if;
   insert into auditoria.evento (id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values (gen_random_uuid(),v_ator,'api.listar_reconciliacao','requisicao',null,'negado',v_request);
   get diagnostics v_linhas=row_count;
   if v_linhas <> 1 then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',v_request);
 end if;
 perform 1 from identidade.concessao_equipe c where c.id=v_concessao for update;
 perform 1 from public.usuario u where u.id=v_ator for update;
 perform 1 from identidade.sessao s where s.session_id=v_sessao for update;
 if identidade.sessao_atual_valida() is distinct from true or not exists (
    select 1 from identidade.sessao s join identidade.concessao_equipe c on c.id=s.concessao_id
    join public.usuario u on u.id=s.usuario_id
    where s.session_id=v_sessao and s.usuario_id=v_ator and s.concessao_id=v_concessao
      and s.revogada_em is null and c.usuario_id=v_ator and c.estado='vinculada'
      and u.ativo and u.perfil='administrador') then
   insert into auditoria.evento (id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values (gen_random_uuid(),v_ator,'api.listar_reconciliacao','requisicao',null,'negado',v_request);
   get diagnostics v_linhas=row_count;
   if v_linhas <> 1 then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',v_request);
 end if;
 if v_cursor is not null then
   select r.criada_em into v_cursor_criado from operacao.requisicao r
   where r.id=v_cursor and r.ator_usuario_id=v_ator and r.operacao='api.criar_paciente';
   if not found then raise exception using errcode='22023',message='ENTRADA_INVALIDA'; end if;
 end if;
 with candidatos as (
   select r.*, row_number() over (order by r.criada_em, r.id) as ordem
   from operacao.requisicao r
   where r.ator_usuario_id=v_ator and r.operacao='api.criar_paciente' and (v_cursor is null or (r.criada_em,r.id) > (v_cursor_criado,v_cursor))
   order by r.criada_em,r.id limit v_limite+1
 ), itens as (
   select c.*, case
     when c.estado='concluida' and c.resultado_id is not null and c.resultado_versao > 0
       and exists(select 1 from cadastro.paciente p where p.id=c.resultado_id)
       then jsonb_build_object('estado','confirmado','resultado_id',c.resultado_id,'resultado_versao',c.resultado_versao)
     when c.estado='registrada' then jsonb_build_object('estado','pendente')
     else jsonb_build_object('estado','indeterminado') end as situacao from candidatos c
 )
 select jsonb_build_object('itens',coalesce(jsonb_agg(jsonb_build_object('operacao_id',id,'situacao',situacao) order by criada_em,id)
     filter (where ordem <= v_limite),'[]'::jsonb),
     'proximo_cursor',case when count(*) > v_limite then max(id::text) filter (where ordem=v_limite) else null end)
   into v_resultado from itens;
 insert into auditoria.evento (id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
 values (gen_random_uuid(),v_ator,'api.listar_reconciliacao','requisicao',null,'permitido',v_request);
 get diagnostics v_linhas=row_count;
 if v_linhas <> 1 then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 return jsonb_build_object('ok',true,'dados',v_resultado,'request_id',v_request);
end $$;
revoke all on function experimento_atestado.listar_reconciliacao(jsonb) from public;
