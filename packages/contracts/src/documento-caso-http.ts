import { z } from 'zod';
import {
  conteudoDocumentoSchema,
  documentoCasoSchema,
  metadadoDocumentoSchema,
} from './documento-caso.ts';
import { uuidSchema } from './comum.ts';

const vazio = z.object({}).strict();

/** Corpo de gravação SEM arquivo: muda classificação, audiência ou estado de um anexo que já
 * existe. O `drive_file_id` vem do próprio cliente porque ele acabou de recebê-lo decifrado na
 * consulta — poupar essa ida ao banco não afrouxa nada: o banco revalida vínculo e versão, e a
 * AAD liga o envelope ao paciente, ao registro e à versão. */
export const gravarDocumentoSchema = z
  .object({
    documento_id: uuidSchema,
    versao_esperada: z.number().int().min(0).max(2147483646),
    metadado: metadadoDocumentoSchema,
    conteudo: conteudoDocumentoSchema,
  })
  .strict();

/** Contrato HTTP isolado da fatia de documentos (FR-029 a FR-031); a exposição depende da
 * flag própria e das provas de autorização, como nas demais fatias.
 *
 * O envio COM arquivo não usa JSON: vai em `multipart/form-data` no mesmo caminho, com os
 * campos `metadado`, `conteudo` e `arquivo`. Colocar bytes de exame dentro de um JSON em
 * base64 inflaria o corpo em um terço sem ganhar nada. */
export const documentoCasoHttp = {
  consultar: {
    metodo: 'GET',
    caminho: '/api/pacientes/:paciente_id/documentos',
    entrada: vazio,
    saida: z.object({ documentos: z.array(documentoCasoSchema) }).strict(),
  },
  gravar: {
    metodo: 'POST',
    caminho: '/api/pacientes/:paciente_id/documentos',
    entrada: gravarDocumentoSchema,
    saida: z.object({ documentos: z.array(documentoCasoSchema) }).strict(),
  },
} as const;
