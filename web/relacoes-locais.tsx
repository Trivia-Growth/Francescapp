/* Pessoas de referência da demonstração local, reconstruídas em React sobre a ilha
 * (`web/ponte/ilha.ts`).
 *
 * Contrato: `montarRelacoesLocais(raiz, dados) => desmontar`. O único chamador é
 * `web/demonstracao.ts`, que remonta na mesma raiz a cada abertura (a ilha tolera) e
 * pendura um ouvinte `input` no `<form>` desenhado aqui para saber se há rascunho;
 * `aoLimpar` é como esta tela avisa que o rascunho deixou de existir.
 *
 * O que NÃO mudou, de propósito:
 *
 * - `dados.pessoas` continua sendo MUTADO por referência (`push`/troca no índice) só
 *   depois de `aoRegistrar`/`aoAtualizar` confirmarem; falha preserva o rascunho e qual
 *   pessoa está em edição.
 * - Trocar de pessoa ou cancelar a edição só pede confirmação quando algum campo difere
 *   do que foi carregado (`original`) — não a cada clique.
 * - Os controles são NÃO controlados: o DOM é dono do valor, lido por `name` (`valorDe`)
 *   e escrito direto ao carregar a pessoa em edição, como em `web/orientacoes-local.tsx`.
 * - A validação nativa (`required`) continua ligada, como na versão imperativa. */
import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { confirmarDescarte } from './confirmacao.js';
import { Botao } from './componentes/ui/botao.js';
import { Campo } from './componentes/ui/campo.js';
import './estilos/tema.css';
import { ilha } from './ponte/ilha.js';
import { Formulario, valorDe } from './telas/formulario.js';

export type PessoaReferenciaLocal = {
  id: string;
  nome: string;
  relacao: string;
  contato: string;
};

export type DadosPessoaReferencia = Omit<PessoaReferenciaLocal, 'id'>;

type Dados = {
  pessoas: PessoaReferenciaLocal[];
  aoRegistrar: (pessoa: DadosPessoaReferencia) => Promise<PessoaReferenciaLocal>;
  aoAtualizar: (id: string, pessoa: DadosPessoaReferencia) => Promise<void>;
  aoLimpar?: () => void;
};

const CAMPOS = ['nome', 'relacao', 'contato'] as const;
const VAZIO: DadosPessoaReferencia = { nome: '', relacao: '', contato: '' };

function RelacoesLocais({ dados }: { dados: Dados }) {
  const [itens, definirItens] = useState<PessoaReferenciaLocal[]>(() => [...dados.pessoas]);
  const [editando, definirEditando] = useState<string | null>(null);
  const [salvando, definirSalvando] = useState(false);
  const [mensagem, definirMensagem] = useState('');
  // O `<form>` é achado pelo invólucro: `Formulario` usa a própria referência para ouvir o
  // `submit`, e uma segunda `ref` espalhada por cima tomaria o lugar dela.
  const envelope = useRef<HTMLDivElement>(null);
  const formulario = () => envelope.current?.querySelector('form') ?? null;
  /** O que estava nos campos quando a edição começou; diferir disto é ter rascunho. */
  const original = useRef<DadosPessoaReferencia>(VAZIO);

  const alterado = () => {
    const atual = formulario();
    if (!atual) return false;
    return CAMPOS.some((campo) => valorDe(atual, campo) !== original.current[campo]);
  };
  // A confirmação é assíncrona: quem pergunta precisa esperar a resposta.
  const confirmarSaida = async () =>
    !alterado() || (await confirmarDescarte('as alterações não salvas desta pessoa de referência'));

  const limpar = () => {
    formulario()?.reset();
    original.current = VAZIO;
    flushSync(() => definirEditando(null));
    dados.aoLimpar?.();
  };

  async function aoClicarCancelar() {
    if (!(await confirmarSaida())) return;
    limpar();
    definirMensagem('');
  }

  async function aoClicarEditar(pessoa: PessoaReferenciaLocal) {
    if (!(await confirmarSaida())) return;
    const atual = formulario();
    if (!atual) return;
    dados.aoLimpar?.();
    // `flushSync`: um envio logo em seguida precisa ler `editando` já commitado.
    flushSync(() => {
      definirEditando(pessoa.id);
      definirMensagem('');
    });
    for (const campo of CAMPOS) {
      const controle = atual.elements.namedItem(campo);
      if (controle instanceof HTMLInputElement) controle.value = pessoa[campo];
    }
    original.current = { nome: pessoa.nome, relacao: pessoa.relacao, contato: pessoa.contato };
    (atual.elements.namedItem('nome') as HTMLInputElement | null)?.focus();
  }

  async function enviar(formulario: HTMLFormElement) {
    if (salvando) return;
    const valores: DadosPessoaReferencia = {
      nome: valorDe(formulario, 'nome').trim(),
      relacao: valorDe(formulario, 'relacao').trim(),
      contato: valorDe(formulario, 'contato').trim(),
    };
    if (!valores.nome || !valores.relacao) {
      definirMensagem('Informe nome e relação.');
      return;
    }
    const id = editando;
    // Já estamos dentro do `flushSync` de `Formulario`: a trava entra no mesmo commit.
    definirSalvando(true);
    definirMensagem('Salvando…');
    try {
      if (id === null) {
        dados.pessoas.push(await dados.aoRegistrar(valores));
      } else {
        await dados.aoAtualizar(id, valores);
        const indice = dados.pessoas.findIndex((item) => item.id === id);
        if (indice !== -1) dados.pessoas[indice] = { id, ...valores };
      }
      limpar();
      flushSync(() => definirItens([...dados.pessoas]));
      definirMensagem('Pessoa de referência salva nesta prévia.');
    } catch {
      definirMensagem('Não foi possível guardar. O rascunho foi preservado.');
    } finally {
      definirSalvando(false);
    }
  }

  return (
    <div ref={envelope} className="grid min-w-0 gap-5">
      <p className="m-0">Registrar uma pessoa de referência não cria conta nem concede acesso.</p>
      <Formulario aoEnviar={enviar} className="grid min-w-0 max-w-[480px] gap-3">
        <Campo
          id="relacao-nome"
          name="nome"
          rotulo="Nome"
          maxLength={200}
          required
          disabled={salvando}
          classeEnvelope="mb-0"
        />
        <Campo
          id="relacao-relacao"
          name="relacao"
          rotulo="Relação"
          maxLength={200}
          required
          disabled={salvando}
          classeEnvelope="mb-0"
        />
        <Campo
          id="relacao-contato"
          name="contato"
          rotulo="Contato (opcional)"
          maxLength={200}
          required={false}
          disabled={salvando}
          classeEnvelope="mb-0"
        />
        <div className="flex flex-wrap gap-3">
          <Botao peso="principal" tipo="submit" disabled={salvando}>
            {editando === null ? 'Registrar pessoa de referência' : 'Salvar alterações'}
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
      </Formulario>
      {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` em `<p>` é o gancho que a versão imperativa já expunha. */}
      <p role="status" className="m-0 empty:hidden">
        {mensagem}
      </p>
      <ul className="m-0 grid min-w-0 list-none gap-2 p-0">
        {!itens.length ? (
          <li>Nenhuma pessoa de referência registrada nesta prévia.</li>
        ) : (
          itens.map((pessoa) => (
            <li key={pessoa.id} className="flex flex-wrap items-center gap-3">
              <span>
                {[pessoa.nome, pessoa.relacao, pessoa.contato].filter(Boolean).join(' · ')}
              </span>
              <Botao
                peso="discreto"
                disabled={salvando}
                rotuloLeitura={`Editar pessoa de referência ${pessoa.nome}`}
                aoAtivar={() => void aoClicarEditar(pessoa)}
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

export function montarRelacoesLocais(raiz: HTMLElement, dados: Dados): () => void {
  return ilha(raiz, <RelacoesLocais dados={dados} />);
}
