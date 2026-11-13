\set ON_ERROR_STOP on
-- Reaproveita a cadeia e as fixtures da configuração (usuários, sessões, papéis e o leitor
-- do servidor), e aplica por cima a semente dos interruptores de serviço.
\ir configuracao_sistema_local.sql
\ir ../migrations/20261121100000_configuracao_servicos.sql

-- Cada chave nova precisa existir com o valor que o ambiente já dizia em 13/11/2026, tipo
-- booleano e exposição 'servidor'. Valor errado aqui liga ou desliga um serviço em produção
-- no momento em que a migration é aplicada, que é exatamente o que não pode acontecer.
do $$
#variable_conflict use_variable
declare
  esperado jsonb := jsonb_build_object(
    'ffcm.pacientes.ativo', true,
    'ffcm.cadastro.edicao_ativa', true,
    'ffcm.acesso_paciente.ativo', true,
    'ffcm.acesso_paciente.barreira_ativa', true,
    'ffcm.anamnese.ativa', true,
    'ffcm.anamnese.historico_ativo', true,
    'ffcm.saude.ativa', true,
    'ffcm.plano.ativo', true,
    'ffcm.plano.aprovador_ativo', true,
    'ffcm.plano.aprovacao_objetivo_ativa', true,
    'ffcm.plano_crise.ativo', true,
    'ffcm.tarefas.ativas', true,
    'ffcm.tarefas.escrita_ativa', true,
    'ffcm.tarefas.barreira_ativa', true,
    'ffcm.pendencias.ativas', true,
    'ffcm.encaminhamentos.ativo', true,
    'ffcm.orientacoes.ativo', true,
    'ffcm.contexto_cuidado.ativo', true,
    'ffcm.rede_cuidado.ativa', true,
    'ffcm.equipe.consulta_ativa', true,
    'ffcm.equipe.criacao_ativa', true,
    'ffcm.equipe.barreira_ativa', true,
    'ffcm.equipe.vinculos_ativa', true,
    'ffcm.auditoria.consulta_ativa', true,
    'ffcm.lgpd.ativa', true,
    'ffcm.regras.ativa', true,
    'ffcm.linha_tempo.ativa', false,
    'ffcm.exportacao.ativa', false
  );
  chave_esperada text;
  valor_esperado jsonb;
begin
  for chave_esperada, valor_esperado in select * from jsonb_each(esperado) loop
    if not exists (
      select 1 from identidade.configuracao_sistema c
      where c.chave = chave_esperada
        and c.valor = valor_esperado
        and c.tipo = 'booleano'
        and c.exposicao = 'servidor'
    ) then
      raise exception 'CHAVE_SEMEADA_DIVERGENTE: %', chave_esperada;
    end if;
  end loop;

  -- Rótulo e descrição são lidos por quem administra, não por quem programa: sem eles a tela
  -- mostra um interruptor sem nome.
  if exists (
    select 1 from identidade.configuracao_sistema c
    where c.chave in (select jsonb_object_keys(esperado))
      and (c.descricao is null or char_length(btrim(c.rotulo)) = 0)
  ) then
    raise exception 'INTERRUPTOR_SEM_ROTULO_OU_DESCRICAO';
  end if;

  -- A linha do tempo e a exportação continuam desligadas no banco. O interruptor fixo no
  -- código é outra trava, independente desta; ligar a chave aqui não abre a rota.
  if exists (
    select 1 from identidade.configuracao_sistema c
    where c.chave in ('ffcm.linha_tempo.ativa', 'ffcm.exportacao.ativa') and c.valor = 'true'::jsonb
  ) then
    raise exception 'SERVICO_SEM_PROVA_NASCE_LIGADO';
  end if;
end $$;

-- O leitor do servidor enxerga os interruptores e NADA além da exposição 'servidor'. Se uma
-- chave de administração vazasse por aqui, o processo do servidor passaria a ler configuração
-- que não é dele.
do $$
declare
  publico jsonb;
  administrativas integer;
begin
  insert into identidade.configuracao_sistema (id, chave, valor, tipo, rotulo, exposicao)
  values (gen_random_uuid(), 'ffcm.teste.administrativa', '"reservado"'::jsonb, 'texto',
          'Chave de administração usada só neste teste', 'administracao');

  set local role ffcmapp_configuracao_leitor_executor;
  publico := identidade.ler_configuracao_sistema_publica();
  reset role;

  if publico ? 'ffcm.teste.administrativa' then
    raise exception 'LEITOR_SERVIDOR_ENXERGA_ADMINISTRACAO';
  end if;
  if not (publico ? 'ffcm.pacientes.ativo' and publico ? 'ffcm.linha_tempo.ativa') then
    raise exception 'LEITOR_SERVIDOR_NAO_ENXERGA_INTERRUPTOR';
  end if;
  if (publico -> 'ffcm.linha_tempo.ativa' ->> 'valor')::boolean then
    raise exception 'LEITOR_SERVIDOR_DEVOLVE_VALOR_ERRADO';
  end if;

  -- Toda chave devolvida ao servidor é, de fato, de exposição 'servidor'.
  select count(*) into administrativas
  from jsonb_object_keys(publico) k
  join identidade.configuracao_sistema c on c.chave = k
  where c.exposicao <> 'servidor';
  if administrativas > 0 then
    raise exception 'LEITOR_SERVIDOR_AMPLO_DEMAIS';
  end if;

  delete from identidade.configuracao_sistema where chave = 'ffcm.teste.administrativa';
end $$;

-- O leitor do servidor lê e não escreve: um interruptor não pode ser mexido pelo papel que
-- apenas o consulta.
do $$ begin
  if has_table_privilege('ffcmapp_configuracao_leitor_owner', 'identidade.configuracao_sistema', 'UPDATE')
     or has_table_privilege('ffcmapp_configuracao_leitor_owner', 'identidade.configuracao_sistema', 'INSERT')
     or has_table_privilege('ffcmapp_configuracao_leitor_owner', 'identidade.configuracao_sistema', 'DELETE') then
    raise exception 'LEITOR_SERVIDOR_ESCREVE';
  end if;
end $$;

do $$ begin raise notice 'CONFIGURACAO_SERVICOS_OK'; end $$;
