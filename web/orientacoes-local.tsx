/* Prévia local de orientações — edição em memória antes de `aoSalvar` confirmar a
 * gravação —, reconstruída em React sobre a ilha (`web/ponte/ilha.ts`).
 *
 * O contrato exportado não muda: `montarOrientacoesLocais(raiz, dados, ehFamilia?) =>
 * void` (sem desmontagem própria — quem monta é dono do ciclo de vida da `raiz`, como
 * `web/orientacoes.tsx` e `web/demonstracao.ts` já fazem).
 *
 * O que NÃO mudou, de propósito:
 *
 * - `dados.orientacoes` continua sendo MUTADO por referência (`splice`) após gravação
 *   confirmada — é o mesmo array que o chamador guarda, e `web/orientacoes.tsx` depende
 *   disso para a próxima substituição enxergar a lista atualizada.
 * - Falha na gravação preserva o rascunho digitado (nada é limpo) e preserva qual item
 *   está sendo substituído — só sucesso limpa o formulário.
 * - Substituir com rascunho não vazio pede confirmação antes de sobrescrevê-lo; cancelar
 *   SEMPRE pede confirmação, tenha ou não rascunho.
 * - Família só vê a lista; nunca o formulário de registro/substituição.
 *
 * **O DOM continua dono do valor dos campos.** Os controles são NÃO controlados, como na
 * versão imperativa: a leitura é por `name` via `valorDe`/`web/telas/formulario.tsx`, e o
 * pré-preenchimento ao substituir e a limpeza ao cancelar escrevem direto no DOM a partir
 * do invólucro (`envelope`), nunca de `document` — a mesma razão de `anamnese.tsx`: a
 * raiz pode estar destacada do documento nas provas.
 */
import { useCallback, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { VisibilidadeObjetivo } from '../packages/contracts/src/plano-cuidado.ts';
import { confirmarDescarte } from './confirmacao.js';
import { AreaTexto } from './componentes/ui/area-texto.js';
import { Botao } from './componentes/ui/botao.js';
import { CampoData } from './componentes/ui/campo-data.js';
import { Campo } from './componentes/ui/campo.js';
import { SelecaoAprimorada } from './componentes/ui/selecao-aprimorada.js';
import { SelecaoSimples } from './componentes/ui/selecao-simples.js';
import { definirValorNativo } from './componentes/ui/valor-nativo.js';
import './estilos/tema.css';
import { Formulario, valorDe } from './telas/formulario.js';

export type OrientacaoLocal = {
  id: string;
  texto: string;
  autor: string;
  data: string;
  destinatarios: string;
  validade: string | null;
  anterior: boolean;
  visibilidade: VisibilidadeObjetivo;
};

type Dados = {
  orientacoes: OrientacaoLocal[];
  aoSalvar: (orientacoes: OrientacaoLocal[]) => Promise<void>;
};

function descricaoItem(item: OrientacaoLocal): string {
  const rotuloVisibilidade = item.visibilidade === 'publica' ? 'Pública' : 'Interna';
  return `${item.anterior ? 'Anterior' : 'Atual'} · ${item.texto} · ${item.autor} · ${item.data} · ${item.destinatarios}${item.validade ? ` · Validade/revisão: ${item.validade}` : ''} · ${rotuloVisibilidade}`;
}

function TelaOrientacoesLocaisFamilia({
  orientacoes,
}: { orientacoes: readonly OrientacaoLocal[] }) {
  if (!orientacoes.length) return <ul>Nenhuma orientação registrada.</ul>;
  return (
    <ul className="m-0 grid min-w-0 list-none gap-2 p-0">
      {orientacoes.map((item) => (
        <li key={item.id}>
          {`${item.anterior ? 'Anterior' : 'Atual'} · ${item.texto} · ${item.autor} · ${item.data} · ${item.destinatarios}${item.validade ? ` · Validade/revisão: ${item.validade}` : ''}`}
        </li>
      ))}
    </ul>
  );
}

function TelaOrientacoesLocaisEdicao({
  dados,
  aprimorarControles,
}: { dados: Dados; aprimorarControles: boolean }) {
  const Data = aprimorarControles ? CampoData : Campo;
  const Selecao = aprimorarControles ? SelecaoAprimorada : SelecaoSimples;
  const tipoNativo = aprimorarControles ? {} : { tipo: 'date' };
  const [itens, definirItens] = useState<OrientacaoLocal[]>(() => [...dados.orientacoes]);
  const [substituindo, definirSubstituindo] = useState<string | null>(null);
  const [salvando, definirSalvando] = useState(false);
  const [mensagem, definirMensagem] = useState('');

  const envelope = useRef<HTMLDivElement>(null);

  const formularioAtual = useCallback((): HTMLFormElement | null => {
    return envelope.current?.querySelector('form') ?? null;
  }, []);

  const limpar = useCallback(() => {
    formularioAtual()?.reset();
    definirSubstituindo(null);
  }, [formularioAtual]);

  async function aoClicarCancelar() {
    if (await confirmarDescarte('as alterações não salvas desta orientação')) limpar();
  }

  async function aoClicarSubstituir(item: OrientacaoLocal) {
    const formulario = formularioAtual();
    if (!formulario) return;
    const haRascunho = Boolean(
      valorDe(formulario, 'texto') ||
        valorDe(formulario, 'autor') ||
        valorDe(formulario, 'data') ||
        valorDe(formulario, 'destinatarios') ||
        valorDe(formulario, 'validade'),
    );
    if (haRascunho && !(await confirmarDescarte('as alterações não salvas desta orientação')))
      return;
    // `flushSync`: o clique e o envio seguinte podem acontecer na mesma passagem síncrona
    // (como nas provas de tela), e o envio precisa ler `substituindo` já commitado.
    flushSync(() => definirSubstituindo(item.id));
    const definir = (nome: string, valor: string) =>
      definirValorNativo(formulario.elements.namedItem(nome), valor);
    definir('texto', item.texto);
    definir('autor', item.autor);
    definir('data', item.data);
    definir('destinatarios', item.destinatarios);
    definir('validade', item.validade ?? '');
    definir('visibilidade', item.visibilidade);
    (formulario.elements.namedItem('texto') as HTMLTextAreaElement | null)?.focus();
  }

  async function enviar(formulario: HTMLFormElement) {
    if (salvando) return;
    const texto = valorDe(formulario, 'texto').trim();
    const autor = valorDe(formulario, 'autor').trim();
    const data = valorDe(formulario, 'data');
    const destinatarios = valorDe(formulario, 'destinatarios').trim();
    if (!texto || !autor || !data || !destinatarios) {
      definirMensagem('Informe orientação, autor, data e destinatários.');
      return;
    }
    const nova: OrientacaoLocal = {
      id: crypto.randomUUID(),
      texto,
      autor,
      data,
      destinatarios,
      validade: valorDe(formulario, 'validade') || null,
      anterior: false,
      visibilidade: valorDe(formulario, 'visibilidade') === 'publica' ? 'publica' : 'interna',
    };
    const proximas = [
      ...itens.map((item) => (item.id === substituindo ? { ...item, anterior: true } : item)),
      nova,
    ];
    // Sem `flushSync` aqui: esta função roda dentro do `flushSync` que
    // `web/telas/formulario.tsx` já aplica ao chamar `aoEnviar` — aninhar seria o React
    // recusar a segunda chamada por estarmos "dentro de um método de ciclo de vida". A
    // parte síncrona antes do primeiro `await` já entra no mesmo commit.
    definirSalvando(true);
    definirMensagem('Salvando…');
    try {
      await dados.aoSalvar(proximas);
      dados.orientacoes.splice(0, dados.orientacoes.length, ...proximas);
      // Aqui já estamos depois de um `await`: fora da pilha síncrona do `flushSync`
      // original, por isso usá-lo de novo é seguro e garante a leitura imediata nas provas.
      flushSync(() => definirItens([...dados.orientacoes]));
      limpar();
      definirMensagem('Orientação salva nesta prévia.');
    } catch {
      definirMensagem('Não foi possível guardar. O rascunho foi preservado.');
    } finally {
      definirSalvando(false);
    }
  }

  return (
    <div ref={envelope} className="grid min-w-0 gap-5">
      <Formulario aoEnviar={enviar} noValidate className="grid min-w-0 max-w-[480px] gap-3">
        <AreaTexto
          id="orientacao-texto"
          name="texto"
          rotulo="Orientação"
          linhas={3}
          maxLength={5_000}
          required
          disabled={salvando}
          classeEnvelope="mb-0"
        />
        <Campo
          id="orientacao-autor"
          name="autor"
          rotulo="Autor"
          maxLength={200}
          required
          disabled={salvando}
          classeEnvelope="mb-0"
        />
        <Data
          id="orientacao-data"
          name="data"
          rotulo="Data"
          {...tipoNativo}
          required
          disabled={salvando}
          classeEnvelope="mb-0"
        />
        <Campo
          id="orientacao-destinatarios"
          name="destinatarios"
          rotulo="Destinatários"
          maxLength={200}
          required
          disabled={salvando}
          classeEnvelope="mb-0"
        />
        <Data
          id="orientacao-validade"
          name="validade"
          rotulo="Validade ou revisão (opcional)"
          {...tipoNativo}
          required={false}
          disabled={salvando}
          classeEnvelope="mb-0"
        />
        <Selecao
          id="orientacao-visibilidade"
          name="visibilidade"
          rotulo="Visibilidade para a família"
          disabled={salvando}
          classeEnvelope="mb-0"
        >
          <option value="interna">Interna (só a equipe vê)</option>
          <option value="publica">Pública (a família também vê)</option>
        </Selecao>
        <div className="flex flex-wrap gap-3">
          <Botao peso="principal" tipo="submit" disabled={salvando}>
            {substituindo === null ? 'Registrar orientação' : 'Salvar nova versão'}
          </Botao>
          <Botao
            peso="secundario"
            hidden={substituindo === null}
            disabled={salvando}
            aoAtivar={() => void aoClicarCancelar()}
          >
            Cancelar substituição
          </Botao>
        </div>
        {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o gancho que as provas já usam. */}
        <p role="status" className="m-0 text-(length:--texto-1) text-texto-suave empty:hidden">
          {mensagem}
        </p>
      </Formulario>

      <ul className="m-0 grid min-w-0 list-none gap-2 p-0">
        {!itens.length ? (
          <li>Nenhuma orientação registrada nesta prévia.</li>
        ) : (
          itens.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3">
              <span>{descricaoItem(item)}</span>
              {item.anterior ? null : (
                <Botao
                  peso="discreto"
                  disabled={salvando}
                  aoAtivar={() => void aoClicarSubstituir(item)}
                >
                  Substituir
                </Botao>
              )}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

/** Edição local das orientações (prévia): família só vê a lista; quem registra vê o
 *  formulário de registro e substituição. `dados.orientacoes` é mutado por referência
 *  após gravação confirmada — `web/orientacoes.tsx` depende disso.
 *
 *  Exportado como componente (e não só como `montar*`) para `web/orientacoes.tsx` poder
 *  compor a prévia na MESMA raiz React, em vez de abrir uma segunda `ilha()` dentro de um
 *  efeito — duas raízes síncronas (`flushSync`) aninhadas faz o React recusar a segunda
 *  por estarmos "dentro de um método de ciclo de vida", medido em 25/11/2026. */
export function OrientacoesLocais({
  dados,
  ehFamilia = false,
  aprimorarControles = false,
}: { dados: Dados; ehFamilia?: boolean; aprimorarControles?: boolean }) {
  return ehFamilia ? (
    <TelaOrientacoesLocaisFamilia orientacoes={dados.orientacoes} />
  ) : (
    <TelaOrientacoesLocaisEdicao dados={dados} aprimorarControles={aprimorarControles} />
  );
}
