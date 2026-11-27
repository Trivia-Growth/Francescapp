// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { montarFinanceiroConcessaoAdministracao } from './financeiro-concessao-administracao.js';
import type { ConcessaoFinanceira } from '../packages/contracts/src/index.ts';
import type { ServicoFinanceiro } from './servico-financeiro-http.ts';
import { FalhaApi } from './api.ts';

/** Dados fictícios. Nenhum e-mail real, e nenhum valor financeiro em lugar nenhum. */
const concessaoAdmin = 'a0000000-0000-4000-8000-000000000001';
const concessaoColega = 'b0000000-0000-4000-8000-000000000002';

const linhas = (): ConcessaoFinanceira[] => [
  {
    concessao_id: concessaoAdmin,
    usuario_id: 'c0000000-0000-4000-8000-000000000003',
    email: 'admin.ficticia@exemplo.test',
    perfil: 'administrador',
    estado: 'vinculada',
    habilitado: false,
    versao: 0,
  },
  {
    concessao_id: concessaoColega,
    usuario_id: 'd0000000-0000-4000-8000-000000000004',
    email: 'colega.ficticia@exemplo.test',
    perfil: 'profissional',
    estado: 'vinculada',
    habilitado: true,
    versao: 2,
  },
];

function servico(sobrepor: Partial<ServicoFinanceiro> = {}) {
  return {
    listarConcessoes: vi.fn().mockResolvedValue(linhas()),
    gravarConcessao: vi.fn(),
    consultarAudiencia: vi.fn(),
    listarValores: vi.fn(),
    registrarValor: vi.fn(),
    listarDespesas: vi.fn(),
    registrarDespesa: vi.fn(),
    enviarComprovante: vi.fn(),
    baixarComprovante: vi.fn(),
    consultarApuracao: vi.fn(),
    ...sobrepor,
  } satisfies ServicoFinanceiro & { listarConcessoes: ReturnType<typeof vi.fn> };
}

const caixaDe = (raiz: HTMLElement, concessao: string) =>
  raiz.querySelector<HTMLInputElement>(`#financeiro-concessao-${concessao}`);

it('lista a equipe sem revelar nenhum conteúdo financeiro', async () => {
  const raiz = document.createElement('div');
  const api = servico();
  montarFinanceiroConcessaoAdministracao(raiz, api);
  await vi.waitFor(() => expect(raiz.textContent).toContain('colega.ficticia@exemplo.test'));
  // A tela concede audiência; não mostra valor, despesa nem apuração de ninguém.
  for (const proibido of ['R$', 'centavos', 'despesa', 'apuraç', 'comprovante'])
    expect(raiz.textContent?.toLowerCase()).not.toContain(proibido.toLowerCase());
  expect(api.listarValores).not.toHaveBeenCalled();
  expect(api.listarDespesas).not.toHaveBeenCalled();
  expect(api.consultarApuracao).not.toHaveBeenCalled();
  expect(raiz.textContent).toContain('1 profissional marcado');
});

it('revoga enviando a versão lida e recarrega com a marca já negada', async () => {
  const raiz = document.createElement('div');
  const depois = linhas();
  const colega = depois[1];
  if (!colega) throw new Error('Equipe fictícia incompleta.');
  const colegaRevogado = { ...colega, habilitado: false, versao: 3 };
  depois[1] = colegaRevogado;
  const listarConcessoes = vi
    .fn()
    .mockResolvedValueOnce(linhas())
    .mockResolvedValue(depois) as unknown as ServicoFinanceiro['listarConcessoes'];
  const api = servico({
    listarConcessoes,
    gravarConcessao: vi.fn().mockResolvedValue(colegaRevogado),
  });
  montarFinanceiroConcessaoAdministracao(raiz, api);
  await vi.waitFor(() => expect(caixaDe(raiz, concessaoColega)?.checked).toBe(true));
  const caixa = caixaDe(raiz, concessaoColega);
  const formulario = caixa?.closest('form');
  if (!caixa || !formulario) throw new Error('Linha da colega ausente.');
  caixa.checked = false;
  formulario.requestSubmit();
  await vi.waitFor(() =>
    expect(api.gravarConcessao).toHaveBeenCalledWith(
      { concessao_id: concessaoColega, habilitado: false, versao_esperada: 2 },
      expect.any(String),
    ),
  );
  // A leitura seguinte é um novo pedido ao servidor, não um estado local otimista.
  //
  // REESCRITO na migração para React: a espera passou a ser pela CONTAGEM relida, não
  // pela caixa. A caixa é o lugar errado para esperar porque a própria prova acabou de
  // desmarcá-la à mão — a condição já estava satisfeita antes de o servidor responder, e
  // a prova seguia adiante lendo a tela no meio da gravação. A contagem só muda quando a
  // listagem volta do servidor, que é exatamente o que este caso afirma.
  await vi.waitFor(() => expect(raiz.textContent).toContain('Nenhum profissional está marcado'));
  expect(caixaDe(raiz, concessaoColega)?.checked).toBe(false);
});

it('a recusa de autoconcessão vem do servidor e a tela não a apresenta como sucesso', async () => {
  const raiz = document.createElement('div');
  // O banco recusa marcar uma concessão de Administrador: a marca só vale para profissional.
  const api = servico({
    gravarConcessao: vi.fn().mockRejectedValue(new FalhaApi('conflito', 409)),
  });
  montarFinanceiroConcessaoAdministracao(raiz, api);
  await vi.waitFor(() => expect(caixaDe(raiz, concessaoAdmin)).not.toBeNull());
  const caixa = caixaDe(raiz, concessaoAdmin);
  const formulario = caixa?.closest('form');
  const salvar = formulario?.querySelector<HTMLButtonElement>('button[type=submit]');
  if (!caixa || !formulario || !salvar) throw new Error('Linha do Administrador ausente.');
  // A tela já desencoraja: a linha de Administrador não é marcável. Mas forçar o envio
  // continua sendo recusado pelo servidor, e é isso que o teste prova.
  expect(caixa.disabled).toBe(true);
  caixa.disabled = false;
  caixa.checked = true;
  salvar.disabled = false;
  formulario.requestSubmit();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Não foi possível aplicar esta marca'));
  expect(caixaDe(raiz, concessaoAdmin)?.checked).toBe(false);
});

it('a negativa de quem não é Administrador aparece sem lista nenhuma', async () => {
  const raiz = document.createElement('div');
  const api = servico({
    listarConcessoes: vi.fn().mockRejectedValue(new FalhaApi('sem_permissao', 403)),
  });
  montarFinanceiroConcessaoAdministracao(raiz, api);
  await vi.waitFor(() =>
    expect(raiz.textContent).toContain('Sua conta não pode ver quem vê o financeiro'),
  );
  expect(raiz.querySelectorAll('form')).toHaveLength(0);
});
