import { esqueletoCarregando, iniciarAcao } from './esqueleto.js';
import { FalhaApi } from './api.js';
import type {
  MotivoBarreira,
  RealizacaoCompromisso,
  SituacaoApresentada,
  SituacaoRegistravel,
} from '../packages/contracts/src/realizacao-compromisso.ts';
import type {
  PedidoEvento,
  ServicoRealizacaoCompromisso,
} from './servico-realizacao-compromisso-http.js';

/** FR-024. "Realização não confirmada" é um estado seu, não um apelido de falta: aparece
 * quando o compromisso já passou e ninguém registrou nada. A tela nunca a chama de falta,
 * e o servidor nunca a devolve como falta. */
export const ROTULOS_SITUACAO: Readonly<Record<SituacaoApresentada, string>> = Object.freeze({
  realizado: 'Realizado',
  faltou: 'Faltou',
  cancelado: 'Cancelado',
  remarcado: 'Remarcado',
  realizacao_nao_confirmada: 'Realização não confirmada',
  agendado: 'Sem registro',
});

const ROTULOS_MOTIVO: Readonly<Record<MotivoBarreira, string>> = Object.freeze({
  transporte: 'Transporte',
  custo: 'Custo',
  disponibilidade: 'Disponibilidade',
  outras: 'Outras',
});

const SITUACOES: readonly SituacaoRegistravel[] = ['realizado', 'faltou', 'cancelado', 'remarcado'];

/** Descrição textual da situação, pronta para leitor de tela e para a lista da agenda. */
export function descreverRealizacao(registro: RealizacaoCompromisso | undefined): string {
  if (!registro) return 'Situação não consultada';
  const partes = [`Situação: ${ROTULOS_SITUACAO[registro.situacao]}`];
  if (registro.motivo) partes.push(`Motivo: ${ROTULOS_MOTIVO[registro.motivo]}`);
  if (registro.observacao) partes.push(`Observação: ${registro.observacao}`);
  if (registro.evento_destino_id)
    partes.push(`Remarcado para o compromisso ${registro.evento_destino_id}`);
  if (registro.remarcado_de.length)
    partes.push(`Remarcado a partir de ${registro.remarcado_de.join(', ')}`);
  if (registro.situacao === 'realizacao_nao_confirmada')
    partes.push('Ninguém registrou o que aconteceu; isto não é uma falta.');
  return partes.join(' · ');
}

export function montarRealizacaoAgenda(
  raiz: HTMLElement,
  servico: ServicoRealizacaoCompromisso,
  aoRegistrar: (registros: readonly RealizacaoCompromisso[]) => void,
) {
  let ativa = true;
  let ocupado = false;
  let eventoId = '';
  let versaoAtual = 0;
  const secao = document.createElement('section');
  secao.className = 'realizacao-compromisso';
  secao.hidden = true;
  const titulo = document.createElement('h3');
  titulo.textContent = 'Registrar realização do compromisso';
  const evento = document.createElement('p');
  const aviso = document.createElement('p');
  aviso.className = 'feedback';
  aviso.textContent =
    'Compromisso passado sem registro aparece como realização não confirmada — isso não é falta. O motivo identifica barreiras de acesso e não produz avaliação clínica.';
  const formulario = document.createElement('form');
  formulario.noValidate = true;

  const situacaoRotulo = document.createElement('label');
  situacaoRotulo.htmlFor = 'realizacao-situacao';
  situacaoRotulo.textContent = 'O que aconteceu';
  const situacao = document.createElement('select');
  situacao.id = 'realizacao-situacao';
  situacao.name = 'situacao';
  for (const valor of SITUACOES) {
    const opcao = document.createElement('option');
    opcao.value = valor;
    opcao.textContent = ROTULOS_SITUACAO[valor];
    situacao.append(opcao);
  }

  const motivoRotulo = document.createElement('label');
  motivoRotulo.htmlFor = 'realizacao-motivo';
  motivoRotulo.textContent = 'Motivo (barreira de acesso)';
  const motivo = document.createElement('select');
  motivo.id = 'realizacao-motivo';
  motivo.name = 'motivo';
  const semMotivo = document.createElement('option');
  semMotivo.value = '';
  semMotivo.textContent = 'Não informar';
  motivo.append(semMotivo);
  for (const [valor, rotulo] of Object.entries(ROTULOS_MOTIVO)) {
    const opcao = document.createElement('option');
    opcao.value = valor;
    opcao.textContent = rotulo;
    motivo.append(opcao);
  }

  const destinoRotulo = document.createElement('label');
  destinoRotulo.htmlFor = 'realizacao-destino';
  destinoRotulo.textContent = 'Identificador do compromisso na nova data';
  const destino = document.createElement('input');
  destino.id = 'realizacao-destino';
  destino.name = 'evento_destino_id';
  destino.type = 'text';
  destino.autocomplete = 'off';
  destino.maxLength = 1024;

  const observacaoRotulo = document.createElement('label');
  observacaoRotulo.htmlFor = 'realizacao-observacao';
  observacaoRotulo.textContent = 'Observação (opcional)';
  const observacao = document.createElement('textarea');
  observacao.id = 'realizacao-observacao';
  observacao.name = 'observacao';
  observacao.maxLength = 2000;
  observacao.rows = 3;

  const estado = document.createElement('p');
  estado.className = 'feedback';
  estado.setAttribute('role', 'status');
  estado.setAttribute('aria-live', 'polite');
  const registrar = document.createElement('button');
  registrar.type = 'submit';
  registrar.textContent = 'Registrar';
  const fechar = document.createElement('button');
  fechar.type = 'button';
  fechar.className = 'button-secondary';
  fechar.textContent = 'Fechar';
  formulario.append(
    situacaoRotulo,
    situacao,
    motivoRotulo,
    motivo,
    destinoRotulo,
    destino,
    observacaoRotulo,
    observacao,
    estado,
    registrar,
    fechar,
  );
  secao.append(titulo, evento, aviso, formulario);
  raiz.append(secao);

  function aplicarSituacao(): void {
    const escolhida = situacao.value as SituacaoRegistravel;
    const remarcado = escolhida === 'remarcado';
    const realizado = escolhida === 'realizado';
    destinoRotulo.hidden = destino.hidden = !remarcado;
    destino.required = remarcado;
    // Registrar que algo foi realizado não é lugar para motivo nem texto livre.
    motivoRotulo.hidden = motivo.hidden = realizado;
    observacaoRotulo.hidden = observacao.hidden = realizado;
    motivo.required = escolhida === 'faltou';
    motivoRotulo.textContent =
      escolhida === 'faltou'
        ? 'Motivo da falta (barreira de acesso)'
        : 'Motivo (barreira de acesso)';
  }
  situacao.addEventListener('change', aplicarSituacao);

  formulario.addEventListener('submit', (acao) => {
    acao.preventDefault();
    void enviar();
  });

  async function enviar(): Promise<void> {
    if (ocupado || !eventoId) return;
    const escolhida = situacao.value as SituacaoRegistravel;
    const texto = observacao.value.trim();
    const alvo = destino.value.trim();
    if (escolhida === 'faltou' && !motivo.value) {
      estado.textContent = 'Informe o motivo da falta.';
      motivo.focus();
      return;
    }
    if (escolhida === 'remarcado' && !/^[A-Za-z0-9_-]{1,1024}$/.test(alvo)) {
      estado.textContent = 'Informe o identificador do compromisso na nova data.';
      destino.focus();
      return;
    }
    ocupado = true;
    registrar.disabled = fechar.disabled = true;
    estado.textContent = 'Registrando…';
    const finalizar = iniciarAcao(registrar);
    try {
      const registros = await servico.registrar({
        evento_id: eventoId,
        situacao: escolhida,
        versao_esperada: versaoAtual,
        ...(escolhida === 'realizado' || !motivo.value
          ? {}
          : { motivo: motivo.value as MotivoBarreira }),
        ...(escolhida === 'realizado' || !texto ? {} : { observacao: texto }),
        ...(escolhida === 'remarcado' ? { evento_destino_id: alvo } : {}),
      });
      if (!ativa) return;
      estado.textContent = 'Situação registrada.';
      secao.hidden = true;
      aoRegistrar(registros);
    } catch (falha) {
      if (!ativa) return;
      estado.textContent =
        falha instanceof FalhaApi && falha.codigo === 'conflito_versao'
          ? 'A situação deste compromisso mudou enquanto você preenchia. Atualize a agenda e tente novamente.'
          : falha instanceof FalhaApi && falha.codigo === 'sem_permissao'
            ? 'Você não pode registrar a realização nesta agenda.'
            : 'Não foi possível registrar agora. Tente novamente.';
    } finally {
      finalizar();
      if (ativa) {
        ocupado = false;
        registrar.disabled = fechar.disabled = false;
      }
    }
  }

  fechar.addEventListener('click', () => {
    if (!ocupado) secao.hidden = true;
  });

  return {
    /** Consulta em lotes; devolve o que respondeu e deixa o resto sem situação conhecida. */
    async consultar(
      itens: readonly PedidoEvento[],
    ): Promise<ReadonlyMap<string, RealizacaoCompromisso>> {
      const encontrados = new Map<string, RealizacaoCompromisso>();
      for (let indice = 0; indice < itens.length; indice += 250) {
        const lote = itens.slice(indice, indice + 250);
        if (!lote.length) continue;
        const registros = await servico.consultar(lote);
        for (const registro of registros) encontrados.set(registro.evento_id, registro);
      }
      return encontrados;
    },
    esqueleto: () => esqueletoCarregando(1, true),
    abrir(id: string, rotulo: string, atual?: RealizacaoCompromisso) {
      if (ocupado) return;
      eventoId = id;
      versaoAtual = atual?.versao ?? 0;
      evento.textContent = `Compromisso: ${rotulo}`;
      situacao.value = atual?.situacao_registrada ?? 'realizado';
      motivo.value = atual?.motivo ?? '';
      observacao.value = atual?.observacao ?? '';
      destino.value = atual?.evento_destino_id ?? '';
      estado.textContent = atual?.situacao_registrada
        ? 'Registrar de novo cria uma versão nova e preserva a anterior.'
        : '';
      aplicarSituacao();
      secao.hidden = false;
      titulo.tabIndex = -1;
      titulo.focus();
    },
    ocultar() {
      if (!ocupado) secao.hidden = true;
    },
    desmontar() {
      ativa = false;
      secao.replaceChildren();
      secao.remove();
    },
  };
}
