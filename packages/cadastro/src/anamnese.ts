import type { SecaoAnamnese } from '@ffcmapp/contratos';

export { validarSecoesAnamnese } from '@ffcmapp/contratos';
export type { RespostaAnamnese, SecaoAnamnese } from '@ffcmapp/contratos';

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
