/* Prévia local de encaminhamentos — edição em memória antes de `aoRegistrar`/`aoAtualizar`
 * confirmarem a gravação —, reconstruída em React sobre a ilha (`web/ponte/ilha.ts`).
 *
 * O contrato exportado não muda: `montarEncaminhamentosLocais(raiz, dados) => void` (sem
 * desmontagem própria — quem monta é dono do ciclo de vida da `raiz`, como
 * `web/encaminhamentos.tsx` e `web/demonstracao.ts` já fazem).
 *
 * O que NÃO mudou, de propósito:
 *
 * - `dados.encaminhamentos` continua MUTADO por referência (`push`/substituição por
 *   índice) após gravação confirmada — é o mesmo array que o chamador guarda.
 * - Falha na gravação preserva o rascunho digitado e qual item está sendo editado — só
 *   sucesso limpa o formulário.
 * - "Cancelar edição" só pergunta se algo mudou desde que a edição começou
 *   (`confirmarSaida`/`alterado`) — diferente da prévia de orientações, onde cancelar
 *   SEMPRE pergunta. Entrar em edição com o rascunho intocado também não pergunta.
 * - Salvando trava filtro, campos e TODOS os botões "Editar" existentes — inclusive os
 *   recriados pelo filtro enquanto a gravação está em voo.
 *
 * **O DOM continua dono do valor dos campos.** Os controles são NÃO controlados: a
 * leitura é por `name` via `valorDe`/`web/telas/formulario.tsx`, e o pré-preenchimento ao
 * editar e a limpeza ao cancelar escrevem direto no DOM a partir do invólucro
 * (`envelope`), nunca de `document` — a mesma razão de `anamnese.tsx`.
 *
 * O filtro "Mostrar apenas retorno pendente" ouve `change` NATIVO, ligado direto ao
 * próprio nó — não pela delegação do React —, pela mesma razão de
 * `web/telas/formulario.tsx`: as provas de tela despacham `new Event('change')` sem
 * `bubbles`, que não alcança a raiz onde o React escuta.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { confirmarDescarte } from './confirmacao.js';
import { Botao } from './componentes/ui/botao.js';
import { Campo } from './componentes/ui/campo.js';
import { SelecaoAprimorada } from './componentes/ui/selecao-aprimorada.js';
import { SelecaoSimples } from './componentes/ui/selecao-simples.js';
import { definirValorNativo } from './componentes/ui/valor-nativo.js';
import './estilos/tema.css';
import { ilha } from './ponte/ilha.js';
import { Formulario, valorDe } from './telas/formulario.js';

export type EstadoEncaminhamento =
  | 'sugerido'
  | 'agendado'
  | 'realizado'
  | 'retorno pendente'
  | 'concluído';

export type EncaminhamentoLocal = {
  id: string;
  destino: string;
  motivo: string;
  responsavel: string;
  estado: EstadoEncaminhamento;
};

export type DadosEncaminhamento = Omit<EncaminhamentoLocal, 'id'>;

type Dados = {
  encaminhamentos: EncaminhamentoLocal[];
  aoRegistrar: (encaminhamento: DadosEncaminhamento) => Promise<EncaminhamentoLocal>;
  aoAtualizar: (id: string, encaminhamento: DadosEncaminhamento) => Promise<void>;
};

const ESTADOS: EstadoEncaminhamento[] = [
  'sugerido',
  'agendado',
  'realizado',
  'retorno pendente',
  'concluído',
];

const ORIGINAL_VAZIO: readonly [string, string, string, EstadoEncaminhamento] = [
  '',
  '',
  '',
  'sugerido',
];

/** O filtro ouve `change` nativo no próprio nó: ver cabeçalho do arquivo. */
function FiltroRetornoPendente({
  disabled,
  aoAlternar,
}: {
  disabled: boolean;
  aoAlternar: (marcado: boolean) => void;
}) {
  const referencia = useRef<HTMLInputElement>(null);
  const aoAlternarAtual = useRef(aoAlternar);
  aoAlternarAtual.current = aoAlternar;
  useEffect(() => {
    const no = referencia.current;
    if (!no) return;
    const ouvir = () => flushSync(() => aoAlternarAtual.current(no.checked));
    no.addEventListener('change', ouvir);
    return () => no.removeEventListener('change', ouvir);
  }, []);
  return (
    <label className="flex items-center gap-2 text-(length:--texto-1) text-texto-suave">
      <input ref={referencia} type="checkbox" defaultChecked={false} disabled={disabled} />
      Mostrar apenas retorno pendente
    </label>
  );
}

function EncaminhamentosLocaisTela({
  dados,
  aprimorarControles,
}: { dados: Dados; aprimorarControles: boolean }) {
  const Selecao = aprimorarControles ? SelecaoAprimorada : SelecaoSimples;
  const [itens, definirItens] = useState<EncaminhamentoLocal[]>(() => [...dados.encaminhamentos]);
  const [editando, definirEditando] = useState<string | null>(null);
  const [salvando, definirSalvando] = useState(false);
  const [mensagem, definirMensagem] = useState('');
  const [filtroAtivo, definirFiltroAtivo] = useState(false);
  const [original, definirOriginal] =
    useState<readonly [string, string, string, EstadoEncaminhamento]>(ORIGINAL_VAZIO);

  const envelope = useRef<HTMLDivElement>(null);

  const formularioAtual = useCallback((): HTMLFormElement | null => {
    return envelope.current?.querySelector('form') ?? null;
  }, []);

  const alterado = useCallback((): boolean => {
    const formulario = formularioAtual();
    if (!formulario) return false;
    const atuais = [
      valorDe(formulario, 'destino'),
      valorDe(formulario, 'motivo'),
      valorDe(formulario, 'responsavel'),
      valorDe(formulario, 'estado'),
    ];
    return atuais.some((valor, indice) => valor !== original[indice]);
  }, [formularioAtual, original]);

  // A confirmação deixou de ser síncrona: quem pergunta precisa esperar a resposta.
  const confirmarSaida = useCallback(async (): Promise<boolean> => {
    return (
      !alterado() || (await confirmarDescarte('as alterações não salvas deste encaminhamento'))
    );
  }, [alterado]);

  const limpar = useCallback(() => {
    formularioAtual()?.reset();
    definirEditando(null);
    definirOriginal(ORIGINAL_VAZIO);
  }, [formularioAtual]);

  async function aoClicarCancelar() {
    if (!(await confirmarSaida())) return;
    limpar();
    definirMensagem('');
  }

  async function aoClicarEditar(item: EncaminhamentoLocal) {
    if (!(await confirmarSaida())) return;
    const formulario = formularioAtual();
    flushSync(() => {
      definirEditando(item.id);
      definirOriginal([item.destino, item.motivo, item.responsavel, item.estado]);
      definirMensagem('');
    });
    const definir = (nome: string, valor: string) =>
      definirValorNativo(formulario?.elements.namedItem(nome), valor);
    definir('destino', item.destino);
    definir('motivo', item.motivo);
    definir('responsavel', item.responsavel);
    definir('estado', item.estado);
    (formulario?.elements.namedItem('destino') as HTMLInputElement | null)?.focus();
  }

  async function enviar(formulario: HTMLFormElement) {
    if (salvando) return;
    const valores: DadosEncaminhamento = {
      destino: valorDe(formulario, 'destino').trim(),
      motivo: valorDe(formulario, 'motivo').trim(),
      responsavel: valorDe(formulario, 'responsavel').trim(),
      estado: valorDe(formulario, 'estado') as EstadoEncaminhamento,
    };
    if (
      !valores.destino ||
      !valores.motivo ||
      !valores.responsavel ||
      !ESTADOS.includes(valores.estado)
    ) {
      definirMensagem('Informe destino, motivo, responsável e estado.');
      return;
    }
    const id = editando;
    // Sem `flushSync` aqui: esta função roda dentro do `flushSync` que
    // `web/telas/formulario.tsx` já aplica ao chamar `aoEnviar` — aninhar seria o React
    // recusar a segunda chamada por estarmos "dentro de um método de ciclo de vida". A
    // parte síncrona antes do primeiro `await` já entra no mesmo commit.
    definirSalvando(true);
    definirMensagem('Salvando…');
    try {
      if (id === null) {
        const criado = await dados.aoRegistrar(valores);
        dados.encaminhamentos.push(criado);
      } else {
        await dados.aoAtualizar(id, valores);
        const indice = dados.encaminhamentos.findIndex((item) => item.id === id);
        if (indice !== -1) dados.encaminhamentos[indice] = { id, ...valores };
      }
      // Aqui já estamos depois de um `await`: fora da pilha síncrona do `flushSync`
      // original, por isso usá-lo de novo é seguro e garante a leitura imediata nas provas.
      flushSync(() => definirItens([...dados.encaminhamentos]));
      limpar();
      definirMensagem('Encaminhamento salvo nesta prévia.');
    } catch {
      definirMensagem('Não foi possível guardar. O rascunho foi preservado.');
    } finally {
      definirSalvando(false);
    }
  }

  const visiveis = filtroAtivo ? itens.filter((item) => item.estado === 'retorno pendente') : itens;

  return (
    <div ref={envelope} className="grid min-w-0 gap-5">
      <Formulario aoEnviar={enviar} noValidate className="grid min-w-0 max-w-[480px] gap-3">
        <Campo
          id="encaminhamento-destino"
          name="destino"
          rotulo="Destino"
          maxLength={200}
          required
          disabled={salvando}
          classeEnvelope="mb-0"
        />
        <Campo
          id="encaminhamento-motivo"
          name="motivo"
          rotulo="Motivo"
          maxLength={200}
          required
          disabled={salvando}
          classeEnvelope="mb-0"
        />
        <Campo
          id="encaminhamento-responsavel"
          name="responsavel"
          rotulo="Responsável"
          maxLength={200}
          required
          disabled={salvando}
          classeEnvelope="mb-0"
        />
        <Selecao
          id="encaminhamento-estado"
          name="estado"
          rotulo="Estado"
          disabled={salvando}
          classeEnvelope="mb-0"
        >
          {ESTADOS.map((valor) => (
            <option key={valor} value={valor}>
              {valor}
            </option>
          ))}
        </Selecao>
        <div className="flex flex-wrap gap-3">
          <Botao peso="principal" tipo="submit" disabled={salvando}>
            {editando === null ? 'Registrar encaminhamento' : 'Salvar alterações'}
          </Botao>
          <Botao
            peso="secundario"
            hidden={editando === null}
            disabled={salvando}
            aoAtivar={() => void aoClicarCancelar()}
          >
            Cancelar edição
          </Botao>
        </div>
        {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o gancho que as provas já usam. */}
        <p role="status" className="m-0 text-(length:--texto-1) text-texto-suave empty:hidden">
          {mensagem}
        </p>
      </Formulario>

      <FiltroRetornoPendente disabled={salvando} aoAlternar={definirFiltroAtivo} />

      <ul className="m-0 grid min-w-0 list-none gap-2 p-0">
        {!visiveis.length ? (
          <li>
            {filtroAtivo
              ? 'Nenhum encaminhamento com retorno pendente.'
              : 'Nenhum encaminhamento registrado nesta prévia.'}
          </li>
        ) : (
          visiveis.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3">
              <span>{`${item.destino} · ${item.motivo} · ${item.responsavel} · ${item.estado}`}</span>
              <Botao
                peso="discreto"
                disabled={salvando}
                rotuloLeitura={`Editar encaminhamento para ${item.destino}`}
                aoAtivar={() => void aoClicarEditar(item)}
              >
                Editar
              </Botao>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

/** Edição local dos encaminhamentos (prévia). `dados.encaminhamentos` é mutado por
 *  referência após gravação confirmada — `web/encaminhamentos.tsx` depende disso. */
export function EncaminhamentosLocais({
  dados,
  aprimorarControles = false,
}: { dados: Dados; aprimorarControles?: boolean }) {
  return <EncaminhamentosLocaisTela dados={dados} aprimorarControles={aprimorarControles} />;
}

/** Mesmo componente acima, montado na sua própria ilha — contrato usado por quem monta a
 *  prévia isoladamente (`web/demonstracao.ts` e a prova deste arquivo). */
export function montarEncaminhamentosLocais(raiz: HTMLElement, dados: Dados): void {
  ilha(raiz, <EncaminhamentosLocais dados={dados} />);
}
