import { expect, it, vi } from 'vitest';
import { criarCicloCadastro } from './ciclo-cadastro.js';

const ids = [
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004',
];
const vazio = { epoca: 1, reserva: null, resultado_pendente: null };
const identidade = { usuario_id: ids[0], session_id: ids[1] };

it('cerca a época antes de criar e conserva identificadores na chamada', async () => {
  const portas = {
    identidadeAtual: () => identidade,
    consultar: vi.fn().mockResolvedValue(vazio),
    reservar: vi.fn().mockResolvedValue('aberta'),
    criar: vi.fn().mockResolvedValue({
      id: ids[3],
      nome: 'Fictício',
      nome_preferencia: null,
      versao: 1,
      data_nascimento: null,
      contatos: [],
    }),
    encerrar: vi.fn().mockResolvedValue('vazia'),
    reconhecer: vi.fn(),
  };
  let indice = 0;
  const ciclo = criarCicloCadastro(portas, () => ids[indice++]);
  await ciclo.consultar();
  await expect(ciclo.criar({ nome: 'Fictício' })).rejects.toThrow('bloqueado');
  await ciclo.encerrar();
  await ciclo.consultar();
  ciclo.liberar();
  await ciclo.criar({ nome: 'Fictício' });
  expect(portas.reservar).toHaveBeenCalledWith({ epoca: 1, reserva_id: ids[1] }, identidade);
  expect(portas.criar).toHaveBeenCalledWith(
    {
      entrada: { nome: 'Fictício' },
      chave: ids[2],
      reserva_id: ids[1],
      geracao_reserva: 1,
    },
    identidade,
  );
  await expect(ciclo.criar({ nome: 'Outro' })).rejects.toThrow('bloqueado');
});

it('não libera após resposta perdida e repete encerramento com mesmo comando', async () => {
  const portas = {
    identidadeAtual: () => identidade,
    consultar: vi.fn().mockResolvedValue(vazio),
    reservar: vi.fn(),
    criar: vi.fn(),
    reconhecer: vi.fn(),
    encerrar: vi.fn().mockRejectedValueOnce(new Error()).mockResolvedValue('vazia'),
  };
  const ciclo = criarCicloCadastro(portas, () => ids[0]);
  await ciclo.consultar();
  await expect(ciclo.encerrar()).rejects.toThrow();
  await ciclo.consultar();
  expect(() => ciclo.liberar()).toThrow();
  await ciclo.encerrar();
  expect(portas.encerrar.mock.calls[0]).toEqual(portas.encerrar.mock.calls[1]);
  await ciclo.consultar();
  expect(() => ciclo.liberar()).not.toThrow();
});

it('resposta perdida da reserva não libera por consulta vazia', async () => {
  const portas = {
    identidadeAtual: () => identidade,
    consultar: vi.fn().mockResolvedValue(vazio),
    reservar: vi.fn().mockRejectedValue(new Error('resposta perdida')),
    criar: vi.fn(),
    encerrar: vi.fn().mockResolvedValue('vazia'),
    reconhecer: vi.fn(),
  };
  let indice = 0;
  const ciclo = criarCicloCadastro(portas, () => ids[indice++]);
  await ciclo.consultar();
  await ciclo.encerrar();
  await ciclo.consultar();
  ciclo.liberar();
  await expect(ciclo.criar({ nome: 'Fictício' })).rejects.toThrow('resposta perdida');
  await ciclo.consultar();
  expect(() => ciclo.liberar()).toThrow('bloqueado');
  expect(portas.criar).not.toHaveBeenCalled();
});

it.each(['confirmada', 'cancelada', 'negada', 'id_reutilizado', 'epoca_antiga', 'bloqueada'])(
  'não cria paciente quando reserva retorna %s e mantém recuperação bloqueada',
  async (estado) => {
    const portas = {
      identidadeAtual: () => identidade,
      consultar: vi.fn().mockResolvedValue(vazio),
      reservar: vi.fn().mockResolvedValue(estado),
      criar: vi.fn(),
      encerrar: vi.fn().mockResolvedValue('vazia'),
      reconhecer: vi.fn(),
    };
    const ciclo = criarCicloCadastro(portas, () => ids[0]);
    await ciclo.consultar();
    await ciclo.encerrar();
    await ciclo.consultar();
    ciclo.liberar();
    await expect(ciclo.criar({ nome: 'Fictício' })).rejects.toThrow('Reserva não confirmada');
    expect(portas.criar).not.toHaveBeenCalled();
    await ciclo.consultar();
    expect(() => ciclo.liberar()).toThrow('bloqueado');
    await ciclo.encerrar();
    await ciclo.consultar();
    expect(() => ciclo.liberar()).not.toThrow();
  },
);

it('invalida o ciclo se a sessão mudar durante reserva ou antes de criar', async () => {
  let atual = identidade;
  let concluir!: (estado: string) => void;
  const portas = {
    identidadeAtual: () => atual,
    consultar: vi.fn().mockResolvedValue(vazio),
    reservar: vi.fn().mockReturnValue(
      new Promise<string>((resolve) => {
        concluir = resolve;
      }),
    ),
    criar: vi.fn(),
    encerrar: vi.fn().mockResolvedValue('vazia'),
    reconhecer: vi.fn(),
  };
  let indice = 0;
  const ciclo = criarCicloCadastro(portas, () => ids[indice++]);
  await ciclo.consultar();
  await ciclo.encerrar();
  await ciclo.consultar();
  ciclo.liberar();
  const pedido = ciclo.criar({ nome: 'Fictício' });
  atual = { ...identidade, session_id: ids[2] };
  concluir('aberta');
  await expect(pedido).rejects.toThrow('Sessão alterada');
  expect(portas.criar).not.toHaveBeenCalled();
  atual = identidade;
  await expect(ciclo.criar({ nome: 'Fictício' })).rejects.toThrow('Sessão alterada');
});

it('impede envio quando outra identidade assume antes da criação', async () => {
  let atual = identidade;
  const portas = {
    identidadeAtual: () => atual,
    consultar: vi.fn().mockResolvedValue(vazio),
    reservar: vi.fn(),
    criar: vi.fn(),
    reconhecer: vi.fn(),
    encerrar: vi.fn().mockResolvedValue('vazia'),
  };
  const ciclo = criarCicloCadastro(portas, () => ids[0]);
  await ciclo.consultar();
  await ciclo.encerrar();
  await ciclo.consultar();
  ciclo.liberar();
  atual = { ...identidade, usuario_id: ids[2] };
  await expect(ciclo.criar({ nome: 'Fictício' })).rejects.toThrow('Sessão alterada');
  expect(portas.reservar).not.toHaveBeenCalled();
});
