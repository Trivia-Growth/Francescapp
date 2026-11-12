// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { montarPlanoCrise } from './plano-crise';
import { montarHabilitacaoPlanoCrise } from './habilitacao-plano-crise';
import { FalhaApi } from './api';

const paciente = '40000000-0000-4000-8000-000000000001';
const plano = {
  registro_id: '50000000-0000-4000-8000-000000000001',
  versao: 1,
  conteudo: {
    responsaveis: [
      { id: 'r1', nome: 'Responsável fictícia', papel: 'Mãe', contato: '(11) 90000-0000' },
    ],
    contatos: [{ id: 'c1', descricao: 'Crise fora do horário', telefone: '(11) 90000-0001' }],
    limites_servico: 'A coordenação organiza o cuidado e não atende emergência presencial.',
    data_revisao: '2027-03-01',
  },
  aprovacao: null,
};

it('mostra sempre os dois avisos exigidos e a falta de aprovação', async () => {
  const raiz = document.createElement('div');
  const servico = {
    consultar: vi.fn(async () => plano),
    salvar: vi.fn(),
    aprovar: vi.fn(),
  };
  montarPlanoCrise(raiz, paciente, servico, () => {});
  await vi.waitFor(() => expect(raiz.textContent).toContain('Plano de crise'));
  // Texto fixo do requisito: não depende do que foi digitado e não pode sumir da tela.
  expect(raiz.textContent).toContain('diário não garante resposta imediata');
  expect(raiz.textContent).toContain('não emite conduta clínica');
  expect(raiz.textContent).toContain('ainda sem aprovação do profissional habilitado');
});

it('aprovar usa a versão lida e explica a recusa de quem não tem habilitação', async () => {
  const raiz = document.createElement('div');
  // 403 de "sem habilitação" não pode derrubar a ficha como se a sessão tivesse caído.
  const aprovar = vi.fn().mockRejectedValue(new FalhaApi('sem_permissao', 403));
  const servico = { consultar: vi.fn(async () => plano), salvar: vi.fn(), aprovar };
  const acessoPerdido = vi.fn();
  montarPlanoCrise(raiz, paciente, servico, acessoPerdido);
  await vi.waitFor(() => expect(raiz.textContent).toContain('Aprovar esta versão'));
  const botao = [...raiz.querySelectorAll('button')].find(
    (item) => item.textContent === 'Aprovar esta versão',
  ) as HTMLButtonElement;
  botao.click();
  await vi.waitFor(() => expect(aprovar).toHaveBeenCalledWith(paciente, plano.registro_id, 1));
  await vi.waitFor(() =>
    expect(raiz.textContent).toContain('não tem habilitação para aprovar plano de crise'),
  );
  expect(acessoPerdido).not.toHaveBeenCalled();
});

it('plano aprovado avisa que editar exige nova aprovação', async () => {
  const raiz = document.createElement('div');
  const aprovado = {
    ...plano,
    aprovacao: {
      aprovador_usuario_id: '10000000-0000-4000-8000-000000000002',
      aprovado_em: '2026-11-11T12:00:00+00:00',
    },
  };
  const servico = {
    consultar: vi.fn(async () => aprovado),
    salvar: vi.fn(),
    aprovar: vi.fn(),
  };
  montarPlanoCrise(raiz, paciente, servico, () => {});
  await vi.waitFor(() => expect(raiz.textContent).toContain('aprovada em'));
  expect(raiz.textContent).toContain('precisará de aprovação de novo');
  const aprovar = [...raiz.querySelectorAll('button')].find(
    (item) => item.textContent === 'Aprovar esta versão',
  ) as HTMLButtonElement;
  expect(aprovar.hidden).toBe(true);
});

it('marca de habilitação só é oferecida para profissional com acesso ativo', async () => {
  const raiz = document.createElement('div');
  const itens = [
    {
      concessao_id: '30000000-0000-4000-8000-000000000001',
      usuario_id: '10000000-0000-4000-8000-000000000001',
      email: 'coordenacao.ficticia@example.test',
      perfil: 'administrador' as const,
      estado: 'vinculada' as const,
      habilitado: false,
      versao: 0,
    },
    {
      concessao_id: '30000000-0000-4000-8000-000000000002',
      usuario_id: '10000000-0000-4000-8000-000000000002',
      email: 'equipe.ficticia@example.test',
      perfil: 'profissional' as const,
      estado: 'vinculada' as const,
      habilitado: false,
      versao: 0,
    },
  ];
  const gravar = vi.fn(async () => ({ ...itens[1], habilitado: true, versao: 1 }));
  montarHabilitacaoPlanoCrise(raiz, { listar: vi.fn(async () => itens), gravar });
  await vi.waitFor(() => expect(raiz.textContent).toContain('equipe.ficticia@example.test'));
  const caixas = [...raiz.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
  expect(caixas[0]?.disabled).toBe(true);
  expect(raiz.textContent).toContain('A coordenação não aprova plano de crise.');
  expect(caixas[1]?.disabled).toBe(false);
  caixas[1].checked = true;
  (raiz.querySelectorAll('form')[1] as HTMLFormElement).dispatchEvent(
    new Event('submit', { cancelable: true }),
  );
  await vi.waitFor(() =>
    expect(gravar).toHaveBeenCalledWith({
      concessao_id: itens[1]?.concessao_id,
      habilitado: true,
      versao_esperada: 0,
    }),
  );
});
