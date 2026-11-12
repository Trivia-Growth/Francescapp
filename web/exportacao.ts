import type {
  ConfirmarEntrega,
  Exportacao,
  RegistrarExportacao,
  RegistroExportacoes,
} from '../packages/contracts/src/exportacao.js';
import { exigeNovoAcesso, mensagemFalha } from './api.js';
import { dataDeInstante } from './datas.js';
import { esqueletoCarregando } from './esqueleto.js';

export type ServicoExportacao = {
  consultar(pacienteId: string): Promise<RegistroExportacoes>;
  registrar(pacienteId: string, pedido: RegistrarExportacao): Promise<RegistroExportacoes>;
  confirmar(pacienteId: string, entrega: ConfirmarEntrega): Promise<RegistroExportacoes>;
};

const elemento = <K extends keyof HTMLElementTagNameMap>(
  tipo: K,
  texto?: string,
  classe?: string,
): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tipo);
  if (texto !== undefined) el.textContent = texto;
  if (classe) el.className = classe;
  return el;
};

const ROTULOS_FINALIDADE: Record<RegistrarExportacao['finalidade'], string> = {
  acompanhamento: 'Acompanhamento do caso',
  portabilidade_titular: 'Pedido do titular',
  encerramento_uso: 'Encerramento do uso',
};

/** Exportação do caso (FR-032/FR-033).
 *
 * O que esta tela mostra é o REGISTRO da exportação: quem exportou, para quem, com qual
 * propósito, o que entrou e o que estava indisponível. O arquivo em si é montado com o
 * conteúdo que as outras telas já carregaram para esta pessoa — nenhum servidor reúne o
 * caso decifrado num só lugar.
 *
 * "Conteúdo indisponível" aqui nunca quer dizer "existe algo que você não pode ver": o que
 * a audiência exclui não chega a esta tela nem como contagem.
 *
 * Decisão de 12/11/2026: dados de terceiros entram no pacote com o mínimo identificável —
 * papel e primeiro nome, sem contato, anotação, documento ou campo livre. A redução é feita
 * na montagem do pacote, aqui no navegador, porque o servidor não decifra nada. */
export function montarExportacao(
  raiz: HTMLElement,
  pacienteId: string,
  servico: ServicoExportacao,
  acessoPerdido: (erro: unknown) => void,
  alteracaoPendente: (pendente: boolean) => void = () => {},
): () => void {
  let vivo = true;

  const secao = elemento('section', undefined, 'secao-exportacao');
  const titulo = elemento('h3', 'Exportação do caso');
  titulo.id = `exportacao-titulo-${pacienteId}`;
  secao.setAttribute('aria-labelledby', titulo.id);
  const explicacao = elemento(
    'p',
    'Toda exportação fica registrada com destinatário e propósito. O registro não pode ser apagado.',
    'exportacao__explicacao',
  );
  const estado = elemento('p', '', 'exportacao__estado');
  estado.setAttribute('role', 'status');
  estado.setAttribute('aria-live', 'polite');

  const formulario = elemento('form', undefined, 'exportacao__form');
  const rotuloFinalidade = elemento('label', 'Finalidade');
  const finalidade = elemento('select');
  finalidade.id = `exportacao-finalidade-${pacienteId}`;
  finalidade.required = true;
  rotuloFinalidade.htmlFor = finalidade.id;
  for (const [chave, rotulo] of Object.entries(ROTULOS_FINALIDADE))
    finalidade.append(new Option(rotulo, chave));
  const rotuloDestinatario = elemento('label', 'Destinatário');
  const destinatario = elemento('input');
  destinatario.id = `exportacao-destinatario-${pacienteId}`;
  destinatario.required = true;
  destinatario.maxLength = 500;
  rotuloDestinatario.htmlFor = destinatario.id;
  const rotuloProposito = elemento('label', 'Propósito');
  const proposito = elemento('textarea');
  proposito.id = `exportacao-proposito-${pacienteId}`;
  proposito.required = true;
  proposito.maxLength = 2000;
  rotuloProposito.htmlFor = proposito.id;
  const enviar = elemento('button', 'Registrar exportação');
  enviar.type = 'submit';
  formulario.append(
    rotuloFinalidade,
    finalidade,
    rotuloDestinatario,
    destinatario,
    rotuloProposito,
    proposito,
    enviar,
  );

  const lista = elemento('ol', undefined, 'exportacao__lista');
  secao.append(titulo, explicacao, estado, formulario, lista);
  raiz.append(secao);

  const marcarPendente = () =>
    alteracaoPendente(destinatario.value.trim() !== '' || proposito.value.trim() !== '');
  destinatario.addEventListener('input', marcarPendente);
  proposito.addEventListener('input', marcarPendente);

  function desenhar(registro: RegistroExportacoes): void {
    lista.replaceChildren();
    if (registro.exportacoes.length === 0) {
      estado.textContent = 'Nenhuma exportação registrada neste caso.';
      return;
    }
    estado.textContent = `${registro.exportacoes.length} exportações registradas.`;
    for (const exportacao of registro.exportacoes) lista.append(desenharExportacao(exportacao));
  }

  function desenharExportacao(exportacao: Exportacao): HTMLElement {
    const item = elemento('li', undefined, 'exportacao__item');
    const quando = dataDeInstante(exportacao.criado_em);
    item.append(
      elemento('p', ROTULOS_FINALIDADE[exportacao.finalidade], 'exportacao__finalidade'),
      elemento('p', quando ? `Registrada em ${quando}` : '', 'exportacao__quando'),
    );
    const incluidos = exportacao.itens.filter((i) => i.disponibilidade === 'incluido').length;
    const indisponiveis = exportacao.itens.length - incluidos;
    item.append(
      elemento(
        'p',
        indisponiveis === 0
          ? `${incluidos} registros incluídos.`
          : `${incluidos} registros incluídos e ${indisponiveis} com conteúdo indisponível.`,
        'exportacao__contagem',
      ),
    );
    // FR-033: o pacote declara que houve omissão de dados de terceiros, sem dizer o que
    // foi omitido. Terceiros entram com papel e primeiro nome, nada além disso.
    if (exportacao.terceiros_reduzidos)
      item.append(
        elemento(
          'p',
          'Dados de outras pessoas entraram apenas como papel e primeiro nome.',
          'exportacao__terceiros',
        ),
      );
    const atos = new Set(exportacao.entregas.map((e) => e.ato));
    const estados = elemento('p', undefined, 'exportacao__entrega');
    estados.textContent = atos.has('conferida')
      ? 'Entregue e conferida.'
      : atos.has('entregue')
        ? 'Entregue, conferência pendente.'
        : 'Ainda não entregue.';
    item.append(estados);
    for (const ato of ['entregue', 'conferida'] as const) {
      if (atos.has(ato)) continue;
      if (ato === 'conferida' && !atos.has('entregue')) continue;
      const botao = elemento('button', ato === 'entregue' ? 'Marcar entregue' : 'Marcar conferida');
      botao.type = 'button';
      botao.addEventListener('click', () => {
        botao.disabled = true;
        void (async () => {
          try {
            const registro = await servico.confirmar(pacienteId, {
              exportacao_id: exportacao.id,
              ato,
            });
            if (!vivo) return;
            desenhar(registro);
          } catch (erro) {
            if (!vivo) return;
            if (exigeNovoAcesso(erro)) {
              acessoPerdido(erro);
              return;
            }
            estado.textContent = mensagemFalha(erro);
            botao.disabled = false;
          }
        })();
      });
      item.append(botao);
    }
    return item;
  }

  formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    if (!destinatario.value.trim() || !proposito.value.trim()) return;
    enviar.disabled = true;
    estado.textContent = 'Registrando a exportação…';
    void (async () => {
      try {
        const registro = await servico.registrar(pacienteId, {
          finalidade: finalidade.value as RegistrarExportacao['finalidade'],
          destinatario: destinatario.value.trim(),
          proposito: proposito.value.trim(),
        });
        if (!vivo) return;
        destinatario.value = '';
        proposito.value = '';
        alteracaoPendente(false);
        desenhar(registro);
      } catch (erro) {
        if (!vivo) return;
        if (exigeNovoAcesso(erro)) {
          acessoPerdido(erro);
          return;
        }
        estado.textContent = mensagemFalha(erro);
      } finally {
        if (vivo) enviar.disabled = false;
      }
    })();
  });

  estado.textContent = 'Carregando as exportações…';
  lista.replaceChildren(esqueletoCarregando(2));
  void (async () => {
    try {
      const registro = await servico.consultar(pacienteId);
      if (!vivo) return;
      desenhar(registro);
    } catch (erro) {
      if (!vivo) return;
      if (exigeNovoAcesso(erro)) {
        acessoPerdido(erro);
        return;
      }
      lista.replaceChildren();
      estado.textContent = mensagemFalha(erro);
    }
  })();

  return () => {
    vivo = false;
    secao.remove();
  };
}
