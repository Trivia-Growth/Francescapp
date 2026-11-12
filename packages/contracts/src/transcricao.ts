import { z } from 'zod';
import { uuidSchema } from './comum.ts';
import { campoCifradoSchema } from './rpc.ts';

/** FR-010 — transcrever áudio em português para rascunho editável, permitir ouvir o
 * original e revisar texto e audiência antes de publicar.
 *
 * Decisões que o contrato precisa carregar:
 * 1. A transcrição automática NÃO é revisão. `revisao_confirmada_em` só é preenchido por
 *    ato humano explícito (delta `fundar-identidade-e-seguranca-backend`).
 * 2. O original fica ouvível enquanto a revisão não foi confirmada; depois dela a exclusão
 *    é SOLICITADA e tem estado verificável — `pendente`, `confirmada` ou `falha`. Nunca
 *    apresentamos indisponibilidade de armazenamento como descarte concluído.
 * 3. "Não transcrever sessões completas por padrão": o teto de duração é configuração do
 *    sistema (`ffcm.transcricao.duracao_maxima_segundos`), com um teto absoluto aqui que a
 *    configuração não pode ultrapassar. */

/** Teto absoluto do áudio aceito, em bytes do arquivo original (antes da cifra).
 *
 * Por que 300_000: o áudio é cifrado em partes de 18 KiB porque a cifra compartilhada
 * limita cada texto cifrado a 32 KiB (`cifra-autenticada.ts`). Depois de cifradas e
 * codificadas, as partes de um áudio de 300 KB ocupam ~535 KB no transporte atestado,
 * que tem teto de 1 MiB (`snapshotCanonicoSchema`). Subir este número estoura o atestado,
 * não só o banco. */
export const AUDIO_BYTES_MAXIMO = 300_000;
/** Bytes do arquivo original por parte cifrada. 18 KiB cifrados cabem em 32 KiB de
 * base64url com folga; ver `campoValido` em `cifra-autenticada.ts`. */
export const AUDIO_BYTES_POR_PARTE = 18_432;
export const AUDIO_PARTES_MAXIMO = 64;
/** Teto absoluto de duração. A configuração do sistema pode baixar, nunca subir. */
export const AUDIO_SEGUNDOS_MAXIMO = 300;

/** Formatos que o navegador produz com `MediaRecorder` e que o provedor aceita. */
export const mimeAudioSchema = z.enum([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
]);
export type MimeAudio = z.output<typeof mimeAudioSchema>;

export const estadoExclusaoAudioSchema = z.enum([
  'nao_solicitada',
  'pendente',
  'confirmada',
  'falha',
]);
export type EstadoExclusaoAudio = z.output<typeof estadoExclusaoAudioSchema>;

/** Base64 padrão (com `+`, `/` e `=`), como `FileReader`/`btoa` produzem no navegador. */
const base64Schema = z
  .string()
  .min(4)
  .max(Math.ceil(AUDIO_BYTES_MAXIMO / 3) * 4)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'áudio fora do formato base64.');

export const textoTranscricaoSchema = z.string().trim().min(1).max(20_000);

/** Envelope do áudio: partes numeradas a partir de 1, na ordem. */
export const audioCifradoSchema = z.array(campoCifradoSchema).min(1).max(AUDIO_PARTES_MAXIMO);

/** O que a tela recebe. O áudio só vem quando é pedido explicitamente para ouvir, e só
 * enquanto existir: depois da exclusão confirmada, `audio_base64` é `null` e o estado diz
 * por quê. Nunca prometemos reprodução futura de áudio apagado. */
export const transcricaoSchema = z
  .object({
    audio_id: uuidSchema,
    paciente_id: uuidSchema,
    mime: mimeAudioSchema,
    duracao_segundos: z.number().int().min(1).max(AUDIO_SEGUNDOS_MAXIMO),
    /** Transcrição automática, como veio do provedor. Não é revisão. */
    transcricao: textoTranscricaoSchema,
    /** Modelo que produziu a transcrição, lido da configuração no momento da chamada.
     * Fica registrado porque trocar de modelo muda a qualidade do rascunho. */
    modelo: z.string().trim().min(1).max(160),
    texto_revisado: textoTranscricaoSchema.nullable(),
    revisao_confirmada_em: z.iso.datetime({ offset: true }).nullable(),
    exclusao_estado: estadoExclusaoAudioSchema,
    exclusao_em: z.iso.datetime({ offset: true }).nullable(),
    /** Prazo do áudio abandonado (30 dias, delta confirmado em 16/10/2026). */
    expira_em: z.iso.datetime({ offset: true }),
    audio_base64: base64Schema.nullable(),
  })
  .strict();
export type Transcricao = z.output<typeof transcricaoSchema>;

export const registrarTranscricaoSchema = z
  .object({
    audio_base64: base64Schema,
    mime: mimeAudioSchema,
    duracao_segundos: z.number().int().min(1).max(AUDIO_SEGUNDOS_MAXIMO),
  })
  .strict();
export type RegistrarTranscricao = z.output<typeof registrarTranscricaoSchema>;

export const confirmarRevisaoTranscricaoSchema = z
  .object({ texto_revisado: textoTranscricaoSchema })
  .strict();

/** Espelha a saída de `api.transcricao_operacao_privada`. O áudio volta em partes
 * cifradas; quem decifra é o servidor, nunca o navegador. */
export const respostaTranscricaoPrivadaSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      dados: z
        .object({
          audio_id: uuidSchema,
          paciente_id: uuidSchema,
          mime: mimeAudioSchema,
          duracao_segundos: z.number().int().min(1).max(AUDIO_SEGUNDOS_MAXIMO),
          transcricao: campoCifradoSchema,
          modelo: z.string().min(1).max(160),
          texto_revisado: campoCifradoSchema.nullable(),
          revisao_confirmada_em: z.iso.datetime({ offset: true }).nullable(),
          exclusao_estado: estadoExclusaoAudioSchema,
          exclusao_em: z.iso.datetime({ offset: true }).nullable(),
          expira_em: z.iso.datetime({ offset: true }),
          audio: audioCifradoSchema.nullable(),
        })
        .strict(),
      request_id: uuidSchema,
      repeticao: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      erro: z
        .object({
          codigo: z.enum(['sem_permissao', 'conflito', 'conflito_idempotencia', 'nao_encontrado']),
        })
        .strict(),
      request_id: uuidSchema,
    })
    .strict(),
]);

/** Quebra o áudio em partes de tamanho fixo. A última parte pode ser menor; nenhuma pode
 * ser vazia, porque a cifra recusa texto vazio. */
export function partirAudio(base64: string): string[] {
  const bytes = base64ParaBytes(base64);
  if (bytes.length === 0 || bytes.length > AUDIO_BYTES_MAXIMO) {
    throw new Error('Áudio fora do tamanho aceito.');
  }
  const partes: string[] = [];
  for (let inicio = 0; inicio < bytes.length; inicio += AUDIO_BYTES_POR_PARTE) {
    partes.push(bytesParaBase64(bytes.subarray(inicio, inicio + AUDIO_BYTES_POR_PARTE)));
  }
  if (partes.length > AUDIO_PARTES_MAXIMO) throw new Error('Áudio fora do tamanho aceito.');
  return partes;
}

/** Junta as partes na ordem recebida. A ligação criptográfica de cada parte já garante a
 * posição; aqui só concatenamos os bytes. */
export function juntarAudio(partes: readonly string[]): string {
  if (partes.length === 0 || partes.length > AUDIO_PARTES_MAXIMO) {
    throw new Error('Áudio fora do tamanho aceito.');
  }
  const blocos = partes.map((parte) => base64ParaBytes(parte));
  const total = blocos.reduce((soma, bloco) => soma + bloco.length, 0);
  if (total === 0 || total > AUDIO_BYTES_MAXIMO) throw new Error('Áudio fora do tamanho aceito.');
  const bytes = new Uint8Array(total);
  let posicao = 0;
  for (const bloco of blocos) {
    bytes.set(bloco, posicao);
    posicao += bloco.length;
  }
  return bytesParaBase64(bytes);
}

export function base64ParaBytes(valor: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(valor) || valor.length % 4 !== 0) {
    throw new Error('Áudio fora do formato base64.');
  }
  const binario = atob(valor);
  const bytes = Uint8Array.from(binario, (caractere) => caractere.charCodeAt(0));
  if (bytesParaBase64(bytes) !== valor) throw new Error('Áudio fora do formato base64.');
  return bytes;
}

export function bytesParaBase64(bytes: Uint8Array): string {
  let binario = '';
  for (let inicio = 0; inicio < bytes.length; inicio += 8192) {
    binario += String.fromCharCode(...bytes.subarray(inicio, inicio + 8192));
  }
  return btoa(binario);
}

/** Teto efetivo de duração: a configuração do sistema manda, limitada pelo teto absoluto.
 * Valor ausente, fora de faixa ou não inteiro cai no padrão, nunca em "sem limite". */
export function duracaoMaximaEfetiva(configurada: unknown, padrao = 90): number {
  if (typeof configurada !== 'number' || !Number.isInteger(configurada) || configurada < 1) {
    return Math.min(padrao, AUDIO_SEGUNDOS_MAXIMO);
  }
  return Math.min(configurada, AUDIO_SEGUNDOS_MAXIMO);
}
