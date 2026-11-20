import type { z } from 'zod';
import {
  turnoExecucaoHttp,
  TAMANHO_MAXIMO_ANEXO_TURNO,
  TAMANHO_MAXIMO_PDF_TURNO,
} from '../packages/contracts/src/turno-execucao-http.ts';
import {
  chaveIdempotenciaSchema,
  erroRespostaSchema,
  sucessoRespostaSchema,
  uuidSchema,
} from '../packages/contracts/src/comum.ts';
import { statusErroHttp } from '../packages/contracts/src/erros.ts';
import { FalhaApi } from './api.ts';

type Operacao = keyof typeof turnoExecucaoHttp;
type Entrada<K extends Operacao> = z.input<(typeof turnoExecucaoHttp)[K]['entrada']>;
type Saida<K extends Operacao> = z.output<(typeof turnoExecucaoHttp)[K]['saida']>;
type Identidade = { usuario_id: string; session_id: string };
export type ArquivoTurno = { bytes: Uint8Array; tipo: string; nome: string };

/** DTO público somente. Nenhuma chave, cifra, atestado ou autoridade é escolhida aqui. */
export function criarServicoTurnoExecucaoHttp(
  pacienteId: string,
  identidadeAtual: () => Identidade | null,
) {
  const paciente = uuidSchema.parse(pacienteId).toLowerCase();
  const inicial = identidadeAtual();
  const identidade = inicial ? { ...inicial } : null;
  const controle = new AbortController();
  function conferir() {
    const atual = identidadeAtual();
    if (
      controle.signal.aborted ||
      !atual ||
      !identidade ||
      atual.usuario_id !== identidade.usuario_id ||
      atual.session_id !== identidade.session_id
    )
      throw new FalhaApi('nao_autenticado', 401);
    return atual;
  }
  async function solicitar<K extends Operacao>(
    operacao: K,
    entrada: Entrada<K>,
    chave?: string,
    anexoId?: string,
  ): Promise<Saida<K> | ArquivoTurno> {
    const rota = turnoExecucaoHttp[operacao];
    const atual = conferir();
    const dados = rota.entrada.parse(entrada);
    const mutacao = rota.metodo === 'POST';
    if (mutacao) chaveIdempotenciaSchema.parse(chave);
    const headers = new Headers({
      Accept:
        operacao === 'pdf' || operacao === 'exportarLocalizacao' || operacao === 'baixarAnexo'
          ? 'application/pdf, image/jpeg, image/png, image/webp, application/json'
          : 'application/json',
      'x-sessao': uuidSchema.parse(atual.session_id),
    });
    let modo: string | null;
    let fluxo: string | null;
    try {
      modo = sessionStorage.getItem('modo-acesso');
      const campo =
        modo === 'interno'
          ? 'fluxo-interno'
          : modo === 'tecnica'
            ? 'fluxo-tecnico'
            : modo === 'familiar'
              ? 'fluxo-familiar'
              : modo === 'google'
                ? 'fluxo-google'
                : null;
      fluxo = campo ? sessionStorage.getItem(campo) : null;
    } catch {
      throw new FalhaApi('nao_autenticado', 401);
    }
    if (!fluxo || !/^[A-Za-z0-9_-]{22}$/.test(fluxo)) throw new FalhaApi('nao_autenticado', 401);
    headers.set('x-fluxo', fluxo);
    if (chave) headers.set('x-chave-idempotencia', chave);
    if (mutacao) headers.set('Content-Type', 'application/json');
    let caminho = rota.caminho.replace(':paciente_id', encodeURIComponent(paciente));
    if (caminho.includes(':anexo_id'))
      caminho = caminho.replace(':anexo_id', encodeURIComponent(uuidSchema.parse(anexoId)));
    if (!mutacao) {
      const parametros = new URLSearchParams();
      for (const [campo, valor] of Object.entries(dados))
        if (valor !== undefined && valor !== null) parametros.set(campo, String(valor));
      if (parametros.size) caminho += `?${parametros}`;
    }
    let enviada = false;
    try {
      const sinal = AbortSignal.any([controle.signal, AbortSignal.timeout(25_000)]);
      if (sinal.aborted) throw new Error();
      enviada = mutacao;
      const resposta = await fetch(caminho, {
        method: rota.metodo,
        headers,
        ...(mutacao ? { body: JSON.stringify(dados) } : {}),
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: sinal,
      });
      const binario =
        resposta.ok &&
        (operacao === 'pdf' || operacao === 'exportarLocalizacao' || operacao === 'baixarAnexo');
      const tipo = resposta.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
      if (
        !resposta.body ||
        (!binario && tipo !== 'application/json') ||
        (binario &&
          !(operacao === 'pdf' || operacao === 'exportarLocalizacao'
            ? tipo === 'application/pdf'
            : ['image/jpeg', 'image/png', 'image/webp'].includes(tipo ?? '')))
      )
        throw new Error();
      const leitor = resposta.body.getReader();
      const partes: Uint8Array[] = [];
      let tamanho = 0;
      const limite = binario
        ? operacao === 'pdf' || operacao === 'exportarLocalizacao'
          ? TAMANHO_MAXIMO_PDF_TURNO
          : TAMANHO_MAXIMO_ANEXO_TURNO
        : 2 * 1024 * 1024;
      try {
        while (true) {
          if (sinal.aborted) throw new Error();
          let abortar!: () => void;
          const interrupcao = new Promise<never>((_, rejeitar) => {
            abortar = () => rejeitar(new Error('Solicitação interrompida.'));
            sinal.addEventListener('abort', abortar, { once: true });
          });
          let parte: ReadableStreamReadResult<Uint8Array>;
          try {
            parte = await Promise.race([leitor.read(), interrupcao]);
          } finally {
            sinal.removeEventListener('abort', abortar);
          }
          if (parte.done) break;
          tamanho += parte.value.byteLength;
          if (tamanho > limite) throw new Error();
          partes.push(parte.value);
        }
      } catch (erro) {
        void leitor.cancel().catch(() => {});
        throw erro;
      } finally {
        leitor.releaseLock();
      }
      const bytes = new Uint8Array(tamanho);
      let offset = 0;
      for (const parte of partes) {
        bytes.set(parte, offset);
        offset += parte.length;
      }
      conferir();
      if (mutacao && resposta.status === 202) throw new Error();
      if (binario) {
        if (!bytes.length) throw new Error();
        rota.saida.parse(bytes);
        return {
          bytes,
          tipo: tipo ?? 'application/octet-stream',
          nome:
            operacao === 'pdf' || operacao === 'exportarLocalizacao'
              ? 'relatorio-cuidado.pdf'
              : tipo === 'image/png'
                ? 'anexo-turno.png'
                : tipo === 'image/webp'
                  ? 'anexo-turno.webp'
                  : 'anexo-turno.jpg',
        };
      }
      const envelope: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (!resposta.ok) {
        const erro = erroRespostaSchema.parse(envelope).erro;
        if (statusErroHttp[erro.codigo] !== resposta.status) throw new Error();
        throw new FalhaApi(erro.codigo, resposta.status, erro.codigo === 'pendencia_externa');
      }
      const recebido = sucessoRespostaSchema(rota.saida).parse(envelope).dados;
      if (
        recebido &&
        typeof recebido === 'object' &&
        'paciente_id' in recebido &&
        recebido.paciente_id !== paciente
      )
        throw new Error();
      if (
        recebido &&
        typeof recebido === 'object' &&
        'itens' in recebido &&
        Array.isArray(recebido.itens) &&
        recebido.itens.some(
          (item: unknown) =>
            item !== null &&
            typeof item === 'object' &&
            'paciente_id' in item &&
            item.paciente_id !== paciente,
        )
      )
        throw new Error();
      return recebido as Saida<K>;
    } catch (erro) {
      if (erro instanceof FalhaApi) throw erro;
      throw new FalhaApi(enviada ? 'pendencia_externa' : 'servico_indisponivel', 0, enviada);
    }
  }
  const json = async <K extends Operacao>(operacao: K, entrada: Entrada<K>, chave?: string) => {
    const recebido = await solicitar(operacao, entrada, chave);
    return turnoExecucaoHttp[operacao].saida.parse(recebido) as Saida<K>;
  };
  const binario = async <K extends 'pdf' | 'baixarAnexo' | 'exportarLocalizacao'>(
    operacao: K,
    entrada: Entrada<K>,
    chave?: string,
    anexoId?: string,
  ) => {
    const recebido = await solicitar(operacao, entrada, chave, anexoId);
    if (!recebido || typeof recebido !== 'object' || !('bytes' in recebido))
      throw new FalhaApi('servico_indisponivel');
    return recebido as ArquivoTurno;
  };
  return {
    consultar: async (entrada: Entrada<'consultar'>) => {
      const pagina = await json('consultar', entrada);
      if (
        pagina.itens.some(
          (item) =>
            item.conteudo.classe !== entrada.classe ||
            (entrada.registro_id !== undefined && item.registro_id !== entrada.registro_id) ||
            (entrada.turno_id !== undefined && item.turno_id !== entrada.turno_id),
        )
      )
        throw new FalhaApi('servico_indisponivel');
      return pagina;
    },
    reconciliar: (entrada: Entrada<'reconciliar'>, chave: string) =>
      json('reconciliar', entrada, chave),
    reconhecer: (entrada: Entrada<'reconhecer'>, chave: string) =>
      json('reconhecer', entrada, chave),
    gravar: (entrada: Entrada<'gravar'>, chave: string) => json('gravar', entrada, chave),
    catalogo: () => json('catalogo', {}),
    prescricoesVigentes: (entrada: Entrada<'prescricoesVigentes'> = {}) =>
      json('prescricoesVigentes', entrada),
    configurarCatalogo: (entrada: Entrada<'configurarCatalogo'>, chave: string) =>
      json('configurarCatalogo', entrada, chave),
    candidatosMedicacao: (entrada: Entrada<'candidatosMedicacao'> = {}) =>
      json('candidatosMedicacao', entrada),
    concederMedicacao: (entrada: Entrada<'concederMedicacao'>, chave: string) =>
      json('concederMedicacao', entrada, chave),
    familiares: (entrada: Entrada<'familiares'> = {}) => json('familiares', entrada),
    consultarFundamento: (entrada: Entrada<'consultarFundamento'>) =>
      json('consultarFundamento', entrada),
    gravarFundamento: (entrada: Entrada<'gravarFundamento'>, chave: string) =>
      json('gravarFundamento', entrada, chave),
    consultarConversaoOcorrencia: (entrada: Entrada<'consultarConversaoOcorrencia'>) =>
      json('consultarConversaoOcorrencia', entrada),
    converterOcorrencia: (entrada: Entrada<'converterOcorrencia'>, chave: string) =>
      json('converterOcorrencia', entrada, chave),
    relatorio: async (entrada: Entrada<'relatorio'>) => {
      const relatorio = await json('relatorio', entrada);
      if (
        relatorio.tipo !== entrada.tipo ||
        relatorio.inicio !== entrada.inicio ||
        relatorio.fim !== entrada.fim ||
        (entrada.consulta_id !== undefined && relatorio.consulta_id !== entrada.consulta_id)
      )
        throw new FalhaApi('servico_indisponivel');
      return relatorio;
    },
    consultarPdf: (entrada: Entrada<'consultarPdf'>) => json('consultarPdf', entrada),
    consultarPdfLocalizacao: (entrada: Entrada<'consultarPdfLocalizacao'>) =>
      json('consultarPdfLocalizacao', entrada),
    pdf: (entrada: Entrada<'pdf'>, chave: string) => binario('pdf', entrada, chave),
    consentimento: () => json('consentimento', {}),
    gravarConsentimento: (entrada: Entrada<'gravarConsentimento'>, chave: string) =>
      json('gravarConsentimento', entrada, chave),
    registrarLocalizacao: (entrada: Entrada<'registrarLocalizacao'>, chave: string) =>
      json('registrarLocalizacao', entrada, chave),
    exportarLocalizacao: (entrada: Entrada<'exportarLocalizacao'>, chave: string) =>
      binario('exportarLocalizacao', entrada, chave),
    consultarLocalizacao: (entrada: Entrada<'consultarLocalizacao'>) =>
      json('consultarLocalizacao', entrada),
    anexos: (entrada: Entrada<'anexos'>) => json('anexos', entrada),
    enviarAnexo: (entrada: Entrada<'enviarAnexo'>, chave: string) =>
      json('enviarAnexo', entrada, chave),
    baixarAnexo: (anexoId: string) => binario('baixarAnexo', {}, undefined, anexoId),
    desmontar() {
      controle.abort();
    },
  };
}
export type ServicoTurnoExecucao = ReturnType<typeof criarServicoTurnoExecucaoHttp>;
