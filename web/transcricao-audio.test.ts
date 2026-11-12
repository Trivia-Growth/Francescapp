// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { Transcricao } from '../packages/contracts/src/transcricao.ts';
import {
  mimeDoBlob,
  montarTranscricaoAudio,
  type ServicoTranscricao,
} from './transcricao-audio.ts';

const paciente = 'c0000000-0000-4000-8000-000000000003';
const audioId = 'd0000000-0000-4000-8000-000000000004';
const falaFicticia = 'A Fulana fictícia dormiu mal.';

function registroFicticio(parcial: Partial<Transcricao> = {}): Transcricao {
  return {
    audio_id: audioId,
    paciente_id: paciente,
    mime: 'audio/webm',
    duracao_segundos: 4,
    transcricao: falaFicticia,
    modelo: 'openai/whisper-large-v3',
    texto_revisado: null,
    revisao_confirmada_em: null,
    exclusao_estado: 'nao_solicitada',
    exclusao_em: null,
    expira_em: '2026-12-12T12:00:00Z',
    audio_base64: null,
    ...parcial,
  };
}

/** `MediaRecorder` não existe no jsdom; o dublê reproduz só o ciclo que a tela usa. */
function criarGravadorFalso() {
  const instancias: GravadorFalso[] = [];
  class GravadorFalso {
    state: 'inactive' | 'recording' = 'inactive';
    mimeType = 'audio/webm;codecs=opus';
    private ouvintes = new Map<string, ((evento: unknown) => void)[]>();
    constructor() {
      instancias.push(this);
    }
    static isTypeSupported(tipo: string) {
      return tipo.startsWith('audio/webm');
    }
    addEventListener(nome: string, ouvinte: (evento: unknown) => void) {
      this.ouvintes.set(nome, [...(this.ouvintes.get(nome) ?? []), ouvinte]);
    }
    start() {
      this.state = 'recording';
    }
    stop() {
      this.state = 'inactive';
      for (const ouvinte of this.ouvintes.get('dataavailable') ?? [])
        ouvinte({ data: new Blob([new Uint8Array(512).fill(1)], { type: 'audio/webm' }) });
      for (const ouvinte of this.ouvintes.get('stop') ?? []) ouvinte({});
    }
  }
  return { Gravador: GravadorFalso as unknown as typeof MediaRecorder, instancias };
}

function midiaFalsa() {
  return {
    getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] }) as never),
  };
}

function servicoFalso(parcial: Partial<ServicoTranscricao> = {}): ServicoTranscricao {
  return {
    registrar: vi.fn(async () => registroFicticio()),
    ouvir: vi.fn(async () => registroFicticio()),
    confirmarRevisao: vi.fn(async () =>
      registroFicticio({
        texto_revisado: 'texto revisado',
        revisao_confirmada_em: '2026-11-12T12:00:00Z',
        exclusao_estado: 'pendente',
      }),
    ),
    excluirAudio: vi.fn(async () =>
      registroFicticio({
        texto_revisado: 'texto revisado',
        revisao_confirmada_em: '2026-11-12T12:00:00Z',
        exclusao_estado: 'confirmada',
        exclusao_em: '2026-11-12T12:00:05Z',
      }),
    ),
    ...parcial,
  };
}

/** `Blob.arrayBuffer()` do jsdom resolve fora da fila de microtarefas; esperar só por
 * `Promise.resolve()` não alcançaria o fim do fluxo de gravação. */
const esperar = async () => {
  for (let volta = 0; volta < 8; volta += 1)
    await new Promise((resolver) => setTimeout(resolver, 0));
};

describe('relato por áudio', () => {
  it('reconhece só os formatos do contrato', () => {
    expect(mimeDoBlob('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(mimeDoBlob('audio/aiff')).toBeNull();
  });

  it('mantém a alternativa por texto quando não há microfone disponível', () => {
    const raiz = document.createElement('div');
    montarTranscricaoAudio(
      raiz,
      paciente,
      servicoFalso(),
      () => {},
      () => {},
      { midia: undefined, gravador: undefined as unknown as typeof MediaRecorder },
    );
    const botao = raiz.querySelector('button');
    const texto = raiz.querySelector('textarea');
    expect(botao?.disabled).toBe(true);
    expect(texto).not.toBeNull();
    expect(texto?.disabled).toBe(false);
    expect(raiz.querySelector('[role=status]')?.textContent).toContain('Escreva o relato');
  });

  it('informa a permissão negada sem bloquear o relato escrito', async () => {
    const raiz = document.createElement('div');
    const midia = { getUserMedia: vi.fn(async () => Promise.reject(new Error('negado'))) };
    const { Gravador } = criarGravadorFalso();
    montarTranscricaoAudio(
      raiz,
      paciente,
      servicoFalso(),
      () => {},
      () => {},
      { midia: midia as never, gravador: Gravador },
    );
    raiz.querySelector('button')?.click();
    await esperar();
    const status = raiz.querySelector('[role=status]')?.textContent ?? '';
    expect(status).toContain('Sem acesso ao microfone');
    expect(raiz.querySelector('textarea')?.disabled).toBe(false);
    expect(raiz.querySelector('button')?.disabled).toBe(false);
  });

  it('não trata a transcrição automática como revisão concluída', async () => {
    const raiz = document.createElement('div');
    const { Gravador, instancias } = criarGravadorFalso();
    const confirmados: string[] = [];
    const servico = servicoFalso();
    montarTranscricaoAudio(
      raiz,
      paciente,
      servico,
      (texto) => confirmados.push(texto),
      () => {},
      { midia: midiaFalsa() as never, gravador: Gravador },
    );
    raiz.querySelector('button')?.click();
    await esperar();
    instancias[0]?.stop();
    await esperar();
    const texto = raiz.querySelector('textarea');
    expect(texto?.value).toBe(falaFicticia);
    // O rascunho chegou, mas nada foi confirmado nem publicado ainda.
    expect(confirmados).toEqual([]);
    expect(servico.confirmarRevisao).not.toHaveBeenCalled();
    const status = raiz.querySelector('[role=status]')?.textContent ?? '';
    expect(status).toContain('não conta como revisada');
    const confirmar = [...raiz.querySelectorAll('button')].find(
      (botao) => botao.textContent === 'Confirmar revisão',
    );
    expect(confirmar?.hidden).toBe(false);
  });

  it('confirma a revisão, pede a exclusão e informa o descarte concluído', async () => {
    const raiz = document.createElement('div');
    const { Gravador, instancias } = criarGravadorFalso();
    const confirmados: string[] = [];
    const servico = servicoFalso();
    montarTranscricaoAudio(
      raiz,
      paciente,
      servico,
      (texto) => confirmados.push(texto),
      () => {},
      { midia: midiaFalsa() as never, gravador: Gravador },
    );
    raiz.querySelector('button')?.click();
    await esperar();
    instancias[0]?.stop();
    await esperar();
    const texto = raiz.querySelector('textarea');
    if (texto) texto.value = 'A Fulana fictícia dormiu mal, segundo a mãe.';
    const confirmar = [...raiz.querySelectorAll('button')].find(
      (botao) => botao.textContent === 'Confirmar revisão',
    );
    confirmar?.click();
    await esperar();
    expect(confirmados).toEqual(['A Fulana fictícia dormiu mal, segundo a mãe.']);
    expect(servico.excluirAudio).toHaveBeenCalled();
    const avisos = [...raiz.querySelectorAll('[role=status]')]
      .map((elemento) => elemento.textContent ?? '')
      .join(' ');
    expect(avisos).toContain('áudio original excluído');
  });

  it('não apresenta exclusão pendente como descarte concluído', async () => {
    const raiz = document.createElement('div');
    const { Gravador, instancias } = criarGravadorFalso();
    const servico = servicoFalso({
      excluirAudio: vi.fn(async () => Promise.reject(new Error('armazenamento fora'))),
    });
    montarTranscricaoAudio(
      raiz,
      paciente,
      servico,
      () => {},
      () => {},
      { midia: midiaFalsa() as never, gravador: Gravador },
    );
    raiz.querySelector('button')?.click();
    await esperar();
    instancias[0]?.stop();
    await esperar();
    const texto = raiz.querySelector('textarea');
    if (texto) texto.value = 'texto revisado fictício';
    [...raiz.querySelectorAll('button')]
      .find((botao) => botao.textContent === 'Confirmar revisão')
      ?.click();
    await esperar();
    const avisos = [...raiz.querySelectorAll('[role=status]')]
      .map((elemento) => elemento.textContent ?? '')
      .join(' ');
    expect(avisos).toContain('pendente');
    expect(avisos).not.toContain('áudio original excluído');
    // A regularização fica ao alcance do autor, e repetir é seguro.
    const regularizar = [...raiz.querySelectorAll('button')].find(
      (botao) => botao.textContent === 'Tentar excluir o áudio novamente',
    );
    expect(regularizar?.hidden).toBe(false);
  });
});
