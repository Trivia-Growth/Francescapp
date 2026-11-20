import { z } from 'zod';
import {
  apuracaoRepasseSchema,
  audienciaFinanceiraSchema,
  despesaVersaoSchema,
  envioComprovanteSchema,
  consultarApuracaoSchema,
  despesaSchema,
  concessaoFinanceiraSchema,
  gravarConcessaoFinanceiraSchema,
  listaConcessaoFinanceiraSchema,
  registrarDespesaSchema,
  registrarValorAcordadoSchema,
  retificarDespesaSchema,
  valorAcordadoSchema,
} from './financeiro.ts';

const vazio = z.object({}).strict();

/** Contrato HTTP isolado do financeiro do cuidado (FR-068, FR-069, FR-070), no molde de
 * `plano-crise-http.ts`. Não está registrado em `rotas.ts`: a exposição depende da
 * concessão financeira e das provas de autorização desta fatia.
 *
 * Nenhum caminho é aninhado em `/pacientes/:paciente_id/...` para valor acordado nem para
 * apuração: a audiência financeira não deriva do caso (design D1), e um caminho de caso
 * sugeriria o contrário a quem for montar o servidor. A despesa pertence a um caso e por
 * isso leva `paciente_id` no corpo, não no caminho — a autorização continua sendo a
 * concessão financeira, nunca o vínculo com o paciente.
 *
 * O comprovante não tem rota de URL: a entrega é por fluxo autorizado a cada leitura
 * (FR-069), portanto a rota devolve os bytes sob a política do repositório privado. */
export const financeiroHttp = {
  /** FR-068: administração da audiência financeira. Caminho próprio, fora de
   * `/api/financeiro/casos/...`, porque a audiência não decorre de caso nenhum (design D1):
   * não há `paciente_id` aqui, e o servidor não lê vínculo de caso para atender estas duas.
   *
   * Conceder é ato de Administrador — `api.listar_concessao_financeira` e
   * `api.gravar_concessao_financeira` exigem administrador no banco, e quem já tem a
   * audiência financeira não ganha com isso o direito de concedê-la a ninguém. */
  listarConcessoes: {
    metodo: 'GET',
    caminho: '/api/financeiro/concessoes',
    entrada: vazio,
    saida: listaConcessaoFinanceiraSchema,
  },
  /** Conceder e revogar pela mesma rota: `habilitado: false` revoga, e a leitura seguinte
   * já nega, porque a marca lida pelas demais rotas é a coluna atualizada aqui. */
  gravarConcessao: {
    metodo: 'POST',
    caminho: '/api/financeiro/concessoes',
    entrada: gravarConcessaoFinanceiraSchema,
    saida: concessaoFinanceiraSchema,
  },
  registrarValorAcordado: {
    metodo: 'POST',
    caminho: '/api/financeiro/valores-acordados',
    entrada: registrarValorAcordadoSchema,
    saida: valorAcordadoSchema,
  },
  consultarValoresAcordados: {
    metodo: 'GET',
    caminho: '/api/financeiro/profissionais/:profissional_usuario_id/valores-acordados',
    entrada: vazio,
    saida: z.array(valorAcordadoSchema),
  },
  registrarDespesa: {
    metodo: 'POST',
    caminho: '/api/financeiro/despesas',
    entrada: registrarDespesaSchema,
    saida: despesaSchema,
  },
  retificarDespesa: {
    metodo: 'POST',
    caminho: '/api/financeiro/despesas/:despesa_id/retificacoes',
    entrada: retificarDespesaSchema,
    // A retificação não tem comprovante próprio: ver `despesaVersaoSchema`.
    saida: despesaVersaoSchema,
  },
  consultarDespesas: {
    metodo: 'GET',
    caminho: '/api/financeiro/casos/:paciente_id/despesas',
    entrada: vazio,
    saida: z.array(despesaVersaoSchema),
  },
  /** Sondagem de audiência para a interface. Não concede nada e não devolve valor algum. */
  consultarAudiencia: {
    metodo: 'GET',
    caminho: '/api/financeiro/audiencia',
    entrada: vazio,
    saida: audienciaFinanceiraSchema,
  },
  /** O caminho leva o caso porque a única leitura de despesa que o banco oferece é por caso
   * (`api.consultar_despesas` recebe `paciente_id`). Levar o caso no caminho não torna a
   * autorização do caso aplicável: continua valendo a concessão financeira, e um profissional
   * com vínculo naquele caso recebe `sem_permissao`. */
  consultarComprovante: {
    metodo: 'GET',
    caminho: '/api/financeiro/casos/:paciente_id/despesas/:despesa_id/comprovante',
    entrada: vazio,
    saida: z.instanceof(Uint8Array),
  },
  /** Envio dos bytes, uma vez só: a política do repositório recusa sobrescrita e só admite
   * quem lançou a despesa, enquanto o objeto ainda não existe. */
  enviarComprovante: {
    metodo: 'POST',
    caminho: '/api/financeiro/casos/:paciente_id/despesas/:despesa_id/comprovante',
    entrada: envioComprovanteSchema,
    saida: z.object({ enviado: z.literal(true) }).strict(),
  },
  consultarApuracao: {
    metodo: 'GET',
    caminho: '/api/financeiro/apuracoes',
    entrada: consultarApuracaoSchema,
    saida: apuracaoRepasseSchema,
  },
} as const;
