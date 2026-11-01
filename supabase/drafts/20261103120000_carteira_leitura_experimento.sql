-- Rascunho local SEM GRANTS e SEM RUNTIME. Claims, chave e prova são fixtures;
-- JWT no gateway, identidade do executor, Vault, cursor HTTP e privilégios reais
-- não são comprovados. Executar a leitura e auditoria na mesma transação.
create function experimento_atestado.validar_carteira_fixture(p_transporte jsonb)
returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare
 e jsonb := p_transporte->'entrada'; a jsonb := e->'atestado';
 ator uuid; sessao uuid; request uuid; emitido timestamptz; expira timestamptz; prazo interval;
begin
 if jsonb_typeof(p_transporte) is distinct from 'object'
   or p_transporte - array['entrada','entrada_canonica','dados_canonicos'] <> '{}'::jsonb
   or jsonb_typeof(e) is distinct from 'object'
   or e - array['request_id','limite','cursor','atestado'] <> '{}'::jsonb
   or jsonb_typeof(a) is distinct from 'object'
   or jsonb_typeof(e->'limite') is distinct from 'number'
   or coalesce(e->>'limite','') !~ '^(100|[1-9][0-9]?)$'
   or (e ? 'cursor' and jsonb_typeof(e->'cursor') is distinct from 'string') then return false; end if;
 begin
   ator:=auth.uid(); sessao:=(auth.jwt()->>'session_id')::uuid;
   request:=(e->>'request_id')::uuid;
   emitido:=(a->>'emitido_em')::timestamptz; expira:=(a->>'expira_em')::timestamptz;
   if e ? 'cursor' then perform (e->>'cursor')::uuid; end if;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then return false; end;
 if ator is null or sessao is null or request is null or emitido is null or expira is null
   or (a->>'usuario_id') is distinct from ator::text
   or (a->>'session_id') is distinct from sessao::text
   or (a->>'request_id') is distinct from request::text
   or a->>'operacao' is distinct from 'api.listar_pacientes'
   or experimento_atestado.verificar_com_chave_interna(p_transporte->>'entrada_canonica',
     p_transporte->>'dados_canonicos',e-'atestado',a-'mac',a->>'mac') is distinct from true then return false; end if;
 prazo:=experimento_atestado.prazo_maximo_teste();
 return prazo is not null and prazo > interval '0 seconds' and emitido <= clock_timestamp()
   and expira > clock_timestamp() and expira > emitido and expira-emitido <= prazo;
end $$;
revoke all on function experimento_atestado.validar_carteira_fixture(jsonb) from public,anon,authenticated;

create function experimento_atestado.listar_carteira_fixture(p_transporte jsonb,p_geracao bigint,p_verificador bytea)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare
 e jsonb:=p_transporte->'entrada'; ator uuid; request uuid; perfil text;
 cursor_id uuid; cursor_criado timestamptz; limite integer; pagina jsonb; linhas integer;
begin
 if experimento_atestado.validar_carteira_fixture(p_transporte) is not true then
   raise exception using errcode='42501',message='SEM_PERMISSAO';
 end if;
 ator:=auth.uid(); request:=(e->>'request_id')::uuid; limite:=(e->>'limite')::integer;
 if saida_fixture.autorizar_prova(p_geracao,p_verificador) is not true then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,'api.listar_pacientes','carteira',null,'negado',request);
   get diagnostics linhas=row_count;
   if linhas<>1 then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',request);
 end if;
 -- A espera por locks pode expirar o atestado; não liberar dados expirados.
 if experimento_atestado.validar_carteira_fixture(p_transporte) is not true then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,'api.listar_pacientes','carteira',null,'negado',request);
   get diagnostics linhas=row_count;
   if linhas<>1 then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',request);
 end if;
 select u.perfil into perfil from public.usuario u where u.id=ator and u.ativo;
 if perfil not in ('administrador','profissional','familia') or perfil is null then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,'api.listar_pacientes','carteira',null,'negado',request);
   get diagnostics linhas=row_count;
   if linhas<>1 then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',request);
 end if;
 if e ? 'cursor' then
   cursor_id:=(e->>'cursor')::uuid;
   if perfil <> 'administrador' then
     perform 1 from cadastro.acesso_paciente a where a.usuario_id=ator and a.paciente_id=cursor_id and a.revogada_em is null for share;
     if not found then
       insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
       values(gen_random_uuid(),ator,'api.listar_pacientes','carteira',null,'negado',request);
       get diagnostics linhas=row_count;
       if linhas<>1 then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
       return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','entrada_invalida'),'request_id',request);
     end if;
   end if;
   select p.criado_em into cursor_criado from cadastro.paciente p where p.id=cursor_id;
   if not found then
     insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
     values(gen_random_uuid(),ator,'api.listar_pacientes','carteira',null,'negado',request);
     get diagnostics linhas=row_count;
     if linhas<>1 then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
     return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','entrada_invalida'),'request_id',request);
   end if;
 end if;
 if perfil='administrador' then
   with selecionados as (
     select p.id,p.criado_em,p.nome_cifrado,p.nome_preferencia_cifrado,p.versao
     from cadastro.paciente p where cursor_id is null or (p.criado_em,p.id)>(cursor_criado,cursor_id)
     order by p.criado_em,p.id limit limite+1
   ), numerados as (select *,row_number() over (order by criado_em,id) as ordem from selecionados)
   select jsonb_build_object('itens',coalesce(jsonb_agg(jsonb_build_object('paciente_id',id,'nome',nome_cifrado,
     'nome_preferencia',nome_preferencia_cifrado,'versao',versao) order by criado_em,id) filter(where ordem<=limite),'[]'::jsonb),
     'proximo_cursor',case when count(*)>limite then max(id::text) filter(where ordem=limite) else null end)
   into pagina from numerados;
 else
   with selecionados as (
     select p.id,p.criado_em,p.nome_cifrado,p.nome_preferencia_cifrado,p.versao
     from cadastro.paciente p join cadastro.acesso_paciente a on a.paciente_id=p.id
     where a.usuario_id=ator and a.revogada_em is null and (cursor_id is null or (p.criado_em,p.id)>(cursor_criado,cursor_id))
     order by p.criado_em,p.id limit limite+1 for share of a
   ), numerados as (select *,row_number() over (order by criado_em,id) as ordem from selecionados)
   select jsonb_build_object('itens',coalesce(jsonb_agg(jsonb_build_object('paciente_id',id,'nome',nome_cifrado,
     'nome_preferencia',nome_preferencia_cifrado,'versao',versao) order by criado_em,id) filter(where ordem<=limite),'[]'::jsonb),
     'proximo_cursor',case when count(*)>limite then max(id::text) filter(where ordem=limite) else null end)
   into pagina from numerados;
 end if;
 -- A espera pelos vínculos também pode consumir todo o prazo do atestado.
 if experimento_atestado.validar_carteira_fixture(p_transporte) is not true then
   insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
   values(gen_random_uuid(),ator,'api.listar_pacientes','carteira',null,'negado',request);
   get diagnostics linhas=row_count;
   if linhas<>1 then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
   return jsonb_build_object('ok',false,'erro',jsonb_build_object('codigo','sem_permissao'),'request_id',request);
 end if;
 -- A cursor UUID é interna: o gateway futuro precisa selá-la por identidade.
 insert into auditoria.evento(id,ator_usuario_id,acao,tipo_objeto,objeto_id,resultado,request_id)
 values(gen_random_uuid(),ator,'api.listar_pacientes','carteira',null,'permitido',request);
 get diagnostics linhas=row_count;
 if linhas<>1 then raise exception using errcode='P0002',message='AUDITORIA_NAO_INSERIDA'; end if;
 return jsonb_build_object('ok',true,'dados',pagina,'request_id',request);
end $$;
revoke all on function experimento_atestado.listar_carteira_fixture(jsonb,bigint,bytea) from public,anon,authenticated;
