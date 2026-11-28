// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import type { ServicoTurnoHttp } from './servico-turno-http.ts';
import { montarTurnoProprio } from './turno-proprio.js';
const passagem = vi.hoisted(() => ({ encerrar: null as null | ((id: string) => Promise<void>) }));
// O dublê captura o comando de encerramento que o turno entrega à Passagem por props.
vi.mock('./passagem-turno.js', () => ({
  PassagemTurnoTela: ({ opcoes }: { opcoes: { encerrar(id: string): Promise<void> } }) => {
    passagem.encerrar = opcoes.encerrar;
    return null;
  },
}));
const usuario = '10000000-0000-4000-8000-000000000001';
const paciente = '20000000-0000-4000-8000-000000000001';
const id = '30000000-0000-4000-8000-000000000001';
const aberto = {
  turno_id: id,
  paciente_id: paciente,
  profissional_usuario_id: usuario,
  aberto_em: '2026-11-19T12:00:00Z',
  encerrado_em: null,
  situacao: 'aberto' as const,
  versao: 1,
  parametros: {
    duracao_padrao_minutos: 60,
    tolerancia_atraso_minutos: 0,
    tratamento_nao_encerrado: 'sinalizar_pendencia' as const,
  },
};
const fechado = {
  ...aberto,
  situacao: 'encerrado' as const,
  versao: 2,
  encerrado_em: '2026-11-19T13:00:00Z',
};
const vazio = { epoca: 7, reserva: null, resultado_pendente: null };
const recibo = {
  recibo_id: usuario,
  reserva_id: usuario,
  resultado: 'confirmada' as const,
  paciente_id: paciente,
  turno_id: id,
  versao_esperada: 0,
};
function preparar() {
  return {
    consultarBarreira: vi.fn<ServicoTurnoHttp['consultarBarreira']>().mockResolvedValue(vazio),
    consultarAtual: vi.fn<ServicoTurnoHttp['consultarAtual']>().mockResolvedValue(null),
    consultarUltimo: vi.fn<ServicoTurnoHttp['consultarUltimo']>().mockResolvedValue(null),
    consultar: vi.fn<ServicoTurnoHttp['consultar']>().mockResolvedValue(aberto),
    reservar: vi.fn<ServicoTurnoHttp['reservar']>().mockResolvedValue({ estado: 'aberta' }),
    abrir: vi.fn<ServicoTurnoHttp['abrir']>().mockResolvedValue(aberto),
    encerrar: vi.fn<ServicoTurnoHttp['encerrar']>().mockResolvedValue(fechado),
    reconhecer: vi
      .fn<ServicoTurnoHttp['reconhecer']>()
      .mockResolvedValue({ estado: 'reconhecido' }),
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  passagem.encerrar = null;
});
it('permissão de localização pendente não impede abertura confirmada nem reconhecimento', async () => {
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(id);
  const api = preparar();
  api.consultarBarreira
    .mockResolvedValueOnce(vazio)
    .mockResolvedValueOnce(vazio)
    .mockResolvedValueOnce({ ...vazio, resultado_pendente: recibo })
    .mockResolvedValue(vazio);
  api.consultarAtual.mockResolvedValueOnce(null).mockResolvedValue(aberto);
  const coletar = vi.fn(() => new Promise<never>(() => {}));
  const registrar = vi.fn();
  const raiz = document.createElement('div');
  const desmontar = montarTurnoProprio(raiz, paciente, api as ServicoTurnoHttp, {
    acessoPerdido: vi.fn(),
    localizacao: { coletar, registrar },
  });
  await vi.waitFor(() => expect(raiz.textContent).toContain('Você não tem turno aberto'));
  const confirmar = raiz.querySelector('input');
  if (!confirmar) throw new Error('Confirmação ausente');
  confirmar.checked = true;
  confirmar.dispatchEvent(new Event('change'));
  raiz.querySelector('form')?.requestSubmit();
  await vi.waitFor(() => expect(api.reconhecer).toHaveBeenCalledOnce());
  expect(api.abrir).toHaveBeenCalledOnce();
  expect(coletar).toHaveBeenCalledOnce();
  expect(registrar).not.toHaveBeenCalled();
  expect(api.abrir.mock.invocationCallOrder[0]).toBeLessThan(
    coletar.mock.invocationCallOrder[0] ?? 0,
  );
  desmontar();
});
it('consulta de consentimento sem resposta não impede encerramento com passagem confirmada', async () => {
  const api = preparar();
  api.consultarAtual.mockResolvedValueOnce(aberto).mockResolvedValue(null);
  api.consultarUltimo.mockResolvedValue(fechado);
  api.consultar.mockResolvedValue(fechado);
  api.consultarBarreira
    .mockResolvedValueOnce(vazio)
    .mockResolvedValueOnce(vazio)
    .mockResolvedValueOnce({ ...vazio, resultado_pendente: { ...recibo, versao_esperada: 1 } })
    .mockResolvedValue(vazio);
  const coletar = vi.fn(() => new Promise<never>(() => {}));
  const raiz = document.createElement('div');
  const desmontar = montarTurnoProprio(raiz, paciente, api as ServicoTurnoHttp, {
    acessoPerdido: vi.fn(),
    localizacao: { coletar, registrar: vi.fn() },
  });
  await vi.waitFor(() => expect(passagem.encerrar).not.toBeNull());
  await passagem.encerrar?.(usuario);
  expect(api.encerrar).toHaveBeenCalledOnce();
  expect(api.reconhecer).toHaveBeenCalledOnce();
  expect(coletar).toHaveBeenCalledOnce();
  expect(raiz.textContent).toContain('Turno encerrado com síntese publicada');
  desmontar();
});
