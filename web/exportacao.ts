import type {
  ConfirmarEntrega,
  Exportacao,
  RegistrarExportacao,
  RegistroExportacoes,
} from '../packages/contracts/src/exportacao.js';
import { exigeNovoAcesso, mensagemFalha } from './api.js';
import { dataDeInstante } from './datas.js';
import { esqueletoCarregando } from './esqueleto.js';
import { montarPacoteExportacao, nomeDoArquivoPacote } from './pacote-exportacao.js';

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
  pacienteRotulo = 'Pessoa acompanhada',
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
  // Decisão de 13/11/2026: o carimbo de entrega é declaração de quem entregou, nunca prova de
  // recebimento — o destinatário não tem conta aqui. Dizer isso com todas as letras é
  // requisito, não enfeite: um carimbo que parece confirmação do outro lado é garantia falsa,
  // e numa discussão sobre LGPD isso é pior que não ter carimbo nenhum.
  const avisoEntrega = elemento(
    'p',
    'Os registros de entrega abaixo são declaração de quem entregou. Quem recebe não confirma nada neste sistema.',
    'exportacao__aviso-entrega',
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
  secao.append(titulo, explicacao, avisoEntrega, estado, formulario, lista);
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
    const baixar = elemento('button', 'Baixar pacote', 'exportacao__baixar');
    baixar.type = 'button';
    baixar.addEventListener('click', () => {
      // O pacote é montado aqui, no navegador, com o conteúdo que as outras telas já
      // carregaram. Nenhum servidor reúne o caso decifrado num só lugar.
      const arquivo = montarPacoteExportacao({ exportacao, pacienteRotulo });
      const endereco = URL.createObjectURL(arquivo);
      const ligacao = elemento('a');
      ligacao.href = endereco;
      ligacao.download = nomeDoArquivoPacote(exportacao);
      ligacao.click();
      URL.revokeObjectURL(endereco);
    });
    item.append(baixar);

    const atos = new Set(exportacao.entregas.map((e) => e.ato));
    const estados = elemento('p', undefined, 'exportacao__entrega');
    // Os dois atos continuam existindo no banco e no contrato; o que muda é não prometerem
    // recebimento. Ambos descrevem o que QUEM ENTREGOU fez.
    estados.textContent = atos.has('conferida')
      ? 'Envio registrado e conferido por quem entregou.'
      : atos.has('entregue')
        ? 'Envio registrado. Conferência de quem entregou ainda pendente.'
        : 'Envio ainda não registrado.';
    item.append(estados);
    for (const ato of ['entregue', 'conferida'] as const) {
      if (atos.has(ato)) continue;
      if (ato === 'conferida' && !atos.has('entregue')) continue;
      const botao = elemento(
        'button',
        ato === 'entregue' ? 'Registrar que entreguei' : 'Confirmar que o envio saiu correto',
      );
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
