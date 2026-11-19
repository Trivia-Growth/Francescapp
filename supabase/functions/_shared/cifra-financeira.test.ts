import { describe, expect, it } from 'vitest';
import {
  metadadosAadFinanceiroSchema,
  type MetadadosAadFinanceiro,
} from '../../../packages/contracts/src/rpc.ts';
import { criarCifraAutenticada, ErroCifraAutenticada, type AadCifra } from './cifra-autenticada.ts';

/** Integração real da cifra do financeiro do cuidado (FR-068, FR-069).
 *
 * Não há dublê aqui: `criarCifraAutenticada` é a função de produção, com o canonicalizador
 * de produção. Nenhum dado real — ids fictícios e textos fictícios.
 *
 * O arquivo prova três coisas distintas:
 *  1. ida e volta de cada campo cifrado das duas tabelas financeiras;
 *  2. que o AAD liga de fato — tabela, registro, campo e formato trocados são recusados, e
 *     texto de uma tabela não decifra no contexto da outra;
 *  3. que nenhum AAD existente mudou de forma, por vetores de teste cuja forma canônica foi
 *     escrita à mão a partir da documentação de cada ramo, sem usar a implementação. */

/** Dados fictícios. */
const valorId = 'f0000000-0000-4000-8000-000000000006';
const outroValorId = 'f0000000-0000-4000-8000-000000000007';
const despesaId = 'd0000000-0000-4000-8000-000000000004';
const outraDespesaId = 'd0000000-0000-4000-8000-000000000005';

function criarCifra() {
  return criarCifraAutenticada({
    keyIdAtiva: 'fin-v1',
    chavesDeCifra: { 'fin-v1': new Uint8Array(32).fill(7) },
    chaveHmac: new Uint8Array(32).fill(23),
  });
}

const aadValor = {
  tabela: 'financeiro.valor_acordado_turno',
  registro_id: valorId,
  campo: 'motivo',
  formato: 1,
} as const satisfies MetadadosAadFinanceiro;

const aadDespesa = {
  tabela: 'financeiro.despesa_lancamento',
  despesa_id: despesaId,
  campo: 'descricao',
  formato: 1,
} as const satisfies MetadadosAadFinanceiro;

const CAMPOS_DESPESA = ['descricao', 'autorizacao', 'motivo_retificacao'] as const;

describe('cifra do financeiro: ida e volta pelo caminho de produção', () => {
  it('recupera o motivo do valor acordado no mesmo AAD', async () => {
    const cifra = criarCifra();
    const campo = await cifra.cifrar('Motivo fictício do reajuste', aadValor);
    expect(campo).toMatchObject({ formato: 1, key_id: 'fin-v1' });
    await expect(cifra.decifrar(campo, aadValor)).resolves.toBe('Motivo fictício do reajuste');
  });

  it.each(CAMPOS_DESPESA)('recupera o campo %s da despesa no mesmo AAD', async (campo) => {
    const cifra = criarCifra();
    const aad = { ...aadDespesa, campo };
    const envelope = await cifra.cifrar(`Texto fictício de ${campo}`, aad);
    await expect(cifra.decifrar(envelope, aad)).resolves.toBe(`Texto fictício de ${campo}`);
  });

  it('os três campos da mesma despesa não são intercambiáveis', async () => {
    const cifra = criarCifra();
    const envelopes = await Promise.all(
      CAMPOS_DESPESA.map(async (campo) => ({
        campo,
        envelope: await cifra.cifrar(`Texto fictício de ${campo}`, { ...aadDespesa, campo }),
      })),
    );
    for (const { campo, envelope } of envelopes) {
      for (const outro of CAMPOS_DESPESA) {
        if (outro === campo) continue;
        await expect(cifra.decifrar(envelope, { ...aadDespesa, campo: outro })).rejects.toThrow(
          ErroCifraAutenticada,
        );
      }
    }
  });

  it('o envelope de uma despesa não decifra no contexto de outra despesa', async () => {
    const cifra = criarCifra();
    const envelope = await cifra.cifrar('Transporte fictício', aadDespesa);
    await expect(
      cifra.decifrar(envelope, { ...aadDespesa, despesa_id: outraDespesaId }),
    ).rejects.toThrow(ErroCifraAutenticada);
  });

  it('o envelope de um valor acordado não decifra no contexto de outro', async () => {
    const cifra = criarCifra();
    const envelope = await cifra.cifrar('Motivo fictício', aadValor);
    await expect(
      cifra.decifrar(envelope, { ...aadValor, registro_id: outroValorId }),
    ).rejects.toThrow(ErroCifraAutenticada);
  });
});

describe('cifra do financeiro: AAD adulterado é recusado', () => {
  it('tabela trocada entre as duas tabelas financeiras', async () => {
    const cifra = criarCifra();
    const doValor = await cifra.cifrar('Motivo fictício', aadValor);
    const daDespesa = await cifra.cifrar('Transporte fictício', aadDespesa);
    // O AAD do valor usa `registro_id`; o da despesa usa `despesa_id`. Trocar só o rótulo da
    // tabela não produz nem AAD válido nem decifra.
    await expect(
      cifra.decifrar(doValor, {
        tabela: 'financeiro.despesa_lancamento',
        despesa_id: valorId,
        campo: 'descricao',
        formato: 1,
      }),
    ).rejects.toThrow(ErroCifraAutenticada);
    await expect(
      cifra.decifrar(daDespesa, {
        tabela: 'financeiro.valor_acordado_turno',
        registro_id: despesaId,
        campo: 'motivo',
        formato: 1,
      }),
    ).rejects.toThrow(ErroCifraAutenticada);
  });

  it('tabela trocada por uma tabela de cuidado de mesma forma', async () => {
    const cifra = criarCifra();
    const envelope = await cifra.cifrar('Motivo fictício', aadValor);
    // `identidade.concessao_equipe` tem exatamente a mesma forma canônica de AAD — tabela,
    // registro_id, campo, formato — e aceita o campo 'motivo'. É a troca mais próxima que
    // existe; a tabela entra na ligação justamente para recusá-la.
    await expect(
      cifra.decifrar(envelope, {
        tabela: 'identidade.concessao_equipe',
        registro_id: valorId,
        campo: 'motivo',
        formato: 1,
      }),
    ).rejects.toThrow(ErroCifraAutenticada);
  });

  it('texto de uma tabela de cuidado não decifra no contexto do financeiro', async () => {
    const cifra = criarCifra();
    const doCuidado = await cifra.cifrar('Pessoa Fictícia', {
      tabela: 'cadastro.paciente',
      registro_id: valorId,
      campo: 'nome',
      formato: 1,
    });
    await expect(cifra.decifrar(doCuidado, aadValor)).rejects.toThrow(ErroCifraAutenticada);
    await expect(cifra.decifrar(doCuidado, { ...aadDespesa, despesa_id: valorId })).rejects.toThrow(
      ErroCifraAutenticada,
    );
  });

  it('campo inexistente na tabela é recusado antes de qualquer operação criptográfica', async () => {
    const cifra = criarCifra();
    await expect(
      cifra.cifrar('Texto fictício', { ...aadDespesa, campo: 'comprovante' } as never),
    ).rejects.toThrow(ErroCifraAutenticada);
    await expect(
      cifra.cifrar('Texto fictício', { ...aadValor, campo: 'descricao' } as never),
    ).rejects.toThrow(ErroCifraAutenticada);
  });

  it('formato trocado é recusado na cifra e na decifra', async () => {
    const cifra = criarCifra();
    await expect(
      cifra.cifrar('Texto fictício', { ...aadDespesa, formato: 2 } as never),
    ).rejects.toThrow(ErroCifraAutenticada);
    const envelope = await cifra.cifrar('Transporte fictício', aadDespesa);
    await expect(cifra.decifrar(envelope, { ...aadDespesa, formato: 2 } as never)).rejects.toThrow(
      ErroCifraAutenticada,
    );
  });

  it('identificador que não é UUID é recusado', async () => {
    const cifra = criarCifra();
    await expect(
      cifra.cifrar('Texto fictício', { ...aadDespesa, despesa_id: 'despesa-1' } as never),
    ).rejects.toThrow(ErroCifraAutenticada);
    await expect(
      cifra.cifrar('Texto fictício', { ...aadValor, registro_id: 'valor-1' } as never),
    ).rejects.toThrow(ErroCifraAutenticada);
  });

  it('o AAD financeiro não tem versão, e o contrato é quem impede contrabandeá-la', () => {
    // A forma canônica do financeiro não carrega `versao`: a versão da retificação é decidida
    // pelo banco depois da cifra, e amarrá-la tornaria a listagem indecifrável. O
    // canonicalizador ignora chave desconhecida, então quem recusa um AAD com `versao` é o
    // schema `.strict()` do contrato, aplicado na fronteira por `compor-financeiro-nativo.ts`.
    // Sem esta recusa, duas convenções de AAD poderiam conviver para a mesma tabela.
    expect(metadadosAadFinanceiroSchema.safeParse(aadDespesa).success).toBe(true);
    expect(metadadosAadFinanceiroSchema.safeParse({ ...aadDespesa, versao: 2 }).success).toBe(
      false,
    );
    expect(metadadosAadFinanceiroSchema.safeParse({ ...aadValor, versao: 2 }).success).toBe(false);
    // E um AAD que troca a tabela financeira por uma tabela versionada também não passa.
    expect(
      metadadosAadFinanceiroSchema.safeParse({
        ...aadValor,
        tabela: 'cadastro.realizacao_compromisso',
      }).success,
    ).toBe(false);
  });

  it('nenhuma recusa revela o texto nem o AAD na mensagem', async () => {
    const cifra = criarCifra();
    const envelope = await cifra.cifrar('Transporte fictício', aadDespesa);
    const erro = await cifra
      .decifrar(envelope, { ...aadDespesa, campo: 'autorizacao' })
      .then(() => null)
      .catch((causa: Error) => causa);
    expect(erro).toBeInstanceOf(ErroCifraAutenticada);
    expect(erro?.message).toBe('Não foi possível processar o campo cifrado.');
    expect(erro?.message).not.toContain(despesaId);
    expect(erro?.message).not.toContain('Transporte');
  });
});

/** Vetores de regressão da FORMA do AAD. Cada envelope foi produzido fora desta
 * implementação, por AES-GCM cru, usando como dado autenticado o JSON canônico escrito à mão
 * a partir da documentação do ramo correspondente. Se qualquer ramo existente mudar de
 * forma — ordem de chaves, campo a mais, campo a menos, tipo diferente —, a decifra falha e
 * este teste quebra. É a prova de que acrescentar o financeiro não mexeu em nada existente. */
const VETORES: readonly { nome: string; aad: AadCifra; texto: string; envelope: unknown }[] = [
  {
    nome: 'cadastro.paciente / nome (ramo genérico)',
    aad: {
      tabela: 'cadastro.paciente',
      registro_id: 'd3bc7baf-8868-44ca-97a2-a5dfe73e567a',
      campo: 'nome',
      formato: 1,
    },
    texto: 'Texto fictício 0',
    envelope: {
      formato: 1,
      key_id: 'fin-v1',
      nonce: 'AQEBAQEBAQEBAQEB',
      ciphertext: 'IoTxw_-fimeyoB-ME14fEZg',
      tag: 'a1M-1Kuoyi_vTrbzCMVkiw',
    },
  },
  {
    nome: 'identidade.sessao / refresh_token',
    aad: {
      tabela: 'identidade.sessao',
      registro_id: 'd3bc7baf-8868-44ca-97a2-a5dfe73e567a',
      usuario_id: 'a0000000-0000-4000-8000-000000000001',
      campo: 'refresh_token',
      formato: 1,
    },
    texto: 'Texto fictício 1',
    envelope: {
      formato: 1,
      key_id: 'fin-v1',
      nonce: 'AgICAgICAgICAgIC',
      ciphertext: 'TtGRczTL0055JEUageujWvs',
      tag: '8rw1F3pdmV9x-AQ_UDihFA',
    },
  },
  {
    nome: 'cadastro.realizacao_compromisso / observacao',
    aad: {
      tabela: 'cadastro.realizacao_compromisso',
      registro_id: 'd3bc7baf-8868-44ca-97a2-a5dfe73e567a',
      versao: 3,
      campo: 'observacao',
      formato: 1,
    },
    texto: 'Texto fictício 2',
    envelope: {
      formato: 1,
      key_id: 'fin-v1',
      nonce: 'AwMDAwMDAwMDAwMD',
      ciphertext: 'cZvbdzUIOCsZNIDxiD6QLN8',
      tag: 'DnenkYbGHRUVgruBzVKANQ',
    },
  },
  {
    nome: 'cadastro.diario_registro_versao / justificativa',
    aad: {
      tabela: 'cadastro.diario_registro_versao',
      paciente_id: 'c0000000-0000-4000-8000-000000000003',
      diario_registro_id: 'c0000000-0000-4000-8000-000000000011',
      registro_id: 'c0000000-0000-4000-8000-000000000012',
      versao: 2,
      campo: 'justificativa',
      formato: 1,
    },
    texto: 'Texto fictício 3',
    envelope: {
      formato: 1,
      key_id: 'fin-v1',
      nonce: 'BAQEBAQEBAQEBAQE',
      ciphertext: 'AVZQvAnJHWFr1m5jbhi8XTE',
      tag: '3dlTGUdBi44R0h2gCpXBPQ',
    },
  },
  {
    nome: 'cadastro.audio_transcricao / audio parte 2',
    aad: {
      tabela: 'cadastro.audio_transcricao',
      paciente_id: 'c0000000-0000-4000-8000-000000000003',
      registro_id: 'c0000000-0000-4000-8000-000000000013',
      parte: 2,
      campo: 'audio',
      formato: 1,
    },
    texto: 'Texto fictício 4',
    envelope: {
      formato: 1,
      key_id: 'fin-v1',
      nonce: 'BQUFBQUFBQUFBQUF',
      ciphertext: 'tpT_XL69GVqDA57d5gTmlGM',
      tag: 'xg864kOHGv1_al9Ii66wIg',
    },
  },
  {
    nome: 'cadastro.turno_prescricao_versao / dose',
    aad: {
      tabela: 'cadastro.turno_prescricao_versao',
      paciente_id: 'c0000000-0000-4000-8000-000000000003',
      turno_id: null,
      registro_id: 'c0000000-0000-4000-8000-000000000014',
      versao: 1,
      campo: 'dose',
      formato: 1,
    },
    texto: 'Texto fictício 5',
    envelope: {
      formato: 1,
      key_id: 'fin-v1',
      nonce: 'BgYGBgYGBgYGBgYG',
      ciphertext: '2eD2ZOGd5IRQOTXHljR6js4',
      tag: 'z9gBjPbYUmSPrlz5agh6NA',
    },
  },
  {
    nome: 'cadastro.exportacao_caso / proposito',
    aad: {
      tabela: 'cadastro.exportacao_caso',
      paciente_id: 'c0000000-0000-4000-8000-000000000003',
      registro_id: 'c0000000-0000-4000-8000-000000000015',
      versao: 1,
      campo: 'proposito',
      formato: 1,
    },
    texto: 'Texto fictício 6',
    envelope: {
      formato: 1,
      key_id: 'fin-v1',
      nonce: 'BwcHBwcHBwcHBwcH',
      ciphertext: 'mv4yS2nG2QwvnUKXXLDJVHo',
      tag: 'IC8xoSop2tKNWVVi2npC3g',
    },
  },
];

describe('nenhum AAD existente mudou de forma', () => {
  it.each(VETORES)('decifra o vetor anterior ao ramo financeiro: $nome', async (vetor) => {
    const cifra = criarCifra();
    await expect(
      cifra.decifrar(vetor.envelope as Parameters<typeof cifra.decifrar>[0], vetor.aad),
    ).resolves.toBe(vetor.texto);
  });
});
