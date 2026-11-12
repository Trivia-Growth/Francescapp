import { z } from 'zod';
import {
  confirmarEntregaSchema,
  registrarExportacaoSchema,
  registroExportacoesSchema,
} from './exportacao.ts';

const vazio = z.object({}).strict();

/** Contrato HTTP isolado da exportação de caso (FR-032/FR-033).
 *
 * As três rotas devolvem o mesmo registro recalculado: depois de registrar uma exportação
 * ou de confirmar entrega, a tela recebe o estado novo sem uma segunda consulta.
 *
 * O que volta é o MANIFESTO — que itens entram, com autoria e datas — e não o conteúdo. O
 * conteúdo continua sendo lido item a item pelos serviços de cada fatia e montado no
 * navegador, que é onde o texto claro já existe para aquele leitor. Nenhum componente de
 * servidor decifra o caso inteiro. */
export const exportacaoHttp = {
  consultar: {
    metodo: 'GET',
    caminho: '/api/pacientes/:paciente_id/exportacoes',
    entrada: vazio,
    saida: registroExportacoesSchema,
  },
  registrar: {
    metodo: 'POST',
    caminho: '/api/pacientes/:paciente_id/exportacoes',
    entrada: registrarExportacaoSchema,
    saida: registroExportacoesSchema,
  },
  confirmar: {
    metodo: 'POST',
    caminho: '/api/pacientes/:paciente_id/exportacoes/entrega',
    entrada: confirmarEntregaSchema,
    saida: registroExportacoesSchema,
  },
} as const;
