// @vitest-environment jsdom
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import type { ArquivoItemExportacao, Exportacao } from '../packages/contracts/src/exportacao.js';
import { reunirAnexosDaExportacao, type BytesDeArquivo } from './anexos-exportacao.js';
import { FalhaApi } from './api.js';
import {
  FalhaPacoteExportacao,
  montarBytesPacoteExportacao,
  montarResumoHtml,
  RESERVA_INDICE_PACOTE_EXPORTACAO,
  TAMANHO_MAXIMO_PACOTE_EXPORTACAO,
} from './pacote-exportacao.js';

/** FR-033: estes testes cobrem a reunião dos BYTES no navegador. O que importa provar é que
 * um anexo que não vem não derruba o pacote, que nada parcial entra, e que autorização
 * perdida no meio não entrega byte nenhum. Dados são fictícios. */

const PACIENTE = '2c9e1e16-33d1-4740-b428-ab75a4c6c937';

const bytes = (texto: string) => new TextEncoder().encode(texto) as Uint8Array<ArrayBuffer>;

function itemComArquivo(registroId: string, nome: string | null = null) {
  return {
    fonte: 'documento' as const,
    registro_id: registroId,
    versao: 1,
    tipo_evento: 'registro' as const,
    autor_usuario_id: null,
    registrado_em: '2026-11-11T09:00:00.000Z',
    aconteceu_em: null,
    disponibilidade: 'incluido' as const,
    motivo_indisponibilidade: null,
    arquivo: {
      origem: 'documento' as const,
      id: registroId,
      nome,
      mime: null,
      tamanho_bytes: null,
    },
  };
}

function exportacaoCom(itens: Exportacao['itens']): Exportacao {
  return {
    id: '3f1d9f4e-0b2a-4c7d-9a1e-2b3c4d5e6f70',
    finalidade: 'encerramento_uso',
    criado_em: '2026-11-13T12:00:00.000Z',
    ator_usuario_id: '11111111-1111-4111-8111-111111111111',
    terceiros_reduzidos: false,
    itens,
    entregas: [],
  };
}

const ID_A = '33333333-3333-4333-8333-333333333333';
const ID_B = '44444444-4444-4444-8444-444444444444';

it('reúne os bytes do anexo recuperado e o ZIP real os devolve inteiros', async () => {
  const conteudo = bytes('laudo fictício com acento: ção');
  const baixar = vi.fn(async () => ({ bytes: conteudo, mime: 'application/pdf' }));
  const reuniao = await reunirAnexosDaExportacao(
    PACIENTE,
    exportacaoCom([itemComArquivo(ID_A)]),
    baixar,
  );
  expect(baixar).toHaveBeenCalledTimes(1);
  expect(reuniao.naoRecuperados).toBe(0);
  expect(reuniao.anexos).toHaveLength(1);

  const pasta = mkdtempSync(join(tmpdir(), 'ffcm-anexos-'));
  try {
    const caminho = join(pasta, 'pacote.zip');
    writeFileSync(
      caminho,
      Buffer.from(
        montarBytesPacoteExportacao({
          exportacao: reuniao.exportacao,
          pacienteRotulo: 'Pessoa Fictícia',
          anexos: reuniao.anexos,
          geradoEm: new Date('2026-11-13T12:00:00Z'),
        }),
      ),
    );
    const listagem = execFileSync('unzip', ['-Z1', caminho], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .sort();
    expect(listagem).toEqual(['anexos/documento-33333333.pdf', 'dados.json', 'resumo.html']);
    execFileSync('unzip', ['-qq', '-o', caminho, '-d', pasta]);
    // Comparação por valor: `Uint8Array` do Node e do jsdom são realms diferentes.
    expect(Array.from(readFileSync(join(pasta, 'anexos/documento-33333333.pdf')))).toEqual(
      Array.from(conteudo),
    );
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

it('anexo que falha vira indisponível com motivo e o pacote continua válido', async () => {
  const baixar = vi.fn(async (_paciente: string, arquivo: ArquivoItemExportacao) => {
    if (arquivo.id === ID_B) throw new FalhaApi('servico_indisponivel');
    return { bytes: bytes('ok'), mime: null } satisfies BytesDeArquivo;
  });
  const reuniao = await reunirAnexosDaExportacao(
    PACIENTE,
    exportacaoCom([itemComArquivo(ID_A), itemComArquivo(ID_B)]),
    baixar,
  );
  expect(reuniao.naoRecuperados).toBe(1);
  expect(reuniao.anexos).toHaveLength(1);
  const falhou = reuniao.exportacao.itens.find((item) => item.registro_id === ID_B);
  expect(falhou?.disponibilidade).toBe('indisponivel');
  expect(falhou?.motivo_indisponibilidade).toBe('anexo_nao_recuperado');
  // O pacote é montado assim mesmo, e declara a ausência em vez de escondê-la.
  const html = montarResumoHtml({
    exportacao: reuniao.exportacao,
    pacienteRotulo: 'Pessoa Fictícia',
    anexos: reuniao.anexos,
  });
  expect(html).toContain('anexo não recuperado');
  expect(
    montarBytesPacoteExportacao({
      exportacao: reuniao.exportacao,
      pacienteRotulo: 'Pessoa Fictícia',
      anexos: reuniao.anexos,
      geradoEm: new Date('2026-11-13T12:00:00Z'),
    }).length,
  ).toBeGreaterThan(0);
});

it('anexo acima do teto da fatia é recusado sem conteúdo parcial', async () => {
  // 5 MiB passa do teto de documento (4 MiB); o pacote não pode levar nem um pedaço.
  const grande = new Uint8Array(5 * 1024 * 1024) as Uint8Array<ArrayBuffer>;
  const reuniao = await reunirAnexosDaExportacao(
    PACIENTE,
    exportacaoCom([itemComArquivo(ID_A)]),
    async () => ({ bytes: grande, mime: null }),
  );
  expect(reuniao.anexos).toHaveLength(0);
  expect(reuniao.naoRecuperados).toBe(1);
  expect(reuniao.exportacao.itens[0]?.motivo_indisponibilidade).toBe('anexo_nao_recuperado');
});

it('anexo vazio também não entra como arquivo de zero byte', async () => {
  const reuniao = await reunirAnexosDaExportacao(
    PACIENTE,
    exportacaoCom([itemComArquivo(ID_A)]),
    async () => ({ bytes: new Uint8Array(0) as Uint8Array<ArrayBuffer>, mime: null }),
  );
  expect(reuniao.anexos).toHaveLength(0);
  expect(reuniao.naoRecuperados).toBe(1);
});

it('autorização revogada durante a montagem não entrega bytes', async () => {
  const baixar = vi.fn(async (_paciente: string, arquivo: ArquivoItemExportacao) => {
    if (arquivo.id === ID_B) throw new FalhaApi('nao_autenticado', 401);
    return { bytes: bytes('primeiro'), mime: null } satisfies BytesDeArquivo;
  });
  await expect(
    reunirAnexosDaExportacao(
      PACIENTE,
      exportacaoCom([itemComArquivo(ID_A), itemComArquivo(ID_B)]),
      baixar,
    ),
  ).rejects.toBeInstanceOf(FalhaApi);
  // Nenhum pacote foi devolvido: a rejeição é o único resultado possível.
  expect(baixar).toHaveBeenCalledTimes(2);
});

it('dois anexos de mesmo nome são desduplicados dentro do ZIP', async () => {
  const reuniao = await reunirAnexosDaExportacao(
    PACIENTE,
    exportacaoCom([itemComArquivo(ID_A, 'exame.pdf'), itemComArquivo(ID_B, 'exame.pdf')]),
    async () => ({ bytes: bytes('x'), mime: null }),
  );
  const pasta = mkdtempSync(join(tmpdir(), 'ffcm-anexos-'));
  try {
    const caminho = join(pasta, 'pacote.zip');
    writeFileSync(
      caminho,
      Buffer.from(
        montarBytesPacoteExportacao({
          exportacao: reuniao.exportacao,
          pacienteRotulo: 'Pessoa Fictícia',
          anexos: reuniao.anexos,
          geradoEm: new Date('2026-11-13T12:00:00Z'),
        }),
      ),
    );
    expect(
      execFileSync('unzip', ['-Z1', caminho], { encoding: 'utf8' })
        .split('\n')
        .filter(Boolean)
        .sort(),
    ).toEqual(['anexos/2-exame.pdf', 'anexos/exame.pdf', 'dados.json', 'resumo.html']);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

it('pacote que excede o teto total é recusado antes de montar', () => {
  const metade = new Uint8Array(TAMANHO_MAXIMO_PACOTE_EXPORTACAO - 1) as Uint8Array<ArrayBuffer>;
  expect(() =>
    montarBytesPacoteExportacao({
      exportacao: exportacaoCom([]),
      pacienteRotulo: 'Pessoa Fictícia',
      anexos: [
        { nome: 'a.bin', conteudo: metade },
        { nome: 'b.bin', conteudo: metade },
      ],
      geradoEm: new Date('2026-11-13T12:00:00Z'),
    }),
  ).toThrow(FalhaPacoteExportacao);
});

it('a reunião orça com a reserva do índice e o pacote ainda monta', async () => {
  const quatroMiB = new Uint8Array(4 * 1024 * 1024) as Uint8Array<ArrayBuffer>;
  const itens = Array.from({ length: 17 }, (_, indice) =>
    itemComArquivo(`3333333${indice.toString(16)}-3333-4333-8333-333333333333`),
  );
  const reuniao = await reunirAnexosDaExportacao(PACIENTE, exportacaoCom(itens), async () => ({
    bytes: quatroMiB,
    mime: null,
  }));
  // O orçamento dos anexos é o teto total MENOS a reserva de `resumo.html` e `dados.json`:
  // 63 MiB cabem 15 arquivos de 4 MiB. Os dois restantes não entram e são declarados.
  const cabem = Math.floor(
    (TAMANHO_MAXIMO_PACOTE_EXPORTACAO - RESERVA_INDICE_PACOTE_EXPORTACAO) / (4 * 1024 * 1024),
  );
  expect(reuniao.anexos).toHaveLength(cabem);
  expect(reuniao.naoRecuperados).toBe(17 - cabem);
  // O ponto do orçamento: o que a reunião aceitou tem de montar de verdade. Sem a reserva,
  // este montar estouraria o teto depois de todos os downloads já terem acontecido.
  const pacote = montarBytesPacoteExportacao({
    exportacao: reuniao.exportacao,
    pacienteRotulo: 'Pessoa Fictícia',
    anexos: reuniao.anexos,
    geradoEm: new Date('2026-11-13T12:00:00Z'),
  });
  expect(pacote.length).toBeGreaterThan(cabem * 4 * 1024 * 1024);
  expect(pacote.length).toBeLessThanOrEqual(TAMANHO_MAXIMO_PACOTE_EXPORTACAO);
});
