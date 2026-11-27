import { FalhaApi, exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.ts';
import type { ServicoTurnoExecucao } from './servico-turno-execucao-http.ts';
import {
  elementoTurno as el,
  campoTurno,
  selecaoTurno,
  instanteTurno,
  dataLocalTurno,
  estadoTurno,
  botaoTurno,
} from './turno-execucao-campos.js';
import { criarEntregaArquivoTurno } from './turno-execucao-arquivos.js';
import { dataTurno } from './turno-execucao-leitura.js';
import { botao } from './ui/basicos.js';
export function montarLocalizacaoCoordenacao(
  raiz: HTMLElement,
  servico: ServicoTurnoExecucao,
  opcoes: { acessoPerdido(erro: unknown): void; alteracaoPendente?(valor: boolean): void },
) {
  let ativa = true;
  let ocupada = false;
  let permitida = false;
  let consultaId: string | undefined;
  let proximo: Awaited<ReturnType<ServicoTurnoExecucao['relatorio']>>['proximo_cursor'] = null;
  let tentativa: {
    entrada: Parameters<ServicoTurnoExecucao['exportarLocalizacao']>[0];
    chave: string;
    consultada: boolean;
  } | null = null;
  const entrega = criarEntregaArquivoTurno();
  const secao = el('section');
  secao.className = 'turno-execucao';
  const status = estadoTurno('Consultando permissão de coordenação…');
  const corpo = el('div');
  const form = el('form');
  const grupo = el('fieldset');
  grupo.append(el('legend', 'Turnos para consultar localização'));
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);
  const inicio = campoTurno(grupo, 'Início do período', {
    tipo: 'datetime-local',
    valor: dataLocalTurno(hoje.toISOString()),
  });
  const fim = campoTurno(grupo, 'Fim do período', {
    tipo: 'datetime-local',
    valor: dataLocalTurno(amanha.toISOString()),
  });
  const consultarTurnos = botao({
    rotulo: 'Consultar turnos autorizados',
    tipo: 'submit',
    peso: 'principal',
  });
  grupo.append(consultarTurnos);
  form.append(grupo);
  const selecao = el('fieldset');
  const turno = selecaoTurno(
    selecao,
    'Turno autorizado',
    [] as { valor: string; rotulo: string }[],
  );
  const mais = botaoTurno('Mais turnos do período', () => void carregarTurnos(true));
  mais.hidden = true;
  const consultar = botaoTurno('Consultar localização declarada', () => void carregarLocalizacao());
  selecao.append(mais, consultar);
  const resultado = el('div');
  const pdfForm = el('form');
  const pdfGrupo = el('fieldset');
  pdfGrupo.append(el('legend', 'Exportar localização separadamente'));
  const destinatario = campoTurno(pdfGrupo, 'Destinatário');
  const proposito = campoTurno(pdfGrupo, 'Propósito', { longo: true });
  const emitir = botao({
    rotulo: 'Emitir PDF restrito de localização',
    tipo: 'submit',
    peso: 'principal',
  });
  pdfGrupo.append(emitir);
  pdfForm.append(pdfGrupo);
  const conferir = botaoTurno('Conferir emissão restrita anterior', () => void conferirPdf());
  conferir.hidden = true;
  const repetir = botaoTurno('Repetir a mesma emissão restrita', () => {
    if (tentativa?.consultada) void enviarPdf();
  });
  repetir.hidden = true;
  corpo.append(form, selecao, resultado, pdfForm, conferir, repetir);
  corpo.hidden = true;
  secao.append(
    el('h3', 'Localização declarada — coordenação'),
    el(
      'p',
      'Consulta segregada para Administrador e case manager atual. Coordenadas não comprovam presença; ausência não impede o cuidado. Retenção de 90 dias, sem rastreamento contínuo.',
    ),
    status,
    corpo,
  );
  raiz.replaceChildren(secao);
  function controles() {
    grupo.disabled = ocupada || !permitida;
    selecao.disabled = ocupada || !permitida;
    pdfGrupo.disabled = ocupada || !turno.value || tentativa !== null;
    conferir.hidden = tentativa === null;
    conferir.disabled = ocupada;
    repetir.hidden = tentativa === null;
    repetir.disabled = ocupada || !tentativa?.consultada;
  }
  function falha(erro: unknown) {
    if (!ativa) return;
    if (
      exigeNovoAcesso(erro) &&
      !(erro instanceof FalhaApi && erro.codigo === 'pendencia_externa')
    ) {
      ativa = false;
      entrega.desmontar();
      raiz.replaceChildren();
      opcoes.acessoPerdido(erro);
      return;
    }
    status.textContent = mensagemFalha(erro);
  }
  async function carregarTurnos(acrescentar = false) {
    if (!ativa || ocupada || !permitida) return;
    ocupada = true;
    controles();
    try {
      const desde = instanteTurno(inicio.value);
      const ate = instanteTurno(fim.value);
      const pagina = await servico.relatorio({
        tipo: 'caso',
        inicio: desde,
        fim: ate,
        limite: 25,
        ...(acrescentar && consultaId ? { consulta_id: consultaId } : {}),
        ...(acrescentar && proximo
          ? {
              cursor_instante: proximo.instante,
              cursor_id: proximo.id,
              cursor_versao: proximo.versao,
              cursor_classe: proximo.classe,
            }
          : {}),
      });
      if (!ativa) return;
      if (!acrescentar) {
        turno.replaceChildren();
        const vazio = el('option', 'Selecione um turno');
        vazio.value = '';
        turno.append(vazio);
        resultado.replaceChildren();
      }
      for (const evento of pagina.itens)
        if ('aberto_em' in evento.dados) {
          const dadosTurno = evento.dados;
          if ([...turno.options].some((opcao) => opcao.value === dadosTurno.turno_id)) continue;
          const opcao = el(
            'option',
            `${dataTurno(evento.dados.aberto_em)} · ${evento.dados.situacao === 'aberto' ? 'Aberto' : 'Encerrado'}`,
          );
          opcao.value = evento.dados.turno_id;
          turno.append(opcao);
        }
      consultaId = pagina.consulta_id;
      proximo = pagina.proximo_cursor;
      mais.hidden = proximo === null;
      status.textContent =
        turno.options.length > 1
          ? 'Turnos consultados. Selecione um para acessar a operação restrita.'
          : 'Nenhum turno encontrado nesta página. Confira o período ou a próxima página.';
    } catch (erro) {
      falha(erro);
    } finally {
      ocupada = false;
      if (ativa) controles();
    }
  }
  async function carregarLocalizacao() {
    if (!ativa || ocupada || !turno.value || !permitida) return;
    ocupada = true;
    controles();
    try {
      const resposta = await servico.consultarLocalizacao({ turno_id: turno.value });
      if (!ativa) return;
      resultado.replaceChildren();
      if (resposta.ausencia === 'retencao_expirada')
        resultado.append(
          el(
            'p',
            'Localização indisponível: retenção de 90 dias expirada. Os demais registros do turno permanecem íntegros.',
          ),
        );
      else if (!resposta.itens.length)
        resultado.append(el('p', 'Nenhuma declaração de localização disponível para este turno.'));
      for (const item of resposta.itens) {
        const artigo = el('article');
        artigo.append(
          el(
            'h4',
            `${item.momento === 'abertura' ? 'Abertura' : 'Encerramento'} · versão ${item.versao}`,
          ),
        );
        artigo.append(
          el('p', `Registrada em ${dataTurno(item.registrado_em)}. Dado declarado pelo aparelho.`),
        );
        if (item.latitude !== null && item.longitude !== null && item.precisao_metros !== null)
          artigo.append(
            el(
              'p',
              `Latitude informada: ${item.latitude}. Longitude informada: ${item.longitude}. Precisão informada: ${item.precisao_metros} metros.`,
            ),
          );
        else
          artigo.append(
            el(
              'p',
              `Localização não informada. Motivo registrado: ${item.motivo_ausencia ?? 'indisponível'}.`,
            ),
          );
        resultado.append(artigo);
      }
      status.textContent = 'Consulta restrita concluída.';
    } catch (erro) {
      falha(erro);
    } finally {
      ocupada = false;
      if (ativa) controles();
    }
  }
  async function enviarPdf() {
    if (!ativa || ocupada || !tentativa) return;
    ocupada = true;
    tentativa.consultada = false;
    controles();
    try {
      const arquivo = await servico.exportarLocalizacao(tentativa.entrada, tentativa.chave);
      if (!ativa) return;
      entrega.entregar(arquivo);
      tentativa = null;
      opcoes.alteracaoPendente?.(false);
      status.textContent = 'PDF restrito confirmado e entregue para download.';
    } catch (erro) {
      if (!resultadoIncerto(erro)) tentativa = null;
      falha(erro);
    } finally {
      ocupada = false;
      if (ativa) controles();
    }
  }
  async function conferirPdf() {
    if (!ativa || ocupada || !tentativa) return;
    ocupada = true;
    controles();
    try {
      const recibo = await servico.consultarPdfLocalizacao({
        turno_id: tentativa.entrada.turno_id,
        exportacao_id: tentativa.entrada.exportacao_id,
      });
      if (!ativa || !tentativa) return;
      if (recibo) {
        tentativa = null;
        opcoes.alteracaoPendente?.(false);
        status.textContent =
          'Emissão restrita anterior confirmada. Para obter outro arquivo, solicite nova emissão explicitamente.';
      } else {
        tentativa.consultada = true;
        status.textContent = 'Emissão ainda sem confirmação. Repita somente o mesmo envio.';
      }
    } catch (erro) {
      falha(erro);
    } finally {
      ocupada = false;
      if (ativa) controles();
    }
  }
  form.onsubmit = (evento) => {
    evento.preventDefault();
    consultaId = undefined;
    proximo = null;
    void carregarTurnos();
  };
  turno.onchange = () => {
    resultado.replaceChildren();
    controles();
  };
  pdfForm.oninput = () => opcoes.alteracaoPendente?.(true);
  pdfForm.onsubmit = (evento) => {
    evento.preventDefault();
    if (
      ocupada ||
      tentativa ||
      !turno.value ||
      !destinatario.value.trim() ||
      !proposito.value.trim()
    )
      return;
    tentativa = {
      entrada: {
        turno_id: turno.value,
        exportacao_id: crypto.randomUUID(),
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
  void servico
    .candidatosMedicacao({})
    .then((pagina) => {
      if (!ativa) return;
      permitida = pagina.pode_gerir;
      corpo.hidden = !permitida;
      status.textContent = permitida
        ? 'Operação restrita disponível; consulte os turnos do período.'
        : 'Este acesso não possui permissão vigente para consultar localização.';
      controles();
    })
    .catch(falha);
  return () => {
    ativa = false;
    tentativa = null;
    entrega.desmontar();
    resultado.replaceChildren();
    raiz.replaceChildren();
  };
}
