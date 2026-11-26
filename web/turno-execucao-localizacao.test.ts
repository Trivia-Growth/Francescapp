// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  coletarLocalizacaoTurno,
  montarConsentimentoTurno,
  type PortasLocalizacaoTurno,
} from './turno-execucao-localizacao.ts';
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const posicao = {
  coords: { latitude: -23, longitude: -46, accuracy: 12 },
  timestamp: 1,
} as GeolocationPosition;
it('sem consentimento ou com revogação não solicita coordenadas', async () => {
  const getCurrentPosition = vi.fn();
  const sinal = new AbortController().signal;
  await expect(coletarLocalizacaoTurno(null, sinal, { getCurrentPosition })).resolves.toEqual({
    motivo_ausencia: 'consentimento_ausente',
  });
  await expect(
    coletarLocalizacaoTurno({ versao: 2, concedido: false }, sinal, { getCurrentPosition }),
  ).resolves.toEqual({ motivo_ausencia: 'consentimento_revogado' });
  expect(getCurrentPosition).not.toHaveBeenCalled();
});
it('deadline JS termina coleta mesmo com permissão pendente e API sem callbacks', async () => {
  vi.useFakeTimers();
  const getCurrentPosition = vi.fn();
  const promessa = coletarLocalizacaoTurno(
    { versao: 1, concedido: true },
    new AbortController().signal,
    { getCurrentPosition },
  );
  expect(getCurrentPosition).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(5_000);
  await expect(promessa).resolves.toEqual({ motivo_ausencia: 'falha' });
  expect(vi.getTimerCount()).toBe(0);
});
it('callback tardio após deadline não muda declaração de ausência', async () => {
  vi.useFakeTimers();
  let sucesso!: PositionCallback;
  const getCurrentPosition = vi.fn((callback: PositionCallback) => {
    sucesso = callback;
  });
  const resolvida = vi.fn();
  const promessa = coletarLocalizacaoTurno(
    { versao: 1, concedido: true },
    new AbortController().signal,
    { getCurrentPosition },
  ).then(resolvida);
  await vi.advanceTimersByTimeAsync(5_000);
  sucesso(posicao);
  await promessa;
  expect(resolvida).toHaveBeenCalledTimes(1);
  expect(resolvida).toHaveBeenCalledWith({ motivo_ausencia: 'falha' });
  expect(vi.getTimerCount()).toBe(0);
});
it('desmontagem interrompe coleta e ignora coordenada posterior', async () => {
  vi.useFakeTimers();
  let sucesso!: PositionCallback;
  const controle = new AbortController();
  const promessa = coletarLocalizacaoTurno({ versao: 1, concedido: true }, controle.signal, {
    getCurrentPosition: (callback) => {
      sucesso = callback;
    },
  });
  controle.abort();
  sucesso(posicao);
  await expect(promessa).resolves.toEqual({ motivo_ausencia: 'falha' });
  expect(vi.getTimerCount()).toBe(0);
});
it('consulta de consentimento sem resposta vence prazo e não inicia geolocalização', async () => {
  vi.useFakeTimers();
  const raiz = document.createElement('div');
  const getCurrentPosition = vi.fn();
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
  const servico: PortasLocalizacaoTurno = {
    consultar: () => new Promise(() => {}),
    gravar: vi.fn(),
    registrar: vi.fn(),
  };
  const montagem = montarConsentimentoTurno(raiz, servico, { acessoPerdido: vi.fn() });
  const promessa = montagem.coletar();
  await vi.advanceTimersByTimeAsync(2_000);
  await expect(promessa).resolves.toEqual({ motivo_ausencia: 'falha' });
  expect(getCurrentPosition).not.toHaveBeenCalled();
  montagem.desmontar();
  vi.unstubAllGlobals();
});
