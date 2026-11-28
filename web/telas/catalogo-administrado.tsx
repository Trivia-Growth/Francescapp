import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { FalhaApi, exigeNovoAcesso, mensagemFalha, resultadoIncerto } from '../api.ts';
import { Botao } from '../componentes/ui/botao.js';

/** A máquina compartilhada dos catálogos administrados — modelo da ficha de plantão
 *  (FR-078), papéis declarados (FR-079), termos de estado emocional (FR-076/FR-081) e o
 *  catálogo do plano de cuidado.
 *
 *  As quatro telas repetiam, letra por letra, a mesma sequência de risco: envio com
 *  chave de idempotência, bloqueio de novas alterações enquanto um resultado está
 *  incerto, releitura para conferir se o envio pegou, e repetição do MESMO envio com a
 *  MESMA chave. Quatro cópias de uma regra dessas é quatro lugares para ela divergir.
 *
 *  O que esta máquina NÃO decide: autorização. Ela só repassa a recusa do servidor —
 *  `exigeNovoAcesso` derruba a tela e chama `acessoPerdido`, e esconder controle aqui
 *  nunca foi autorizar nada. */

export type ServicoCatalogo<D, E> = {
  consultar(): Promise<D>;
  gravar(entrada: E, chave: string): Promise<void>;
};

/** Leitura guardada fora da tela (o cache de `web/consultas.ts`). Com ela, a montagem
 *  usa o que já foi lido em vez de consultar de novo; `atualizar`, o envio e a repetição
 *  continuam relendo sempre pelo `servico`. */
export type LeituraRetida<D> = {
  /** O que a identidade atual já leu, se ainda estiver guardado. */
  retida(): D | undefined;
  /** Esquece a leitura: chamada quando o acesso é recusado. */
  descartar(): void;
  /** Mostra o guardado na montagem e RELÊ em seguida, em vez de confiar nele (política da
   *  Equipe e do Plano de cuidado, fatia 9b). Sem isto, a volta não relê. */
  revalidar?: boolean;
};

export type TentativaCatalogo<E> = { entrada: E; chave: string; consultada: boolean };

export const AVISO_SEM_CONFIRMACAO =
  'Consulta concluída. O envio anterior ainda precisa de confirmação; confira e repita exatamente o mesmo envio.';

type Maquina<D, E> = {
  dados: D;
  geracao: number;
  ocupado: boolean;
  status: string;
  tentativa: TentativaCatalogo<E> | null;
  ativa: boolean;
  perdido: boolean;
  /** Houve leitura concluída NESTA montagem (o guardado não conta). */
  lida: boolean;
};

export type Catalogo<D, E> = {
  /** O que a última leitura concluída devolveu. */
  dados: D;
  /** Conta as leituras concluídas; serve de `key` da região de conteúdo. */
  geracao: number;
  ocupado: boolean;
  status: string;
  tentativa: TentativaCatalogo<E> | null;
  /** Há envio em curso ou resultado por confirmar: nenhuma alteração nova é aceita. */
  bloqueado: boolean;
  /** O acesso foi recusado: a tela não mostra mais nada. */
  perdido: boolean;
  atualizar: () => void;
  enviar: (entrada: E) => void;
  repetir: () => void;
  /** Recado da própria tela, como a recusa de uma validação antes de chamar o servidor. */
  avisar: (mensagem: string) => void;
};

export function useCatalogoAdministrado<D, E>(
  servico: ServicoCatalogo<D, E>,
  acessoPerdido: (erro: unknown) => void,
  textos: { carregando: string; atualizado: string; salvando: string },
  confirmado: (entrada: E, dados: D) => boolean,
  inicial: D,
  leitura?: LeituraRetida<D>,
): Catalogo<D, E> {
  const [, repintar] = useState(0);
  // Lida UMA vez, na montagem: é o que faz a volta à tela desenhar a lista já no primeiro
  // quadro, sem esqueleto e sem GET.
  const [retida] = useState(() => leitura?.retida());
  const estado = useRef<Maquina<D, E>>({
    dados: retida ?? inicial,
    geracao: retida === undefined ? 0 : 1,
    ocupado: false,
    status: '',
    tentativa: null,
    ativa: true,
    perdido: false,
    lida: false,
  });
  const inicialRef = useRef(inicial);
  const dependencias = useRef({ servico, acessoPerdido, textos, confirmado, leitura });
  dependencias.current = { servico, acessoPerdido, textos, confirmado, leitura };

  const pintar = () => {
    if (estado.current.ativa) repintar((volta) => volta + 1);
  };

  const falha = (erro: unknown) => {
    if (!estado.current.ativa) return;
    if (
      exigeNovoAcesso(erro) &&
      !(erro instanceof FalhaApi && erro.codigo === 'pendencia_externa')
    ) {
      estado.current.ativa = false;
      estado.current.perdido = true;
      // A recusa vale para a identidade: o que foi lido não volta na próxima montagem.
      dependencias.current.leitura?.descartar();
      // A tela precisa estar VAZIA quando `acessoPerdido` corre: quem o recebe decide
      // navegar, e conteúdo negado não pode sobreviver nem por um quadro.
      flushSync(() => repintar((volta) => volta + 1));
      dependencias.current.acessoPerdido(erro);
      return;
    }
    estado.current.status = mensagemFalha(erro);
    pintar();
  };

  const carregar = async () => {
    if (estado.current.ocupado) return;
    estado.current.ocupado = true;
    estado.current.status = dependencias.current.textos.carregando;
    pintar();
    try {
      const dados = await dependencias.current.servico.consultar();
      if (!estado.current.ativa) return;
      const pendente = estado.current.tentativa;
      if (pendente) {
        if (dependencias.current.confirmado(pendente.entrada, dados))
          estado.current.tentativa = null;
        else pendente.consultada = true;
      }
      estado.current.dados = dados;
      estado.current.lida = true;
      // A leitura concluída é uma geração nova do conteúdo. Trocar a chave devolve os
      // campos ao valor recém-lido, como a reconstrução do DOM fazia antes — sem isso um
      // texto digitado e não gravado sobreviveria calado por cima do valor do servidor.
      estado.current.geracao += 1;
      estado.current.status = estado.current.tentativa
        ? AVISO_SEM_CONFIRMACAO
        : dependencias.current.textos.atualizado;
    } catch (erro) {
      // Revisão do #85: na volta que revalida, o guardado só ficou à vista à espera da
      // releitura. Se ela falha, ele sai da tela e do cache — nunca vale sem uma leitura
      // bem-sucedida nesta montagem.
      if (dependencias.current.leitura?.revalidar && !estado.current.lida) {
        dependencias.current.leitura.descartar();
        estado.current.dados = inicialRef.current;
        estado.current.geracao = 0;
      }
      falha(erro);
    } finally {
      estado.current.ocupado = false;
      pintar();
    }
  };

  const enviarTentativa = async () => {
    const pendente = estado.current.tentativa;
    if (!estado.current.ativa || estado.current.ocupado || !pendente) return;
    estado.current.ocupado = true;
    pendente.consultada = false;
    estado.current.status = dependencias.current.textos.salvando;
    pintar();
    try {
      await dependencias.current.servico.gravar(pendente.entrada, pendente.chave);
      // A gravação pegou: o que estava guardado ficou velho. Esquece ANTES de reler, e
      // mesmo com a tela já fechada — se a releitura falhar, a volta relê em vez de mostrar
      // a lista de antes da gravação.
      dependencias.current.leitura?.descartar();
      if (!estado.current.ativa) return;
      estado.current.tentativa = null;
      estado.current.ocupado = false;
      await carregar();
    } catch (erro) {
      // Resultado incerto preserva a tentativa: repetir o mesmo envio com a mesma chave é
      // o que impede o servidor de criar um segundo registro do que talvez já tenha pego.
      if (!resultadoIncerto(erro)) estado.current.tentativa = null;
      // Resultado incerto pode ter gravado: o guardado deixa de valer pelo mesmo motivo.
      else dependencias.current.leitura?.descartar();
      falha(erro);
    } finally {
      estado.current.ocupado = false;
      pintar();
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: é a montagem da tela, e só ela. A máquina lê serviço, textos e estado por referência viva, então uma lista de dependências aqui só criaria releitura a cada repintura.
  useEffect(() => {
    if (estado.current.geracao === 0 || dependencias.current.leitura?.revalidar) void carregar();
    return () => {
      estado.current.ativa = false;
    };
    // Montagem e desmontagem: a máquina lê serviço e textos por referência viva.
  }, []);

  const atual = estado.current;
  return {
    dados: atual.dados,
    geracao: atual.geracao,
    ocupado: atual.ocupado,
    status: atual.status,
    tentativa: atual.tentativa,
    bloqueado: atual.ocupado || atual.tentativa !== null,
    perdido: atual.perdido,
    atualizar: () => void carregar(),
    enviar: (entrada: E) => {
      if (estado.current.ocupado || estado.current.tentativa) return;
      estado.current.tentativa = {
        entrada: structuredClone(entrada),
        chave: crypto.randomUUID(),
        consultada: false,
      };
      void enviarTentativa();
    },
    repetir: () => {
      if (estado.current.tentativa?.consultada) void enviarTentativa();
    },
    avisar: (mensagem: string) => {
      estado.current.status = mensagem;
      pintar();
    },
  };
}

/** A saída do envio sem confirmação: o que foi enviado, por que tudo está travado, e o
 *  único caminho de volta. Fica FORA da região que recua na releitura — recuar o aviso
 *  junto com a lista esconderia exatamente a instrução que a pessoa precisa ler. */
export function Recuperacao({
  alvo,
  podeRepetir,
  aoRepetir,
}: {
  /** Identificação do que foi enviado, em linguagem de negócio: "Campo: Humor". */
  alvo: string | null;
  podeRepetir: boolean;
  aoRepetir: () => void;
}) {
  if (alvo === null) return null;
  return (
    <div className="grid justify-items-start gap-2 rounded-r-campo border-l-[3px] border-l-aviso-filete bg-aviso-superficie px-4 py-3">
      <p className="m-0 max-w-[68ch] text-aviso-texto">
        {`${alvo}. Resultado aguardando confirmação; novas alterações estão bloqueadas. Consulte e repita o mesmo envio se necessário.`}
      </p>
      <Botao disabled={!podeRepetir} aoAtivar={aoRepetir}>
        Repetir exatamente o envio conferido
      </Botao>
    </div>
  );
}
