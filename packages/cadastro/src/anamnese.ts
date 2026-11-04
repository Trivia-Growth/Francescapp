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
