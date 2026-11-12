// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { FalhaApi } from './api.js';
import { montarPlanoCuidado as montar, type ServicoPlanoCuidado } from './plano-cuidado.js';

function montarPlanoCuidado(
  raiz: HTMLElement,
  paciente: string,
  servico: Omit<ServicoPlanoCuidado, 'ciclo'> & { criarObjetivo: ReturnType<typeof vi.fn> },
  acesso: (erro: unknown) => void,
) {
  const ciclo = {
    consultar: vi.fn().mockResolvedValue({ epoca: 1, reserva: null, resultado_pendente: null }),
    encerrar: vi.fn().mockResolvedValue('vazia'),
    reconhecer: vi.fn(),
    liberar: vi.fn(),
    criar: servico.criarObjetivo,
  };
  return montar(raiz, paciente, { ...servico, ciclo }, acesso);
}

const objetivo = {
  descricao: '<img src=x>',
  area: 'Cuidado',
  responsavel: 'Equipe',
  situacaoInicial: 'Inicial',
  observacaoProgresso: 'Observação',
  dataRevisao: '2026-12-01',
  estado: 'proposto' as const,
};
const atual = { objetivo_id: 'objetivo', versao: 1, objetivo };

it('mostra texto como texto e envia revisão com versão esperada', async () => {
  const raiz = document.createElement('div');
  const revisarObjetivo = vi.fn().mockResolvedValue(undefined);
  montarPlanoCuidado(
    raiz,
    'paciente',
    {
      consultarHistorico: vi.fn(),
      consultarObjetivos: vi.fn().mockResolvedValue({ itens: [atual], proximo_cursor: null }),
      criarObjetivo: vi.fn(),
      revisarObjetivo,
    },
    vi.fn(),
  );
  await vi.waitFor(() => expect(raiz.textContent).toContain('<img src=x>'));
  expect(raiz.querySelector('img')).toBeNull();
  [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Revisar objetivo')?.click();
  const motivo = [...raiz.querySelectorAll('label')]
    .find((label) => label.textContent?.includes('Motivo da revisão'))
    ?.querySelector('textarea');
  if (!motivo) throw new Error('Motivo ausente');
  motivo.value = 'Ajuste';
  raiz.querySelector('form')?.requestSubmit();
  await vi.waitFor(() =>
    expect(revisarObjetivo).toHaveBeenCalledWith('paciente', 'objetivo', 1, {
      objetivo,
      motivo: 'Ajuste',
    }),
  );
});

it('preserva rascunho e bloqueia reenvio quando resultado é incerto', async () => {
  const raiz = document.createElement('div');
  const revisarObjetivo = vi.fn().mockRejectedValue(new Error());
  montarPlanoCuidado(
    raiz,
    'paciente',
    {
      consultarHistorico: vi.fn(),
      consultarObjetivos: vi.fn().mockResolvedValue({ itens: [atual], proximo_cursor: null }),
      criarObjetivo: vi.fn(),
      revisarObjetivo,
    },
    vi.fn(),
  );
  await vi.waitFor(() => expect(raiz.textContent).toContain('Revisar objetivo'));
  [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Revisar objetivo')?.click();
  const motivo = [...raiz.querySelectorAll('label')]
    .find((label) => label.textContent?.includes('Motivo da revisão'))
    ?.querySelector('textarea');
  if (!motivo) throw new Error('Motivo ausente');
  motivo.value = 'Ajuste';
  raiz.querySelector('form')?.requestSubmit();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Não foi possível confirmar'));
  raiz.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  expect(revisarObjetivo).toHaveBeenCalledTimes(1);
  expect(motivo.value).toBe('Ajuste');
});

it('remove dados quando acesso é revogado', async () => {
  const raiz = document.createElement('div');
  const acessoPerdido = vi.fn();
  montarPlanoCuidado(
    raiz,
    'paciente',
    {
      consultarHistorico: vi.fn(),
      consultarObjetivos: vi.fn().mockRejectedValue(new FalhaApi('negado', 403)),
      criarObjetivo: vi.fn(),
      revisarObjetivo: vi.fn(),
    },
    acessoPerdido,
  );
  await vi.waitFor(() => expect(acessoPerdido).toHaveBeenCalledOnce());
  expect(raiz.childElementCount).toBe(0);
});

it('consulta plano atual sem perder rascunho nem reenviar após conflito', async () => {
  const raiz = document.createElement('div');
  const revisarObjetivo = vi.fn().mockRejectedValue(new FalhaApi('conflito_versao', 409));
  const consultarObjetivos = vi.fn().mockResolvedValue({ itens: [atual], proximo_cursor: null });
  montarPlanoCuidado(
    raiz,
    'paciente',
    { consultarHistorico: vi.fn(), consultarObjetivos, criarObjetivo: vi.fn(), revisarObjetivo },
    vi.fn(),
  );
  await vi.waitFor(() => expect(raiz.textContent).toContain('Revisar objetivo'));
  [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Revisar objetivo')?.click();
  const motivo = [...raiz.querySelectorAll('label')]
    .find((label) => label.textContent?.includes('Motivo da revisão'))
    ?.querySelector('textarea');
  if (!motivo) throw new Error('Motivo ausente');
  motivo.value = 'Rascunho preservado';
  raiz.querySelector('form')?.requestSubmit();
  await vi.waitFor(() => expect(raiz.textContent).toContain('outra pessoa'));
  [...raiz.querySelectorAll('button')]
    .find((b) => b.textContent === 'Consultar versão atual')
    ?.click();
  await vi.waitFor(() =>
    expect(raiz.textContent).toContain('Descartar rascunho e abrir plano atual'),
  );
  expect(motivo.value).toBe('Rascunho preservado');
  expect(revisarObjetivo).toHaveBeenCalledTimes(1);
  [...raiz.querySelectorAll('button')]
    .find((b) => b.textContent === 'Descartar rascunho e abrir plano atual')
    ?.click();
  expect(raiz.querySelector('form')).toBeNull();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Revisar objetivo'));
});

it('mantém criação bloqueada após consulta quando salvamento pode concluir depois', async () => {
  const raiz = document.createElement('div');
  const criarObjetivo = vi.fn().mockRejectedValue(new Error());
  const consultarObjetivos = vi.fn().mockResolvedValue({ itens: [], proximo_cursor: null });
  montarPlanoCuidado(
    raiz,
    'paciente',
    { consultarHistorico: vi.fn(), consultarObjetivos, criarObjetivo, revisarObjetivo: vi.fn() },
    vi.fn(),
  );
  await vi.waitFor(() => expect(raiz.textContent).toContain('Adicionar objetivo'));
  [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Conferir e liberar')?.click();
  await vi.waitFor(() =>
    expect(
      [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Adicionar objetivo')
        ?.disabled,
    ).toBe(false),
  );
  [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Adicionar objetivo')?.click();
  const form = raiz.querySelector('form');
  if (!form) throw new Error('Formulário ausente');
  const preencher = (nome: string, valor: string) => {
    const campo = [...form.querySelectorAll('label')]
      .find((l) => l.textContent?.includes(nome))
      ?.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement | null;
    if (!campo) throw new Error(`Campo ausente: ${nome}`);
    campo.value = valor;
  };
  preencher('Objetivo', 'Objetivo fictício');
  preencher('Área', 'Cuidado');
  preencher('Responsável', 'Equipe');
  preencher('Situação inicial', 'Inicial');
  preencher('Como observar o progresso', 'Observação');
  preencher('Data de revisão', '2026-12-01');
  form.requestSubmit();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Não foi possível confirmar'));
  [...raiz.querySelectorAll('button')]
    .find((b) => b.textContent === 'Consultar versão atual')
    ?.click();
  await vi.waitFor(() =>
    expect(raiz.textContent).toContain('Descartar rascunho e abrir plano atual'),
  );
  [...raiz.querySelectorAll('button')]
    .find((b) => b.textContent === 'Descartar rascunho e abrir plano atual')
    ?.click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Adicionar objetivo'));
  const adicionar = [...raiz.querySelectorAll('button')].find(
    (b) => b.textContent === 'Adicionar objetivo',
  );
  expect(adicionar?.disabled).toBe(true);
  expect(raiz.textContent).toContain('confira se já existe algum envio aguardando resposta');
  expect(criarObjetivo).toHaveBeenCalledTimes(1);
});

it('impede reconhecimento de resultado de criação de outro paciente', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const outro = '00000000-0000-4000-8000-000000000002';
  const ciclo = {
    consultar: vi.fn().mockResolvedValue({
      epoca: 1,
      reserva: null,
      resultado_pendente: {
        recibo_id: id,
        reserva_id: id,
        resultado: 'confirmada',
        paciente_id: outro,
        objetivo_id: id,
      },
    }),
    encerrar: vi.fn(),
    reconhecer: vi.fn(),
    liberar: vi.fn(),
    criar: vi.fn(),
  };
  const raiz = document.createElement('div');
  montar(
    raiz,
    id,
    {
      consultarHistorico: vi.fn(),
      consultarObjetivos: vi.fn().mockResolvedValue({ itens: [], proximo_cursor: null }),
      revisarObjetivo: vi.fn(),
      ciclo,
    } as unknown as ServicoPlanoCuidado,
    vi.fn(),
  );
  await vi.waitFor(() => expect(raiz.textContent).toContain('Conferir e liberar'));
  const recuperar = [...raiz.querySelectorAll('button')].find(
    (b) => b.textContent === 'Conferir e liberar',
  );
  recuperar?.click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('outro paciente'));
  expect(raiz.textContent).not.toContain(outro);
  expect(ciclo.reconhecer).not.toHaveBeenCalled();
  expect(ciclo.liberar).not.toHaveBeenCalled();
  expect(recuperar?.hidden).toBe(true);
});

it('consulta histórico sob demanda e limpa dados ao perder acesso', async () => {
  const raiz = document.createElement('div');
  const acessoPerdido = vi.fn();
  const consultarHistorico = vi
    .fn()
    .mockResolvedValueOnce({
      itens: [
        {
          ...atual,
          ator_usuario_id: 'autor',
          data: '2026-11-04T12:00:00Z',
          motivo: '<script>motivo</script>',
        },
      ],
      proximo_cursor: null,
    })
    .mockRejectedValueOnce(new FalhaApi('negado', 403));
  montarPlanoCuidado(
    raiz,
    'paciente',
    {
      consultarHistorico,
      consultarObjetivos: vi.fn().mockResolvedValue({ itens: [atual], proximo_cursor: null }),
      criarObjetivo: vi.fn(),
      revisarObjetivo: vi.fn(),
    },
    acessoPerdido,
  );
  await vi.waitFor(() => expect(raiz.textContent).toContain('Consultar histórico'));
  expect(consultarHistorico).not.toHaveBeenCalled();
  const botao = [...raiz.querySelectorAll('button')].find(
    (b) => b.textContent === 'Consultar histórico',
  );
  botao?.click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('<script>motivo</script>'));
  expect(consultarHistorico).toHaveBeenCalledWith('paciente', 'objetivo', undefined);
  expect(raiz.querySelector('script')).toBeNull();
  botao?.click();
  await vi.waitFor(() => expect(acessoPerdido).toHaveBeenCalledOnce());
  expect(raiz.childElementCount).toBe(0);
});

it('remove dados quando acesso é revogado após redesenho durante consulta de histórico', async () => {
  const raiz = document.createElement('div');
  const acessoPerdido = vi.fn();
  let rejeitar: (erro: unknown) => void = () => {};
  const historico = new Promise<never>((_, reject) => {
    rejeitar = reject;
  });
  montarPlanoCuidado(
    raiz,
    'paciente',
    {
      consultarHistorico: vi.fn().mockReturnValue(historico),
      consultarObjetivos: vi.fn().mockResolvedValue({ itens: [atual], proximo_cursor: null }),
      criarObjetivo: vi.fn(),
      revisarObjetivo: vi.fn().mockResolvedValue(undefined),
    },
    acessoPerdido,
  );
  await vi.waitFor(() => expect(raiz.textContent).toContain('Consultar histórico'));
  [...raiz.querySelectorAll('button')]
    .find((b) => b.textContent === 'Consultar histórico')
    ?.click();
  [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Revisar objetivo')?.click();
  const motivo = [...raiz.querySelectorAll('label')]
    .find((l) => l.textContent?.includes('Motivo da revisão'))
    ?.querySelector('textarea');
  if (!motivo) throw new Error('Motivo ausente');
  motivo.value = 'Revisão';
  raiz.querySelector('form')?.requestSubmit();
  await vi.waitFor(() => expect(raiz.querySelector('form')).toBeNull());
  rejeitar(new FalhaApi('negado', 403));
  await vi.waitFor(() => expect(acessoPerdido).toHaveBeenCalledOnce());
  expect(raiz.childElementCount).toBe(0);
});

it('mantém criação bloqueada após recarga quando confirmação da barreira falha, sem persistir rascunho', async () => {
  localStorage.clear();
  const raiz = document.createElement('div');
  const ciclo = {
    consultar: vi.fn().mockRejectedValue(new Error('rede')),
    encerrar: vi.fn(),
    reconhecer: vi.fn(),
    liberar: vi.fn(),
    criar: vi.fn(),
  };
  const desmontar = montar(
    raiz,
    'paciente',
    {
      ciclo,
      consultarHistorico: vi.fn(),
      consultarObjetivos: vi.fn().mockResolvedValue({ itens: [], proximo_cursor: null }),
      revisarObjetivo: vi.fn(),
    },
    vi.fn(),
  );
  await vi.waitFor(() => expect(raiz.textContent).toContain('Conferir e liberar'));
  [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Conferir e liberar')?.click();
  await vi.waitFor(() => expect(raiz.textContent).toContain('Não foi possível conferir agora'));
  expect(
    [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Adicionar objetivo')
      ?.disabled,
  ).toBe(true);
  desmontar();
  montar(
    raiz,
    'paciente',
    {
      ciclo,
      consultarHistorico: vi.fn(),
      consultarObjetivos: vi.fn().mockResolvedValue({ itens: [], proximo_cursor: null }),
      revisarObjetivo: vi.fn(),
    },
    vi.fn(),
  );
  await vi.waitFor(() => expect(raiz.textContent).toContain('Conferir e liberar'));
  expect(
    [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Adicionar objetivo')
      ?.disabled,
  ).toBe(true);
  expect(localStorage.length).toBe(0);
  expect(ciclo.criar).not.toHaveBeenCalled();
});

it('preserva rascunho de revisão e impede abertura durante reconciliação', async () => {
  const raiz = document.createElement('div');
  let concluir!: (valor: { epoca: number; reserva: null; resultado_pendente: null }) => void;
  const ciclo = {
    consultar: vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            concluir = resolve;
          }),
      )
      .mockResolvedValue({ epoca: 1, reserva: null, resultado_pendente: null }),
    encerrar: vi.fn().mockResolvedValue('vazia'),
    reconhecer: vi.fn(),
    liberar: vi.fn(),
    criar: vi.fn(),
  };
  montar(
    raiz,
    'paciente',
    {
      ciclo,
      consultarHistorico: vi.fn(),
      consultarObjetivos: vi.fn().mockResolvedValue({ itens: [atual], proximo_cursor: null }),
      revisarObjetivo: vi.fn(),
    },
    vi.fn(),
  );
  await vi.waitFor(() => expect(raiz.textContent).toContain('Revisar objetivo'));
  const botao = (texto: string) =>
    [...raiz.querySelectorAll('button')].find((b) => b.textContent === texto);
  botao('Revisar objetivo')?.click();
  const motivo = [...raiz.querySelectorAll('label')]
    .find((l) => l.textContent?.includes('Motivo da revisão'))
    ?.querySelector('textarea');
  if (!motivo) throw new Error('Motivo ausente');
  motivo.value = 'Rascunho';
  expect(botao('Conferir e liberar')?.disabled).toBe(true);
  botao('Conferir e liberar')?.click();
  expect(ciclo.consultar).not.toHaveBeenCalled();
  expect(motivo.value).toBe('Rascunho');
  botao('Cancelar')?.click();
  botao('Conferir e liberar')?.click();
  botao('Revisar objetivo')?.click();
  expect(raiz.querySelector('form')).toBeNull();
  concluir({ epoca: 1, reserva: null, resultado_pendente: null });
  await vi.waitFor(() => expect(botao('Adicionar objetivo')?.disabled).toBe(false));
});

it('confirma antes de descartar alterações ao cancelar revisão', async () => {
  const raiz = document.createElement('div');
  montarPlanoCuidado(
    raiz,
    'paciente',
    {
      consultarHistorico: vi.fn(),
      consultarObjetivos: vi.fn().mockResolvedValue({ itens: [atual], proximo_cursor: null }),
      criarObjetivo: vi.fn(),
      revisarObjetivo: vi.fn(),
    },
    vi.fn(),
  );
  await vi.waitFor(() => expect(raiz.textContent).toContain('Revisar objetivo'));
  [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Revisar objetivo')?.click();
  const campo = raiz.querySelector('form textarea');
  if (!campo) throw new Error('Campo ausente');
  campo.value = 'Rascunho fictício';
  campo.dispatchEvent(new Event('input', { bubbles: true }));
  const confirmar = vi
    .spyOn(window, 'confirm')
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(true);
  const cancelar = [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Cancelar');
  cancelar?.click();
  expect(campo.value).toBe('Rascunho fictício');
  expect(raiz.querySelector('form')).not.toBeNull();
  cancelar?.click();
  expect(raiz.querySelector('form')).toBeNull();
  confirmar.mockRestore();
});
