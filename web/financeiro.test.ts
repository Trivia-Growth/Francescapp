// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { formatarCentavos, lerCentavos, montarFinanceiro } from './financeiro';
import { criarAudienciaFinanceira } from './financeiro-audiencia';
import { FalhaApi } from './api';
import type { ServicoFinanceiro } from './servico-financeiro-http';

/** Dados fictícios. */
const profissional = '10000000-0000-4000-8000-000000000001';
const caso = '20000000-0000-4000-8000-000000000002';
const despesa = '30000000-0000-4000-8000-000000000003';

function servicoFalso(parcial: Partial<ServicoFinanceiro> = {}): ServicoFinanceiro {
  return {
    consultarAudiencia: vi.fn(async () => true),
    listarValores: vi.fn(async () => []),
    registrarValor: vi.fn(),
    listarDespesas: vi.fn(async () => []),
    registrarDespesa: vi.fn(),
    enviarComprovante: vi.fn(),
    baixarComprovante: vi.fn(),
    consultarApuracao: vi.fn(),
    ...parcial,
  } as unknown as ServicoFinanceiro;
}

function botao(raiz: HTMLElement, texto: string): HTMLButtonElement {
  const alvo = [...raiz.querySelectorAll('button')].find((item) => item.textContent === texto);
  if (!alvo) throw new Error(`Botão ausente: ${texto}`);
  return alvo as HTMLButtonElement;
}

describe('valor em centavos (o contrato não carrega texto formatado)', () => {
  it('converte reais digitados para centavos inteiros', () => {
    expect(lerCentavos('1234,56')).toBe(123_456);
    expect(lerCentavos('1234.5')).toBe(123_450);
    expect(lerCentavos('80')).toBe(8_000);
  });

  it('recusa entrada que não é valor monetário, sem arredondar nem adivinhar', () => {
    for (const texto of ['', '-10', '0', '1,234', 'abc', '1e3', '1,2,3'])
      expect(lerCentavos(texto)).toBeNull();
  });

  it('apresenta centavos em reais só na tela', () => {
    expect(formatarCentavos(123_456).replace(/ /g, ' ')).toBe('R$ 1.234,56');
  });
});

describe('estados das telas financeiras (tarefa 4.1)', () => {
  it('mostra carregamento e depois o estado vazio, só após consulta bem-sucedida', async () => {
    const raiz = document.createElement('div');
    let liberar: (valor: never[]) => void = () => {};
    const listarValores = vi.fn(
      () =>
        new Promise<never[]>((resolve) => {
          liberar = resolve;
        }),
    );
    montarFinanceiro(raiz, servicoFalso({ listarValores } as Partial<ServicoFinanceiro>), {
      profissionalPadrao: profissional,
    });
    botao(raiz, 'Consultar valores').click();
    await vi.waitFor(() => expect(raiz.textContent).toContain('Consultando valores combinados…'));
    expect(raiz.querySelector('.list-loading')).not.toBeNull();
    expect(raiz.textContent).not.toContain('Nenhum valor combinado');
    liberar([]);
    await vi.waitFor(() =>
      expect(raiz.textContent).toContain('Nenhum valor combinado registrado para esta pessoa.'),
    );
    expect(raiz.querySelector('.list-loading')).toBeNull();
  });

  it('erro não apresenta estado vazio nem dado de exemplo', async () => {
    const raiz = document.createElement('div');
    const listarValores = vi.fn().mockRejectedValue(new FalhaApi('servico_indisponivel'));
    montarFinanceiro(raiz, servicoFalso({ listarValores } as Partial<ServicoFinanceiro>), {
      profissionalPadrao: profissional,
    });
    botao(raiz, 'Consultar valores').click();
    await vi.waitFor(() =>
      expect(raiz.textContent).toContain('Não foi possível consultar os valores.'),
    );
    expect(raiz.textContent).not.toContain('Nenhum valor combinado registrado');
    expect(raiz.querySelector('.financeiro__vazio')).toBeNull();
    expect(raiz.querySelector('.financeiro__linha')).toBeNull();
    expect(raiz.textContent).not.toMatch(/R\$/);
  });

  it('sucesso apresenta os valores formatados em reais', async () => {
    const raiz = document.createElement('div');
    const listarValores = vi.fn(async () => [
      {
        valor_id: '40000000-0000-4000-8000-000000000004',
        profissional_usuario_id: profissional,
        valor_turno_centavos: 20_000,
        vigencia: { inicio: '2026-11-01', fim: null },
        motivo: 'Combinado fictício',
        autor_usuario_id: profissional,
        registrado_em: '2026-11-01T12:00:00.000Z',
      },
    ]);
    montarFinanceiro(raiz, servicoFalso({ listarValores } as Partial<ServicoFinanceiro>), {
      profissionalPadrao: profissional,
    });
    botao(raiz, 'Consultar valores').click();
    await vi.waitFor(() => expect(raiz.textContent).toContain('por turno'));
    expect(raiz.textContent?.replace(/ /g, ' ')).toContain('R$ 200,00 por turno');
    expect(raiz.textContent).toContain('Combinado fictício');
  });

  it('a apuração não mostra total antes da consulta e mostra o instante depois', async () => {
    const raiz = document.createElement('div');
    const consultarApuracao = vi.fn(async () => ({
      origem: 'consulta_aberta' as const,
      consultado_em: '2026-11-19T12:00:10.000Z',
      profissional_usuario_id: profissional,
      periodo_inicio: '2026-11-01',
      periodo_fim: '2026-11-30',
      linhas: [],
      total_centavos: 0,
      pendentes: 0,
    }));
    montarFinanceiro(raiz, servicoFalso({ consultarApuracao } as Partial<ServicoFinanceiro>), {
      profissionalPadrao: profissional,
    });
    botao(raiz, 'Apuração').click();
    expect(raiz.textContent).not.toMatch(/R\$/);
    botao(raiz, 'Apurar período').click();
    await vi.waitFor(() => expect(raiz.textContent).toContain('2026-11-19T12:00:10.000Z'));
    expect(raiz.textContent).toContain('Nenhum turno no período consultado.');
  });
});

describe('falha de persistência na despesa na interface (tarefa 2.7)', () => {
  function prepararDespesa(registrarDespesa: ServicoFinanceiro['registrarDespesa']) {
    const raiz = document.createElement('div');
    const servico = servicoFalso({ registrarDespesa });
    montarFinanceiro(raiz, servico, { casoPadrao: caso });
    botao(raiz, 'Despesas do caso').click();
    const formulario = [...raiz.querySelectorAll('form')].at(-1) as HTMLFormElement;
    const entradas = [...formulario.querySelectorAll('input')];
    const porRotulo = (texto: string) =>
      entradas.find((item) =>
        formulario.querySelector(`label[for="${item.id}"]`)?.textContent?.startsWith(texto),
      ) as HTMLInputElement;
    porLabelValor(porRotulo('Descrição'), 'Transporte fictício');
    porLabelValor(porRotulo('Valor'), '12,34');
    porLabelValor(porRotulo('Data'), '2026-11-10');
    porLabelValor(porRotulo('Responsável'), profissional);
    porLabelValor(porRotulo('Autorização'), 'Autorização fictícia');
    const arquivo = porRotulo('Comprovante');
    // O `File` do jsdom desta versão não implementa `arrayBuffer()`; o dublê entrega os
    // mesmos quatro campos que a tela lê de um arquivo escolhido pela pessoa.
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const ficheiro = {
      name: 'comprovante-ficticio.pdf',
      type: 'application/pdf',
      size: bytes.byteLength,
      arrayBuffer: async () => bytes.buffer,
    } as unknown as File;
    Object.defineProperty(arquivo, 'files', { value: [ficheiro], configurable: true });
    return { raiz, formulario, servico };
  }
  function porLabelValor(entrada: HTMLInputElement, valor: string) {
    entrada.value = valor;
  }

  it('informa a falha, não apresenta sucesso e não repete sozinha', async () => {
    const registrarDespesa = vi
      .fn()
      .mockRejectedValue(
        new FalhaApi('pendencia_externa'),
      ) as unknown as ServicoFinanceiro['registrarDespesa'];
    const { raiz, formulario } = prepararDespesa(registrarDespesa);
    formulario.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await vi.waitFor(() => expect(raiz.textContent).toContain('A despesa não foi salva.'));
    expect(raiz.textContent).not.toContain('Despesa registrada');
    // Uma única tentativa: a tela não reenvia por conta própria.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(registrarDespesa).toHaveBeenCalledTimes(1);
  });

  it('a repetição explícita reaproveita o mesmo lançamento e a mesma chave', async () => {
    const chamadas: { despesa_id: string; chave: string }[] = [];
    const registrarDespesa = vi.fn(async (entrada: { despesa_id: string }, chave: string) => {
      chamadas.push({ despesa_id: entrada.despesa_id, chave });
      throw new FalhaApi('pendencia_externa');
    }) as unknown as ServicoFinanceiro['registrarDespesa'];
    const { raiz, formulario } = prepararDespesa(registrarDespesa);
    formulario.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await vi.waitFor(() => expect(chamadas).toHaveLength(1));
    const repetir = botao(raiz, 'Tentar de novo este mesmo lançamento');
    expect(repetir.hidden).toBe(false);
    repetir.click();
    await vi.waitFor(() => expect(chamadas).toHaveLength(2));
    expect(chamadas[0]?.despesa_id).toBe(chamadas[1]?.despesa_id);
    expect(chamadas[0]?.chave).toBe(chamadas[1]?.chave);
  });

  it('sem_permissao não oferece repetição', async () => {
    const registrarDespesa = vi
      .fn()
      .mockRejectedValue(
        new FalhaApi('sem_permissao', 403),
      ) as unknown as ServicoFinanceiro['registrarDespesa'];
    const { raiz, formulario } = prepararDespesa(registrarDespesa);
    formulario.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await vi.waitFor(() =>
      expect(raiz.textContent).toContain('Sua conta não pode registrar despesas.'),
    );
    expect(botao(raiz, 'Tentar de novo este mesmo lançamento').hidden).toBe(true);
  });
});

describe('audiência financeira na interface (tarefa 4.2)', () => {
  // Isto SOMA aos testes de servidor (`netlify/functions/_shared/financeiro-nativo.test.ts`)
  // e de banco (`supabase/tests/financeiro_*_local.sql`). Ocultar a área NÃO é autorização:
  // a autorização continua no servidor e no banco, e estes casos só provam que a superfície
  // não aparece para quem o servidor já disse que não tem audiência.
  it('familiar nem chega a perguntar e nunca fica permitido', async () => {
    const consultar = vi.fn(async () => true);
    const audiencia = criarAudienciaFinanceira(consultar, () => {});
    audiencia.sondar({ session_id: 's1', perfil: 'familia' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(consultar).not.toHaveBeenCalled();
    expect(audiencia.permitidaPara('s1')).toBe(false);
  });

  it('profissional sem concessão financeira não libera a área', async () => {
    const audiencia = criarAudienciaFinanceira(
      async () => false,
      () => {},
    );
    audiencia.sondar({ session_id: 's2', perfil: 'profissional' });
    await vi.waitFor(() => expect(audiencia.permitidaPara('s2')).toBe(false));
  });

  it('profissional com concessão financeira libera a área só para a própria sessão', async () => {
    const audiencia = criarAudienciaFinanceira(
      async () => true,
      () => {},
    );
    audiencia.sondar({ session_id: 's3', perfil: 'profissional' });
    await vi.waitFor(() => expect(audiencia.permitidaPara('s3')).toBe(true));
    expect(audiencia.permitidaPara('outra-sessao')).toBe(false);
  });

  it('falha da sondagem mantém a área escondida', async () => {
    const audiencia = criarAudienciaFinanceira(
      async () => {
        throw new FalhaApi('servico_indisponivel');
      },
      () => {},
    );
    audiencia.sondar({ session_id: 's4', perfil: 'administrador' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(audiencia.permitidaPara('s4')).toBe(false);
  });

  it('sair esquece a audiência', async () => {
    const audiencia = criarAudienciaFinanceira(
      async () => true,
      () => {},
    );
    audiencia.sondar({ session_id: 's5', perfil: 'administrador' });
    await vi.waitFor(() => expect(audiencia.permitidaPara('s5')).toBe(true));
    audiencia.esquecer();
    expect(audiencia.permitidaPara('s5')).toBe(false);
  });
});

describe('conforto no celular (tarefa 4.3)', () => {
  it('o campo de valor pede teclado numérico e os alvos de toque são declarados', () => {
    const raiz = document.createElement('div');
    montarFinanceiro(raiz, servicoFalso());
    const valor = [...raiz.querySelectorAll('input')].find(
      (item) => item.getAttribute('inputmode') === 'decimal',
    );
    expect(valor).toBeDefined();
    expect(valor?.type).toBe('text');
    // Alvo de toque e foco visível vêm de `.financeiro__*` em `styles.css` (min-height 44px
    // e o `:focus-visible` global); aqui se prova que a tela usa essas classes.
    expect(raiz.querySelector('.financeiro__aba')).not.toBeNull();
    expect(raiz.querySelector('.financeiro__campo')).not.toBeNull();
  });

  it('todo campo tem rótulo associado', () => {
    const raiz = document.createElement('div');
    montarFinanceiro(raiz, servicoFalso());
    for (const entrada of raiz.querySelectorAll('input'))
      expect(raiz.querySelector(`label[for="${entrada.id}"]`)).not.toBeNull();
  });

  it('nenhuma superfície financeira apresenta conteúdo clínico', () => {
    const raiz = document.createElement('div');
    montarFinanceiro(raiz, servicoFalso());
    for (const termo of ['medicaç', 'aferiç', 'passagem', 'ocorrência', 'prescriç', 'rotina'])
      expect(raiz.textContent?.toLowerCase()).not.toContain(termo);
  });
});
