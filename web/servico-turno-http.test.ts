// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { criarServicoTurnoHttp } from './servico-turno-http.ts';

const usuario = '10000000-0000-4000-8000-000000000001';
const paciente = '20000000-0000-4000-8000-000000000001';
const turnoId = '30000000-0000-4000-8000-000000000001';
const identidade = { usuario_id: usuario, session_id: usuario };
const turno = {
  turno_id: turnoId,
  paciente_id: paciente,
  profissional_usuario_id: usuario,
  aberto_em: '2026-11-18T12:00:00.000Z',
  encerrado_em: null,
  situacao: 'aberto',
  versao: 1,
  parametros: {
    duracao_padrao_minutos: 60,
    tolerancia_atraso_minutos: 0,
    tratamento_nao_encerrado: 'sinalizar_pendencia',
  },
};
function preparar() {
  sessionStorage.setItem('modo-acesso', 'google');
  sessionStorage.setItem('fluxo-google', 'abcdefghijklmnopqrstuv');
  return criarServicoTurnoHttp(() => identidade);
}
afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

it('consulta atual sem ID local e aceita vazio somente em envelope válido', async () => {
  const servico = preparar();
  const buscar = vi.fn(async () => Response.json({ dados: null, request_id: usuario }));
  vi.stubGlobal('fetch', buscar);
  await expect(servico.consultarAtual(paciente)).resolves.toBeNull();
  expect(buscar).toHaveBeenCalledWith(
    `/api/pacientes/${paciente}/turnos/atual`,
    expect.objectContaining({ method: 'GET', cache: 'no-store', credentials: 'same-origin' }),
  );
});
it.each([
  { ...turno, paciente_id: usuario },
  { ...turno, profissional_usuario_id: paciente },
  { ...turno, situacao: 'encerrado', encerrado_em: '2026-11-18T13:00:00.000Z' },
])('rejeita resultado fora da consulta própria atual', async (dados) => {
  const servico = preparar();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ dados, request_id: usuario })),
  );
  await expect(servico.consultarAtual(paciente)).rejects.toMatchObject({
    codigo: 'servico_indisponivel',
  });
});
it('503 válido não vira lista vazia', async () => {
  const servico = preparar();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json(
        { erro: { codigo: 'servico_indisponivel' }, request_id: usuario },
        { status: 503 },
      ),
    ),
  );
  await expect(servico.consultarAtual(paciente)).rejects.toBeDefined();
});
it('resposta de abertura malformada permanece resultado incerto', async () => {
  const servico = preparar();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ dados: null, request_id: usuario })),
  );
  await expect(
    servico.abrir(
      paciente,
      { turno_id: turnoId, reserva_id: usuario, geracao_reserva: 7 },
      usuario,
    ),
  ).rejects.toMatchObject({ codigo: 'pendencia_externa' });
});
it('troca de identidade durante consulta descarta conteúdo', async () => {
  preparar();
  let atual = identidade;
  const servico = criarServicoTurnoHttp(() => atual);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      atual = { usuario_id: paciente, session_id: paciente };
      return Response.json({ dados: turno, request_id: usuario });
    }),
  );
  await expect(servico.consultarAtual(paciente)).rejects.toMatchObject({
    codigo: 'nao_autenticado',
  });
});
it('instância antiga não inicia segunda chamada com sessão nova', async () => {
  preparar();
  let atual = identidade;
  const servico = criarServicoTurnoHttp(() => atual);
  const buscar = vi.fn(async () => Response.json({ dados: null, request_id: usuario }));
  vi.stubGlobal('fetch', buscar);
  await servico.consultarAtual(paciente);
  atual = { usuario_id: usuario, session_id: paciente };
  await expect(
    servico.reservar({
      epoca: 7,
      reserva_id: usuario,
      paciente_id: paciente,
      turno_id: turnoId,
      versao_esperada: 0,
    }),
  ).rejects.toMatchObject({ codigo: 'nao_autenticado' });
  expect(buscar).toHaveBeenCalledTimes(1);
});
it('último turno encerrado é recuperado sem convertê-lo em turno aberto', async () => {
  const servico = preparar();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        dados: { ...turno, situacao: 'encerrado', encerrado_em: '2026-11-18T13:00:00Z' },
        request_id: usuario,
      }),
    ),
  );
  await expect(servico.consultarUltimo(paciente)).resolves.toMatchObject({ situacao: 'encerrado' });
});
it('publicação envia modelo FR009 sem autoria ou relógio e 202 não confirma persistência', async () => {
  const servico = preparar();
  const buscar = vi.fn(async (_url: string, _opcoes: RequestInit) =>
    Response.json({ dados: {}, request_id: usuario }, { status: 202 }),
  );
  vi.stubGlobal('fetch', buscar);
  const entrada = {
    versao_esperada: 0,
    conteudo: { data: '2026-11-18', area: 'Área configurada', atividade: 'Síntese fictícia' },
  };
  await expect(servico.publicarPassagem(paciente, turnoId, entrada, usuario)).rejects.toMatchObject(
    { codigo: 'pendencia_externa' },
  );
  expect(buscar).toHaveBeenCalledWith(
    `/api/pacientes/${paciente}/turnos/${turnoId}/passagem`,
    expect.objectContaining({ method: 'POST' }),
  );
  expect(JSON.parse(buscar.mock.calls[0]?.[1]?.body as string)).toEqual(entrada);
  expect(buscar).toHaveBeenCalledTimes(1);
});

it('consulta escala com cursor estrito e mantém rótulos históricos fora do catálogo elegível', async () => {
  const servico = preparar();
  const buscar = vi.fn(async () =>
    Response.json({
      dados: {
        identidades: [{ usuario_id: usuario, rotulo: 'Autor fictício anterior' }],
        pode_gerir: false,
        profissionais: [],
        itens: [],
        proximo_cursor: null,
      },
      request_id: usuario,
    }),
  );
  vi.stubGlobal('fetch', buscar);
  const resultado = await servico.consultarEscala(paciente, { escala_id: turnoId, versao: 50 });
  expect(buscar).toHaveBeenCalledWith(
    `/api/pacientes/${paciente}/turnos/escala?cursor_escala_id=${turnoId}&cursor_versao=50`,
    expect.objectContaining({ method: 'GET' }),
  );
  expect(resultado.profissionais).toEqual([]);
  expect(resultado.identidades[0]?.rotulo).toBe('Autor fictício anterior');
  await expect(
    servico.consultarEscala(paciente, { escala_id: turnoId, versao: 0 }),
  ).rejects.toBeDefined();
  expect(buscar).toHaveBeenCalledTimes(1);
});

it('erro HTTP contraditório não transforma mutação incerta em recusa definitiva', async () => {
  const servico = preparar();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({ erro: { codigo: 'conflito_versao' }, request_id: usuario }, { status: 500 }),
    ),
  );
  await expect(
    servico.criarEscala(
      paciente,
      {
        escala_id: turnoId,
        profissional_previsto_usuario_id: usuario,
        inicio_previsto: '2026-11-18T10:00:00Z',
        fim_previsto: '2026-11-18T12:00:00Z',
      },
      usuario,
    ),
  ).rejects.toMatchObject({ codigo: 'pendencia_externa' });
});
