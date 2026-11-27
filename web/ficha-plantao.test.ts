// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { montarFichaPlantao, type ServicosFichaPlantao } from './ficha-plantao.js';
import type { CampoExtraCatalogoGeneralizado } from '../packages/contracts/src/campo-extra-catalogo.ts';
import type { Turno } from '../packages/contracts/src/turno.ts';
import { FalhaApi } from './api.ts';

/** Dados fictícios. Os testes provam comportamento de tela: os quatro estados, o rascunho
 * recuperável do servidor, a exigência de turno aberto, a marcação de audiência por campo e
 * a recusa de transformar medicação em texto livre. Não substituem nenhuma prova de
 * autorização de servidor ou de banco. */

const paciente = '20000000-0000-4000-8000-000000000001';
const turnoId = '20000000-0000-4000-8000-000000000002';

const turno: Turno = {
  turno_id: turnoId,
  paciente_id: paciente,
  profissional_usuario_id: '20000000-0000-4000-8000-000000000003',
  aberto_em: '2026-11-20T10:00:00.000Z',
  encerrado_em: null,
  situacao: 'aberto',
  versao: 1,
  parametros: {
    duracao_padrao_minutos: 360,
    tolerancia_atraso_minutos: 30,
    tratamento_nao_encerrado: 'sinalizar_pendencia',
  },
};

function campo(
  id: string,
  nome: string,
  ordem: number,
  extras: Partial<CampoExtraCatalogoGeneralizado> = {},
): CampoExtraCatalogoGeneralizado {
  return {
    campo_id: id,
    escopo: 'ficha_plantao',
    nome,
    tipo: 'texto_longo',
    opcoes: null,
    ativo: true,
    ordem,
    obrigatorio: false,
    de_fabrica: true,
    visibilidade: 'interna',
    versao: 1,
    ...extras,
  };
}

const modelo: CampoExtraCatalogoGeneralizado[] = [
  campo('7f1c0001-0000-4000-8000-000000000001', 'Estado emocional observado', 1, {
    tipo: 'texto',
  }),
  campo('7f1c0001-0000-4000-8000-000000000003', 'Atividades', 3, {
    visibilidade: 'compartilhavel',
  }),
  campo('7f1c0001-0000-4000-8000-000000000005', 'Medicação', 5),
  campo('7f1c0001-0000-4000-8000-000000000007', 'Observações', 7),
  campo('7f1c0001-0000-4000-8000-000000000008', 'Pendências', 8),
];

function servicos(sobrepor: Partial<ServicosFichaPlantao['ficha']> = {}): ServicosFichaPlantao {
  return {
    ficha: {
      consultar: vi.fn().mockResolvedValue({ ficha: null, pendencias: [] }),
      consultarRascunho: vi.fn().mockResolvedValue(null),
      salvarRascunho: vi.fn(),
      publicar: vi.fn(),
      resolverPendencia: vi.fn(),
      ...sobrepor,
    },
    modelo: { consultar: vi.fn().mockResolvedValue(modelo), gravar: vi.fn() },
    papeis: {
      consultar: vi.fn().mockResolvedValue([
        {
          papel_id: '30000000-0000-4000-8000-000000000001',
          nome: 'Acompanhante terapêutico',
          ativo: true,
          de_fabrica: true,
          versao: 1,
        },
      ]),
      gravar: vi.fn(),
    },
  };
}

const botao = (raiz: HTMLElement, texto: string) => {
  const item = [...raiz.querySelectorAll('button')].find((b) => b.textContent === texto);
  if (!item) throw new Error(texto);
  return item;
};
const grupo = (raiz: HTMLElement, legenda: string) => {
  const item = [...raiz.querySelectorAll('fieldset')].find(
    (f) => f.querySelector('legend')?.textContent === legenda,
  );
  if (!item) throw new Error(legenda);
  return item;
};

afterEach(() => {
  vi.restoreAllMocks();
});

it('carrega, mostra o vazio só após consulta real e marca a audiência de cada campo', async () => {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const api = servicos();
  montarFichaPlantao(raiz, api, { pacienteId: paciente, turno, acessoPerdido: vi.fn() });
  expect(raiz.textContent).toContain('Carregando a ficha do plantão');
  await vi.waitFor(() =>
    expect(raiz.textContent).toContain('Ficha em branco. Nada foi publicado neste plantão ainda.'),
  );
  expect(api.ficha.consultar).toHaveBeenCalledWith(paciente, turnoId);
  expect(grupo(raiz, 'Atividades').textContent).toContain('A família autorizada pode ler');
  expect(grupo(raiz, 'Observações').textContent).toContain('Nota interna da equipe');
  // Medicação não vira texto livre: prescrição e administração continuam separadas.
  expect(grupo(raiz, 'Medicação').querySelector('textarea')).toBeNull();
  expect(grupo(raiz, 'Medicação').querySelector('input')).toBeNull();
  expect(grupo(raiz, 'Medicação').textContent).toContain('registros separados');
  // Nenhuma leitura clínica derivada: não há rótulo de gravidade, risco, alerta, tendência
  // nem sugestão de conduta produzido pelo sistema a partir de campo nenhum.
  expect(raiz.textContent).not.toMatch(/(gravidade|risco|alerta|tendência|conduta)\s*:/i);
  expect(raiz.textContent).not.toMatch(/pontuação|classificação de gravidade/i);
});

it('sem turno aberto a ficha não é oferecida e o caminho declarado é explicado', async () => {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const api = servicos();
  montarFichaPlantao(raiz, api, { pacienteId: paciente, turno: null, acessoPerdido: vi.fn() });
  await vi.waitFor(() => expect(raiz.textContent).toContain('Nenhum turno aberto para este caso.'));
  expect(raiz.textContent).toContain('declare a janela real');
  expect(raiz.querySelector('form')).toBeNull();
  expect(api.ficha.consultar).not.toHaveBeenCalled();
});

it('recupera o rascunho guardado no servidor sem publicar nada', async () => {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const api = servicos({
    consultarRascunho: vi.fn().mockResolvedValue({
      turno_id: turnoId,
      conteudo: {
        atividades: {
          texto: 'Caminhada fictícia no corredor.',
          fonte: 'observacao_direta',
          visibilidade: 'compartilhavel',
        },
      },
      atualizado_em: '2026-11-20T12:00:00.000Z',
      publicado: false,
    }),
  });
  montarFichaPlantao(raiz, api, { pacienteId: paciente, turno, acessoPerdido: vi.fn() });
  await vi.waitFor(() => expect(raiz.textContent).toContain('Rascunho não publicado recuperado'));
  const texto = grupo(raiz, 'Atividades').querySelector('textarea');
  expect(texto?.value).toBe('Caminhada fictícia no corredor.');
  expect(api.ficha.publicar).not.toHaveBeenCalled();
});

it('guarda o rascunho no servidor, nunca no navegador', async () => {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const api = servicos({
    salvarRascunho: vi.fn().mockResolvedValue({
      turno_id: turnoId,
      conteudo: {},
      atualizado_em: '2026-11-20T12:30:00.000Z',
      publicado: false,
    }),
  });
  montarFichaPlantao(raiz, api, { pacienteId: paciente, turno, acessoPerdido: vi.fn() });
  await vi.waitFor(() => expect(raiz.textContent).toContain('Ficha em branco'));
  const texto = grupo(raiz, 'Observações').querySelector('textarea');
  if (!texto) throw new Error('Campo ausente');
  texto.value = 'Observação fictícia do plantão.';
  botao(raiz, 'Guardar rascunho').click();
  await vi.waitFor(() => expect(api.ficha.salvarRascunho).toHaveBeenCalledOnce());
  const enviado = vi.mocked(api.ficha.salvarRascunho).mock.calls[0];
  expect(enviado?.[2]).toMatchObject({
    observacoes: { texto: 'Observação fictícia do plantão.', visibilidade: 'interna' },
  });
  expect(localStorage.length).toBe(0);
  expect(raiz.textContent).toContain('Ele é só seu e não aparece em relatório nenhum.');
});

it('publica uma ficha por plantão, com o turno como registro, e informa a falha sem sucesso falso', async () => {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const api = servicos({
    publicar: vi.fn().mockRejectedValue(new FalhaApi('conflito_versao', 409)),
  });
  montarFichaPlantao(raiz, api, { pacienteId: paciente, turno, acessoPerdido: vi.fn() });
  await vi.waitFor(() => expect(raiz.textContent).toContain('Ficha em branco'));
  const texto = grupo(raiz, 'Atividades').querySelector('textarea');
  if (!texto) throw new Error('Campo ausente');
  texto.value = 'Atividade fictícia.';
  raiz.querySelector('form')?.requestSubmit();
  await vi.waitFor(() => expect(api.ficha.publicar).toHaveBeenCalledOnce());
  const submissao = vi.mocked(api.ficha.publicar).mock.calls[0]?.[1];
  expect(submissao).toMatchObject({ turno_id: turnoId, registro_id: turnoId, versao_esperada: 0 });
  expect(submissao).not.toHaveProperty('motivo');
  await vi.waitFor(() => expect(raiz.textContent).toContain('O recurso foi alterado'));
  expect(raiz.textContent).not.toContain('Ficha publicada.');
});

it('campo obrigatório vazio bloqueia a publicação e a correção exige motivo', async () => {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const api = servicos({
    consultar: vi.fn().mockResolvedValue({
      ficha: {
        registro_id: turnoId,
        turno_id: turnoId,
        versao: 1,
        periodo: 'noturno',
        papel_declarado: 'Acompanhante terapêutico',
        atividades: null,
        observacoes: null,
        autor_usuario_id: turno.profissional_usuario_id,
        registrado_em: '2026-11-20T16:00:00.000Z',
        retroativo: false,
      },
      pendencias: [],
    }),
  });
  api.modelo.consultar = vi
    .fn()
    .mockResolvedValue([
      campo('7f1c0001-0000-4000-8000-000000000007', 'Observações', 7, { obrigatorio: true }),
    ]);
  montarFichaPlantao(raiz, api, { pacienteId: paciente, turno, acessoPerdido: vi.fn() });
  await vi.waitFor(() => expect(raiz.textContent).toContain('Ficha publicada carregada'));
  // `dispatchEvent` em vez de `requestSubmit`: a validação nativa já barraria o envio, e o
  // que se prova aqui é a guarda da própria tela, que o navegador não garante sozinho.
  const enviar = () =>
    raiz.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  enviar();
  await vi.waitFor(() =>
    expect(raiz.textContent).toContain('Preencha o campo obrigatório: Observações.'),
  );
  expect(api.ficha.publicar).not.toHaveBeenCalled();
  const texto = grupo(raiz, 'Observações').querySelector('textarea');
  if (!texto) throw new Error('Campo ausente');
  texto.value = 'Correção fictícia.';
  enviar();
  await vi.waitFor(() =>
    expect(raiz.textContent).toContain('A correção de ficha publicada exige motivo.'),
  );
  expect(api.ficha.publicar).not.toHaveBeenCalled();
});

it('falha de consulta não vira estado vazio e o acesso perdido limpa a tela', async () => {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const api = servicos({
    consultar: vi.fn().mockRejectedValue(new FalhaApi('servico_indisponivel', 503)),
  });
  montarFichaPlantao(raiz, api, { pacienteId: paciente, turno, acessoPerdido: vi.fn() });
  await vi.waitFor(() => expect(raiz.textContent).toContain('Serviço temporariamente'));
  expect(raiz.textContent).not.toContain('Ficha em branco');
  expect(raiz.querySelector('form')).toBeNull();

  const outra = document.createElement('div');
  document.body.append(outra);
  const perdido = vi.fn();
  montarFichaPlantao(
    outra,
    servicos({ consultar: vi.fn().mockRejectedValue(new FalhaApi('sem_permissao', 403)) }),
    { pacienteId: paciente, turno, acessoPerdido: perdido },
  );
  await vi.waitFor(() => expect(perdido).toHaveBeenCalledOnce());
  expect(outra.textContent).toBe('');
});

it('pendência escrita aparece com origem declarada e a resolução exige o que foi feito', async () => {
  const raiz = document.createElement('div');
  document.body.append(raiz);
  const api = servicos({
    consultar: vi.fn().mockResolvedValue({
      ficha: null,
      pendencias: [
        {
          pendencia_id: '40000000-0000-4000-8000-000000000001',
          turno_id: turnoId,
          versao: 1,
          origem: 'declarada',
          situacao: 'aberta',
          texto: 'Confirmar receita fictícia com a família.',
          fonte: 'observacao_direta',
          visibilidade: 'interna',
          declarado_por_usuario_id: turno.profissional_usuario_id,
          registrado_em: '2026-11-20T17:00:00.000Z',
          resolvido_por_usuario_id: null,
          resolvido_em: null,
        },
      ],
    }),
  });
  montarFichaPlantao(raiz, api, { pacienteId: paciente, turno, acessoPerdido: vi.fn() });
  await vi.waitFor(() => expect(raiz.textContent).toContain('Pendência aberta'));
  expect(raiz.textContent).toContain('Origem: escrita por pessoa, não deduzida pelo sistema.');
  const forms = [...raiz.querySelectorAll('form')];
  const resolucao = forms[forms.length - 1];
  resolucao?.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(raiz.textContent).toContain('Descreva o que foi feito.'));
  expect(api.ficha.resolverPendencia).not.toHaveBeenCalled();
});
