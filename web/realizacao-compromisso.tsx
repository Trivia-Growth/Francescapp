/** Registro de realização do compromisso (FR-024), reconstruído em React sobre a ilha
 *  (`web/ponte/ilha.ts`).
 *
 *  O hospedeiro é `web/agenda-individual.tsx`, migrado na MESMA leva: por isso o punho
 *  continua existindo (`registrar` entrega `{ abrir, ocultar }`), mas não por necessidade
 *  de um consumidor imperativo — é o mesmo padrão já usado em `web/revogacao-vinculo.tsx`
 *  para expor uma ação disparada por um clique em outra parte da árvore (a lista de
 *  compromissos) sem reconstruir o estado de abertura duas vezes.
 *
 *  `consultar()` saiu do punho: era um método puro, sem nenhuma leitura de estado do
 *  componente, e o hospedeiro pode chamar `consultarRealizacoes` diretamente, sem
 *  depender deste componente estar montado. O método `esqueleto()` do punho antigo não
 *  tinha chamador — nenhuma leitura de `web/agenda-individual.ts` o usava — e não foi
 *  recriado (YAGNI).
 *
 *  VIS-012: a versão imperativa guardava `ativa` e testava `if (!ativa) return` em cada
 *  retomada de `await`. Aqui não sobra nenhuma: desmontar a ilha cancela os efeitos, e
 *  `setState` depois disso não produz tela nenhuma. */
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { AreaTexto } from './componentes/ui/area-texto.js';
import { Botao } from './componentes/ui/botao.js';
import { Campo } from './componentes/ui/campo.js';
import { SelecaoAprimorada } from './componentes/ui/selecao-aprimorada.js';
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

/** Consulta em lotes; devolve o que respondeu e deixa o resto sem situação conhecida.
 *  Pura: não depende de `RealizacaoAgenda` estar montado. */
export async function consultarRealizacoes(
  servico: ServicoRealizacaoCompromisso,
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
}

export type PunhoRealizacao = {
  abrir: (id: string, rotulo: string, atual?: RealizacaoCompromisso) => void;
  ocultar: () => void;
};

type PropsRealizacaoAgenda = {
  servico: ServicoRealizacaoCompromisso;
  aoRegistrar: (registros: readonly RealizacaoCompromisso[]) => void;
  registrar: (punho: PunhoRealizacao) => void;
};

export function RealizacaoAgenda({ servico, aoRegistrar, registrar }: PropsRealizacaoAgenda) {
  const [aberto, definirAberto] = useState(false);
  const [evento, definirEvento] = useState('');
  const [situacao, definirSituacao] = useState<SituacaoRegistravel>('realizado');
  const [motivo, definirMotivo] = useState('');
  const [destino, definirDestino] = useState('');
  const [observacao, definirObservacao] = useState('');
  const [estado, definirEstado] = useState('');
  const [ocupado, definirOcupado] = useState(false);

  const eventoIdRef = useRef('');
  const versaoAtualRef = useRef(0);
  const ocupadoRef = useRef(false);
  const tituloRef = useRef<HTMLHeadingElement | null>(null);

  const abrir = useCallback((id: string, rotulo: string, atual?: RealizacaoCompromisso) => {
    if (ocupadoRef.current) return;
    eventoIdRef.current = id;
    versaoAtualRef.current = atual?.versao ?? 0;
    definirEvento(`Compromisso: ${rotulo}`);
    definirSituacao(atual?.situacao_registrada ?? 'realizado');
    definirMotivo(atual?.motivo ?? '');
    definirObservacao(atual?.observacao ?? '');
    definirDestino(atual?.evento_destino_id ?? '');
    definirEstado(
      atual?.situacao_registrada
        ? 'Registrar de novo cria uma versão nova e preserva a anterior.'
        : '',
    );
    definirAberto(true);
  }, []);

  const ocultar = useCallback(() => {
    if (!ocupadoRef.current) definirAberto(false);
  }, []);

  useLayoutEffect(() => {
    registrar({ abrir, ocultar });
  }, [registrar, abrir, ocultar]);

  useLayoutEffect(() => {
    if (aberto) tituloRef.current?.focus();
  }, [aberto]);

  const remarcado = situacao === 'remarcado';
  const realizado = situacao === 'realizado';

  async function enviar(): Promise<void> {
    if (ocupadoRef.current || !eventoIdRef.current) return;
    const texto = observacao.trim();
    const alvo = destino.trim();
    if (situacao === 'faltou' && !motivo) {
      definirEstado('Informe o motivo da falta.');
      return;
    }
    if (situacao === 'remarcado' && !/^[A-Za-z0-9_-]{1,1024}$/.test(alvo)) {
      definirEstado('Informe o identificador do compromisso na nova data.');
      return;
    }
    ocupadoRef.current = true;
    definirOcupado(true);
    definirEstado('Registrando…');
    try {
      const registros = await servico.registrar({
        evento_id: eventoIdRef.current,
        situacao,
        versao_esperada: versaoAtualRef.current,
        ...(realizado || !motivo ? {} : { motivo: motivo as MotivoBarreira }),
        ...(realizado || !texto ? {} : { observacao: texto }),
        ...(situacao === 'remarcado' ? { evento_destino_id: alvo } : {}),
      });
      definirEstado('Situação registrada.');
      definirAberto(false);
      aoRegistrar(registros);
    } catch (falha) {
      definirEstado(
        falha instanceof FalhaApi && falha.codigo === 'conflito_versao'
          ? 'A situação deste compromisso mudou enquanto você preenchia. Atualize a agenda e tente novamente.'
          : falha instanceof FalhaApi && falha.codigo === 'sem_permissao'
            ? 'Você não pode registrar a realização nesta agenda.'
            : 'Não foi possível registrar agora. Tente novamente.',
      );
    } finally {
      ocupadoRef.current = false;
      definirOcupado(false);
    }
  }

  return (
    <section hidden={!aberto} className="realizacao-compromisso grid min-w-0 gap-4">
      <h3
        ref={tituloRef}
        tabIndex={-1}
        className="m-0 font-serifada text-(length:--texto-4) font-semibold leading-[1.2]"
      >
        Registrar realização do compromisso
      </h3>
      <p className="m-0">{evento}</p>
      <p className="feedback m-0">
        Compromisso passado sem registro aparece como realização não confirmada — isso não é falta.
        O motivo identifica barreiras de acesso e não produz avaliação clínica.
      </p>
      <form
        noValidate
        className="grid min-w-0 gap-4"
        onSubmit={(acao) => {
          acao.preventDefault();
          void enviar();
        }}
      >
        <SelecaoAprimorada
          id="realizacao-situacao"
          name="situacao"
          rotulo="O que aconteceu"
          value={situacao}
          onChange={(acao) => definirSituacao(acao.currentTarget.value as SituacaoRegistravel)}
        >
          {SITUACOES.map((valor) => (
            <option key={valor} value={valor}>
              {ROTULOS_SITUACAO[valor]}
            </option>
          ))}
        </SelecaoAprimorada>
        {realizado ? null : (
          <SelecaoAprimorada
            id="realizacao-motivo"
            name="motivo"
            rotulo={
              situacao === 'faltou'
                ? 'Motivo da falta (barreira de acesso)'
                : 'Motivo (barreira de acesso)'
            }
            required={situacao === 'faltou'}
            value={motivo}
            onChange={(acao) => definirMotivo(acao.currentTarget.value)}
          >
            <option value="">Não informar</option>
            {Object.entries(ROTULOS_MOTIVO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </SelecaoAprimorada>
        )}
        {remarcado ? (
          <Campo
            id="realizacao-destino"
            name="evento_destino_id"
            rotulo="Identificador do compromisso na nova data"
            required
            autoComplete="off"
            maxLength={1024}
            value={destino}
            onChange={(acao) => definirDestino(acao.currentTarget.value)}
          />
        ) : null}
        {realizado ? null : (
          <AreaTexto
            id="realizacao-observacao"
            name="observacao"
            rotulo="Observação (opcional)"
            maxLength={2000}
            linhas={3}
            value={observacao}
            onChange={(acao) => definirObservacao(acao.currentTarget.value)}
          />
        )}
        {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` é o gancho que as provas já usam. */}
        <p role="status" aria-live="polite" className="feedback m-0">
          {estado}
        </p>
        <div className="flex flex-wrap gap-3">
          <Botao tipo="submit" peso="principal" disabled={ocupado}>
            Registrar
            {ocupado ? <span className="loading-indicator" aria-hidden="true" /> : null}
          </Botao>
          <Botao peso="secundario" disabled={ocupado} aoAtivar={() => definirAberto(false)}>
            Fechar
          </Botao>
        </div>
      </form>
    </section>
  );
}
