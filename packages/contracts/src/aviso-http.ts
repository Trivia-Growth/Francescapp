import { z } from 'zod';
import { listaAvisosSchema, marcarAvisoLidoSchema } from './aviso.ts';

const vazio = z.object({}).strict();

/** Contrato HTTP isolado dos avisos no aplicativo (FR-072).
 *
 * Duas rotas só, e nenhuma delas é por paciente: o aviso é da PESSOA autenticada, e o
 * caso aparece dentro do item quando aplicável. Marcar como lido devolve a lista
 * recalculada para que o indicador não seja inferido pela tela.
 *
 * Não existe rota de envio, de token de dispositivo ou de assinatura de canal externo —
 * a decisão de 0.3 é o sino dentro do aplicativo e nada mais. */
export const avisoHttp = {
  listar: {
    metodo: 'GET',
    caminho: '/api/avisos',
    entrada: vazio,
    saida: listaAvisosSchema,
  },
  marcarLido: {
    metodo: 'POST',
    caminho: '/api/avisos/leitura',
    entrada: marcarAvisoLidoSchema,
    saida: listaAvisosSchema,
  },
} as const;
