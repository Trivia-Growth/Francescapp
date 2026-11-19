import type {
  RegistroExecucaoPublico,
  RelatorioTurnoPublico,
} from '../../../packages/contracts/src/turno-execucao-http.ts';
const situacoes: Record<string, string> = {
  administrado: 'Administrado',
  recusado: 'Recusado',
  adiado: 'Adiado',
  nao_administrado: 'Não administrado',
  cafe: 'Café',
  almoco: 'Almoço',
  lanche: 'Lanche',
  jantar: 'Jantar',
  ceia: 'Ceia',
  total: 'Total',
  parcial: 'Parcial',
  minima: 'Mínima',
  recusou: 'Recusou',
  tranquilo: 'Tranquilo',
  agitado: 'Agitado',
  nao_dormiu: 'Não dormiu',
  urina: 'Urina',
  fezes: 'Fezes',
};
const sinais: Record<string, string> = {
  pressao_sistolica: 'Pressão arterial sistólica',
  pressao_diastolica: 'Pressão arterial diastólica',
  frequencia_cardiaca: 'Frequência cardíaca',
  frequencia_respiratoria: 'Frequência respiratória',
  temperatura: 'Temperatura',
  saturacao_oxigenio: 'Saturação de oxigênio',
  glicemia_capilar: 'Glicemia capilar',
  dor: 'Dor declarada',
};
export function apresentarRegistroExecucao(registro: RegistroExecucaoPublico): string {
  const linhas = [
    `Registro: ${registro.criado_em}`,
    `Ocorrência informada: ${registro.instante_ocorrencia}`,
    `Registrador autenticado: ${registro.registrador_nome ?? `identificador do autor persistido ${registro.registrador_usuario_id}`}`,
    `Versão ${registro.versao}${registro.retificada ? ' (retificação)' : ''}`,
  ];
  const c = registro.conteudo;
  if (c.classe === 'afericao')
    linhas.push(`${sinais[c.dados.tipo]}: ${c.dados.valor} ${c.dados.unidade}`);
  else if (c.classe === 'prescricao')
    linhas.push(
      `Medicação transcrita: ${c.dados.nome}`,
      `Dose: ${c.dados.dose}`,
      `Via: ${c.dados.via}`,
      `Horários informados: ${c.dados.horarios.join(', ')}`,
      `Vigência: ${c.dados.vigencia_inicio} até ${c.dados.vigencia_fim ?? 'fim não informado'}`,
      `Fonte documental: ${c.dados.fonte_documental}`,
    );
  else if (c.classe === 'administracao')
    linhas.push(
      ...(registro.prescricao_referenciada
        ? [
            `Medicação referenciada: ${registro.prescricao_referenciada.nome}`,
            `Dose da versão prescrita: ${registro.prescricao_referenciada.dose}`,
            `Via da versão prescrita: ${registro.prescricao_referenciada.via}`,
          ]
        : []),
      `Executor declarado: ${c.dados.executor.nome}`,
      `Vínculo declarado do executor: ${c.dados.executor.vinculo}`,
      `Situação: ${situacoes[c.dados.situacao]}`,
      `Versão da prescrição referenciada: ${c.dados.versao}`,
      ...(c.dados.motivo ? [`Motivo da situação: ${c.dados.motivo}`] : []),
    );
  else if (c.classe === 'ocorrencia')
    linhas.push(`Descrição: ${c.dados.descricao}`, `Providência tomada: ${c.dados.providencia}`);
  else {
    const d = c.dados;
    if (d.tipo === 'refeicao')
      linhas.push(
        `Refeição: ${situacoes[d.momento]}`,
        `Aceitação observada: ${situacoes[d.aceitacao]}`,
      );
    else if (d.tipo === 'hidratacao') linhas.push(`Hidratação informada: ${d.mililitros} mL`);
    else if (d.tipo === 'sono')
      linhas.push(
        `Sono informado: ${d.inicio} até ${d.fim}`,
        `Qualidade observada: ${situacoes[d.qualidade]}`,
      );
    else linhas.push(`Eliminação observada: ${situacoes[d.eliminacao]}`, `Contagem: ${d.contagem}`);
    if (d.observacao) linhas.push(`Observação: ${d.observacao}`);
  }
  if (registro.motivo) linhas.push(`Motivo da retificação: ${registro.motivo}`);
  return linhas.join('\n');
}
export function apresentarEventoExecucao(evento: RelatorioTurnoPublico['itens'][number]): {
  titulo: string;
  texto: string;
} {
  const d = evento.dados;
  if ('conteudo' in d && typeof d.conteudo === 'object')
    return {
      titulo: (
        {
          afericao: 'Aferição',
          prescricao: 'Prescrição transcrita',
          administracao: 'Administração de medicação',
          ocorrencia: 'Ocorrência',
          rotina: 'Rotina',
        } as const
      )[d.conteudo.classe],
      texto: [
        apresentarRegistroExecucao(d as RegistroExecucaoPublico),
        ...(evento.anexos?.length
          ? [
              `Anexos disponíveis: ${evento.anexos.map((a) => `${a.mime_type}, ${a.tamanho_bytes} bytes`).join('; ')}. Arquivos binários não incorporados ao PDF.`,
            ]
          : []),
      ].join('\n'),
    };
  if ('profissional_usuario_id' in d)
    return {
      titulo: 'Turno',
      texto: [
        `Profissional: ${d.profissional_nome ?? `identificador do profissional persistido ${d.profissional_usuario_id}`}`,
        `Abertura: ${d.aberto_em}`,
        `Encerramento: ${d.encerrado_em ?? 'Turno aberto no corte da consulta'}`,
        `Situação: ${d.situacao === 'aberto' ? 'Aberto' : 'Encerrado'}`,
        `Versão: ${d.versao}`,
      ].join('\n'),
    };
  if ('publicado_em' in d)
    return {
      titulo: 'Passagem de turno',
      texto: [
        `Autor: ${d.autor_nome ?? `identificador do autor persistido ${d.autor_usuario_id}`}`,
        `Publicação: ${d.publicado_em}`,
        `Versão: ${d.versao}`,
        `Audiência: ${d.audiencia === 'equipe' ? 'Equipe' : 'Equipe e família'}`,
        d.conteudo,
      ].join('\n'),
    };
  throw new Error('Categoria indisponível.');
}
