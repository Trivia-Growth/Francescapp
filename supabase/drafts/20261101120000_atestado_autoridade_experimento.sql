-- EXPERIMENTO ISOLADO: auth.*, sessão e política de duração são fixtures no teste.
-- Sem gateway autenticado, papel restrito e Vault reais, não usar em produção.
-- Fixar operação internamente impede seleção da operação pelo chamador desta função.
create function experimento_atestado.verificar_criar_paciente(
  p_entrada_canonica text, p_dados_canonicos text,
  p_entrada_usada jsonb, p_dados_usados jsonb, p_mac text
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_dados jsonb;
  v_usuario uuid;
  v_sessao uuid;
  v_emitido timestamptz;
  v_expira timestamptz;
  v_agora timestamptz;
  v_prazo interval;
  v_sessao_ativa boolean;
begin
  if experimento_atestado.verificar_com_chave_interna(
    p_entrada_canonica, p_dados_canonicos, p_entrada_usada, p_dados_usados, p_mac
  ) is distinct from true then return false; end if;
  v_dados := p_dados_canonicos::jsonb;
  v_usuario := auth.uid();
  v_sessao := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_emitido := (v_dados ->> 'emitido_em')::timestamptz;
  v_expira := (v_dados ->> 'expira_em')::timestamptz;
  v_prazo := experimento_atestado.prazo_maximo_teste();
  v_sessao_ativa := identidade.sessao_atual_valida();
  -- A verificação criptográfica e as consultas anteriores podem esperar.
  v_agora := clock_timestamp();
  if v_usuario is null or v_sessao is null or v_emitido is null or v_expira is null
     or v_prazo is null or v_prazo <= interval '0 seconds'
     or (v_dados ->> 'usuario_id')::uuid is distinct from v_usuario
     or (v_dados ->> 'session_id')::uuid is distinct from v_sessao
     or v_dados ->> 'operacao' is distinct from 'api.criar_paciente'
     or v_emitido > v_agora or v_expira <= v_agora or v_expira <= v_emitido
     or v_expira - v_emitido > v_prazo
     or v_sessao_ativa is distinct from true then
    return false;
  end if;
  return true;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then return false;
end $$;
revoke all on function experimento_atestado.verificar_criar_paciente(text,text,jsonb,jsonb,text) from public;
