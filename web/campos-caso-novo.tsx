import { type Ref, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { novoContatoSchema, type SituacaoCaso } from '../packages/contracts/src/index.js';
import { type ResponsavelOpcao, rotulosSituacao } from './acompanhamento-caso.js';
import { Botao } from './componentes/ui/botao.js';
import { CampoData } from './componentes/ui/campo-data.js';
import { SelecaoAprimorada } from './componentes/ui/selecao-aprimorada.js';
import { definirValorNativo } from './componentes/ui/valor-nativo.js';

const LIMITE_CONTATOS = 10;

export type ContatoDigitado = { tipo: 'email' | 'telefone'; valor: string };

type Destinos = {
  contatos: HTMLElement;
  adicionar: HTMLElement;
  erroContatos: HTMLElement;
  nascimento: HTMLElement;
  situacao: HTMLElement;
  responsavel: HTMLElement;
  estadoResponsavel: HTMLElement;
  tentarNovamente: HTMLElement;
};

type CampoEstatico = 'birth-date' | 'case-status' | 'case-manager';
type EstadoEquipe = {
  fase: 'ausente' | 'carregando' | 'carregada' | 'falha';
  mensagem: string;
  opcoes: readonly ResponsavelOpcao[];
};

export type ComandoCamposCasoNovo = {
  readonly campos: {
    nascimento: HTMLInputElement;
    situacao: HTMLSelectElement;
    responsavel: HTMLSelectElement;
  };
  marcarInvalido(campo: CampoEstatico, invalido: boolean): void;
  carregarResponsaveis(): Promise<void>;
  equipeIndisponivel(mensagem: string): void;
  reiniciar(): void;
  cancelarCarga(): void;
  contatos(): ContatoDigitado[];
  situacao(): SituacaoCaso | undefined;
  responsavelId(): string | undefined;
  equipeDisponivel(): boolean;
  marcarContatos(invalido: boolean): HTMLInputElement | undefined;
};

function CampoContato({
  numero,
  primeiro,
  invalido,
  aoRemover,
}: {
  numero: number;
  primeiro: boolean;
  invalido: boolean;
  aoRemover(): void;
}) {
  const [tipo, definirTipo] = useState<ContatoDigitado['tipo']>('email');
  const email = tipo === 'email';
  const idTipo = `contact-type-${numero}`;
  const idValor = `contact-value-${numero}`;

  return (
    <div className="contact-row">
      <label className="sr-only" htmlFor={idTipo}>
        Tipo do contato {numero}
      </label>
      <div>
        <SelecaoAprimorada
          id={idTipo}
          aria-label={`Tipo do contato ${numero}`}
          defaultValue="email"
          onChange={(evento) =>
            definirTipo(evento.currentTarget.value === 'telefone' ? 'telefone' : 'email')
          }
        >
          <option value="email">E-mail</option>
          <option value="telefone">Telefone</option>
        </SelecaoAprimorada>
      </div>
      <label className="sr-only" htmlFor={idValor}>
        Contato {numero}
      </label>
      <input
        id={idValor}
        type={email ? 'email' : 'tel'}
        placeholder={email ? 'nome@exemplo.org' : '+55 11 90000-0000'}
        maxLength={254}
        autoComplete="off"
        aria-invalid={invalido || undefined}
      />
      <Botao
        peso="secundario"
        className="contact-remove"
        aria-label={`Remover contato ${numero}`}
        hidden={primeiro}
        onClick={aoRemover}
      >
        Remover
      </Botao>
    </div>
  );
}

/** Os controles pertencem à casca React e enviam os valores nativos no formulário existente. */
export function CamposCasoNovo({
  destinos,
  listarResponsaveis,
  comando,
  aoMontar,
}: {
  destinos: Destinos;
  listarResponsaveis: () => Promise<ResponsavelOpcao[]>;
  comando: Ref<ComandoCamposCasoNovo>;
  aoMontar?: () => void;
}) {
  const nascimento = useRef<HTMLInputElement>(null);
  const situacao = useRef<HTMLSelectElement>(null);
  const responsavel = useRef<HTMLSelectElement>(null);
  const adicionar = useRef<HTMLButtonElement>(null);
  const proximoNumero = useRef(2);
  const carga = useRef(0);

  const [contatos, definirContatos] = useState({ numeros: [1], geracao: 0 });
  const [erroContatos, definirErroContatos] = useState(false);
  const [invalidos, definirInvalidos] = useState<ReadonlySet<string>>(new Set());
  const [equipe, definirEquipe] = useState<EstadoEquipe>({
    fase: 'ausente',
    mensagem: '',
    opcoes: [],
  });

  useLayoutEffect(
    () => () => {
      carga.current += 1;
    },
    [],
  );

  useEffect(() => {
    aoMontar?.();
  }, [aoMontar]);

  function consultarLinhas() {
    return Array.from(destinos.contatos.querySelectorAll<HTMLElement>('.contact-row'), (no) => {
      const valor = no.querySelector<HTMLInputElement>('input');
      const tipo = no.querySelector<HTMLSelectElement>('select');
      if (!valor || !tipo) throw new Error('Controle de contato indisponível.');
      return {
        valor,
        tipo: tipo.value === 'telefone' ? ('telefone' as const) : ('email' as const),
      };
    });
  }

  function focarContato(numero: number | undefined) {
    const campo = numero
      ? destinos.contatos.querySelector<HTMLInputElement>(`#contact-value-${numero}`)
      : adicionar.current;
    campo?.focus();
  }

  function adicionarContato() {
    if (contatos.numeros.length >= LIMITE_CONTATOS) return;
    const numero = proximoNumero.current++;
    flushSync(() => definirContatos({ ...contatos, numeros: [...contatos.numeros, numero] }));
    focarContato(numero);
  }

  function removerContato(numero: number) {
    const numeros = contatos.numeros.filter((atual) => atual !== numero);
    flushSync(() => definirContatos({ ...contatos, numeros }));
    focarContato(numeros.at(-1));
  }

  async function carregarResponsaveis() {
    const minhaCarga = ++carga.current;
    flushSync(() =>
      definirEquipe({ fase: 'carregando', mensagem: 'Carregando equipe…', opcoes: [] }),
    );
    try {
      const opcoes = (await listarResponsaveis()).filter((opcao) => opcao.ativo);
      if (minhaCarga !== carga.current) return;
      flushSync(() =>
        definirEquipe({
          fase: 'carregada',
          mensagem: opcoes.length
            ? ''
            : 'Nenhuma pessoa ativa da equipe para indicar. O cadastro não pode ser enviado.',
          opcoes,
        }),
      );
    } catch {
      if (minhaCarga !== carga.current) return;
      flushSync(() =>
        definirEquipe({
          fase: 'falha',
          mensagem: 'Não foi possível carregar a equipe. O cadastro não pode ser enviado agora.',
          opcoes: [],
        }),
      );
    }
  }

  function equipeIndisponivel(mensagem: string) {
    carga.current += 1;
    flushSync(() => definirEquipe({ fase: 'ausente', mensagem, opcoes: [] }));
  }

  function marcarInvalido(campo: string, invalido: boolean) {
    definirInvalidos((atuais) => {
      if (atuais.has(campo) === invalido) return atuais;
      const proximos = new Set(atuais);
      if (invalido) proximos.add(campo);
      else proximos.delete(campo);
      return proximos;
    });
  }

  useImperativeHandle(comando, () => ({
    get campos() {
      if (!nascimento.current || !situacao.current || !responsavel.current)
        throw new Error('Campos do cadastro indisponíveis.');
      return {
        nascimento: nascimento.current,
        situacao: situacao.current,
        responsavel: responsavel.current,
      };
    },
    marcarInvalido(campo, invalido) {
      flushSync(() => marcarInvalido(campo, invalido));
    },
    carregarResponsaveis,
    equipeIndisponivel,
    reiniciar() {
      proximoNumero.current = 2;
      flushSync(() => {
        definirContatos(({ geracao }) => ({ numeros: [1], geracao: geracao + 1 }));
        definirInvalidos(new Set());
        definirErroContatos(false);
      });
      if (situacao.current) definirValorNativo(situacao.current, '');
      if (responsavel.current) definirValorNativo(responsavel.current, '');
    },
    cancelarCarga: () => equipeIndisponivel(''),
    contatos: () =>
      consultarLinhas()
        .filter(({ valor }) => valor.value.trim() !== '')
        .map(({ tipo, valor }) => ({ tipo, valor: valor.value })),
    situacao: () => (situacao.current?.value || undefined) as SituacaoCaso | undefined,
    responsavelId: () => responsavel.current?.value || undefined,
    equipeDisponivel: () => responsavel.current?.disabled === false,
    marcarContatos(invalido) {
      const linhas = consultarLinhas();
      const algumaPreenchida = linhas.some(({ valor }) => valor.value.trim() !== '');
      let primeira: HTMLInputElement | undefined;
      flushSync(() => {
        for (const [indice, { tipo, valor }] of linhas.entries()) {
          const ruim =
            invalido &&
            (algumaPreenchida
              ? Boolean(valor.value.trim()) &&
                !novoContatoSchema.safeParse({ tipo, valor: valor.value }).success
              : indice === 0);
          marcarInvalido(valor.id, ruim);
          if (ruim) primeira ??= valor;
        }
        definirErroContatos(invalido);
      });
      return primeira;
    },
  }));

  return (
    <>
      {createPortal(
        <CampoData
          ref={nascimento}
          id="birth-date"
          name="data_nascimento"
          max={new Date().toISOString().slice(0, 10)}
          aria-labelledby="birth-label"
          aria-describedby="birth-error"
          aria-invalid={invalidos.has('birth-date') || undefined}
        />,
        destinos.nascimento,
      )}
      {createPortal(
        <SelecaoAprimorada
          ref={situacao}
          id="case-status"
          name="situacao"
          aria-labelledby="status-label"
          aria-describedby="status-error"
          aria-invalid={invalidos.has('case-status') || undefined}
          defaultValue=""
        >
          <option value="">Selecione a situação</option>
          {Object.entries(rotulosSituacao).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </SelecaoAprimorada>,
        destinos.situacao,
      )}
      {createPortal(
        <SelecaoAprimorada
          ref={responsavel}
          id="case-manager"
          name="responsavel_id"
          aria-labelledby="manager-label"
          aria-describedby="manager-error manager-state"
          aria-invalid={invalidos.has('case-manager') || undefined}
          aria-busy={equipe.fase === 'carregando' || undefined}
          disabled={equipe.opcoes.length === 0}
          defaultValue=""
        >
          <option value="">Selecione quem acompanha o caso</option>
          {equipe.opcoes.map((opcao) => (
            <option key={opcao.usuario_id} value={opcao.usuario_id}>
              {opcao.rotulo}
            </option>
          ))}
        </SelecaoAprimorada>,
        destinos.responsavel,
      )}
      {createPortal(
        contatos.numeros.map((numero, indice) => (
          <CampoContato
            key={`${contatos.geracao}:${numero}`}
            numero={numero}
            primeiro={indice === 0}
            invalido={invalidos.has(`contact-value-${numero}`)}
            aoRemover={() => removerContato(numero)}
          />
        )),
        destinos.contatos,
      )}
      {createPortal(
        <button
          id="add-contact"
          ref={adicionar}
          className="ui-botao"
          data-peso="secundario"
          type="button"
          disabled={contatos.numeros.length >= LIMITE_CONTATOS}
          onClick={adicionarContato}
        >
          Adicionar outro contato
        </button>,
        destinos.adicionar,
      )}
      {createPortal(
        erroContatos ? 'Informe ao menos um contato válido, com e-mail ou telefone correto.' : null,
        destinos.erroContatos,
      )}
      {createPortal(equipe.mensagem, destinos.estadoResponsavel)}
      {createPortal(
        <button
          id="manager-retry"
          className="ui-botao"
          data-peso="secundario"
          type="button"
          hidden={equipe.fase !== 'falha'}
          onClick={() => void carregarResponsaveis()}
        >
          Tentar novamente
        </button>,
        destinos.tentarNovamente,
      )}
    </>
  );
}
