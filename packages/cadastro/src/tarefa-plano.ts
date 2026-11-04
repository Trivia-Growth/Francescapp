export type TarefaPlano = {
  responsavel: string;
  prazo: string;
  prioridade: string;
  estado: 'pendente' | 'em_andamento' | 'concluida' | 'cancelada';
  acaoRealizada?: string;
  justificativa?: string;
};

/** Valida os campos confirmados de FR-017 sem definir transições ou níveis de prioridade. */
export function validarTarefaPlano(
  entrada: unknown,
): { valido: true; tarefa: TarefaPlano } | { valido: false } {
  if (entrada === null || typeof entrada !== 'object' || Array.isArray(entrada))
    return { valido: false };
  const dados = entrada as Record<string, unknown>;
  const texto = (valor: unknown): valor is string =>
    typeof valor === 'string' && valor.trim().length > 0;
  if (!texto(dados.responsavel) || !texto(dados.prazo) || !texto(dados.prioridade))
    return { valido: false };
  if (
    dados.estado !== 'pendente' &&
    dados.estado !== 'em_andamento' &&
    dados.estado !== 'concluida' &&
    dados.estado !== 'cancelada'
  )
    return { valido: false };
  if (dados.acaoRealizada !== undefined && !texto(dados.acaoRealizada)) return { valido: false };
  if (dados.justificativa !== undefined && !texto(dados.justificativa)) return { valido: false };
  if (dados.estado === 'concluida' && !texto(dados.acaoRealizada) && !texto(dados.justificativa))
    return { valido: false };
  return {
    valido: true,
    tarefa: {
      responsavel: dados.responsavel,
      prazo: dados.prazo,
      prioridade: dados.prioridade,
      estado: dados.estado,
      ...(texto(dados.acaoRealizada) ? { acaoRealizada: dados.acaoRealizada } : {}),
      ...(texto(dados.justificativa) ? { justificativa: dados.justificativa } : {}),
    },
  };
}
