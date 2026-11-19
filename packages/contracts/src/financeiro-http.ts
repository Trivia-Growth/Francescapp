import { z } from 'zod';
import {
  apuracaoRepasseSchema,
  consultarApuracaoSchema,
  despesaSchema,
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
    saida: despesaSchema,
  },
  consultarComprovante: {
    metodo: 'GET',
    caminho: '/api/financeiro/despesas/:despesa_id/comprovante',
    entrada: vazio,
    saida: z.instanceof(Uint8Array),
  },
  consultarApuracao: {
    metodo: 'GET',
    caminho: '/api/financeiro/apuracoes',
    entrada: consultarApuracaoSchema,
    saida: apuracaoRepasseSchema,
  },
} as const;
