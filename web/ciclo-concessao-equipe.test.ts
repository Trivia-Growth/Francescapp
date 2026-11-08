import { expect, it, vi } from 'vitest';
import { criarCicloConcessaoEquipe } from './ciclo-concessao-equipe.ts';

const ator = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const dados = {
  email: 'equipe@example.test',
  perfil: 'profissional' as const,
  metodo: 'google_workspace' as const,
  motivo: 'Admissão aprovada',
};

it('recusa nova criação após falha de transporte até cercar e consultar novamente', async () => {
  let epoca = 1;
  const portas = {
    identidadeAtual: () => ({ usuario_id: ator, session_id: ator }),
    consultar: async () => ({ epoca, reserva: null, resultado_pendente: null }),
    reservar: vi.fn().mockRejectedValue(new Error('rede')),
    criar: vi.fn(),
    encerrar: async () => {
      epoca++;
      return 'vazia';
    },
    reconhecer: async () => 'reconhecido',
  };
  const ciclo = criarCicloConcessaoEquipe(portas, () => id);
  await ciclo.consultar();
  await ciclo.encerrar();
  await ciclo.consultar();
  ciclo.liberar();
  await expect(ciclo.criar(dados)).rejects.toThrow('rede');
  await expect(ciclo.criar(dados)).rejects.toThrow('Concessão bloqueada');
  expect(portas.criar).not.toHaveBeenCalled();
});
