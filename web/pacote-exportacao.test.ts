// @vitest-environment jsdom
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import type { Exportacao } from '../packages/contracts/src/exportacao.js';
import {
  crc32,
  montarDadosJson,
  montarBytesPacoteExportacao,
  montarResumoHtml,
  nomeSeguro,
} from './pacote-exportacao.js';

const EXPORTACAO: Exportacao = {
  id: '3f1d9f4e-0b2a-4c7d-9a1e-2b3c4d5e6f70',
  finalidade: 'portabilidade_titular',
  criado_em: '2026-11-13T12:00:00.000Z',
  ator_usuario_id: '11111111-1111-4111-8111-111111111111',
  terceiros_reduzidos: true,
  itens: [
    {
      fonte: 'diario',
      registro_id: '22222222-2222-4222-8222-222222222222',
      versao: 1,
      tipo_evento: 'registro',
      autor_usuario_id: null,
      registrado_em: '2026-11-10T09:00:00.000Z',
      aconteceu_em: '2026-11-09',
      disponibilidade: 'incluido',
      motivo_indisponibilidade: null,
    },
    {
      fonte: 'documento',
      registro_id: '33333333-3333-4333-8333-333333333333',
      versao: 2,
      tipo_evento: 'registro',
      autor_usuario_id: null,
      registrado_em: '2026-11-11T09:00:00.000Z',
      aconteceu_em: null,
      disponibilidade: 'indisponivel',
      motivo_indisponibilidade: 'anexo_nao_recuperado',
    },
  ],
  entregas: [],
};

const entrada = { exportacao: EXPORTACAO, pacienteRotulo: 'Pessoa Fictícia' };

it('calcula CRC32 conforme a referência conhecida', () => {
  // Valor canônico de "123456789", usado como vetor de teste do CRC-32 desde sempre.
  expect(crc32(new TextEncoder().encode('123456789') as Uint8Array<ArrayBuffer>)).toBe(0xcbf43926);
});

it('impede que o nome de um anexo escape da pasta', () => {
  expect(nomeSeguro('../../etc/passwd')).toBe('etc-passwd');
  expect(nomeSeguro('C:\\Windows\\System32\\x.dll')).toBe('C:-Windows-System32-x.dll');
  expect(nomeSeguro('   ')).toBe('anexo');
  expect(nomeSeguro('..')).toBe('anexo');
});

it('escapa conteúdo no resumo em vez de deixá-lo virar marcação', () => {
  const html = montarResumoHtml({
    ...entrada,
    pacienteRotulo: '<script>alert(1)</script>',
  });
  expect(html).not.toContain('<script>alert(1)</script>');
  expect(html).toContain('&lt;script&gt;');
});

it('declara no pacote que a entrega não é prova de recebimento', () => {
  // Decisão de 13/11/2026. Não vale só a tela dizer: quem abrir o arquivo daqui a um ano
  // precisa encontrar a mesma ressalva.
  expect(montarResumoHtml(entrada)).toContain('não comprova recebimento');
  expect(montarDadosJson(entrada)).toContain('não confirma recebimento neste sistema');
});

it('conta o indisponível sem sugerir que existe conteúdo oculto', () => {
  const html = montarResumoHtml(entrada);
  expect(html).toContain('anexo não recuperado');
  expect(html).toContain('não entra neste pacote nem como contagem');
});

it('monta um ZIP que o descompactador do sistema abre e lê', () => {
  const bytes = Buffer.from(
    montarBytesPacoteExportacao({
      ...entrada,
      anexos: [
        {
          nome: '../fuga.txt',
          conteudo: new TextEncoder().encode('conteúdo') as Uint8Array<ArrayBuffer>,
        },
      ],
      geradoEm: new Date('2026-11-13T12:00:00Z'),
    }),
  );
  const pasta = mkdtempSync(join(tmpdir(), 'ffcm-pacote-'));
  try {
    const caminho = join(pasta, 'pacote.zip');
    writeFileSync(caminho, bytes);
    // Prova que o arquivo é um ZIP de verdade, não só bytes que o nosso código sabe ler.
    const listagem = execFileSync('unzip', ['-Z1', caminho], { encoding: 'utf8' });
    expect(listagem.split('\n').filter(Boolean).sort()).toEqual([
      'anexos/fuga.txt',
      'dados.json',
      'resumo.html',
    ]);
    execFileSync('unzip', ['-qq', '-o', caminho, '-d', pasta]);
    const json = JSON.parse(execFileSync('cat', [join(pasta, 'dados.json')], { encoding: 'utf8' }));
    expect(json.formato).toBe('ffcm.exportacao.v1');
    expect(json.exportacao.id).toBe(EXPORTACAO.id);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});
