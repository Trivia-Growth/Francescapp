/* Exportação do caso (FR-033), reconstruída em React sobre a ilha (`web/ponte/ilha.ts`).
 *
 * `web/anexos-exportacao.ts` e `web/pacote-exportacao.ts` (alvos originais da mesma
 * entrega) são lógica pura — nenhum dos dois toca DOM ou monta interface — e por isso não
 * há nada a migrar neles; ficam como estão.
 *
 * VIS-012: a flag `vivo` desapareceu — `ilha()` cancela os efeitos por construção. As
 * guardas que restam (`valida` nos efeitos, `vivoRef` nos manipuladores assíncronos de
 * linha) são de GERAÇÃO/desmontagem, não de ciclo de vida improvisado.
 *
 * O que NÃO mudou (VIS-018):
 * - o carimbo de entrega continua sendo DECLARAÇÃO de quem entregou, nunca prova de
 *   recebimento — os dois textos exatos que os testes conferem;
 * - nenhuma URL pública nem assinada: os anexos continuam sendo reunidos no navegador,
 *   chamada por chamada, pela mesma `reunirAnexosDaExportacao`;
 * - sucesso com anexo faltando nunca é anunciado como sucesso limpo;
 * - o registro de entrega é imutável; só se acrescenta ato, nunca se apaga;
 * - o formulário de registro limpa somente destinatário e propósito depois de salvar — a
 *   finalidade escolhida permanece, exatamente como antes.
 *
 * Qualquer gravação bem-sucedida (novo registro, ato confirmado) reconstrói a lista inteira
 * a partir da resposta do servidor, igual a `desenhar()` na versão imperativa. Isso vira um
 * contador `geracao` que remonta a lista via `key`. */
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { SelecaoAprimorada } from './componentes/ui/selecao-aprimorada.js';
import type {
  ArquivoItemExportacao,
  ConfirmarEntrega,
  Exportacao,
  RegistrarExportacao,
  RegistroExportacoes,
} from '../packages/contracts/src/exportacao.js';
import { arquivosDoManifesto, reunirAnexosDaExportacao } from './anexos-exportacao.js';
import type { BytesDeArquivo } from './anexos-exportacao.js';
import { exigeNovoAcesso, mensagemFalha } from './api.js';
import { dataDeInstante } from './datas.js';
import {
  FalhaPacoteExportacao,
  montarPacoteExportacao,
  nomeDoArquivoPacote,
} from './pacote-exportacao.js';
import { Botao } from './componentes/ui/botao.js';
import { ilha } from './ponte/ilha.js';
import { Formulario } from './telas/formulario.js';

export type ServicoExportacao = {
  consultar(pacienteId: string): Promise<RegistroExportacoes>;
  registrar(pacienteId: string, pedido: RegistrarExportacao): Promise<RegistroExportacoes>;
  confirmar(pacienteId: string, entrega: ConfirmarEntrega): Promise<RegistroExportacoes>;
  /** FR-033: bytes de um anexo autorizado, uma chamada por arquivo. Opcional porque a tela
   * continua entregando o índice quando a reunião de anexos não está disponível. */
  baixarArquivo?(pacienteId: string, arquivo: ArquivoItemExportacao): Promise<BytesDeArquivo>;
};

const ROTULOS_FINALIDADE: Record<RegistrarExportacao['finalidade'], string> = {
  acompanhamento: 'Acompanhamento do caso',
  portabilidade_titular: 'Pedido do titular',
  encerramento_uso: 'Encerramento do uso',
};

function IndicadorAcao() {
  return <span className="loading-indicator" aria-hidden="true" />;
}

function EsqueletoCompacto() {
  return (
    <div className="list-loading" aria-hidden="true">
      <span />
      <span />
    </div>
  );
}

function textoContagem(registro: RegistroExportacoes): string {
  return registro.exportacoes.length === 0
    ? 'Nenhuma exportação registrada neste caso.'
    : `${registro.exportacoes.length} exportações registradas.`;
}

function BotaoBaixarPacote({
  exportacao,
  pacienteId,
  pacienteRotulo,
  servico,
  acessoPerdido,
  definirEstadoTexto,
  vivoRef,
}: {
  exportacao: Exportacao;
  pacienteId: string;
  pacienteRotulo: string;
  servico: ServicoExportacao;
  acessoPerdido: (erro: unknown) => void;
  definirEstadoTexto: (texto: string) => void;
  vivoRef: RefObject<boolean>;
}) {
  const [ocupado, definirOcupado] = useState(false);
  const comArquivo = arquivosDoManifesto(exportacao).length;
  const baixarArquivo = servico.baixarArquivo;
  const reuneAnexos = comArquivo > 0 && baixarArquivo !== undefined;

  const aoClicar = async () => {
    definirOcupado(true);
    try {
      let conteudo: {
        exportacao: Exportacao;
        anexos: { nome: string; conteudo: Uint8Array<ArrayBuffer> }[];
        naoRecuperados: number;
      } = { exportacao, anexos: [], naoRecuperados: 0 };
      if (reuneAnexos && baixarArquivo) {
        definirEstadoTexto(`Reunindo os anexos do pacote… 0 de ${comArquivo}.`);
        conteudo = await reunirAnexosDaExportacao(
          pacienteId,
          exportacao,
          baixarArquivo,
          (feitos, total) => {
            if (vivoRef.current)
              definirEstadoTexto(`Reunindo os anexos do pacote… ${feitos} de ${total}.`);
          },
        );
      }
      if (!vivoRef.current) return;
      const arquivo = montarPacoteExportacao({
        exportacao: conteudo.exportacao,
        pacienteRotulo,
        anexos: conteudo.anexos,
      });
      const endereco = URL.createObjectURL(arquivo);
      const ligacao = document.createElement('a');
      ligacao.href = endereco;
      ligacao.download = nomeDoArquivoPacote(exportacao);
      ligacao.click();
      URL.revokeObjectURL(endereco);
      // Sucesso com anexo faltando NÃO pode ser anunciado como sucesso limpo.
      flushSync(() => {
        definirEstadoTexto(
          conteudo.naoRecuperados > 0
            ? `Pacote gerado com ${conteudo.anexos.length} anexo(s). ${conteudo.naoRecuperados} anexo(s) não puderam ser recuperados e estão marcados como indisponíveis dentro do pacote.`
            : reuneAnexos
              ? `Pacote gerado com ${conteudo.anexos.length} anexo(s).`
              : 'Índice gerado.',
        );
      });
    } catch (erro) {
      if (!vivoRef.current) return;
      if (exigeNovoAcesso(erro)) {
        acessoPerdido(erro);
        return;
      }
      flushSync(() => {
        definirEstadoTexto(
          erro instanceof FalhaPacoteExportacao
            ? `${erro.message} Nenhum arquivo foi gerado.`
            : mensagemFalha(erro),
        );
      });
    } finally {
      if (vivoRef.current) definirOcupado(false);
    }
  };

  return (
    <>
      <p>
        {reuneAnexos
          ? `Este ZIP traz o índice dos registros e os arquivos anexos que você já pode abrir (${comArquivo} no manifesto), na pasta anexos/. Não inclui o conteúdo clínico escrito dos registros. Para conteúdo persistido em PDF, use Relatórios do cuidado quando autorizado.`
          : 'Este ZIP contém somente o índice dos registros. Não inclui conteúdo clínico nem arquivos anexos. Para conteúdo persistido em PDF, use Relatórios do cuidado quando autorizado.'}
      </p>
      <button
        type="button"
        className="exportacao__baixar"
        disabled={ocupado}
        onClick={() => void aoClicar()}
      >
        {reuneAnexos ? 'Baixar pacote com índice e anexos' : 'Baixar índice dos registros'}
        {ocupado ? <IndicadorAcao /> : null}
      </button>
    </>
  );
}

function BotoesEntrega({
  exportacao,
  pacienteId,
  servico,
  acessoPerdido,
  definirEstadoTexto,
  vivoRef,
  aoRegistroAtualizado,
}: {
  exportacao: Exportacao;
  pacienteId: string;
  servico: ServicoExportacao;
  acessoPerdido: (erro: unknown) => void;
  definirEstadoTexto: (texto: string) => void;
  vivoRef: RefObject<boolean>;
  aoRegistroAtualizado: (registro: RegistroExportacoes) => void;
}) {
  const [ocupado, definirOcupado] = useState(false);
  const atos = new Set(exportacao.entregas.map((e) => e.ato));
  const textoEstado = atos.has('conferida')
    ? 'Envio registrado e conferido por quem entregou.'
    : atos.has('entregue')
      ? 'Envio registrado. Conferência de quem entregou ainda pendente.'
      : 'Envio ainda não registrado.';

  const confirmar = async (ato: 'entregue' | 'conferida') => {
    definirOcupado(true);
    definirEstadoTexto('Registrando confirmação…');
    try {
      const registro = await servico.confirmar(pacienteId, { exportacao_id: exportacao.id, ato });
      if (!vivoRef.current) return;
      aoRegistroAtualizado(registro);
    } catch (erro) {
      if (!vivoRef.current) return;
      if (exigeNovoAcesso(erro)) {
        acessoPerdido(erro);
        return;
      }
      flushSync(() => definirEstadoTexto(mensagemFalha(erro)));
    } finally {
      if (vivoRef.current) definirOcupado(false);
    }
  };

  return (
    <>
      <p className="exportacao__entrega">{textoEstado}</p>
      {(['entregue', 'conferida'] as const).map((ato) => {
        if (atos.has(ato)) return null;
        if (ato === 'conferida' && !atos.has('entregue')) return null;
        return (
          <button key={ato} type="button" disabled={ocupado} onClick={() => void confirmar(ato)}>
            {ato === 'entregue' ? 'Registrar que entreguei' : 'Confirmar que o envio saiu correto'}
            {ocupado ? <IndicadorAcao /> : null}
          </button>
        );
      })}
    </>
  );
}

function ItemExportacaoRegistrada({
  exportacao,
  pacienteId,
  pacienteRotulo,
  servico,
  acessoPerdido,
  definirEstadoTexto,
  vivoRef,
  aoRegistroAtualizado,
}: {
  exportacao: Exportacao;
  pacienteId: string;
  pacienteRotulo: string;
  servico: ServicoExportacao;
  acessoPerdido: (erro: unknown) => void;
  definirEstadoTexto: (texto: string) => void;
  vivoRef: RefObject<boolean>;
  aoRegistroAtualizado: (registro: RegistroExportacoes) => void;
}) {
  const quando = dataDeInstante(exportacao.criado_em);
  const incluidos = exportacao.itens.filter((i) => i.disponibilidade === 'incluido').length;
  const indisponiveis = exportacao.itens.length - incluidos;
  return (
    <li className="exportacao__item">
      <p className="exportacao__finalidade">{ROTULOS_FINALIDADE[exportacao.finalidade]}</p>
      <p className="exportacao__quando">{quando ? `Registrada em ${quando}` : ''}</p>
      <p className="exportacao__contagem">
        {indisponiveis === 0
          ? `${incluidos} referências no índice.`
          : `${incluidos} referências no índice e ${indisponiveis} com conteúdo indisponível.`}
      </p>
      {/* FR-033: o pacote declara que houve omissão de dados de terceiros, sem dizer o que
          foi omitido. Terceiros entram com papel e primeiro nome, nada além disso. */}
      {exportacao.terceiros_reduzidos ? (
        <p className="exportacao__terceiros">
          Dados de outras pessoas entraram apenas como papel e primeiro nome.
        </p>
      ) : null}
      <BotaoBaixarPacote
        exportacao={exportacao}
        pacienteId={pacienteId}
        pacienteRotulo={pacienteRotulo}
        servico={servico}
        acessoPerdido={acessoPerdido}
        definirEstadoTexto={definirEstadoTexto}
        vivoRef={vivoRef}
      />
      <BotoesEntrega
        exportacao={exportacao}
        pacienteId={pacienteId}
        servico={servico}
        acessoPerdido={acessoPerdido}
        definirEstadoTexto={definirEstadoTexto}
        vivoRef={vivoRef}
        aoRegistroAtualizado={aoRegistroAtualizado}
      />
    </li>
  );
}

function TelaExportacao({
  pacienteId,
  servico,
  acessoPerdido,
  alteracaoPendente,
  pacienteRotulo,
}: {
  pacienteId: string;
  servico: ServicoExportacao;
  acessoPerdido: (erro: unknown) => void;
  alteracaoPendente: (pendente: boolean) => void;
  pacienteRotulo: string;
}) {
  const [fase, definirFase] = useState<'carregando' | 'pronta' | 'erro'>('carregando');
  const [registro, definirRegistro] = useState<RegistroExportacoes | null>(null);
  const [estadoTexto, definirEstadoTexto] = useState('Carregando as exportações…');
  const [geracao, definirGeracao] = useState(0);
  const [enviando, definirEnviando] = useState(false);

  const vivoRef = useRef(true);
  const acessoPerdidoRef = useRef(acessoPerdido);
  acessoPerdidoRef.current = acessoPerdido;
  const servicoRef = useRef(servico);
  servicoRef.current = servico;
  const alteracaoPendenteRef = useRef(alteracaoPendente);
  alteracaoPendenteRef.current = alteracaoPendente;

  useEffect(
    () => () => {
      vivoRef.current = false;
    },
    [],
  );

  const aplicarRegistro = useCallback((novo: RegistroExportacoes) => {
    flushSync(() => {
      definirRegistro(novo);
      definirGeracao((atual) => atual + 1);
      definirFase('pronta');
      definirEstadoTexto(textoContagem(novo));
    });
  }, []);

  useEffect(() => {
    let valida = true;
    servicoRef.current
      .consultar(pacienteId)
      .then((novo) => {
        if (!valida) return;
        aplicarRegistro(novo);
      })
      .catch((erro: unknown) => {
        if (!valida) return;
        if (exigeNovoAcesso(erro)) {
          acessoPerdidoRef.current(erro);
          return;
        }
        flushSync(() => {
          definirFase('erro');
          definirEstadoTexto(mensagemFalha(erro));
        });
      });
    return () => {
      valida = false;
    };
  }, [pacienteId, aplicarRegistro]);

  const marcarPendente = (formulario: HTMLFormElement) => {
    const destinatario = formulario.elements.namedItem('destinatario') as HTMLInputElement | null;
    const proposito = formulario.elements.namedItem('proposito') as HTMLTextAreaElement | null;
    alteracaoPendente(Boolean(destinatario?.value.trim()) || Boolean(proposito?.value.trim()));
  };

  const aoRegistrar = async (formulario: HTMLFormElement) => {
    const finalidade = formulario.elements.namedItem('finalidade') as HTMLSelectElement;
    const destinatario = formulario.elements.namedItem('destinatario') as HTMLInputElement;
    const proposito = formulario.elements.namedItem('proposito') as HTMLTextAreaElement;
    if (!destinatario.value.trim() || !proposito.value.trim()) return;
    definirEnviando(true);
    definirEstadoTexto('Registrando a exportação…');
    try {
      const novo = await servicoRef.current.registrar(pacienteId, {
        finalidade: finalidade.value as RegistrarExportacao['finalidade'],
        destinatario: destinatario.value.trim(),
        proposito: proposito.value.trim(),
      });
      if (!vivoRef.current) return;
      destinatario.value = '';
      proposito.value = '';
      alteracaoPendenteRef.current(false);
      aplicarRegistro(novo);
    } catch (erro) {
      if (!vivoRef.current) return;
      if (exigeNovoAcesso(erro)) {
        acessoPerdidoRef.current(erro);
        return;
      }
      flushSync(() => definirEstadoTexto(mensagemFalha(erro)));
    } finally {
      if (vivoRef.current) definirEnviando(false);
    }
  };

  const idPrefixo = `exportacao-${pacienteId}`;

  return (
    <section className="secao-exportacao" aria-labelledby={`${idPrefixo}-titulo`}>
      <h3 id={`${idPrefixo}-titulo`}>Exportação do caso</h3>
      <p className="exportacao__explicacao">
        Toda exportação fica registrada com destinatário e propósito. O registro não pode ser
        apagado.
      </p>
      {/* Decisão de 13/11/2026: o carimbo de entrega é declaração de quem entregou, nunca
          prova de recebimento — o destinatário não tem conta aqui. Dizer isso com todas as
          letras é requisito, não enfeite. */}
      <p className="exportacao__aviso-entrega">
        Os registros de entrega abaixo são declaração de quem entregou. Quem recebe não confirma
        nada neste sistema.
      </p>
      {/* biome-ignore lint/a11y/useSemanticElements: idem. */}
      <p className="exportacao__estado" role="status" aria-live="polite">
        {estadoTexto}
      </p>
      <Formulario
        className="exportacao__form"
        aoEnviar={(formulario) => void aoRegistrar(formulario)}
        noValidate
      >
        <SelecaoAprimorada
          id={`${idPrefixo}-finalidade`}
          rotulo="Finalidade"
          name="finalidade"
          required
          defaultValue="acompanhamento"
        >
          {Object.entries(ROTULOS_FINALIDADE).map(([chave, rotulo]) => (
            <option key={chave} value={chave}>
              {rotulo}
            </option>
          ))}
        </SelecaoAprimorada>
        <label htmlFor={`${idPrefixo}-destinatario`}>Destinatário</label>
        <input
          id={`${idPrefixo}-destinatario`}
          name="destinatario"
          required
          maxLength={500}
          onChange={(evento) => marcarPendente(evento.currentTarget.form as HTMLFormElement)}
        />
        <label htmlFor={`${idPrefixo}-proposito`}>Propósito</label>
        <textarea
          id={`${idPrefixo}-proposito`}
          name="proposito"
          required
          maxLength={2000}
          onChange={(evento) => marcarPendente(evento.currentTarget.form as HTMLFormElement)}
        />
        <Botao tipo="submit" peso="principal" disabled={enviando}>
          Registrar exportação
          {enviando ? <IndicadorAcao /> : null}
        </Botao>
      </Formulario>
      {fase === 'carregando' ? (
        <ol className="exportacao__lista">
          <EsqueletoCompacto />
        </ol>
      ) : fase === 'erro' || !registro ? (
        <ol className="exportacao__lista" />
      ) : (
        <ol className="exportacao__lista" key={geracao}>
          {registro.exportacoes.map((exportacao) => (
            <ItemExportacaoRegistrada
              key={exportacao.id}
              exportacao={exportacao}
              pacienteId={pacienteId}
              pacienteRotulo={pacienteRotulo}
              servico={servico}
              acessoPerdido={acessoPerdido}
              definirEstadoTexto={definirEstadoTexto}
              vivoRef={vivoRef}
              aoRegistroAtualizado={aplicarRegistro}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

/** Jornada de exportação do caso: índice do manifesto autorizado e registro humano de
 * entrega. O ZIP traz `resumo.html`, `dados.json` e, quando o manifesto aponta arquivos e o
 * serviço sabe baixá-los, os BYTES dos anexos autorizados em `anexos/` — reunidos aqui no
 * navegador, um download autorizado por arquivo. O conteúdo clínico escrito dos registros
 * continua fora do pacote; PDF de conteúdo persistido é operação separada no servidor.
 * Anexo que não vier entra no pacote como indisponível, com motivo declarado. A redução de
 * terceiros do manifesto e o registro de entrega permanecem; o índice não comprova
 * recebimento. */
export function montarExportacao(
  raiz: HTMLElement,
  pacienteId: string,
  servico: ServicoExportacao,
  acessoPerdido: (erro: unknown) => void,
  alteracaoPendente: (pendente: boolean) => void = () => {},
  pacienteRotulo = 'Pessoa acompanhada',
): () => void {
  return ilha(
    raiz,
    <TelaExportacao
      pacienteId={pacienteId}
      servico={servico}
      acessoPerdido={acessoPerdido}
      alteracaoPendente={alteracaoPendente}
      pacienteRotulo={pacienteRotulo}
    />,
  );
}
