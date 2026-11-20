import type {
  CampoExtraCatalogoGeneralizado,
  VisibilidadeCampoExtra,
} from '../packages/contracts/src/campo-extra-catalogo.ts';
import type { PapelDeclarado } from '../packages/contracts/src/papel-declarado.ts';
import type { Turno } from '../packages/contracts/src/turno.ts';
import type {
  ConteudoFichaPlantao,
  FonteInformacao,
  PeriodoPlantao,
  RespostaPlantao,
} from '../packages/contracts/src/ficha-plantao.ts';
import type {
  FichaPlantaoProjetada,
  PendenciaPlantaoHttp,
} from '../packages/contracts/src/ficha-plantao-http.ts';
import type { ServicoFichaPlantao } from './servico-ficha-plantao-http.ts';
import type {
  ServicoModeloFormulario,
  ServicoPapelDeclarado,
} from './servico-catalogo-administrado-http.ts';
import {
  elementoTurno as el,
  campoTurno,
  selecaoTurno,
  instanteTurno,
  dataLocalTurno,
  botaoTurno,
  estadoTurno,
} from './turno-execucao-campos.ts';
import { FalhaApi, exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.ts';

/** FR-073 a FR-077, FR-081. Ficha de plantão: superfície ÚNICA de registro do AT e da
 * enfermagem, na ordem e no vocabulário da ficha de papel que a equipe já usa.
 *
 * A ficha é tela de entrada, não armazenamento novo. Rotina, Alimentação, Medicação e
 * Intercorrências continuam vivendo nas tabelas canônicas de FR-059/FR-060/FR-061/FR-064 e
 * aparecem aqui como encaminhamento para o registro canônico — nunca como campo de texto
 * livre. Medicação em especial: prescrição e administração são registros distintos, com
 * executor distinto do registrador, e virar linha de texto destruiria essa separação.
 *
 * Nenhuma leitura clínica é derivada de campo nenhum: não há pontuação, escala,
 * classificação de gravidade, alerta, tendência nem sugestão de conduta. */

/** Campos de fábrica semeados em `20261127120000_modelo_ficha_plantao_campos_fabrica.sql`.
 * O identificador é estável; o nome e a ordem são do Administrador e podem mudar. */
const CAMPOS_DE_FABRICA = {
  '7f1c0001-0000-4000-8000-000000000001': 'estado_emocional',
  '7f1c0001-0000-4000-8000-000000000002': 'rotina',
  '7f1c0001-0000-4000-8000-000000000003': 'atividades',
  '7f1c0001-0000-4000-8000-000000000004': 'alimentacao',
  '7f1c0001-0000-4000-8000-000000000005': 'medicacao',
  '7f1c0001-0000-4000-8000-000000000006': 'intercorrencias',
  '7f1c0001-0000-4000-8000-000000000007': 'observacoes',
  '7f1c0001-0000-4000-8000-000000000008': 'pendencias',
} as const;
type CampoDeFabrica = (typeof CAMPOS_DE_FABRICA)[keyof typeof CAMPOS_DE_FABRICA];

/** Onde cada campo da ficha é de fato persistido. Aparece na tela porque o AT precisa saber
 * que o que ele escreve aqui não vira um segundo registro em outro lugar. */
const ONDE_GRAVA: Readonly<Record<CampoDeFabrica, string>> = {
  estado_emocional:
    'Gravado como observação declarada do plantão, com quem observou e quando. Sem nota, escala ou classificação.',
  rotina: 'Registrado no acompanhamento de rotina do turno, evento a evento.',
  atividades: 'Gravado no registro do plantão, com quem escreveu e quando.',
  alimentacao: 'Registrado no acompanhamento de rotina do turno, refeição a refeição.',
  medicacao:
    'Registrado em prescrição e em administração, que são registros separados: quem administrou não é necessariamente quem registrou.',
  intercorrencias: 'Registrado como ocorrência do turno, uma a uma.',
  observacoes: 'Gravado no registro do plantão, com quem escreveu e quando.',
  pendencias: 'Gravada como pendência escrita do plantão, com autor, instante e situação.',
};

/** Campos cujo conteúdo é canônico: a ficha os apresenta e encaminha, nunca os redige. */
const CANONICOS: ReadonlySet<CampoDeFabrica> = new Set([
  'rotina',
  'alimentacao',
  'medicacao',
  'intercorrencias',
]);

const FONTES: readonly { valor: FonteInformacao; rotulo: string }[] = [
  { valor: 'observacao_direta', rotulo: 'Observei diretamente' },
  { valor: 'relato_paciente', rotulo: 'Relato do paciente' },
  { valor: 'relato_familiar', rotulo: 'Relato de familiar' },
  { valor: 'documento', rotulo: 'Documento' },
];

const VISIBILIDADES: readonly { valor: RespostaPlantao['visibilidade']; rotulo: string }[] = [
  { valor: 'interna', rotulo: 'Nota interna da equipe' },
  { valor: 'compartilhavel', rotulo: 'A família autorizada pode ler' },
];

function rotuloVisibilidade(valor: VisibilidadeCampoExtra): string {
  return valor === 'compartilhavel'
    ? 'A família autorizada pode ler este campo.'
    : 'Nota interna da equipe. A família não lê este campo.';
}

export type ServicosFichaPlantao = {
  ficha: ServicoFichaPlantao;
  modelo: ServicoModeloFormulario;
  papeis: ServicoPapelDeclarado;
};

type Controles = {
  campo: CampoExtraCatalogoGeneralizado;
  chave: CampoDeFabrica | null;
  texto?: HTMLInputElement | HTMLTextAreaElement;
  fonte?: HTMLSelectElement;
  visibilidade?: HTMLSelectElement;
};

export function montarFichaPlantao(
  raiz: HTMLElement,
  servicos: ServicosFichaPlantao,
  opcoes: {
    pacienteId: string;
    turno: Turno | null;
    acessoPerdido(erro: unknown): void;
    alteracaoPendente?(valor: boolean): void;
  },
): () => void {
  let ativa = true;
  let ocupada = false;
  let publicada: FichaPlantaoProjetada | null = null;
  let pendencias: PendenciaPlantaoHttp[] = [];
  let consultado = false;
  let tentativa: { entrada: ConteudoFichaPlantao; chave: string; consultada: boolean } | null =
    null;
  const controles: Controles[] = [];
  /** Leitura única do DOM, usada pelo rascunho e pela publicação. */
  let coletar: () => ConteudoFichaPlantao = () => ({});
  const secao = el('section');
  secao.className = 'turno-execucao';
  const status = estadoTurno('Carregando a ficha do plantão…');
  const corpo = el('div');
  const recuperacao = el('div');
  const atualizar = botaoTurno('Recarregar a ficha', () => void carregar());

  secao.append(
    el('h3', 'Ficha do plantão'),
    el(
      'p',
      'Mesma ficha que a equipe preenche no papel. O que você escreve aqui é gravado uma vez só, no lugar próprio de cada conteúdo. O sistema não interpreta nada do que você registra.',
    ),
    status,
    atualizar,
    recuperacao,
    corpo,
  );
  raiz.replaceChildren(secao);

  function falha(erro: unknown) {
    if (!ativa) return;
    if (
      exigeNovoAcesso(erro) &&
      !(erro instanceof FalhaApi && erro.codigo === 'pendencia_externa')
    ) {
      ativa = false;
      raiz.replaceChildren();
      opcoes.acessoPerdido(erro);
      return;
    }
    status.textContent = mensagemFalha(erro);
  }

  function semTurno() {
    consultado = false;
    corpo.replaceChildren(
      el(
        'p',
        'A ficha pertence a um plantão aberto: sem turno não há janela, nem vínculo conferido no momento do registro, nem a quem atribuir o plantão.',
      ),
      el(
        'p',
        'Se o turno ficou sem abrir, abra-o na tela do turno e declare a janela real que você cumpriu. O instante do servidor fica gravado ao lado do que você declarar, e quem ler o relatório vê que a abertura foi retroativa.',
      ),
    );
    status.textContent = 'Nenhum turno aberto para este caso.';
  }

  function resposta(
    destino: HTMLElement,
    campo: CampoExtraCatalogoGeneralizado,
    chave: CampoDeFabrica | null,
    valor: RespostaPlantao | null,
    longo: boolean,
  ): Controles {
    const grupo = el('fieldset');
    grupo.append(el('legend', campo.nome));
    if (chave) grupo.append(el('p', ONDE_GRAVA[chave]));
    grupo.append(el('p', rotuloVisibilidade(campo.visibilidade)));
    const texto = campoTurno(
      grupo,
      campo.obrigatorio ? `${campo.nome} (obrigatório)` : campo.nome,
      {
        longo,
        obrigatorio: campo.obrigatorio,
        valor: valor?.texto ?? '',
        ajuda: 'Registre o que foi observado ou feito. Nada aqui é interpretado pelo sistema.',
      },
    );
    if (!longo && texto instanceof HTMLInputElement) texto.inputMode = 'text';
    const fonte = selecaoTurno(
      grupo,
      'De onde veio a informação',
      FONTES,
      valor?.fonte ?? 'observacao_direta',
    );
    const visibilidade = selecaoTurno(
      grupo,
      'Quem pode ler',
      VISIBILIDADES,
      valor?.visibilidade ?? campo.visibilidade,
    );
    destino.append(grupo);
    return { campo, chave, texto, fonte, visibilidade };
  }

  function montarFormulario(modelo: CampoExtraCatalogoGeneralizado[], papeis: PapelDeclarado[]) {
    controles.length = 0;
    corpo.replaceChildren();
    const turno = opcoes.turno;
    if (!turno) return semTurno();
    const form = el('form');

    const identificacao = el('fieldset');
    identificacao.append(el('legend', 'Plantão'));
    identificacao.append(
      el('p', `Turno aberto em ${new Date(turno.aberto_em).toLocaleString('pt-BR')}.`),
    );
    const periodo = selecaoTurno(
      identificacao,
      'Plantão',
      [
        { valor: 'diurno', rotulo: 'Diurno' },
        { valor: 'noturno', rotulo: 'Noturno' },
      ] as const,
      (publicada?.periodo ?? undefined) as PeriodoPlantao | undefined,
    );
    periodo.required = false;
    const papel = selecaoTurno(
      identificacao,
      'Seu papel neste plantão',
      papeis.filter((item) => item.ativo).map((item) => ({ valor: item.nome, rotulo: item.nome })),
      publicada?.papel_declarado ?? undefined,
    );
    papel.required = false;
    identificacao.append(
      el(
        'p',
        'O papel é rótulo do registro e aparece impresso na ficha. Ele não dá, não tira e não amplia acesso nenhum.',
      ),
    );
    if (!papeis.some((item) => item.ativo))
      identificacao.append(
        el('p', 'Nenhum papel no catálogo. O Administrador precisa cadastrá-los primeiro.'),
      );
    form.append(identificacao);

    const retro = el('fieldset');
    retro.append(el('legend', 'Preenchimento fora do horário'));
    // Seleção em vez de caixa de marcação: a caixa nativa fica em 24px e não alcança o
    // alvo de toque de 44px do projeto, medido em navegador real na prova de celular.
    const declarar = selecaoTurno(
      retro,
      'Preenchi fora do horário do plantão',
      [
        { valor: 'nao', rotulo: 'Não' },
        { valor: 'sim', rotulo: 'Sim — declarar a janela real que cumpri' },
      ] as const,
      'nao',
    );
    declarar.required = false;
    const janelaInicio = campoTurno(retro, 'Início real do plantão', {
      tipo: 'datetime-local',
      obrigatorio: false,
      valor: dataLocalTurno(turno.aberto_em),
    });
    const janelaFim = campoTurno(retro, 'Fim real do plantão', {
      tipo: 'datetime-local',
      obrigatorio: false,
    });
    retro.append(
      el(
        'p',
        'O instante registrado pelo servidor continua gravado ao lado do que você declarar, e o relatório mostra que a ficha foi retroativa. A tolerância é a administrada do turno.',
      ),
    );
    const ajustarRetro = () => {
      janelaInicio.disabled = declarar.value !== 'sim';
      janelaFim.disabled = declarar.value !== 'sim';
    };
    declarar.onchange = ajustarRetro;
    ajustarRetro();
    form.append(retro);

    const ativos = modelo.filter((campo) => campo.ativo);
    for (const campo of ativos) {
      const chave = CAMPOS_DE_FABRICA[campo.campo_id as keyof typeof CAMPOS_DE_FABRICA] ?? null;
      if (chave && CANONICOS.has(chave)) {
        const grupo = el('fieldset');
        grupo.append(el('legend', campo.nome), el('p', ONDE_GRAVA[chave]));
        grupo.append(el('p', rotuloVisibilidade(campo.visibilidade)));
        grupo.append(
          el(
            'p',
            'Registre no acompanhamento do turno. A ficha reúne o que já foi registrado; ela não guarda uma segunda cópia.',
          ),
        );
        form.append(grupo);
        controles.push({ campo, chave });
        continue;
      }
      if (chave === 'estado_emocional') {
        const grupo = el('fieldset');
        grupo.append(el('legend', campo.nome), el('p', ONDE_GRAVA[chave]));
        grupo.append(el('p', rotuloVisibilidade(campo.visibilidade)));
        const texto = campoTurno(grupo, campo.nome, {
          obrigatorio: campo.obrigatorio,
          ajuda:
            'Use um termo do catálogo administrado. Observação declarada, sem nota e sem escala.',
        });
        texto.required = campo.obrigatorio;
        form.append(grupo);
        controles.push({ campo, chave, texto });
        continue;
      }
      if (chave === 'pendencias') {
        controles.push(resposta(form, campo, chave, null, true));
        continue;
      }
      const valor =
        chave === 'atividades'
          ? (publicada?.atividades ?? null)
          : chave === 'observacoes'
            ? (publicada?.observacoes ?? null)
            : null;
      if (chave) {
        controles.push(resposta(form, campo, chave, valor, true));
        continue;
      }
      // Campo acrescentado pelo Administrador: o modelo já o conhece, mas o registro do
      // plantão ainda não tem onde guardar a resposta. Apresentar um campo que não grava
      // seria sucesso falso; apresentar o limite é honesto.
      const grupo = el('fieldset');
      grupo.append(
        el('legend', campo.nome),
        el(
          'p',
          'Campo acrescentado ao modelo. Ainda não é possível responder por aqui: o registro do plantão não tem onde guardar respostas de campos acrescentados.',
        ),
      );
      form.append(grupo);
    }

    const desativados = modelo.filter((campo) => !campo.ativo);
    if (desativados.length) {
      const grupo = el('fieldset');
      grupo.append(el('legend', 'Campos desativados'));
      grupo.append(
        el(
          'p',
          'Não são oferecidos em ficha nova. As respostas já gravadas continuam legíveis nas fichas antigas.',
        ),
      );
      for (const campo of desativados) grupo.append(el('p', campo.nome));
      form.append(grupo);
    }

    let motivo: HTMLInputElement | HTMLTextAreaElement | undefined;
    if (publicada) {
      const grupo = el('fieldset');
      grupo.append(
        el('legend', 'Correção de ficha já publicada'),
        el(
          'p',
          `Versão vigente: ${publicada.versao}. A correção cria uma versão nova e preserva a anterior.`,
        ),
      );
      motivo = campoTurno(grupo, 'Motivo da correção', {
        longo: true,
        obrigatorio: true,
        ajuda: 'Sem motivo a correção é recusada e nada muda.',
      });
      form.append(grupo);
    }

    const acoes = el('div');
    acoes.className = 'turno-execucao__acoes';
    const guardar = botaoTurno('Guardar rascunho', () => void salvarRascunho());
    const publicar = el('button', publicada ? 'Publicar correção' : 'Publicar ficha do plantão');
    publicar.type = 'submit';
    publicar.className = 'button-primary';
    acoes.append(guardar, publicar);
    form.append(acoes);
    form.oninput = () => opcoes.alteracaoPendente?.(true);
    form.onsubmit = (evento) => {
      evento.preventDefault();
      void publicarFicha(motivo?.value ?? '');
    };
    corpo.append(form);

    const lista = el('div');
    lista.append(el('h4', 'Pendências escritas do plantão'));
    if (!pendencias.length)
      lista.append(el('p', 'Nenhuma pendência escrita neste plantão até agora.'));
    for (const item of pendencias) {
      const artigo = el('article');
      artigo.className = 'turno-execucao__registro';
      artigo.append(
        el('h4', item.situacao === 'aberta' ? 'Pendência aberta' : 'Pendência resolvida'),
        el('p', 'Origem: escrita por pessoa, não deduzida pelo sistema.'),
        el('p', item.texto),
        el('p', `Registrada em ${new Date(item.registrado_em).toLocaleString('pt-BR')}.`),
        el('p', rotuloVisibilidade(item.visibilidade)),
      );
      if (item.situacao === 'aberta') {
        const form = el('form');
        const grupo = el('fieldset');
        grupo.append(el('legend', 'Resolver esta pendência'));
        const campoMotivo = campoTurno(grupo, 'O que foi feito', { longo: true });
        const resolver = el('button', 'Registrar a resolução');
        resolver.type = 'submit';
        resolver.className = 'button-secondary';
        grupo.append(resolver);
        form.append(grupo);
        form.onsubmit = (evento) => {
          evento.preventDefault();
          void resolverPendencia(item, campoMotivo.value);
        };
        artigo.append(form);
      }
      lista.append(artigo);
    }
    corpo.append(lista);

    coletar = (): ConteudoFichaPlantao => {
      const conteudo: ConteudoFichaPlantao = {};
      if (periodo.value === 'diurno' || periodo.value === 'noturno')
        conteudo.periodo = periodo.value;
      if (papel.value) conteudo.papel_declarado = papel.value;
      if (declarar.value === 'sim') {
        if (!janelaInicio.value || !janelaFim.value)
          throw new Error('Informe o início e o fim da janela declarada.');
        conteudo.janela_declarada = {
          inicio: instanteTurno(janelaInicio.value),
          fim: instanteTurno(janelaFim.value),
        };
      }
      const escritas: NonNullable<ConteudoFichaPlantao['pendencias']> = [];
      for (const controle of controles) {
        const texto = controle.texto?.value.trim() ?? '';
        if (controle.campo.obrigatorio && controle.texto && !texto)
          throw new Error(`Preencha o campo obrigatório: ${controle.campo.nome}.`);
        if (!texto) continue;
        if (controle.chave === 'estado_emocional') {
          conteudo.estado_emocional = {
            estado: texto,
            instante_ocorrencia: new Date().toISOString(),
          };
          continue;
        }
        const detalhe = {
          texto,
          fonte: (controle.fonte?.value ?? 'observacao_direta') as FonteInformacao,
          visibilidade: (controle.visibilidade?.value ??
            controle.campo.visibilidade) as RespostaPlantao['visibilidade'],
        };
        if (controle.chave === 'atividades') conteudo.atividades = detalhe;
        else if (controle.chave === 'observacoes') conteudo.observacoes = detalhe;
        else if (controle.chave === 'pendencias')
          escritas.push({ pendencia_id: crypto.randomUUID(), conteudo: detalhe });
      }
      if (escritas.length) conteudo.pendencias = escritas;
      return conteudo;
    };
    status.textContent = publicada
      ? 'Ficha publicada carregada. Qualquer correção cria uma versão nova com motivo.'
      : 'Ficha em branco. Nada foi publicado neste plantão ainda.';
  }

  function aplicarRascunho(conteudo: ConteudoFichaPlantao) {
    for (const controle of controles) {
      if (!controle.texto) continue;
      const valor =
        controle.chave === 'atividades'
          ? conteudo.atividades
          : controle.chave === 'observacoes'
            ? conteudo.observacoes
            : null;
      if (valor) {
        controle.texto.value = valor.texto;
        if (controle.fonte) controle.fonte.value = valor.fonte;
        if (controle.visibilidade) controle.visibilidade.value = valor.visibilidade;
      }
      if (controle.chave === 'estado_emocional' && conteudo.estado_emocional)
        controle.texto.value = conteudo.estado_emocional.estado;
      if (controle.chave === 'pendencias' && conteudo.pendencias?.length) {
        const primeira = conteudo.pendencias[0];
        if (primeira) {
          controle.texto.value = primeira.conteudo.texto;
          if (controle.fonte) controle.fonte.value = primeira.conteudo.fonte;
          if (controle.visibilidade) controle.visibilidade.value = primeira.conteudo.visibilidade;
        }
      }
    }
  }

  function estadoTentativa() {
    recuperacao.replaceChildren();
    if (!tentativa) return;
    const repetir = botaoTurno('Repetir exatamente o mesmo envio', () => {
      if (tentativa?.consultada) void publicarFicha(null, true);
    });
    repetir.disabled = ocupada || !tentativa.consultada;
    recuperacao.append(
      el(
        'p',
        'O resultado da publicação anterior não foi confirmado. Consulte a ficha e, se precisar, repita exatamente o mesmo envio.',
      ),
      botaoTurno('Conferir a ficha publicada', () => void carregar()),
      repetir,
    );
  }

  async function carregar() {
    if (!ativa || ocupada) return;
    if (!opcoes.turno) {
      semTurno();
      return;
    }
    ocupada = true;
    atualizar.disabled = true;
    status.textContent = 'Carregando a ficha do plantão…';
    try {
      const turnoId = opcoes.turno.turno_id;
      const [modelo, papeis, resultado, rascunho] = await Promise.all([
        servicos.modelo.consultar(),
        servicos.papeis.consultar(),
        servicos.ficha.consultar(opcoes.pacienteId, turnoId),
        servicos.ficha.consultarRascunho(opcoes.pacienteId, turnoId),
      ]);
      if (!ativa) return;
      consultado = true;
      publicada = resultado.ficha;
      pendencias = resultado.pendencias;
      if (tentativa && publicada) tentativa = null;
      else if (tentativa) tentativa.consultada = true;
      montarFormulario(modelo, papeis);
      if (rascunho) {
        aplicarRascunho(rascunho.conteudo);
        status.textContent = `Rascunho não publicado recuperado, guardado em ${new Date(rascunho.atualizado_em).toLocaleString('pt-BR')}. Nada foi publicado nesse intervalo.`;
      }
      if (!modelo.length)
        corpo.append(el('p', 'O modelo da ficha está vazio. O Administrador precisa montá-lo.'));
    } catch (erro) {
      consultado = false;
      corpo.replaceChildren();
      falha(erro);
    } finally {
      ocupada = false;
      atualizar.disabled = false;
      if (ativa) estadoTentativa();
    }
  }

  async function salvarRascunho() {
    if (!ativa || ocupada || !opcoes.turno || !consultado) return;
    let conteudo: ConteudoFichaPlantao;
    try {
      conteudo = coletar();
    } catch (erro) {
      status.textContent = erro instanceof Error ? erro.message : 'Confira os campos da ficha.';
      return;
    }
    ocupada = true;
    status.textContent = 'Guardando o rascunho no servidor…';
    try {
      const salvo = await servicos.ficha.salvarRascunho(
        opcoes.pacienteId,
        opcoes.turno.turno_id,
        conteudo,
      );
      if (!ativa) return;
      opcoes.alteracaoPendente?.(false);
      status.textContent = salvo
        ? `Rascunho guardado em ${new Date(salvo.atualizado_em).toLocaleString('pt-BR')}. Ele é só seu e não aparece em relatório nenhum.`
        : 'Rascunho guardado.';
    } catch (erro) {
      falha(erro);
    } finally {
      ocupada = false;
      if (ativa) estadoTentativa();
    }
  }

  async function publicarFicha(motivo: string | null, repetindo = false) {
    if (!ativa || ocupada || !opcoes.turno || !consultado) return;
    if (!repetindo && tentativa) return;
    let conteudo: ConteudoFichaPlantao;
    if (repetindo && tentativa) conteudo = tentativa.entrada;
    else {
      try {
        conteudo = coletar();
      } catch (erro) {
        status.textContent = erro instanceof Error ? erro.message : 'Confira os campos da ficha.';
        return;
      }
    }
    const versaoEsperada = publicada?.versao ?? 0;
    const texto = (motivo ?? '').trim();
    if (versaoEsperada > 0 && !texto && !repetindo) {
      status.textContent = 'A correção de ficha publicada exige motivo. Nada foi alterado.';
      return;
    }
    if (!repetindo)
      tentativa = { entrada: conteudo, chave: crypto.randomUUID(), consultada: false };
    const pendente = tentativa;
    if (!pendente) return;
    ocupada = true;
    pendente.consultada = false;
    estadoTentativa();
    status.textContent = 'Publicando a ficha…';
    try {
      const resultado = await servicos.ficha.publicar(
        opcoes.pacienteId,
        {
          turno_id: opcoes.turno.turno_id,
          registro_id: opcoes.turno.turno_id,
          versao_esperada: versaoEsperada,
          conteudo,
          ...(versaoEsperada > 0 ? { motivo: texto } : {}),
        },
        pendente.chave,
      );
      if (!ativa) return;
      tentativa = null;
      publicada = resultado.ficha;
      pendencias = resultado.pendencias;
      opcoes.alteracaoPendente?.(false);
      status.textContent = 'Ficha publicada. Cada conteúdo foi gravado no seu lugar próprio.';
      ocupada = false;
      await carregar();
      return;
    } catch (erro) {
      if (!resultadoIncerto(erro)) tentativa = null;
      falha(erro);
    } finally {
      ocupada = false;
      if (ativa) estadoTentativa();
    }
  }

  async function resolverPendencia(item: PendenciaPlantaoHttp, motivo: string) {
    if (!ativa || ocupada) return;
    const texto = motivo.trim();
    if (!texto) {
      status.textContent = 'Descreva o que foi feito. Sem isso a resolução é recusada.';
      return;
    }
    ocupada = true;
    status.textContent = 'Registrando a resolução…';
    try {
      const resultado = await servicos.ficha.resolverPendencia(
        opcoes.pacienteId,
        { pendencia_id: item.pendencia_id, versao_esperada: item.versao, motivo: texto },
        crypto.randomUUID(),
      );
      if (!ativa) return;
      pendencias = resultado.pendencias;
      ocupada = false;
      await carregar();
      if (ativa) status.textContent = 'Resolução registrada com autor e instante.';
      return;
    } catch (erro) {
      falha(erro);
    } finally {
      ocupada = false;
    }
  }

  void carregar();
  return () => {
    ativa = false;
    raiz.replaceChildren();
  };
}
