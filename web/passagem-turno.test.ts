// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { montarPassagemTurno } from './passagem-turno.js';
import { FalhaApi } from './api.ts';
import { criarServicoTurnoHttp } from './servico-turno-http.ts';
import type { PassagemTurno } from '../packages/contracts/src/turno-passagem.ts';
import type { Turno } from '../packages/contracts/src/turno.ts';
const usuario = '10000000-0000-4000-8000-000000000001';
const paciente = '20000000-0000-4000-8000-000000000001';
const turno: Turno = {
  turno_id: usuario,
  paciente_id: paciente,
  profissional_usuario_id: usuario,
  aberto_em: '2026-11-18T10:00:00Z',
  encerrado_em: null,
  situacao: 'aberto',
  versao: 1,
  parametros: {
    duracao_padrao_minutos: 60,
    tolerancia_atraso_minutos: 0,
    tratamento_nao_encerrado: 'sinalizar_pendencia',
  },
};
const identidades = [
  { usuario_id: usuario, rotulo: 'Autora fictícia' },
  { usuario_id: paciente, rotulo: 'Destinatária fictícia' },
];
const referencia = {
  turno_aberto_em: '2026-11-18T10:00:00Z',
  turno_encerrado_em: null,
  registro_id: usuario,
  diario_registro_id: usuario,
  turno_id: usuario,
  autor_usuario_id: usuario,
  versao_passagem: 1,
  publicado_em: '2026-11-18T11:00:00Z',
  conteudo: { data: '2026-11-18', area: 'Área configurada', atividade: 'Síntese fictícia' },
};
function preparar(dados: PassagemTurno) {
  const servico = criarServicoTurnoHttp(() => ({ usuario_id: usuario, session_id: usuario }));
  vi.spyOn(servico, 'consultarPassagem').mockResolvedValue(dados);
  vi.spyOn(servico, 'registrarCiencia').mockRejectedValue(new Error('Falha fictícia'));
  const raiz = document.createElement('div');
  const encerrar = vi.fn(async () => {});
  const desmontar = montarPassagemTurno(raiz, paciente, turno, servico, {
    acessoPerdido: vi.fn(),
    encerrar,
  });
  return { raiz, servico, desmontar, encerrar };
}
/* A espera precisa ceder a vez ao agendador, não só à fila de microtarefas. Medido em
   25/11/2026: o React agenda a repintura de uma atualização vinda de `then`/`await` fora
   de evento numa macrotarefa, então `await Promise.resolve()` repetido voltava com a
   tela ainda no estado anterior. Nenhuma asserção mudou. */
const aguardar = async () => {
  for (let i = 0; i < 20; i++) await new Promise((resolver) => setTimeout(resolver, 0));
};
afterEach(() => vi.restoreAllMocks());
it('consultar passagem anterior não registra ciência; falha da ação mantém pendência', async () => {
  const { raiz, servico } = preparar({
    identidades,
    propria: null,
    area_passagem: null,
    recebimento: null,
    anterior: { referencia, turno_destinatario_id: usuario, ciencia: null },
  });
  await aguardar();
  expect(servico.registrarCiencia).not.toHaveBeenCalled();
  const ciencia = [...raiz.querySelectorAll('button')].find(
    (b) => b.textContent === 'Registrar minha ciência',
  );
  if (!ciencia) throw new Error('Ação de ciência ausente');
  ciencia.click();
  await aguardar();
  expect(raiz.textContent).toContain('Ciência ainda pendente');
  expect(raiz.textContent).toContain('Resultado não confirmado');
});
it('própria publicada distingue consulta de ciência ao remetente', async () => {
  const { raiz, encerrar } = preparar({
    identidades,
    propria: referencia,
    area_passagem: 'Área configurada',
    anterior: null,
    recebimento: {
      turno_destinatario_id: paciente,
      usuario_id: paciente,
      consultado_em: '2026-11-18T12:00:00Z',
      ciencia: null,
    },
  });
  await aguardar();
  expect(raiz.textContent).toContain('Ciência ainda não registrada');
  const botao = [...raiz.querySelectorAll('button')].find(
    (b) => b.textContent === 'Encerrar meu turno',
  );
  expect(botao?.disabled).toBe(true);
  expect(encerrar).not.toHaveBeenCalled();
});
it('sem publicação confirmada não oferece encerramento e desmontagem descarta retorno tardio', async () => {
  const { raiz, desmontar } = preparar({
    identidades,
    propria: null,
    anterior: null,
    recebimento: null,
    area_passagem: 'Área configurada',
  });
  await aguardar();
  expect(raiz.textContent).not.toContain('Encerrar meu turno');
  expect(raiz.textContent).toContain('Atividade (obrigatória para publicar)');
  desmontar();
  await aguardar();
  expect(raiz.textContent).toBe('');
});
it('nova versão exige ação explícita e usa versão do vínculo consultado', async () => {
  const dados: PassagemTurno = {
    identidades,
    propria: referencia,
    anterior: null,
    recebimento: null,
    area_passagem: 'Área configurada',
  };
  const { raiz, servico } = preparar(dados);
  const publicar = vi
    .spyOn(servico, 'publicarPassagem')
    .mockResolvedValue({ ...referencia, versao_passagem: 2 });
  await aguardar();
  expect(publicar).not.toHaveBeenCalled();
  expect(raiz.querySelector('form')).toBeNull();
  const novo = [...raiz.querySelectorAll('button')].find(
    (b) => b.textContent === 'Publicar nova versão de passagem',
  );
  if (!novo) throw new Error('Ação explícita de republicação ausente');
  novo.click();
  await aguardar();
  const form = raiz.querySelector('form');
  const data = form?.querySelector<HTMLInputElement>('input[type=date]');
  const atividade = form?.querySelector<HTMLTextAreaElement>('[id$="-atividade"]');
  if (!form || !data || !atividade) throw new Error('Campos de nova versão ausentes');
  data.value = '2026-11-18';
  atividade.value = 'Nova síntese fictícia';
  vi.mocked(servico.consultarPassagem).mockResolvedValue({
    ...dados,
    propria: {
      ...referencia,
      versao_passagem: 2,
      conteudo: { ...referencia.conteudo, atividade: 'Nova síntese fictícia' },
    },
  });
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await aguardar();
  expect(publicar).toHaveBeenCalledWith(
    paciente,
    turno.turno_id,
    {
      conteudo: {
        data: '2026-11-18',
        area: 'Área configurada',
        atividade: 'Nova síntese fictícia',
      },
      versao_esperada: 1,
    },
    expect.any(String),
  );
  expect(raiz.textContent).toContain('Versão de passagem 2');
});
it('republicação incerta preserva dados, versão e chave antes de repetição', async () => {
  const dados: PassagemTurno = {
    identidades,
    propria: referencia,
    anterior: null,
    recebimento: null,
    area_passagem: 'Área configurada',
  };
  const { raiz, servico } = preparar(dados);
  const publicar = vi
    .spyOn(servico, 'publicarPassagem')
    .mockRejectedValue(new Error('Resposta perdida fictícia'));
  await aguardar();
  const novo = [...raiz.querySelectorAll('button')].find(
    (b) => b.textContent === 'Publicar nova versão de passagem',
  );
  if (!novo) throw new Error('Republicação ausente');
  novo.click();
  await aguardar();
  const form = raiz.querySelector('form');
  const data = form?.querySelector<HTMLInputElement>('input[type=date]');
  const atividade = form?.querySelector<HTMLTextAreaElement>('[id$="-atividade"]');
  if (!form || !data || !atividade) throw new Error('Campos ausentes');
  data.value = '2026-11-18';
  atividade.value = 'Síntese pendente fictícia';
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await aguardar();
  const consultar = [...raiz.querySelectorAll('button')].find(
    (b) => b.textContent === 'Consultar passagem',
  );
  if (!consultar) throw new Error('Consulta ausente');
  consultar.click();
  await aguardar();
  const repetir = raiz.querySelector('form');
  if (!repetir) throw new Error('Repetição ausente');
  repetir.dispatchEvent(new Event('submit', { cancelable: true }));
  await aguardar();
  expect(publicar.mock.calls[0]).toEqual(publicar.mock.calls[1]);
  expect(publicar.mock.calls[0]?.[2].versao_esperada).toBe(1);
  expect(
    [...raiz.querySelectorAll('button')].find(
      (b) => b.textContent === 'Descartar tentativa e editar síntese',
    )?.hidden,
  ).toBe(true);
});

it('primeira publicação recusada permite descarte explícito após consulta, preservando texto e nova área', async () => {
  const dados: PassagemTurno = {
    identidades,
    propria: null,
    anterior: null,
    recebimento: null,
    area_passagem: 'Área configurada',
  };
  const { raiz, servico } = preparar(dados);
  const publicar = vi
    .spyOn(servico, 'publicarPassagem')
    .mockRejectedValue(new FalhaApi('entrada_invalida', 422));
  await aguardar();
  let form = raiz.querySelector('form');
  const data = form?.querySelector<HTMLInputElement>('input[type=date]');
  const atividade = form?.querySelector<HTMLTextAreaElement>('[id$="-atividade"]');
  if (!form || !data || !atividade) throw new Error('Campos ausentes');
  data.value = '2026-11-18';
  atividade.value = 'Texto fictício preservado';
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await aguardar();
  const botao = (texto: string) =>
    [...raiz.querySelectorAll('button')].find((b) => b.textContent === texto);
  expect(botao('Descartar tentativa e editar síntese')?.hidden).toBe(true);
  vi.mocked(servico.consultarPassagem).mockResolvedValue({
    ...dados,
    area_passagem: 'Nova área configurada',
  });
  botao('Consultar passagem')?.click();
  await aguardar();
  expect(botao('Descartar tentativa e editar síntese')?.hidden).toBe(false);
  botao('Descartar tentativa e editar síntese')?.click();
  await aguardar();
  form = raiz.querySelector('form');
  expect(form?.querySelector<HTMLTextAreaElement>('[id$="-atividade"]')?.value).toBe(
    'Texto fictício preservado',
  );
  expect(form?.querySelector<HTMLTextAreaElement>('[id$="-atividade"]')?.disabled).toBe(false);
  expect(publicar).toHaveBeenCalledTimes(1);
  form?.dispatchEvent(new Event('submit', { cancelable: true }));
  await aguardar();
  expect(publicar.mock.calls[1]?.[2].conteudo.area).toBe('Nova área configurada');
  expect(publicar.mock.calls[1]?.[3]).not.toBe(publicar.mock.calls[0]?.[3]);
});
it('identifica autoria e ciência com rótulos autorizados separados do catálogo de gestão', async () => {
  const { raiz } = preparar({
    identidades,
    propria: referencia,
    anterior: null,
    area_passagem: 'Área configurada',
    recebimento: {
      turno_destinatario_id: paciente,
      usuario_id: paciente,
      consultado_em: '2026-11-18T12:00:00Z',
      ciencia: { usuario_id: paciente, registrada_em: '2026-11-18T12:01:00Z' },
    },
  });
  await aguardar();
  expect(raiz.textContent).toContain('Autor: Autora fictícia');
  expect(raiz.textContent).toContain('Ciência registrada por Destinatária fictícia');
  expect(raiz.textContent).not.toContain(usuario);
});

it('consulta e ciência preservam campos ainda incompletos sem enviar publicação', async () => {
  const dados: PassagemTurno = {
    identidades,
    propria: null,
    area_passagem: 'Área configurada',
    recebimento: null,
    anterior: { referencia, turno_destinatario_id: usuario, ciencia: null },
  };
  const { raiz, servico } = preparar(dados);
  const publicar = vi.spyOn(servico, 'publicarPassagem');
  vi.mocked(servico.registrarCiencia).mockResolvedValue({
    usuario_id: usuario,
    registrada_em: '2026-11-18T12:00:00Z',
  });
  await aguardar();
  const atividade = raiz.querySelector<HTMLTextAreaElement>('[id$="-atividade"]');
  const observacoes = raiz.querySelector<HTMLTextAreaElement>('[id$="-observacoes"]');
  if (!atividade || !observacoes) throw new Error('Campos ausentes');
  atividade.value = 'Rascunho incompleto fictício';
  observacoes.value = 'Observação fictícia';
  const botao = (texto: string) =>
    [...raiz.querySelectorAll('button')].find((b) => b.textContent === texto);
  botao('Consultar passagem')?.click();
  await aguardar();
  expect(raiz.querySelector<HTMLTextAreaElement>('[id$="-atividade"]')?.value).toBe(
    'Rascunho incompleto fictício',
  );
  botao('Registrar minha ciência')?.click();
  await aguardar();
  expect(raiz.querySelector<HTMLTextAreaElement>('[id$="-observacoes"]')?.value).toBe(
    'Observação fictícia',
  );
  expect(raiz.querySelector<HTMLInputElement>('input[type=date]')?.value).toBe('');
  expect(publicar).not.toHaveBeenCalled();
});
it('passagem anterior mostra período real do turno separado da publicação', async () => {
  const encerrada = {
    ...referencia,
    turno_aberto_em: '2026-11-17T08:00:00Z',
    turno_encerrado_em: '2026-11-17T16:00:00Z',
    publicado_em: '2026-11-17T15:55:00Z',
  };
  const { raiz } = preparar({
    identidades,
    propria: null,
    area_passagem: null,
    recebimento: null,
    anterior: { referencia: encerrada, turno_destinatario_id: usuario, ciencia: null },
  });
  await aguardar();
  expect(raiz.textContent).toContain(
    `Turno iniciado em ${new Date(encerrada.turno_aberto_em).toLocaleString('pt-BR')} e encerrado em ${new Date(encerrada.turno_encerrado_em).toLocaleString('pt-BR')}`,
  );
  expect(raiz.textContent).toContain(
    `Publicada em ${new Date(encerrada.publicado_em).toLocaleString('pt-BR')}`,
  );
});
