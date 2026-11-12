// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { FalhaApi } from './api.js';
import { montarEdicaoPaciente, type ServicoEdicaoPaciente } from './editar-paciente.js';

const id = '00000000-0000-4000-8000-000000000001';
const paciente = {
  id,
  nome: 'Paciente fictício',
  nome_preferencia: null,
  data_nascimento: null,
  versao: 2,
  contatos: [],
  acompanhamento: [],
};
const vazio = { epoca: 1, reserva: null, resultado_pendente: null };

it('reconcilia edição após recarga antes de permitir novo envio, sem persistir rascunho', async () => {
  const ciclo = {
    consultar: vi
      .fn()
      .mockResolvedValueOnce({
        epoca: 2,
        reserva: null,
        resultado_pendente: {
          recibo_id: id,
          reserva_id: id,
          resultado: 'confirmada',
          paciente_id: id,
          versao: 3,
        },
      })
      .mockResolvedValue(vazio),
    encerrar: vi.fn(),
    reconhecer: vi.fn().mockResolvedValue('reconhecido'),
    liberar: vi.fn(),
    editar: vi.fn(),
  };
  const servico = {
    ciclo,
    consultarPaciente: vi.fn().mockResolvedValue(paciente),
  } as unknown as ServicoEdicaoPaciente;
  const raiz = document.createElement('div');
  montarEdicaoPaciente(raiz, id, servico, vi.fn());
  expect(raiz.querySelector('form')).toBeNull();
  raiz.querySelector('button')?.click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('foram salvas (versão'));
  expect(servico.consultarPaciente).toHaveBeenCalledOnce();
  expect(raiz.textContent).toContain(`Cadastro atual: ${paciente.nome}`);
  expect(raiz.textContent).toContain('salvas (versão 3)');
  expect(raiz.textContent).toContain('O cadastro já está em outra versão');
  raiz.querySelector('button')?.click();
  await vi.waitFor(() => expect(raiz.querySelector('form')).not.toBeNull());
  expect(ciclo.reconhecer).toHaveBeenCalledOnce();
  expect(ciclo.liberar).toHaveBeenCalledOnce();
  expect(sessionStorage.length).toBe(0);
});

it('preserva rascunho após falha incerta até recarga explícita', async () => {
  const ciclo = {
    consultar: vi
      .fn()
      .mockResolvedValueOnce(vazio)
      .mockResolvedValueOnce(vazio)
      .mockResolvedValue({
        epoca: 2,
        reserva: null,
        resultado_pendente: {
          recibo_id: id,
          reserva_id: id,
          resultado: 'cancelada',
          paciente_id: id,
          versao: null,
        },
      }),
    encerrar: vi.fn().mockResolvedValue('vazia'),
    reconhecer: vi.fn().mockResolvedValue('reconhecido'),
    liberar: vi.fn(),
    editar: vi.fn().mockRejectedValue(new Error()),
  };
  const raiz = document.createElement('div');
  montarEdicaoPaciente(
    raiz,
    id,
    {
      ciclo,
      consultarPaciente: vi.fn().mockResolvedValue(paciente),
    } as unknown as ServicoEdicaoPaciente,
    vi.fn(),
  );
  raiz.querySelector('button')?.click();
  await vi.waitFor(() => expect(raiz.querySelector('form')).not.toBeNull());
  const nome = raiz.querySelector('input');
  const motivo = raiz.querySelector('textarea');
  if (!nome || !motivo) throw new Error('Campos ausentes');
  nome.value = 'Nome fictício alterado';
  motivo.value = 'Correção';
  raiz.querySelector('form')?.requestSubmit();
  await vi.waitFor(() => expect(raiz.textContent).toContain('rascunho permanece'));
  [...raiz.querySelectorAll('button')]
    .find((b) => b.textContent === 'Conferir o que foi salvo')
    ?.click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('não foram salvas'));
  [...raiz.querySelectorAll('button')]
    .find((b) => b.textContent === 'Entendi, liberar a edição')
    ?.click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Copie seu rascunho'));
  expect(raiz.querySelector('input')?.value).toBe('Nome fictício alterado');
});

it('preserva rascunho copiável quando reserva falha e barreira está vazia', async () => {
  const ciclo = {
    consultar: vi.fn().mockResolvedValue(vazio),
    encerrar: vi.fn().mockResolvedValue('vazia'),
    reconhecer: vi.fn(),
    liberar: vi.fn(),
    editar: vi.fn().mockRejectedValue(new Error()),
  };
  const raiz = document.createElement('div');
  montarEdicaoPaciente(
    raiz,
    id,
    {
      ciclo,
      consultarPaciente: vi.fn().mockResolvedValue(paciente),
    } as unknown as ServicoEdicaoPaciente,
    vi.fn(),
  );
  raiz.querySelector('button')?.click();
  await vi.waitFor(() => expect(raiz.querySelector('form')).not.toBeNull());
  const nome = raiz.querySelector('input');
  const motivo = raiz.querySelector('textarea');
  if (!nome || !motivo) throw new Error('Campos ausentes');
  nome.value = 'Rascunho fictício';
  motivo.value = 'Correção';
  raiz.querySelector('form')?.requestSubmit();
  await vi.waitFor(() => expect(raiz.textContent).toContain('rascunho permanece'));
  [...raiz.querySelectorAll('button')]
    .find((b) => b.textContent === 'Conferir o que foi salvo')
    ?.click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Copie seu rascunho'));
  expect(nome.value).toBe('Rascunho fictício');
  expect(raiz.querySelector('fieldset')?.disabled).toBe(false);
  expect(raiz.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
});

it('impede reconhecimento de resultado de outro paciente', async () => {
  const outro = '00000000-0000-4000-8000-000000000002';
  const ciclo = {
    consultar: vi.fn().mockResolvedValue({
      epoca: 2,
      reserva: null,
      resultado_pendente: {
        recibo_id: id,
        reserva_id: id,
        resultado: 'confirmada',
        paciente_id: outro,
        versao: 3,
      },
    }),
    encerrar: vi.fn(),
    reconhecer: vi.fn(),
    liberar: vi.fn(),
    editar: vi.fn(),
  };
  const raiz = document.createElement('div');
  montarEdicaoPaciente(
    raiz,
    id,
    { ciclo, consultarPaciente: vi.fn() } as unknown as ServicoEdicaoPaciente,
    vi.fn(),
  );
  raiz.querySelector('button')?.click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('outro paciente'));
  expect(raiz.textContent).not.toContain(outro);
  expect(ciclo.reconhecer).not.toHaveBeenCalled();
  expect(raiz.querySelector('button')?.hidden).toBe(true);
});

it('não permite reconhecer quando consulta autorizada para conferência falha', async () => {
  const ciclo = {
    consultar: vi.fn().mockResolvedValue({
      epoca: 2,
      reserva: null,
      resultado_pendente: {
        recibo_id: id,
        reserva_id: id,
        resultado: 'confirmada',
        paciente_id: id,
        versao: 3,
      },
    }),
    encerrar: vi.fn(),
    reconhecer: vi.fn(),
    liberar: vi.fn(),
    editar: vi.fn(),
  };
  const raiz = document.createElement('div');
  montarEdicaoPaciente(
    raiz,
    id,
    {
      ciclo,
      consultarPaciente: vi.fn().mockRejectedValue(new Error()),
    } as unknown as ServicoEdicaoPaciente,
    vi.fn(),
  );
  raiz.querySelector('button')?.click();
  await vi.waitFor(() =>
    expect(raiz.textContent).toContain('Não foi possível confirmar a situação'),
  );
  expect(ciclo.reconhecer).not.toHaveBeenCalled();
  expect(raiz.textContent).not.toContain('Entendi, liberar a edição');
});

it('não encerra reserva de edição em outra aba sem confirmação', async () => {
  const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const ciclo = {
    consultar: vi
      .fn()
      .mockResolvedValue({ epoca: 1, reserva: { id, estado: 'aberta' }, resultado_pendente: null }),
    encerrar: vi.fn(),
    reconhecer: vi.fn(),
    liberar: vi.fn(),
    editar: vi.fn(),
  };
  const raiz = document.createElement('div');
  montarEdicaoPaciente(
    raiz,
    id,
    { ciclo, consultarPaciente: vi.fn() } as unknown as ServicoEdicaoPaciente,
    vi.fn(),
  );
  raiz.querySelector('button')?.click();
  await vi.waitFor(() => expect(confirmar).toHaveBeenCalledOnce());
  expect(ciclo.encerrar).not.toHaveBeenCalled();
  expect(raiz.querySelector('form')).toBeNull();
  confirmar.mockRestore();
});

const ana = '30000000-0000-4000-8000-000000000003';
const bia = '30000000-0000-4000-8000-000000000004';
const equipe = [
  { usuario_id: ana, rotulo: 'ana@exemplo.test (Profissional)', ativo: true },
  { usuario_id: bia, rotulo: 'bia@exemplo.test (Profissional)', ativo: false },
];
const mudanca = (parcial: Record<string, unknown> = {}) => ({
  versao: 3,
  situacao: 'ativo',
  responsavel_id: ana,
  responsavel_ativo: true,
  ator_id: id,
  criado_em: '2026-11-05T15:00:00.000000+00:00',
  motivo: 'Início fictício',
  ...parcial,
});

async function abrirComCaso(
  acompanhamento: unknown[],
  extra: Record<string, unknown> = {},
  editar = vi.fn().mockResolvedValue(undefined),
) {
  const ciclo = {
    consultar: vi.fn().mockResolvedValue(vazio),
    encerrar: vi.fn().mockResolvedValue('vazia'),
    reconhecer: vi.fn(),
    liberar: vi.fn(),
    editar,
  };
  const raiz = document.createElement('div');
  montarEdicaoPaciente(
    raiz,
    id,
    {
      ciclo,
      consultarPaciente: vi.fn().mockResolvedValue({ ...paciente, acompanhamento }),
      ...extra,
    } as unknown as ServicoEdicaoPaciente,
    vi.fn(),
  );
  raiz.querySelector('button')?.click();
  await vi.waitFor(() => expect(raiz.querySelector('form')).not.toBeNull());
  const [situacao, responsavel] = [...raiz.querySelectorAll('select')];
  const motivo = raiz.querySelector('textarea');
  if (!situacao || !responsavel || !motivo) throw new Error('Campos ausentes');
  return { raiz, ciclo, situacao, responsavel, motivo };
}
const resumoDe = (raiz: HTMLElement) => raiz.querySelector('.caso-resumo')?.textContent ?? '';

it('mostra situação, responsável e histórico, oferece só equipe ativa e envia apenas o que mudou', async () => {
  const antigo = mudanca({
    versao: 2,
    situacao: 'entrada',
    responsavel_id: null,
    responsavel_ativo: null,
    motivo: 'Cadastro fictício',
  });
  const { raiz, ciclo, situacao, responsavel, motivo } = await abrirComCaso([mudanca(), antigo], {
    listarResponsaveis: vi.fn().mockResolvedValue(equipe),
  });
  await vi.waitFor(() => expect(resumoDe(raiz)).toContain('ana@exemplo.test'));
  const resumo = resumoDe(raiz);
  expect(resumo).toContain('Situação: Ativo');
  expect(resumo).toContain('Responsável: ana@exemplo.test (Profissional)');
  expect(resumo).toContain('Desde 05/11/2026. Motivo: Início fictício');
  expect(resumo).toContain('Histórico de mudanças (2)');
  expect(resumo).toContain(
    'Situação: Entrada · Responsável: a completar · Motivo: Cadastro fictício',
  );
  expect([...responsavel.options].map((opcao) => opcao.textContent)).toEqual([
    'Selecione…',
    'ana@exemplo.test (Profissional)',
  ]);
  expect(situacao.value).toBe('ativo');
  expect(responsavel.value).toBe(ana);
  situacao.value = 'pausado';
  motivo.value = 'Pausa fictícia';
  raiz.querySelector('form')?.requestSubmit();
  await vi.waitFor(() => expect(ciclo.editar).toHaveBeenCalled());
  expect(ciclo.editar).toHaveBeenCalledWith(id, {
    situacao: 'pausado',
    versao_esperada: paciente.versao,
    motivo: 'Pausa fictícia',
  });
});

it('indica o que falta completar em caso anterior e não envia situação nem responsável sem escolha', async () => {
  const { raiz, ciclo, situacao, responsavel, motivo } = await abrirComCaso([], {
    listarResponsaveis: vi.fn().mockResolvedValue(equipe),
  });
  await vi.waitFor(() => expect(responsavel.disabled).toBe(false));
  const resumo = resumoDe(raiz);
  expect(resumo).toContain('Situação: a completar');
  expect(resumo).toContain('Responsável: a completar');
  expect(resumo).toContain(
    'A completar: nome de preferência, data de nascimento, contato, situação do caso, responsável.',
  );
  expect(situacao.value).toBe('');
  expect(responsavel.value).toBe('');
  motivo.value = 'Sem escolha';
  raiz.querySelector('form')?.requestSubmit();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Altere ao menos um campo'));
  expect(ciclo.editar).not.toHaveBeenCalled();
});

it('sinaliza responsável inativo, não o oferece e envia a nova indicação', async () => {
  const { raiz, ciclo, responsavel, motivo } = await abrirComCaso(
    [mudanca({ responsavel_id: bia, responsavel_ativo: false })],
    { listarResponsaveis: vi.fn().mockResolvedValue(equipe) },
  );
  await vi.waitFor(() => expect(resumoDe(raiz)).toContain('bia@exemplo.test'));
  expect(resumoDe(raiz)).toContain(
    'Responsável: bia@exemplo.test (Profissional) (inativo: indique um novo responsável)',
  );
  expect([...responsavel.options].some((opcao) => opcao.value === bia)).toBe(false);
  expect(responsavel.value).toBe('');
  responsavel.value = ana;
  motivo.value = 'Nova indicação';
  raiz.querySelector('form')?.requestSubmit();
  await vi.waitFor(() => expect(ciclo.editar).toHaveBeenCalled());
  expect(ciclo.editar).toHaveBeenCalledWith(id, {
    responsavel_id: ana,
    versao_esperada: paciente.versao,
    motivo: 'Nova indicação',
  });
});

it('trata responsável recusado como recusa definitiva, mantendo o rascunho e a confirmação da barreira', async () => {
  const { raiz, ciclo, responsavel, motivo } = await abrirComCaso(
    [mudanca({ responsavel_id: null, responsavel_ativo: null })],
    { listarResponsaveis: vi.fn().mockResolvedValue(equipe) },
    vi.fn().mockRejectedValue(new FalhaApi('responsavel_invalido', 422)),
  );
  await vi.waitFor(() => expect(responsavel.disabled).toBe(false));
  responsavel.value = ana;
  motivo.value = 'Troca fictícia';
  raiz.querySelector('form')?.requestSubmit();
  await vi.waitFor(() => expect(ciclo.editar).toHaveBeenCalled());
  await vi.waitFor(() => expect(raiz.textContent).toContain('Nada foi alterado'));
  expect(raiz.textContent).toContain('O responsável indicado não está disponível.');
  expect(raiz.textContent).not.toContain('Não foi possível confirmar o salvamento');
  expect(motivo.value).toBe('Troca fictícia');
  expect(
    [...raiz.querySelectorAll('button')].some(
      (botao) => botao.textContent === 'Conferir o que foi salvo' && !botao.hidden,
    ),
  ).toBe(true);
});

it('mantém a situação editável quando a equipe não pode ser listada', async () => {
  const semLista = await abrirComCaso([mudanca()]);
  expect(semLista.responsavel.disabled).toBe(true);
  expect(semLista.responsavel.options[0]?.textContent).toBe(
    'Listagem da equipe indisponível para este perfil',
  );
  semLista.situacao.value = 'encerrado';
  semLista.motivo.value = 'Alta fictícia';
  semLista.raiz.querySelector('form')?.requestSubmit();
  await vi.waitFor(() => expect(semLista.ciclo.editar).toHaveBeenCalled());
  expect(semLista.ciclo.editar).toHaveBeenCalledWith(id, {
    situacao: 'encerrado',
    versao_esperada: paciente.versao,
    motivo: 'Alta fictícia',
  });
  const falha = await abrirComCaso([mudanca()], {
    listarResponsaveis: vi.fn().mockRejectedValue(new Error()),
  });
  await vi.waitFor(() =>
    expect(falha.responsavel.options[0]?.textContent).toContain('Não foi possível listar a equipe'),
  );
  expect(falha.responsavel.disabled).toBe(true);
  expect(resumoDe(falha.raiz)).toContain('Responsável: Responsável indicado');
});

it('mostra "Registrado no cadastro do caso." no primeiro retrato, que não tem motivo', async () => {
  const primeiro = mudanca({
    versao: 1,
    situacao: 'entrada',
    motivo: null,
    criado_em: '2026-11-01T15:00:00.000000+00:00',
  });
  const { raiz } = await abrirComCaso([primeiro], {
    listarResponsaveis: vi.fn().mockResolvedValue(equipe),
  });
  await vi.waitFor(() => expect(resumoDe(raiz)).toContain('ana@exemplo.test'));
  const resumo = resumoDe(raiz);
  expect(resumo).toContain('Desde 01/11/2026. Registrado no cadastro do caso.');
  expect(resumo).not.toContain('Motivo');
  expect(resumo).not.toContain('null');
});

it('no histórico, só o primeiro retrato sem motivo mostra o registro do cadastro', async () => {
  const primeiro = mudanca({
    versao: 1,
    situacao: 'entrada',
    motivo: null,
    criado_em: '2026-11-01T15:00:00.000000+00:00',
  });
  const pausa = mudanca({ versao: 2, situacao: 'pausado', motivo: 'Pausa fictícia' });
  const { raiz } = await abrirComCaso([pausa, primeiro], {
    listarResponsaveis: vi.fn().mockResolvedValue(equipe),
  });
  await vi.waitFor(() => expect(resumoDe(raiz)).toContain('ana@exemplo.test'));
  const itens = [...raiz.querySelectorAll('.caso-resumo ol li')].map((item) => item.textContent);
  expect(itens).toHaveLength(2);
  expect(itens[0]).toContain('Situação: Pausado');
  expect(itens[0]).toContain('Motivo: Pausa fictícia');
  expect(itens[0]).not.toContain('Registrado no cadastro do caso.');
  expect(itens[1]).toContain('Situação: Entrada');
  expect(itens[1]).toContain('· Registrado no cadastro do caso.');
  expect(itens[1]).not.toContain('Motivo');
  expect(resumoDe(raiz)).not.toContain('null');
});
