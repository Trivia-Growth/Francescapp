-- Experimento local, não é migração. O proprietário deve configurar o alvo
-- após verificá-lo independentemente; comparação de texto não prova o alvo.
-- Não há grants nem endpoint; SECURITY INVOKER não é seguro para runtime HTTP.
alter table identidade.concessao_equipe drop constraint concessao_equipe_metodo_check;
alter table identidade.concessao_equipe drop constraint concessao_estado_datas_chk;
alter table identidade.concessao_equipe add constraint concessao_metodo_experimento_chk
  check (metodo in ('google_workspace', 'tecnica'));
alter table identidade.concessao_equipe add constraint concessao_estado_experimento_chk check ((
  (metodo = 'google_workspace' and (
    (estado = 'pendente' and usuario_id is null and subject_google is null and vinculada_em is null and revogada_em is null and revogada_por_usuario_id is null and motivo_revogacao_cifrado is null)
    or (estado = 'vinculada' and usuario_id is not null and nullif(btrim(subject_google), '') is not null and vinculada_em is not null and revogada_em is null and revogada_por_usuario_id is null and motivo_revogacao_cifrado is null)
    or (estado = 'revogada' and revogada_em is not null and revogada_por_usuario_id is not null and motivo_revogacao_cifrado is not null)))
  or (metodo = 'tecnica' and subject_google is null and usuario_id is not null and vinculada_em is not null and
    ((estado = 'vinculada' and revogada_em is null and revogada_por_usuario_id is null and motivo_revogacao_cifrado is null)
    or (estado = 'revogada' and revogada_em is not null and revogada_por_usuario_id is not null and motivo_revogacao_cifrado is not null)))
) is true);

create table identidade.bootstrap_experimento (
  unico boolean primary key default true check (unico),
  projeto_ref text not null check (length(btrim(projeto_ref)) > 0),
  usuario_id uuid references auth.users(id),
  concessao_id uuid references identidade.concessao_equipe(id),
  check ((usuario_id is null) = (concessao_id is null))
);
revoke all on identidade.bootstrap_experimento from public, anon, authenticated;

create function identidade.bootstrap_tecnico_experimento(
 p_projeto text, p_usuario uuid, p_concessao uuid, p_email_cifrado jsonb,
 p_email_hmac text, p_motivo_cifrado jsonb, p_operador text, p_request uuid
) returns text language plpgsql security invoker set search_path = pg_catalog as $$
declare v_alvo identidade.bootstrap_experimento%rowtype; v_resultado text; v_linhas integer;
begin
  if p_projeto is null or btrim(p_projeto) = '' or p_usuario is null or p_concessao is null
    or p_request is null or p_operador is null or length(btrim(p_operador)) not between 1 and 120
    or p_email_hmac is null or btrim(p_email_hmac) = '' or p_motivo_cifrado is null
    or p_email_cifrado is null then
    raise exception 'entrada inválida' using errcode = '22023';
  end if;
  select * into v_alvo from identidade.bootstrap_experimento where unico for update;
  if not found or v_alvo.projeto_ref <> p_projeto then
    raise exception 'alvo não confirmado' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_usuario) then
    raise exception 'identidade não encontrada' using errcode = '22023';
  end if;
  if v_alvo.usuario_id is null then
    insert into public.usuario(id,perfil,ativo) values (p_usuario,'administrador',true);
    get diagnostics v_linhas = row_count;
    if v_linhas <> 1 then raise exception 'persistência de usuário indisponível'; end if;
    insert into identidade.concessao_equipe(id,email_cifrado,email_hmac,perfil,metodo,estado,usuario_id,subject_google,motivo_cifrado,vinculada_em)
      values(p_concessao,p_email_cifrado,p_email_hmac,'administrador','tecnica','vinculada',p_usuario,null,p_motivo_cifrado,clock_timestamp());
    get diagnostics v_linhas = row_count;
    if v_linhas <> 1 then raise exception 'persistência de concessão indisponível'; end if;
    insert into identidade.excecao_tecnica(usuario_id,concessao_id,motivo_cifrado)
      values(p_usuario,p_concessao,p_motivo_cifrado);
    get diagnostics v_linhas = row_count;
    if v_linhas <> 1 then raise exception 'persistência de exceção indisponível'; end if;
    update identidade.bootstrap_experimento set usuario_id=p_usuario,concessao_id=p_concessao where unico;
    get diagnostics v_linhas = row_count;
    if v_linhas <> 1 then raise exception 'persistência de controle indisponível'; end if;
    v_resultado := 'inicializado';
  else
    if v_alvo.usuario_id <> p_usuario or v_alvo.concessao_id <> p_concessao then
      raise exception 'bootstrap divergente' using errcode = '22023';
    end if;
    if not exists (select 1 from identidade.concessao_equipe c
      join identidade.excecao_tecnica e on e.usuario_id = p_usuario and e.concessao_id = c.id
      where c.id = p_concessao and c.usuario_id = p_usuario and c.metodo = 'tecnica'
        and c.email_cifrado = p_email_cifrado and c.email_hmac = p_email_hmac
        and c.motivo_cifrado = p_motivo_cifrado and e.motivo_cifrado = p_motivo_cifrado) then
      raise exception 'bootstrap divergente' using errcode = '22023';
    end if;
    -- Não reativa nem repara concessão ou usuário alterados após bootstrap.
    v_resultado := 'ja_inicializado';
  end if;
  insert into auditoria.evento(id,operador_restrito,acao,tipo_objeto,objeto_id,resultado,request_id)
    values(gen_random_uuid(),p_operador,'bootstrap.tecnico','usuario',p_usuario,'permitido',p_request);
  get diagnostics v_linhas = row_count;
  if v_linhas <> 1 then raise exception 'auditoria indisponível'; end if;
  return v_resultado;
end $$;
revoke all on function identidade.bootstrap_tecnico_experimento(text,uuid,uuid,jsonb,text,jsonb,text,uuid) from public, anon, authenticated;
