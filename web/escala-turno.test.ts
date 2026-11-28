// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { TelaEscalaTurno } from './escala-turno.js';
import { FalhaApi } from './api.ts';
import { criarServicoTurnoHttp } from './servico-turno-http.ts';
import type { EscalaCaso } from '../packages/contracts/src/turno-passagem.ts';
const usuario = '10000000-0000-4000-8000-000000000001';
const paciente = '20000000-0000-4000-8000-000000000001';
const identidades = [
  { usuario_id: usuario, rotulo: 'Profissional previsto fictício' },
  { usuario_id: paciente, rotulo: 'Profissional substituto fictício' },
];
const versao = {
  escala_id: usuario,
  paciente_id: paciente,
  versao: 1,
  profissional_previsto_usuario_id: usuario,
  profissional_assumiu_usuario_id: null,
  inicio_previsto: '2026-11-18T10:00:00Z',
  fim_previsto: '2026-11-18T12:00:00Z',
  tipo: 'previsto' as const,
  motivo: null,
  autor_usuario_id: usuario,
  registrado_em: '2026-11-17T10:00:00Z',
};
/* A espera precisa ceder a vez ao agendador, não só à fila de microtarefas.
   Medido em 25/11/2026: o React agenda a repintura de uma atualização vinda de
   `then`/`await` fora de evento numa macrotarefa, então `await Promise.resolve()`
   repetido voltava com a tela ainda no estado anterior. Nenhuma asserção mudou. */
const aguardar = async () => {
  for (let i = 0; i < 20; i++) await new Promise((resolver) => setTimeout(resolver, 0));
};
afterEach(() => vi.restoreAllMocks());
function preparar(dados: EscalaCaso) {
  const raiz = document.createElement('div');
  const servico = criarServicoTurnoHttp(() => ({ usuario_id: usuario, session_id: usuario }));
  vi.spyOn(servico, 'consultarEscala').mockResolvedValue(dados);
  vi.spyOn(servico, 'alterarEscala').mockRejectedValue(new Error('Falha fictícia'));
  const painel = render(
    createElement(TelaEscalaTurno, {
      pacienteId: paciente,
      servico,
      opcoes: { acessoPerdido: vi.fn() },
    }),
    { container: raiz },
  );
  return { raiz, servico, desmontar: () => painel.rerender(null) };
}
it('consulta mostra original, assumiu e histórico com motivo, autor e versão sem UUID como rótulo', async () => {
  const { raiz } = preparar({
    identidades,
    proximo_cursor: null,
    pode_gerir: false,
    profissionais: [],
    itens: [
      versao,
      {
        ...versao,
        versao: 2,
        profissional_assumiu_usuario_id: paciente,
        tipo: 'substituicao',
        motivo: 'Cobertura fictícia',
      },
    ],
  });
  await aguardar();
  expect(raiz.textContent).toContain('Previsto originalmente');
  expect(raiz.textContent).toContain('Assumiu');
  expect(raiz.textContent).toContain('Cobertura fictícia');
  expect(raiz.textContent).toContain('Versão 2');
  expect(raiz.textContent).toContain('Profissional previsto fictício');
  expect(raiz.textContent).toContain('Profissional substituto fictício');
  expect(raiz.textContent).not.toContain(usuario);
  expect(raiz.querySelector('form')).toBeNull();
});
it('gestor deve informar motivo; falha não anuncia alteração e repetição mantém chave', async () => {
  const { raiz, servico } = preparar({
    identidades,
    proximo_cursor: null,
    pode_gerir: true,
    profissionais: [{ usuario_id: usuario, rotulo: 'Profissional fictício' }],
    itens: [versao],
  });
  await aguardar();
  const form = raiz.querySelector('article form');
  if (!form) throw new Error('Formulário ausente');
  const select = form.querySelectorAll('select')[1];
  const motivo = form.querySelector('textarea');
  if (!select || !motivo) throw new Error('Campos ausentes');
  select.value = usuario;
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await aguardar();
  expect(servico.alterarEscala).not.toHaveBeenCalled();
  motivo.value = 'Motivo fictício';
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await aguardar();
  expect(servico.alterarEscala).toHaveBeenCalledTimes(1);
  expect(raiz.textContent).toContain('Resultado não confirmado');
  const repetir = [...raiz.querySelectorAll('button')].find(
    (b) => b.textContent === 'Repetir operação pendente',
  );
  if (!repetir) throw new Error('Recuperação ausente');
  repetir.click();
  await aguardar();
  const chamadas = vi.mocked(servico.alterarEscala).mock.calls;
  expect(chamadas[0]).toEqual(chamadas[1]);
  [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Atualizar escala')?.click();
  await aguardar();
  expect(
    [...raiz.querySelectorAll('button')].find(
      (b) => b.textContent === 'Descartar tentativa e editar dados',
    )?.hidden,
  ).toBe(true);
});
it('vazio real não inventa escala e desmontagem impede renderização tardia', async () => {
  const { raiz, desmontar } = preparar({
    identidades,
    proximo_cursor: null,
    pode_gerir: false,
    itens: [],
    profissionais: [],
  });
  await aguardar();
  expect(raiz.textContent).toContain('Nenhum turno previsto');
  desmontar();
  await aguardar();
  expect(raiz.textContent).toBe('');
});

it('recusa definitiva exige consulta antes do descarte e preserva motivo para novo envio humano', async () => {
  const dados: EscalaCaso = {
    identidades,
    proximo_cursor: null,
    pode_gerir: true,
    profissionais: [{ usuario_id: usuario, rotulo: 'Profissional fictício' }],
    itens: [versao],
  };
  const { raiz, servico } = preparar(dados);
  vi.mocked(servico.alterarEscala).mockRejectedValue(new FalhaApi('conflito_versao', 409));
  await aguardar();
  const form = raiz.querySelector('article form');
  const select = form?.querySelectorAll('select')[1];
  const motivo = form?.querySelector('textarea');
  if (!form || !select || !motivo) throw new Error('Campos ausentes');
  select.value = usuario;
  motivo.value = 'Texto fictício preservado';
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await aguardar();
  const botao = (texto: string) =>
    [...raiz.querySelectorAll('button')].find((b) => b.textContent === texto);
  expect(botao('Descartar tentativa e editar dados')?.hidden).toBe(true);
  vi.mocked(servico.consultarEscala).mockResolvedValue({
    ...dados,
    itens: [{ ...versao, versao: 2 }],
  });
  botao('Atualizar escala')?.click();
  await aguardar();
  expect(botao('Descartar tentativa e editar dados')?.hidden).toBe(false);
  botao('Descartar tentativa e editar dados')?.click();
  const editor = raiz.querySelector('article form');
  const texto = editor?.querySelector('textarea');
  expect(texto?.value).toBe('Texto fictício preservado');
  expect(texto?.disabled).toBe(false);
  expect(servico.alterarEscala).toHaveBeenCalledTimes(1);
  editor?.dispatchEvent(new Event('submit', { cancelable: true }));
  await aguardar();
  const chamadas = vi.mocked(servico.alterarEscala).mock.calls;
  expect(chamadas[1]?.[2].versao_esperada).toBe(2);
  expect(chamadas[1]?.[3]).not.toBe(chamadas[0]?.[3]);
});
it('paginação conserva versões anteriores e usa cursor explícito', async () => {
  const cursor = { escala_id: usuario, versao: 1 };
  const { raiz, servico } = preparar({
    identidades,
    proximo_cursor: cursor,
    pode_gerir: false,
    profissionais: [],
    itens: [versao],
  });
  await aguardar();
  vi.mocked(servico.consultarEscala).mockResolvedValue({
    identidades,
    proximo_cursor: null,
    pode_gerir: false,
    profissionais: [],
    itens: [{ ...versao, versao: 2 }],
  });
  [...raiz.querySelectorAll('button')]
    .find((b) => b.textContent === 'Carregar mais histórico')
    ?.click();
  await aguardar();
  expect(servico.consultarEscala).toHaveBeenLastCalledWith(paciente, cursor);
  expect(raiz.textContent).toContain('Versão 1');
  expect(raiz.textContent).toContain('Versão 2');
  expect(
    [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Carregar mais histórico')
      ?.hidden,
  ).toBe(true);
});

it('criação com resultado incerto mantém mesma operação e não libera nova chave após GET', async () => {
  const { raiz, servico } = preparar({
    identidades,
    proximo_cursor: null,
    pode_gerir: true,
    profissionais: [{ usuario_id: usuario, rotulo: 'Profissional fictício' }],
    itens: [],
  });
  const criar = vi
    .spyOn(servico, 'criarEscala')
    .mockRejectedValue(new FalhaApi('pendencia_externa', 0, true));
  await aguardar();
  const form = raiz.querySelector('form');
  const pessoa = form?.querySelector('select');
  const datas = form?.querySelectorAll('input');
  if (!form || !pessoa || !datas?.[0] || !datas[1]) throw new Error('Campos ausentes');
  pessoa.value = usuario;
  datas[0].value = '2026-11-18T10:00';
  datas[1].value = '2026-11-18T12:00';
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await aguardar();
  [...raiz.querySelectorAll('button')].find((b) => b.textContent === 'Atualizar escala')?.click();
  await aguardar();
  expect(
    [...raiz.querySelectorAll('button')].find(
      (b) => b.textContent === 'Descartar tentativa e editar dados',
    )?.hidden,
  ).toBe(true);
  expect(raiz.querySelector<HTMLButtonElement>('form button')?.disabled).toBe(true);
  [...raiz.querySelectorAll('button')]
    .find((b) => b.textContent === 'Repetir operação pendente')
    ?.click();
  await aguardar();
  expect(criar.mock.calls[1]).toEqual(criar.mock.calls[0]);
});
