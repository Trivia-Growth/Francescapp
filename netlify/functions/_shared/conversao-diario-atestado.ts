import {
  dadosAtestadoSchema,
  resultadoAtestacaoSchema,
} from '../../../packages/contracts/src/rpc.ts';
export type TransporteConversaoFilho = {
  entrada: Record<string, unknown>;
  entrada_canonica: string;
  dados_canonicos: string;
};
export type PortasAtestadoConversao = {
  metadados(requestId: string): {
    key_id: string;
    emitido_em: string;
    expira_em: string;
    request_id: string;
  };
  atestador: {
    canonicalizar(valor: unknown): string;
    atestarEntrada(dados: unknown, entrada: Record<string, unknown>): Promise<unknown>;
  };
};
/** Prepara somente transporte assinado; não executa operação ou concede autorização. */
export async function prepararAtestadoConversao(
  entrada: Record<string, unknown>,
  operacao: string,
  identidade: { usuario_id: string; session_id: string },
  requestId: string,
  portas: PortasAtestadoConversao,
): Promise<TransporteConversaoFilho> {
  const metadados = dadosAtestadoSchema
    .omit({ digest_entrada: true })
    .parse({ ...portas.metadados(requestId), ...identidade, operacao });
  if (metadados.request_id !== requestId || entrada.request_id !== requestId)
    throw new Error('Atestado incompatível.');
  const prova = resultadoAtestacaoSchema.parse(
    await portas.atestador.atestarEntrada(metadados, entrada),
  );
  const dados = dadosAtestadoSchema.parse(JSON.parse(prova.dadosCanonicos));
  if (
    portas.atestador.canonicalizar(entrada) !== prova.entradaCanonica ||
    portas.atestador.canonicalizar(dados) !== prova.dadosCanonicos ||
    Object.entries(metadados).some(([k, v]) => dados[k as keyof typeof dados] !== v) ||
    Object.entries(dados).some(([k, v]) => prova.atestado[k as keyof typeof dados] !== v)
  )
    throw new Error('Atestado incompatível.');
  return {
    entrada: { ...entrada, atestado: prova.atestado },
    entrada_canonica: prova.entradaCanonica,
    dados_canonicos: prova.dadosCanonicos,
  };
}
