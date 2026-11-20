import { FalhaApi, exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.ts';
import type { ServicoTurnoExecucao } from './servico-turno-execucao-http.ts';
import type { Turno } from '../packages/contracts/src/turno.ts';
import {
  elementoTurno as el,
  campoTurno,
  selecaoTurno,
  instanteTurno,
  dataLocalTurno,
  botaoTurno,
  estadoTurno,
} from './turno-execucao-campos.ts';
import { apresentarRelatorioTurno, dataTurno } from './turno-execucao-leitura.ts';
import { apresentarConsolidadoFicha, type FichaDoPlantao } from './consolidado-ficha-plantao.ts';
import { criarEntregaArquivoTurno } from './turno-execucao-arquivos.ts';
export function montarRelatoriosTurno(
  raiz: HTMLElement,
  servico: ServicoTurnoExecucao,
  opcoes: {
    turno?: Turno | null;
    familia?: boolean;
    acessoPerdido(erro: unknown): void;
    alteracaoPendente?(valor: boolean): void;
    /** FR-080. Consulta autorizada da ficha de um plantão, usada só para rotular o
     * consolidado com período, papel declarado e conteúdo redigido do plantão. A audiência
     * dos registros continua sendo a de FR-062; quem não alcança a ficha vê o campo como
     * não disponível, sem que o teor seja revelado. */
    fichaDoPlantao?(turnoId: string): Promise<FichaDoPlantao | null>;
  },
) {
  let ativa = true;
  let ocupada = false;
  let consulta: Parameters<ServicoTurnoExecucao['relatorio']>[0] | null = null;
  let proximo: Awaited<ReturnType<ServicoTurnoExecucao['relatorio']>>['proximo_cursor'] = null;
  let tentativaPdf: {
    entrada: Parameters<ServicoTurnoExecucao['pdf']>[0];
    chave: string;
    consultada: boolean;
  } | null = null;
  const entrega = criarEntregaArquivoTurno();
  const secao = el('section');
  secao.className = 'turno-execucao';
  const status = estadoTurno();
  const resultados = el('div');
  const form = el('form');
  const filtros = el('fieldset');
  filtros.append(el('legend', 'Período do relatório'));
  const tipo = selecaoTurno(
    filtros,
    'Relatório',
    [
      { valor: 'turno', rotulo: 'Relatório de um turno' },
      { valor: 'diario', rotulo: 'Consolidado diário' },
      { valor: 'semanal', rotulo: 'Consolidado de sete dias' },
      ...(opcoes.familia ? [] : [{ valor: 'caso', rotulo: 'Exportação do caso por período' }]),
    ],
    'diario',
  );
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const inicio = campoTurno(filtros, 'Início do período', {
    tipo: 'datetime-local',
    valor: dataLocalTurno(hoje.toISOString()),
  });
  const fim = campoTurno(filtros, 'Fim do período', { tipo: 'datetime-local' });
  const turnos = new Map<string, string>();
  if (opcoes.turno)
    turnos.set(
      opcoes.turno.turno_id,
      `${dataTurno(opcoes.turno.aberto_em)} · ${opcoes.turno.situacao === 'aberto' ? 'Aberto' : 'Encerrado'}`,
    );
  const turno = selecaoTurno(
    filtros,
    'Turno consultado',
    [...turnos].map(([valor, rotulo]) => ({ valor, rotulo })),
  );
  const dica = el(
    'p',
    'Para escolher um turno anterior, consulte primeiro o consolidado do período.',
  );
  filtros.append(dica);
  const ajustar = () => {
    turno.parentElement?.toggleAttribute('hidden', tipo.value !== 'turno');
    turno.required = tipo.value === 'turno';
    dica.hidden = tipo.value !== 'turno';
    if (fim instanceof HTMLInputElement)
      fim.readOnly = tipo.value === 'diario' || tipo.value === 'semanal';
    if ((tipo.value === 'diario' || tipo.value === 'semanal') && inicio.value) {
      const data = new Date(inicio.value);
      data.setDate(data.getDate() + (tipo.value === 'semanal' ? 7 : 1));
      fim.value = dataLocalTurno(data.toISOString());
    }
  };
  tipo.onchange = ajustar;
  inicio.addEventListener('input', ajustar);
  ajustar();
  const consultar = el('button', 'Consultar relatório');
  consultar.type = 'submit';
  consultar.className = 'button-primary';
  filtros.append(consultar);
  form.append(filtros);
  const mais = botaoTurno('Próxima página do relatório', () => {
    if (consulta && proximo)
      void carregar(
        {
          ...consulta,
          cursor_instante: proximo.instante,
          cursor_id: proximo.id,
          cursor_versao: proximo.versao,
          cursor_classe: proximo.classe,
        },
        true,
      );
  });
  mais.hidden = true;
  const pdfForm = el('form');
  const exportacao = el('fieldset');
  exportacao.append(el('legend', 'PDF gerado no servidor'));
  const destinatario = campoTurno(exportacao, 'Destinatário da exportação');
  const proposito = campoTurno(exportacao, 'Propósito da exportação', { longo: true });
  const emitir = el('button', 'Emitir PDF do período consultado');
  emitir.type = 'submit';
  emitir.className = 'button-secondary';
  exportacao.append(emitir);
  pdfForm.append(exportacao);
  const resumoPdf = el('p');
  const conferirPdf = botaoTurno('Conferir emissão anterior de PDF', () => void consultarPdf());
  conferirPdf.hidden = true;
  const repetirPdf = botaoTurno('Repetir a mesma emissão de PDF', () => {
    if (tentativaPdf?.consultada) void enviarPdf();
  });
  repetirPdf.hidden = true;
  secao.append(
    el('h3', 'Relatórios do cuidado'),
    el(
      'p',
      'Consulta e PDF usam registros persistidos e a audiência autorizada. Nenhum dado de localização integra estes relatórios.',
    ),
    status,
    form,
    resultados,
    mais,
    pdfForm,
    resumoPdf,
    conferirPdf,
    repetirPdf,
  );
  if (opcoes.familia)
    secao.append(
      el(
        'p',
        'A leitura familiar depende de fundamento de autorização vigente para o caso e para o período. Parentesco não concede esse acesso.',
      ),
    );
  raiz.replaceChildren(secao);
  function controles() {
    resumoPdf.textContent = tentativaPdf
      ? `Emissão pendente: ${tentativaPdf.entrada.tipo}, ${new Date(tentativaPdf.entrada.inicio).toLocaleString('pt-BR')} até ${new Date(tentativaPdf.entrada.fim).toLocaleString('pt-BR')}. A conferência e a repetição referem-se a esse período.`
      : '';
    filtros.disabled = ocupada;
    exportacao.disabled = ocupada || !consulta || tentativaPdf !== null;
    mais.disabled = ocupada;
    conferirPdf.hidden = tentativaPdf === null;
    conferirPdf.disabled = ocupada;
    repetirPdf.hidden = tentativaPdf === null;
    repetirPdf.disabled = ocupada || !tentativaPdf?.consultada;
  }
  function falha(erro: unknown) {
    if (!ativa) return;
    if (
      exigeNovoAcesso(erro) &&
      !(erro instanceof FalhaApi && erro.codigo === 'pendencia_externa')
    ) {
      ativa = false;
      entrega.desmontar();
      resultados.replaceChildren();
      raiz.replaceChildren();
      opcoes.acessoPerdido(erro);
      return;
    }
    status.textContent = mensagemFalha(erro);
  }
  async function carregar(
    entrada: Parameters<ServicoTurnoExecucao['relatorio']>[0],
    acrescentar = false,
  ) {
    if (!ativa || ocupada) return;
    if (!acrescentar) {
      consulta = null;
      proximo = null;
      resultados.replaceChildren();
      mais.hidden = true;
    }
    ocupada = true;
    controles();
    status.textContent = tentativaPdf
      ? `Consultando registros. PDF anterior pendente: ${tentativaPdf.entrada.tipo}, ${tentativaPdf.entrada.inicio} até ${tentativaPdf.entrada.fim}.`
      : 'Consultando registros persistidos…';
    try {
      const relatorio = await servico.relatorio(entrada);
      if (!ativa) return;
      if (!acrescentar) resultados.replaceChildren();
      if (relatorio.tipo === 'diario') {
        // FR-080: mesmo conteúdo da projeção autorizada, agrupado por plantão e rotulado
        // na ordem da ficha de papel. Nenhuma consulta nova de audiência.
        const fichas = new Map<string, FichaDoPlantao>();
        if (opcoes.fichaDoPlantao)
          for (const evento of relatorio.itens)
            if ('aberto_em' in evento.dados && !fichas.has(evento.dados.turno_id)) {
              const ficha = await opcoes.fichaDoPlantao(evento.dados.turno_id).catch(() => null);
              if (!ativa) return;
              if (ficha) fichas.set(evento.dados.turno_id, ficha);
            }
        resultados.append(
          apresentarConsolidadoFicha(relatorio, opcoes.fichaDoPlantao ? fichas : undefined),
        );
      } else resultados.append(apresentarRelatorioTurno(relatorio));
      consulta = {
        consulta_id: relatorio.consulta_id,
        tipo: entrada.tipo,
        inicio: entrada.inicio,
        fim: entrada.fim,
        ...(entrada.turno_id ? { turno_id: entrada.turno_id } : {}),
        limite: 25,
      };
      for (const evento of relatorio.itens)
        for (const foto of evento.anexos ?? []) {
          const area = el('div');
          area.append(
            botaoTurno('Baixar foto autorizada da ocorrência', () => {
              if (ocupada) return;
              if (foto.tamanho_bytes > 3 * 1024 * 1024) {
                status.textContent = 'Foto indisponível: excede o limite de transferência.';
                return;
              }
              ocupada = true;
              controles();
              void servico
                .baixarAnexo(foto.anexo_id)
                .then((arquivo) => {
                  if (ativa) entrega.entregar(arquivo);
                })
                .catch(falha)
                .finally(() => {
                  ocupada = false;
                  if (ativa) controles();
                });
            }),
          );
          resultados.append(area);
        }
      proximo = relatorio.proximo_cursor;
      mais.hidden = proximo === null;
      for (const evento of relatorio.itens)
        if ('aberto_em' in evento.dados && !turnos.has(evento.dados.turno_id)) {
          const rotulo = `${dataTurno(evento.dados.aberto_em)} · ${evento.dados.situacao === 'aberto' ? 'Aberto' : 'Encerrado'}`;
          turnos.set(evento.dados.turno_id, rotulo);
          const opcao = el('option', rotulo);
          opcao.value = evento.dados.turno_id;
          turno.append(opcao);
        }
      resultados.append(
        el(
          'p',
          `Corte dos registros: ${new Date(relatorio.instante_corte).toLocaleString('pt-BR')}. Os rótulos de identidade são atuais e não comprovam o nome na época do registro.`,
        ),
      );
      status.textContent = proximo
        ? 'Página consultada. Há mais registros no período.'
        : 'Consulta concluída.';
    } catch (erro) {
      falha(erro);
    } finally {
      ocupada = false;
      if (ativa) controles();
    }
  }
  async function consultarPdf() {
    if (!ativa || ocupada || !tentativaPdf) return;
    ocupada = true;
    controles();
    try {
      const recibo = await servico.consultarPdf({
        exportacao_id: tentativaPdf.entrada.exportacao_id,
      });
      if (!ativa || !tentativaPdf) return;
      if (recibo) {
        tentativaPdf = null;
        opcoes.alteracaoPendente?.(false);
        status.textContent =
          'A emissão anterior foi confirmada, mas o arquivo não foi recebido nesta tela. Para obter outro arquivo, solicite uma nova emissão explicitamente.';
      } else {
        tentativaPdf.consultada = true;
        status.textContent =
          'Ainda sem confirmação. Você pode repetir exatamente a mesma emissão, com o mesmo identificador.';
      }
    } catch (erro) {
      falha(erro);
    } finally {
      ocupada = false;
      if (ativa) controles();
    }
  }
  async function enviarPdf() {
    if (ocupada || !ativa || !tentativaPdf) return;
    ocupada = true;
    tentativaPdf.consultada = false;
    controles();
    status.textContent = 'Gerando PDF no servidor…';
    try {
      const arquivo = await servico.pdf(tentativaPdf.entrada, tentativaPdf.chave);
      if (!ativa) return;
      entrega.entregar(arquivo);
      tentativaPdf = null;
      opcoes.alteracaoPendente?.(false);
      status.textContent = 'PDF confirmado pelo servidor e entregue para download.';
    } catch (erro) {
      if (!resultadoIncerto(erro)) tentativaPdf = null;
      falha(erro);
    } finally {
      ocupada = false;
      if (ativa) controles();
    }
  }
  form.onsubmit = (evento) => {
    evento.preventDefault();
    if (ocupada) return;
    try {
      if (
        !['turno', 'diario', 'semanal', 'caso'].includes(tipo.value) ||
        (opcoes.familia && tipo.value === 'caso')
      )
        throw new Error();
      const de = instanteTurno(inicio.value);
      const ate = instanteTurno(fim.value);
      if (Date.parse(ate) <= Date.parse(de) || (tipo.value === 'turno' && !turno.value))
        throw new Error();
      void carregar({
        tipo: tipo.value as 'turno' | 'diario' | 'semanal' | 'caso',
        inicio: de,
        fim: ate,
        ...(tipo.value === 'turno' ? { turno_id: turno.value } : {}),
        limite: 25,
      });
    } catch {
      status.textContent = 'Confira o tipo de relatório, o período e o turno selecionado.';
    }
  };
  pdfForm.oninput = () => opcoes.alteracaoPendente?.(true);
  pdfForm.onsubmit = (evento) => {
    evento.preventDefault();
    if (
      !consulta ||
      tentativaPdf ||
      ocupada ||
      !destinatario.value.trim() ||
      !proposito.value.trim()
    )
      return;
    tentativaPdf = {
      entrada: {
        exportacao_id: crypto.randomUUID(),
        tipo: consulta.tipo,
        inicio: consulta.inicio,
        fim: consulta.fim,
        ...(consulta.turno_id ? { turno_id: consulta.turno_id } : {}),
        destinatario: destinatario.value.trim(),
        proposito: proposito.value.trim(),
      },
      chave: crypto.randomUUID(),
      consultada: false,
    };
    opcoes.alteracaoPendente?.(true);
    void enviarPdf();
  };
  controles();
  return () => {
    ativa = false;
    tentativaPdf = null;
    consulta = null;
    entrega.desmontar();
    raiz.replaceChildren();
  };
}
