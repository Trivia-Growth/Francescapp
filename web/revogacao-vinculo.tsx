/* Painel de revogação de vínculo, composto pela seção de equipe da ficha.
 * A confirmação precede o envio. A autorização permanece no servidor. */
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { AreaTexto } from './componentes/ui/area-texto.js';
import { Botao } from './componentes/ui/botao.js';
import { confirmar, type PedidoConfirmacao } from './confirmacao.js';
import './estilos/tema.css';

export type AlvoRevogacao = { id: string; versao: number; nome: string };

/** O punho visto por dentro: `selecionar` diz SE selecionou, para o hospedeiro só revelar
 *  o painel quando houver mesmo um vínculo escolhido. */
export type PunhoInterno = {
  selecionar: (acesso: AlvoRevogacao) => Promise<boolean>;
  invalidarSelecao: () => void;
  reconciliar: () => void;
};

export type PropsPainel = {
  revogar: (
    acessoId: string,
    dados: { versao_esperada: number; motivo: string },
  ) => Promise<unknown>;
  atualizarVinculos: () => Promise<void>;
  acessoPerdido: (erro: unknown) => boolean;
  alteracaoPendente: (pendente: boolean) => void;
  sinal: AbortSignal;
  /** Entrega ao chamador imperativo o punho que `web/main.ts` já conduz. */
  registrar: (punho: PunhoInterno) => void;
};

export function PainelRevogacao({
  revogar,
  atualizarVinculos,
  acessoPerdido,
  alteracaoPendente,
  sinal,
  registrar,
}: PropsPainel) {
  const [nome, definirNome] = useState('');
  const [motivo, definirMotivo] = useState('');
  const [status, definirStatus] = useState('');
  const [desligado, definirDesligado] = useState(false);
  const [enviando, marcarEnviando] = useState(false);

  /* Decisões síncronas no meio de um fluxo assíncrono (o segundo clique, a troca de
     vínculo durante o envio) leem ref, não estado: o estado ainda seria o do render
     anterior. */
  const alvoRef = useRef<AlvoRevogacao | undefined>(undefined);
  const enviandoRef = useRef(false);
  const incertoRef = useRef(false);
  const perguntandoRef = useRef(false);
  const selecaoValidaRef = useRef(false);
  /* O motivo é controlado — é dado, e dado mora no estado. O ref acompanha para que
     decisões síncronas (o clique que dispara a revogação) leiam o valor digitado e não o
     do render anterior. */
  const motivoRef = useRef('');
  const definirMotivoDigitado = useCallback((valor: string) => {
    motivoRef.current = valor;
    definirMotivo(valor);
  }, []);
  /* `AreaTexto` não publica `ref` no seu contrato, e o contrato é de outra frente. Para o
     único uso imperativo legítimo que sobrou — levar o foco ao campo quando um vínculo é
     selecionado — o envelope basta. */
  const envelopeRef = useRef<HTMLDivElement | null>(null);
  const focarMotivo = useCallback(() => {
    envelopeRef.current?.querySelector('textarea')?.focus();
  }, []);

  /** A confirmação é um `<dialog>` montado no documento por `web/confirmacao.ts`, FORA da
   *  ilha: desmontar a raiz React não a alcança. É o único ponto em que o ciclo de vida
   *  não basta, e por isso o sinal entra aqui — e só aqui. Sem isto, destruir o painel
   *  durante a pergunta deixaria a pergunta na tela seguinte, com o foco preso nela
   *  (VIS-012). Sinal abortado responde "não", que é o caminho que desiste sem tocar no
   *  servidor. */
  const perguntar = useCallback(
    (pedido: PedidoConfirmacao): Promise<boolean> =>
      sinal.aborted ? Promise.resolve(false) : confirmar(pedido),
    [sinal],
  );

  const selecionar = useCallback(
    async (acesso: AlvoRevogacao): Promise<boolean> => {
      const anterior = alvoRef.current;
      if (enviandoRef.current || incertoRef.current) return false;
      if (
        anterior &&
        anterior.id !== acesso.id &&
        motivoRef.current.trim() &&
        !(await perguntar({
          titulo: 'Descartar o motivo de revogação já digitado?',
          detalhe: 'Trocar de vínculo apaga o motivo escrito para o vínculo anterior.',
          acao: 'Descartar o motivo',
          cancelar: 'Continuar neste vínculo',
        }))
      )
        return false;
      if (!alvoRef.current || alvoRef.current.id !== acesso.id) {
        definirMotivoDigitado('');
        alteracaoPendente(false);
      }
      alvoRef.current = acesso;
      selecaoValidaRef.current = true;
      definirDesligado(false);
      definirNome(acesso.nome);
      definirStatus('');
      focarMotivo();
      return true;
    },
    [perguntar, alteracaoPendente, definirMotivoDigitado, focarMotivo],
  );

  const reconciliar = useCallback(() => {
    incertoRef.current = false;
    selecaoValidaRef.current = false;
    definirDesligado(true);
    definirStatus('Tudo conferido. Selecione o vínculo que deseja alterar.');
  }, []);

  const invalidarSelecao = useCallback(() => {
    selecaoValidaRef.current = false;
    definirDesligado(true);
    if (alvoRef.current && !enviandoRef.current && !incertoRef.current)
      definirStatus(
        'A lista foi atualizada. Selecione o vínculo novamente para confirmar a versão atual.',
      );
  }, []);

  useLayoutEffect(() => {
    registrar({ selecionar, invalidarSelecao, reconciliar });
  }, [registrar, selecionar, invalidarSelecao, reconciliar]);

  function acionar() {
    const atual = alvoRef.current;
    const razao = motivoRef.current;
    if (
      !atual ||
      enviandoRef.current ||
      incertoRef.current ||
      perguntandoRef.current ||
      !selecaoValidaRef.current ||
      !razao.trim()
    )
      return;
    // A confirmação não é síncrona: enquanto a pergunta está na tela, nenhum segundo
    // clique entra, e só depois da resposta o envio começa.
    perguntandoRef.current = true;
    void (async () => {
      let seguir: boolean;
      try {
        seguir = await perguntar({
          titulo: `Revogar o acesso de ${atual.nome}?`,
          detalhe: 'A pessoa perde o acesso a este caso assim que a revogação for aceita.',
          acao: 'Revogar acesso',
          cancelar: 'Manter o acesso',
        });
      } finally {
        perguntandoRef.current = false;
      }
      if (!seguir || enviandoRef.current || incertoRef.current || !selecaoValidaRef.current) return;
      enviandoRef.current = true;
      marcarEnviando(true);
      definirDesligado(true);
      definirStatus('Enviando revogação…');
      let perdeuAcesso = false;
      let concluida = false;
      let recado = 'Enviando revogação…';
      try {
        await revogar(atual.id, { versao_esperada: atual.versao, motivo: razao });
        if (motivoRef.current === razao) {
          definirMotivoDigitado('');
          alteracaoPendente(false);
        }
        concluida = true;
        alvoRef.current = undefined;
        recado = 'Revogação confirmada. Consultando estado atual.';
        definirStatus(recado);
      } catch (erro) {
        perdeuAcesso = acessoPerdido(erro);
        if (perdeuAcesso) return;
        incertoRef.current = true;
        recado =
          'Resultado desconhecido. O pedido ainda pode ser concluído. Consulte o estado atual antes de agir.';
        definirStatus(recado);
      } finally {
        if (!perdeuAcesso) {
          try {
            await atualizarVinculos();
          } catch {
            definirStatus(
              `${recado} Não foi possível consultar o estado atual; tente atualizar a lista.`,
            );
          }
          enviandoRef.current = false;
          marcarEnviando(false);
          definirDesligado(concluida || incertoRef.current || !selecaoValidaRef.current);
        }
      }
    })();
  }

  return (
    <section className="grid gap-4">
      <div className="grid gap-1">
        <h3 className="m-0 font-serifada text-(length:--texto-4) font-semibold leading-[1.2]">
          Revogar acesso
        </h3>
        <p className="m-0 text-(length:--texto-2)">{nome}</p>
      </div>
      <div ref={envelopeRef}>
        <AreaTexto
          id="revogacao-motivo"
          rotulo="Motivo da revogação"
          marcaRotulo="obrigatório"
          required
          maxLength={4000}
          classeEnvelope="max-w-[560px] mb-0"
          value={motivo}
          onChange={(evento) => {
            const valor = evento.currentTarget.value;
            definirMotivoDigitado(valor);
            alteracaoPendente(valor.trim().length > 0);
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Botao
          peso="secundario"
          disabled={desligado}
          aria-busy={enviando || undefined}
          aoAtivar={acionar}
        >
          Revogar acesso
          {enviando ? <span className="loading-indicator" aria-hidden="true" /> : null}
        </Botao>
        <output className="m-0 text-(length:--texto-1) text-texto-suave block" aria-live="polite">
          {status}
        </output>
      </div>
    </section>
  );
}
