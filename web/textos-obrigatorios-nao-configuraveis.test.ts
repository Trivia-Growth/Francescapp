import { existsSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

/** FR-084, cenário "Texto que descreve controle não é editável".
 *
 * A customização pelo Administrador vale para vocabulário, rótulo, limite operacional e
 * texto institucional de marca. NÃO vale para:
 *
 *  - ressalva clínica obrigatória ("sem interpretação clínica automática"), que existe para
 *    limitar responsabilidade clínica;
 *  - aviso que descreve QUEM LÊ um conteúdo, que é a única coisa que a pessoa tem antes de
 *    escrever para decidir se escreve;
 *  - texto de consentimento, inclusive a retenção de 90 dias da localização — ela não é
 *    parâmetro, é a promessa que a pessoa aceitou e que é impressa no documento. Torná-la
 *    editável permitiria reter geolocalização além do consentido, retroativamente.
 *
 * Este teste falha se algum desses textos sumir OU virar configuração: a presença do
 * literal no código é o que garante que ele não veio do banco. Estende para as outras
 * superfícies a garantia que `web/plano-crise.test.ts` já dá para dois deles. */

function lerModulo(modulo: string): string {
  const candidatos = ['ts', 'tsx']
    .map((extensao) => new URL(`../${modulo}.${extensao}`, import.meta.url))
    .filter((caminho) => existsSync(caminho));
  expect(candidatos, `O módulo ${modulo} deve ter exatamente um arquivo fonte`).toHaveLength(1);
  return readFileSync(candidatos[0], 'utf8');
}

const OBRIGATORIOS: readonly { arquivo: string; trecho: string }[] = [
  // FR-020 — avisos do plano de crise.
  {
    arquivo: 'web/plano-crise',
    trecho:
      'O diário não garante resposta imediata. Em emergência, procure os contatos de urgência listados aqui.',
  },
  {
    arquivo: 'web/plano-crise',
    trecho:
      'A case manager coordena o cuidado e não emite conduta clínica por assumir a coordenação.',
  },
  // Ressalvas de "sem interpretação clínica automática".
  {
    arquivo: 'web/turno-execucao-editor',
    trecho:
      'O sistema registra o valor informado, sem interpretar gravidade ou recomendar conduta.',
  },
  {
    arquivo: 'web/turno-execucao-editor',
    trecho:
      'Transcreva uma prescrição externa já existente. Nenhuma dose, via ou decisão clínica é sugerida pelo sistema.',
  },
  {
    arquivo: 'web/turno-execucao-editor',
    trecho:
      'Observações registradas sem avaliação automática de adequação, gravidade ou recomendação.',
  },
  {
    arquivo: 'netlify/functions/_shared/turno-execucao-pdf',
    trecho: 'Dados registrados e declarados. Sem interpretação clínica automática.',
  },
  // Aviso de audiência do diário.
  {
    arquivo: 'web/diario',
    trecho: 'O retorno a um relato da família é sempre visto por quem o escreveu, além da equipe.',
  },
  {
    arquivo: 'web/diario',
    trecho: 'Ao publicar, este registro ficará visível para:',
  },
  // Consentimento da localização, com a retenção que foi consentida.
  {
    arquivo: 'web/turno-execucao-localizacao',
    trecho: 'Retenção: 90 dias após o turno.',
  },
  {
    arquivo: 'web/turno-execucao-localizacao',
    trecho: 'Localização é declarada pelo aparelho, sem comprovar presença.',
  },
];

it('mantém como constante de código todo texto que descreve controle, audiência ou consentimento', () => {
  const ausentes = OBRIGATORIOS.filter(
    ({ arquivo, trecho }) => !lerModulo(arquivo).includes(trecho),
  ).map(({ arquivo, trecho }) => `${arquivo}: ${trecho.slice(0, 50)}…`);
  expect(ausentes).toEqual([]);
});

it('não deixa nenhum desses textos ser lido de uma chave de configuração', () => {
  // Um leitor de configuração no mesmo arquivo não é, por si, defeito — `documentos.ts` lê
  // categorias e exibe avisos fixos. O que não pode é a chave acabar em `.ativo`/`.texto`
  // de uma dessas ressalvas. A forma econômica de travar isso é exigir que os arquivos de
  // consentimento e de ressalva clínica não chamem leitor de configuração nenhum.
  const leitores = /(?:textoConfigurado|listaConfigurada|carregarConfiguracaoServidor)\s*\(/;
  const comLeitor = [
    'web/plano-crise',
    'web/turno-execucao-editor',
    'web/turno-execucao-localizacao',
    'netlify/functions/_shared/turno-execucao-pdf',
  ].filter((arquivo) => leitores.test(lerModulo(arquivo)));
  expect(comLeitor).toEqual([]);
});
