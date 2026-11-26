import { z } from 'zod';
import {
  confirmarRevisaoTranscricaoSchema,
  registrarTranscricaoSchema,
  transcricaoSchema,
} from './transcricao.ts';

const vazio = z.object({}).strict();

/** Contrato HTTP isolado da fatia de transcrição (FR-010); a exposição depende da flag
 * própria e das provas de autorização, como nas demais fatias.
 *
 * `ouvir` devolve o áudio original embutido na resposta. Não há URL de arquivo: um
 * endereço de mídia atravessaria a autorização da aplicação e sobreviveria à exclusão.
 * `excluir` remove o ÁUDIO, não o registro — texto revisado, autoria e histórico ficam. */
export const transcricaoHttp = {
  registrar: {
    metodo: 'POST',
    caminho: '/api/pacientes/:paciente_id/transcricoes',
    entrada: registrarTranscricaoSchema,
    saida: transcricaoSchema,
  },
  ouvir: {
    metodo: 'GET',
    caminho: '/api/pacientes/:paciente_id/transcricoes/:audio_id',
    entrada: vazio,
    saida: transcricaoSchema,
  },
  confirmarRevisao: {
    metodo: 'PATCH',
    caminho: '/api/pacientes/:paciente_id/transcricoes/:audio_id',
    entrada: confirmarRevisaoTranscricaoSchema,
    saida: transcricaoSchema,
  },
  excluirAudio: {
    metodo: 'DELETE',
    caminho: '/api/pacientes/:paciente_id/transcricoes/:audio_id',
    entrada: vazio,
    saida: transcricaoSchema,
  },
} as const;
