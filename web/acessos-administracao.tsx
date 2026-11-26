/* Acessos ao sistema — a tela de criar usuário, reconstruída em React sobre a ilha.
 *
 * Alvo literal da queixa de 24/11/2026: *"Tela de criar usuário muito feia, uma caixa
 * solta"*. A versão imperativa montava título, parágrafo, status, botões, lista e um
 * `<fieldset>` soltos na raiz, sem nenhuma superfície que dissesse onde um assunto termina
 * e o outro começa. Agora são duas superfícies — quem já tem acesso, e o acesso novo —,
 * separadas por espaço e filete, como manda a regra "superfície plana" do `DESIGN.md`:
 * uma superfície por assunto, nunca caixa dentro de caixa.
 *
 * Conta e método não atribuem caso. Só a operação opaca sobrevive a uma recarga.
 *
 * O que NÃO mudou (VIS-018): a revalidação de identidade antes de cada escrita, a
 * recuperação da operação pendente por `sessionStorage`, o bloqueio da criação enquanto
 * houver pendência ou enquanto a listagem não tiver sido confirmada, a regra de que só
 * negativa HTTP coerente libera novo cadastro, e o descarte da senha antes de a chamada
 * partir.
 *
 * VIS-012: a flag `ativa` do módulo anterior desapareceu. `atual()` ficou com o que ela
 * nunca deveria ter dividido espaço: a revalidação de sessão, que é controle de
 * autorização. Resposta que chega depois da saída não escreve mais nada porque a raiz
 * React já não existe, e `servico.desmontar()` continua cancelando o que estiver em voo.
 */
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { Acesso, FuncaoConta } from '../packages/contracts/src/acessos.js';
import { uuidSchema } from '../packages/contracts/src/comum.js';
import { criarAcessoSchema } from '../packages/contracts/src/acessos.js';
import { statusErroHttp } from '../packages/contracts/src/erros.js';
import { exigeNovoAcesso, FalhaApi } from './api.js';
import { AreaTexto } from './componentes/ui/area-texto.js';
import { Botao } from './componentes/ui/botao.js';
import { Campo } from './componentes/ui/campo.js';
import { Esqueleto } from './componentes/ui/esqueleto.js';
import { type Coluna, Lista } from './componentes/ui/lista.js';
import { MarcaEstado } from './componentes/ui/marca-estado.js';
import { SelecaoSimples } from './componentes/ui/selecao-simples.js';
import { Superficie } from './componentes/ui/superficie.js';
import './estilos/tema.css';
import type { ServicoAcessos } from './servico-acessos-http.js';
import { ilhaSincrona } from './telas/ilha-sincrona.js';

const funcoes: Record<FuncaoConta, string> = {
  administrador: 'Administrador',
  case_manager: 'Case Manager',
  familia: 'Familiar',
  profissional: 'Profissional',
};
const estados: Record<Acesso['estado'], string> = {
  reservado: 'Criação ainda não confirmada',
  aguardando_confirmacao_email: 'Aguardando confirmação do e-mail',
  aguardando_google: 'Aguardando primeira entrada com Google',
  ativo: 'Acesso ativo',
  conflito: 'Conflito: conta existente não alterada',
  falha_confirmada:
    'Criação recusada; nenhuma conta criada. Confira a política da senha antes de cadastrar novamente',
};

/** Traduz e RECUSA o que não conhece: devolver vazio deixaria a coluna em branco sem que
 *  ninguém descobrisse que o servidor passou a mandar outro valor. A barreira por linha de
 *  `Lista` contém o erro naquele registro e mantém os demais legíveis (VIS-016). */
function traduzir(mapa: Record<string, string>, chave: string, campo: string): string {
  const texto = mapa[chave];
  if (texto === undefined) throw new Error(`Valor desconhecido em ${campo}.`);
  return texto;
}

type Opcoes = {
  identidadeAtual(): { usuario_id: string; session_id: string } | null;
  acessoPerdido(erro: unknown): void;
};

function TelaAcessos({
  servico,
  opcoes,
}: {
  servico: ServicoAcessos;
  opcoes: Opcoes;
}) {
  const [itens, definirItens] = useState<readonly Acesso[]>([]);
  const [status, definirStatus] = useState('Consultando acessos…');
  const [ocupada, marcarOcupada] = useState(true);
  const [pendente, marcarPendente] = useState<string | null>(null);
  const [temMais, definirTemMais] = useState(false);

  const [nome, definirNome] = useState('');
  const [email, definirEmail] = useState('');
  const [funcao, definirFuncao] = useState('');
  const [metodo, definirMetodo] = useState('');
  const [senha, definirSenha] = useState('');
  const [motivo, definirMotivo] = useState('');

  const ocupadaRef = useRef(false);
  const definirOcupada = useCallback((valor: boolean) => {
    ocupadaRef.current = valor;
    marcarOcupada(valor);
  }, []);
  const pendenteRef = useRef<string | null>(null);
  const definirPendente = useCallback((valor: string | null) => {
    pendenteRef.current = valor;
    marcarPendente(valor);
  }, []);

  const cursorRef = useRef<string | null>(null);
  const itensRef = useRef<readonly Acesso[]>([]);
  const listaConfirmadaRef = useRef(false);
  const [listaConfirmada, marcarListaConfirmada] = useState(false);
  const definirListaConfirmada = useCallback((valor: boolean) => {
    listaConfirmadaRef.current = valor;
    marcarListaConfirmada(valor);
  }, []);
  const recuperacaoRef = useRef(true);
  const [recuperacaoDisponivel, marcarRecuperacao] = useState(true);
  const nomeRef = useRef<HTMLDivElement | null>(null);

  /* A identidade capturada na montagem. Toda escrita confere se a sessão ainda é a mesma
     ANTES de agir: trocar de conta sem recarregar a página não pode fazer uma resposta
     antiga escrever na sessão nova. Isto é autorização, não ciclo de vida, e por isso
     continua aqui depois da migração. */
  const identidadeRef = useRef<{ usuario_id: string; session_id: string } | null>(null);
  const chaveRef = useRef<string | null>(null);
  if (chaveRef.current === null && identidadeRef.current === null) {
    const identidade = opcoes.identidadeAtual();
    identidadeRef.current = identidade;
    chaveRef.current = identidade
      ? `acesso-operacao:${identidade.usuario_id}:${identidade.session_id}`
      : null;
  }

  const atual = useCallback(() => {
    const inicial = identidadeRef.current;
    const sessao = opcoes.identidadeAtual();
    return Boolean(
      inicial &&
        sessao?.usuario_id === inicial.usuario_id &&
        sessao.session_id === inicial.session_id,
    );
  }, [opcoes]);

  const guardarOperacao = useCallback(
    (id: string | null) => {
      const chave = chaveRef.current;
      if (!chave) throw new FalhaApi('nao_autenticado', 401);
      if (id) {
        sessionStorage.setItem(chave, id);
        if (sessionStorage.getItem(chave) !== id) throw new Error();
      } else sessionStorage.removeItem(chave);
      definirPendente(id);
    },
    [definirPendente],
  );

  /** Fecha o formulário de senha: a senha some do estado e o campo volta a ficar fora do
   *  caminho. Repetido em quatro pontos do fluxo original; aqui é um lugar só. */
  const limparFormulario = useCallback(() => {
    definirNome('');
    definirEmail('');
    definirFuncao('');
    definirMetodo('');
    definirSenha('');
    definirMotivo('');
  }, []);

  const carregar = useCallback(
    async (adicionar = false): Promise<void> => {
      definirListaConfirmada(false);
      definirStatus('Consultando acessos…');
      const pagina = await servico.listar(adicionar ? (cursorRef.current ?? undefined) : undefined);
      if (!atual()) return;
      definirListaConfirmada(true);
      const todos = adicionar ? [...itensRef.current, ...pagina.itens] : [...pagina.itens];
      itensRef.current = todos;
      definirItens(todos);
      cursorRef.current = pagina.proximo_cursor;
      definirTemMais(Boolean(pagina.proximo_cursor));
      let frase =
        pagina.itens.length || adicionar
          ? 'Acessos consultados.'
          : 'Nenhum acesso criado por esta administração ainda. Preencha o novo acesso abaixo.';
      if (pendenteRef.current) frase += ' Há um cadastro pendente de conferência.';
      if (!recuperacaoRef.current)
        frase += ' Recuperação local indisponível. Criação bloqueada; reabra a sessão.';
      definirStatus(frase);
    },
    [servico, atual, definirListaConfirmada],
  );

  const executar = useCallback(
    async (acao: () => Promise<void>): Promise<void> => {
      if (ocupadaRef.current || !atual()) return;
      definirOcupada(true);
      try {
        await acao();
      } catch (erro) {
        if (!atual()) return;
        if (exigeNovoAcesso(erro)) {
          definirSenha('');
          opcoes.acessoPerdido(erro);
          return;
        }
        definirStatus(
          pendenteRef.current
            ? 'Cadastro sem confirmação. Confira a operação antes de criar outro acesso. A senha foi descartada e não será reenviada.'
            : 'Não foi possível consultar os acessos. Tente atualizar.',
        );
      } finally {
        definirOcupada(false);
      }
    },
    [atual, definirOcupada, opcoes],
  );

  const recuperar = useCallback(async (): Promise<void> => {
    const operacao = pendenteRef.current;
    if (!operacao) return;
    const item = await servico.consultarOperacao(operacao);
    if (!atual()) return;
    if (!item || item.estado === 'reservado') {
      definirStatus(
        'Resultado ainda não confirmado. A criação continua bloqueada; confira novamente mais tarde.',
      );
      return;
    }
    if (item.operacao_id !== operacao) throw new Error();
    guardarOperacao(null);
    limparFormulario();
    await carregar();
    if (atual()) definirStatus(`${estados[item.estado]}. Nenhuma senha foi reenviada.`);
  }, [servico, atual, guardarOperacao, limparFormulario, carregar]);

  const conferirLinha = useCallback(
    (item: Acesso) =>
      void executar(async () => {
        const confirmado = await servico.consultarOperacao(item.operacao_id);
        if (!atual()) return;
        if (!confirmado) {
          definirStatus('Não foi possível confirmar a situação deste cadastro.');
          return;
        }
        if (confirmado.operacao_id !== item.operacao_id) throw new Error();
        if (pendenteRef.current === confirmado.operacao_id && confirmado.estado !== 'reservado') {
          guardarOperacao(null);
          limparFormulario();
        }
        const trocados = itensRef.current.map((anterior) =>
          anterior.operacao_id === item.operacao_id ? confirmado : anterior,
        );
        itensRef.current = trocados;
        definirItens(trocados);
        definirStatus(`${estados[confirmado.estado]}.`);
      }),
    [executar, servico, atual, guardarOperacao, limparFormulario],
  );

  useEffect(() => {
    try {
      const salvo = chaveRef.current ? sessionStorage.getItem(chaveRef.current) : null;
      if (salvo && uuidSchema.safeParse(salvo).success) definirPendente(salvo);
    } catch {
      recuperacaoRef.current = false;
      marcarRecuperacao(false);
      definirStatus(
        'Armazenamento de recuperação indisponível. Reabra a sessão antes de criar acesso.',
      );
    }
    void executar(() => carregar());
  }, [executar, carregar, definirPendente]);

  const interno = metodo === 'interno';
  const criacaoFechada = ocupada || Boolean(pendente) || !recuperacaoDisponivel || !listaConfirmada;

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (
      ocupadaRef.current ||
      pendenteRef.current ||
      !recuperacaoRef.current ||
      !listaConfirmadaRef.current ||
      !atual()
    )
      return;
    const operacaoId = crypto.randomUUID();
    const dados = criarAcessoSchema.safeParse({
      operacao_id: operacaoId,
      nome,
      email,
      funcao,
      metodo,
      motivo,
      ...(metodo === 'interno' ? { senha } : {}),
    });
    if (!dados.success) {
      definirStatus(
        'Confira nome, e-mail, função, método e motivo. A senha interna precisa de pelo menos 12 caracteres.',
      );
      nomeRef.current?.querySelector('input')?.focus();
      return;
    }
    // A senha sai do DOM ANTES de a chamada partir, e `flushSync` é o que garante o
    // "antes": sem ele a repintura só aconteceria no fim do evento, com a requisição já
    // a caminho e o segredo ainda escrito no campo.
    flushSync(() => definirSenha(''));
    void executar(async () => {
      guardarOperacao(operacaoId);
      definirStatus('Criando acesso… A senha não ficará disponível para consulta.');
      let resultado: Acesso;
      try {
        resultado = await servico.criar(dados.data, crypto.randomUUID());
      } catch (erro) {
        // Só negativa HTTP coerente garante que a criação foi recusada. Ausência
        // de operação após timeout não cerca uma requisição ainda em execução.
        if (
          atual() &&
          erro instanceof FalhaApi &&
          !erro.exigeReautenticacao &&
          ((erro.codigo === 'entrada_invalida' &&
            erro.status === statusErroHttp.entrada_invalida) ||
            (erro.codigo === 'conflito' && erro.status === statusErroHttp.conflito) ||
            (erro.codigo === 'conflito_idempotencia' &&
              erro.status === statusErroHttp.conflito_idempotencia))
        ) {
          guardarOperacao(null);
          definirStatus(
            'Cadastro recusado. Confira os dados ou use outro e-mail. Nenhuma conta existente foi alterada; informe a senha novamente apenas para um novo envio.',
          );
          return;
        }
        throw erro;
      }
      if (!atual()) return;
      if (resultado.operacao_id !== operacaoId) throw new Error();
      if (resultado.estado === 'reservado') {
        definirStatus('Criação ainda não confirmada. Use Conferir cadastro pendente.');
        return;
      }
      guardarOperacao(null);
      limparFormulario();
      await carregar();
      if (atual()) definirStatus(`${estados[resultado.estado]}.`);
    });
  }

  const colunas: ReadonlyArray<Coluna<Acesso>> = [
    { titulo: 'Nome', celula: (item) => item.nome },
    { titulo: 'E-mail', celula: (item) => item.email, secundaria: true },
    {
      titulo: 'Função e entrada',
      secundaria: true,
      celula: (item) =>
        `${traduzir(funcoes, item.funcao, 'função')} · ${item.metodo === 'interno' ? 'E-mail e senha' : 'Google da organização'}`,
    },
    {
      titulo: 'Situação',
      celula: (item) => <MarcaEstado>{traduzir(estados, item.estado, 'estado')}</MarcaEstado>,
    },
    {
      titulo: 'Cadastro',
      secundaria: true,
      celula: (item) => `Cadastrado em ${new Date(item.criado_em).toLocaleString('pt-BR')}`,
    },
    {
      titulo: 'Conferência',
      celula: (item) =>
        item.estado === 'conflito' || item.estado === 'falha_confirmada' ? null : (
          <Botao peso="discreto" disabled={ocupada} aoAtivar={() => conferirLinha(item)}>
            Conferir situação
          </Botao>
        ),
    },
  ];

  return (
    <section data-tela="acessos" aria-busy={ocupada} className="grid gap-6">
      <Superficie
        titulo="Acessos ao sistema"
        descricao="Crie contas autorizadas. Cada pessoa terá uma função e um método de entrada. Casos e permissões clínicas continuam sendo concedidos separadamente."
        acao={
          <Botao
            peso="secundario"
            disabled={ocupada}
            aoAtivar={() => void executar(() => carregar())}
          >
            Atualizar acessos
          </Botao>
        }
      >
        <div className="grid gap-4">
          <output className="m-0 text-(length:--texto-1) text-texto-suave block" aria-live="polite">
            {status}
          </output>
          <Botao
            peso="secundario"
            hidden={!pendente}
            disabled={ocupada}
            className="justify-self-start"
            aoAtivar={() => void executar(recuperar)}
          >
            Conferir cadastro pendente
          </Botao>
          <Esqueleto ocupado={ocupada}>
            <Lista
              itens={itens}
              colunas={colunas}
              chave={(item) => item.operacao_id}
              rotulo="Acessos criados por esta administração"
              carregando={ocupada}
              // Já está dentro de uma `Superficie`: a segunda moldura seria caixa dentro de caixa.
              moldura={false}
            />
          </Esqueleto>
          <Botao
            peso="secundario"
            hidden={!temMais}
            disabled={ocupada}
            className="justify-self-start"
            aoAtivar={() => {
              if (cursorRef.current) void executar(() => carregar(true));
            }}
          >
            Carregar mais acessos
          </Botao>
        </div>
      </Superficie>

      <Superficie
        titulo="Novo acesso"
        descricao="A senha inicial não fica disponível para consulta depois do envio."
      >
        <form method="post" onSubmit={enviar} noValidate>
          <fieldset disabled={criacaoFechada} className="m-0 min-w-0 border-0 p-0">
            <legend className="sr-only m-0 p-0 text-(length:--texto-1) font-semibold text-texto-suave">
              Novo acesso
            </legend>
            <div className="grid max-w-[560px] gap-4">
              <div ref={nomeRef}>
                <Campo
                  id="acesso-nome"
                  rotulo="Nome"
                  marcaRotulo="obrigatório"
                  required
                  maxLength={200}
                  autoComplete="name"
                  value={nome}
                  onChange={(evento) => definirNome(evento.currentTarget.value)}
                  classeEnvelope="mb-0"
                />
              </div>
              <Campo
                id="acesso-email"
                rotulo="E-mail usado para entrar"
                tipo="email"
                marcaRotulo="obrigatório"
                required
                maxLength={254}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={(evento) => definirEmail(evento.currentTarget.value)}
                classeEnvelope="mb-0"
              />
              <SelecaoSimples
                id="acesso-funcao"
                rotulo="Função"
                marcaRotulo="obrigatório"
                required
                value={funcao}
                onChange={(evento) => definirFuncao(evento.currentTarget.value)}
                classeEnvelope="mb-0"
              >
                <option value="">Selecione a função</option>
                {Object.entries(funcoes).map(([valor, texto]) => (
                  <option key={valor} value={valor}>
                    {texto}
                  </option>
                ))}
              </SelecaoSimples>
              <SelecaoSimples
                id="acesso-metodo"
                rotulo="Como esta pessoa entrará"
                marcaRotulo="obrigatório"
                required
                value={metodo}
                onChange={(evento) => {
                  // Trocar de método descarta a senha digitada: ela só vale para o método
                  // interno, e guardá-la em memória entre trocas é guardar um segredo que
                  // ninguém pediu.
                  definirSenha('');
                  definirMetodo(evento.currentTarget.value);
                }}
                classeEnvelope="mb-0"
              >
                <option value="">Selecione o método</option>
                <option value="google_workspace">Google da organização</option>
                <option value="interno">E-mail e senha</option>
              </SelecaoSimples>
              {/* O campo continua montado quando o método não é interno, e apenas oculto:
                  desmontá-lo faria o rótulo e a dica sumirem da leitura e reapareceram a
                  cada troca de método. Desligado, ele não entra no envio. */}
              <div hidden={!interno}>
                <Campo
                  id="acesso-senha"
                  rotulo="Senha inicial (pelo menos 12 caracteres)"
                  tipo="password"
                  marcaRotulo={interno ? 'obrigatório' : 'não usada neste método'}
                  required={interno}
                  disabled={!interno}
                  minLength={12}
                  maxLength={1024}
                  autoComplete="new-password"
                  value={senha}
                  onChange={(evento) => definirSenha(evento.currentTarget.value)}
                  classeEnvelope="mb-0"
                />
              </div>
              <AreaTexto
                id="acesso-motivo"
                rotulo="Motivo da concessão"
                marcaRotulo="obrigatório"
                required
                maxLength={500}
                value={motivo}
                onChange={(evento) => definirMotivo(evento.currentTarget.value)}
                classeEnvelope="mb-0"
              />
              <div>
                <Botao peso="principal" tipo="submit">
                  Criar acesso
                </Botao>
              </div>
            </div>
          </fieldset>
        </form>
      </Superficie>
    </section>
  );
}

export function montarAcessosAdministracao(
  raiz: HTMLElement,
  servico: ServicoAcessos,
  opcoes: Opcoes,
): () => void {
  const desmontar = ilhaSincrona(raiz, <TelaAcessos servico={servico} opcoes={opcoes} />);
  return () => {
    desmontar();
    // O serviço continua cancelando o que estiver em voo: a raiz React já não existe, mas
    // a requisição ainda existiria.
    servico.desmontar();
  };
}
