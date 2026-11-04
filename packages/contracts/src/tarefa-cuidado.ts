import { z } from 'zod';
import { uuidSchema } from './comum.ts';
import { campoCifradoSchema } from './rpc.ts';

const texto = z.string().trim().min(1).max(4000);
export const tarefaCuidadoSchema = z
  .object({
    responsavel: texto,
    prazo: z.iso.date(),
    prioridade: z.enum(['baixa', 'media', 'alta']),
    estado: z.enum(['pendente', 'em_andamento', 'concluida', 'cancelada']),
    acaoRealizada: texto.optional(),
    justificativa: texto.optional(),
  })
  .strict()
  .refine(
    (tarefa) => tarefa.estado !== 'concluida' || !!tarefa.acaoRealizada || !!tarefa.justificativa,
  );
export const conteudoTarefaSchema = z
  .object({ tarefa: tarefaCuidadoSchema, ator_usuario_id: uuidSchema, data: z.iso.datetime() })
  .strict();
const registro = z
  .object({
    registro_id: uuidSchema,
    tarefa_id: uuidSchema,
    paciente_id: uuidSchema,
    versao: z.number().int().positive().max(2147483647),
    conteudo: campoCifradoSchema,
  })
  .strict();
export const respostaTarefaPrivadaSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      dados: z.union([registro, z.array(registro)]),
      request_id: uuidSchema,
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      erro: z.object({ codigo: z.enum(['sem_permissao', 'conflito']) }).strict(),
      request_id: uuidSchema,
    })
    .strict(),
]);
