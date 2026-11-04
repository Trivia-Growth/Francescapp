/** Fonte e data são preservadas como fornecidas; validação ocorre na fronteira de entrada. */
export type RespostaAnamnese =
  | { campo: string; estado: 'informado'; valor: string; fonte: string; data: string }
  | { campo: string; estado: 'desconhecido' | 'nao_se_aplica'; fonte: string; data: string }
  | { campo: string; estado: 'pendente' };

export type SecaoAnamnese = {
  id: string;
  camposEsperados: readonly string[];
  respostas: readonly RespostaAnamnese[];
};

/** Identifica somente ausência e pendência explícita; não define completude clínica. */
export function localizarPendencias(secoes: readonly SecaoAnamnese[]) {
  return secoes.flatMap(({ id, camposEsperados, respostas }) => {
    const camposAusentes = camposEsperados.filter(
      (campo) => !respostas.some((resposta) => resposta.campo === campo),
    );
    const camposPendentes = camposEsperados.filter((campo) =>
      respostas.some((resposta) => resposta.campo === campo && resposta.estado === 'pendente'),
    );
    return camposAusentes.length || camposPendentes.length
      ? [{ secao: id, camposAusentes, camposPendentes }]
      : [];
  });
}

/** Valida dados externos antes de calcular pendências; não valida critérios clínicos. */
export function validarSecoesAnamnese(entrada: unknown): SecaoAnamnese[] {
  const invalida = (): never => {
    throw new Error('Anamnese inválida.');
  };
  const objeto = (valor: unknown): Record<string, unknown> => {
    if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return invalida();
    return valor as Record<string, unknown>;
  };
  const texto = (valor: unknown): string =>
    typeof valor === 'string' && valor.trim().length > 0 ? valor : invalida();
  const data = (valor: unknown): string => {
    const resultado = texto(valor);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(resultado)) return invalida();
    const instante = new Date(`${resultado}T00:00:00Z`);
    if (Number.isNaN(instante.getTime()) || instante.toISOString().slice(0, 10) !== resultado)
      return invalida();
    return resultado;
  };
  if (!Array.isArray(entrada)) return invalida();
  const ids = new Set<string>();
  return entrada.map((item): SecaoAnamnese => {
    const secao = objeto(item);
    const id = texto(secao.id);
    if (ids.has(id)) return invalida();
    ids.add(id);
    if (!Array.isArray(secao.camposEsperados) || !Array.isArray(secao.respostas)) return invalida();
    const camposEsperados = secao.camposEsperados.map(texto);
    if (new Set(camposEsperados).size !== camposEsperados.length) return invalida();
    const campos = new Set<string>();
    const respostas = secao.respostas.map((itemResposta): RespostaAnamnese => {
      const resposta = objeto(itemResposta);
      const campo = texto(resposta.campo);
      if (campos.has(campo)) return invalida();
      campos.add(campo);
      switch (resposta.estado) {
        case 'pendente':
          return { campo, estado: 'pendente' };
        case 'informado':
          return {
            campo,
            estado: 'informado',
            valor: texto(resposta.valor),
            fonte: texto(resposta.fonte),
            data: data(resposta.data),
          };
        case 'desconhecido':
        case 'nao_se_aplica':
          return {
            campo,
            estado: resposta.estado,
            fonte: texto(resposta.fonte),
            data: data(resposta.data),
          };
        default:
          return invalida();
      }
    });
    return { id, camposEsperados, respostas };
  });
}
