import { useSyncExternalStore } from 'react';
import { confirmar } from './confirmacao.js';
import { iniciarAcao } from './esqueleto.js';
import { type ClienteFFCM, mensagemFalha } from './api.js';
import { criarCicloAcesso } from './ciclo-acesso.js';
import { montarRevogacaoVinculo } from './revogacao-vinculo.js';
import { botao as botaoDaCamada } from './ui/basicos.js';
import { Botao } from './componentes/ui/botao.js';
import { type Coluna, Lista, valor } from './componentes/ui/lista.js';
import { MarcaEstado } from './componentes/ui/marca-estado.js';
import { ilhaSincrona } from './telas/ilha-sincrona.js';

/** Um vínculo profissional como a lista o apresenta. `nome` ausente significa que a
 *  identificação não veio na página consultada — e nesse caso o identificador NÃO entra
 *  no lugar dela: expor o `usuario_id` seria vazar identidade que a consulta não trouxe. */
type VinculoExibido = {
  id: string;
  usuarioId: string;
  revogado: boolean;
  versao: number;
};

type EstadoVinculos = {
  itens: readonly VinculoExibido[];
  nomes: ReadonlyMap<string, string>;
  consultando: boolean;
};

/** Vitrine mínima: a máquina de estado desta tela continua imperativa, e a lista precisa
 *  apenas ser avisada quando o que ela mostra muda. Um `useState` dentro do componente
 *  não serviria — quem muda o estado está fora do React. */
function criarVitrine(inicial: EstadoVinculos) {
  let estado = inicial;
  const ouvintes = new Set<() => void>();
  return {
    ler: () => estado,
    definir(mudanca: Partial<EstadoVinculos>) {
      estado = { ...estado, ...mudanca };
      for (const ouvinte of ouvintes) ouvinte();
    },
    assinar(ouvinte: () => void) {
      ouvintes.add(ouvinte);
      return () => {
        ouvintes.delete(ouvinte);
      };
    },
  };
}

const NOME_INDISPONIVEL = 'Identificação indisponível nesta página';

/** A lista de profissionais com acesso ao caso: linhas sob um cabeçalho, as mesmas
 *  colunas em todas elas (VIS-016). Era uma pilha de `<li>` com três informações coladas
 *  por ` · `, em que nada alinhava com nada e comparar duas linhas exigia reler as duas.
 *
 *  A falha de uma linha degrada só aquela linha: a barreira é da camada de lista, e foi
 *  escrita por causa de 24/11/2026, quando um registro inválido apagou a equipe inteira. */
function ListaVinculos({
  vitrine,
  aoSelecionar,
}: {
  vitrine: ReturnType<typeof criarVitrine>;
  aoSelecionar: (vinculo: VinculoExibido, nome: string) => void;
}) {
  const estado = useSyncExternalStore(vitrine.assinar, vitrine.ler);
  const nomeDe = (vinculo: VinculoExibido) =>
    estado.nomes.get(vinculo.usuarioId.toLowerCase()) ?? NOME_INDISPONIVEL;
  const colunas: ReadonlyArray<Coluna<VinculoExibido>> = [
    { titulo: 'Profissional', celula: nomeDe },
    {
      titulo: 'Situação do vínculo',
      celula: (vinculo) => (
        <MarcaEstado tom={vinculo.revogado ? 'contorno' : 'padrao'}>
          {vinculo.revogado ? 'Revogado' : 'Ativo'}
        </MarcaEstado>
      ),
    },
    { titulo: 'Versão', celula: (vinculo) => valor(vinculo.versao), secundaria: true },
    {
      // Não é coluna secundária de propósito: revogar acesso é a única ação da lista, e
      // escondê-la no celular tiraria do telefone a capacidade que o desktop tem.
      titulo: 'Alteração',
      celula: (vinculo) => {
        if (vinculo.revogado) return null;
        const nome = estado.nomes.get(vinculo.usuarioId.toLowerCase());
        return (
          <Botao
            peso="discreto"
            marca="selecionar-revogacao"
            disabled={nome === undefined}
            rotuloLeitura={`Selecionar para revogação: ${nomeDe(vinculo)}`}
            aoAtivar={() => {
              if (nome !== undefined) aoSelecionar(vinculo, nome);
            }}
          >
            Selecionar para revogação
          </Botao>
        );
      },
    },
  ];
  return (
    <Lista
      itens={estado.itens}
      colunas={colunas}
      chave={(vinculo) => vinculo.id}
      rotulo="Profissionais com acesso ao caso"
      carregando={estado.consultando}
    />
  );
}

export function montarSelecaoProfissional(
  raiz: HTMLElement,
  pacienteId: string,
  api: ClienteFFCM,
  acessoPerdido: (erro: unknown) => boolean,
  alteracaoPendente: (pendente: boolean) => void = () => {},
): () => void {
  let ativa = true;
  let pendenciaConcessao = false;
  let pendenciaRevogacao = false;
  const informarPendencia = () => alteracaoPendente(pendenciaConcessao || pendenciaRevogacao);
  let consulta = 0;
  let cursores: (string | undefined)[] = [undefined];
  let pagina = 0;
  let proximo: string | null = null;
  const status = document.createElement('p');
  status.className = 'feedback';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const rotulo = document.createElement('label');
  rotulo.htmlFor = 'profissional-selecionado';
  rotulo.textContent = 'Profissional';
  const selecao = document.createElement('select');
  selecao.id = rotulo.htmlFor;
  const anterior = botaoDaCamada({ rotulo: 'Página anterior', peso: 'secundario' });
  const seguinte = botaoDaCamada({ rotulo: 'Próxima página', peso: 'secundario' });
  // Paginação só aparece quando há mais de uma página: botões soltos sobre lista
  // vazia davam a impressão de tela quebrada.
  anterior.hidden = seguinte.hidden = true;
  const tentar = botaoDaCamada({ rotulo: 'Tentar novamente', peso: 'secundario' });
  const explicacao = document.createElement('p');
  explicacao.textContent = 'Conferindo se há alguma concessão aguardando resposta…';
  const rotuloMotivo = document.createElement('label');
  rotuloMotivo.textContent = 'Motivo da concessão';
  const motivo = document.createElement('textarea');
  motivo.required = true;
  motivo.maxLength = 4000;
  motivo.addEventListener('input', () => {
    pendenciaConcessao = motivo.value.trim().length > 0;
    informarPendencia();
  });
  rotuloMotivo.append(motivo);
  const recuperar = botaoDaCamada({ rotulo: 'Conferir novamente', peso: 'secundario' });
  const conceder = botaoDaCamada({ rotulo: 'Conceder acesso', peso: 'principal' });
  conceder.disabled = true;
  raiz.replaceChildren(
    status,
    rotulo,
    selecao,
    anterior,
    seguinte,
    tentar,
    rotuloMotivo,
    explicacao,
    conceder,
    recuperar,
  );

  const ciclo = criarCicloAcesso({
    identidadeAtual: () => api.identidadeAtual(),
    consultar: () => api.consultarBarreiraAcesso(),
    reservar: async (entrada) => (await api.reservarBarreiraAcesso(entrada)).estado,
    criar: ({ entrada, paciente_id, chave, reserva_id, geracao_reserva }) =>
      api.criarAcessoPaciente(paciente_id, entrada, chave, { reserva_id, geracao_reserva }),
    revogar: ({ paciente_id, acesso_id, entrada, chave, reserva_id, geracao_reserva }) =>
      api.revogarAcessoPaciente(paciente_id, acesso_id, entrada, chave, {
        reserva_id,
        geracao_reserva,
      }),
    encerrar: async (entrada) => (await api.encerrarBarreiraAcesso(entrada)).estado,
    reconhecer: async (entrada) => (await api.reconhecerBarreiraAcesso(entrada)).estado,
  });
  let liberado = false;
  let verificando = false;
  const verificarPendente = async () => {
    if (verificando) return;
    verificando = true;
    liberado = false;
    conceder.disabled = recuperar.disabled = true;
    const terminarAcao = iniciarAcao(recuperar);
    explicacao.textContent = 'Conferindo acesso…';
    try {
      let estado = await ciclo.consultar();
      if (!ativa) return;
      if (!estado.resultado_pendente) {
        if (
          estado.reserva &&
          !(await confirmar({
            titulo: 'Encerrar a tentativa em andamento?',
            detalhe:
              'A tentativa pode estar aberta em outra aba. Encerrá-la afeta todas as abas desta pessoa.',
            acao: 'Encerrar a tentativa',
            cancelar: 'Deixar como está',
          }))
        )
          throw new Error('Encerramento não confirmado');
        await ciclo.encerrar();
        if (!ativa) return;
        estado = await ciclo.consultar();
        if (!ativa) return;
      }
      if (estado.resultado_pendente) {
        const pendente = estado.resultado_pendente;
        if (pendente.resultado === 'confirmada') {
          if (pendente.paciente_id.toLowerCase() !== pacienteId.toLowerCase())
            throw new Error('Outro paciente');
          let cursor: string | undefined;
          let encontrado: { usuario_id: string; revogado: boolean } | undefined;
          const vistos = new Set<string>();
          do {
            const pagina = await api.listarVinculosProfissionais(pacienteId, cursor);
            if (!ativa) return;
            encontrado ??= pagina.itens.find(
              (item) => item.id.toLowerCase() === pendente.acesso_id.toLowerCase(),
            );
            cursor = pagina.proximo_cursor ?? undefined;
            if (cursor && vistos.has(cursor)) throw new Error('Cursor repetido');
            if (cursor) vistos.add(cursor);
          } while (!encontrado && cursor);
          await identificarProfissionais();
          if (!ativa) return;
          const nome = encontrado && nomesProfissionais.get(encontrado.usuario_id.toLowerCase());
          if (
            !encontrado ||
            !nome ||
            !(await confirmar({
              titulo: `${pendente.acao === 'revogar' ? 'Revogação' : 'Concessão'} anterior para ${nome}: ${encontrado.revogado ? 'revogada' : 'ativa'}. Confere?`,
              detalhe:
                'Confirmar encerra a conferência e libera novas alterações de vínculo. Cancelar mantém tudo como está.',
              acao: 'Confere, pode seguir',
              cancelar: 'Não confere',
            }))
          )
            throw new Error('Confirmação necessária');
        }
        await ciclo.reconhecer();
        if (!ativa) return;
        await ciclo.consultar();
        if (!ativa) return;
      }
      await atualizarVinculos();
      if (!ativa) return;
      ciclo.liberar();
      if (!ativa) return;
      liberado = true;
      revogacao.reconciliar();
      explicacao.textContent = 'Tudo conferido. Você já pode conceder acesso.';
      conceder.disabled = !selecao.value;
    } catch (erro) {
      if (!ativa || acessoPerdido(erro)) return;
      explicacao.textContent =
        'Não foi possível concluir a conferência. Confira o paciente correspondente e tente de novo.';
    } finally {
      terminarAcao();
      verificando = false;
      if (ativa) recuperar.disabled = false;
    }
  };
  recuperar.addEventListener('click', () => void verificarPendente());
  selecao.addEventListener('change', () => {
    conceder.disabled = !liberado || !selecao.value;
  });
  conceder.addEventListener('click', () => {
    if (!liberado || !selecao.value || !motivo.value.trim()) return;
    liberado = false;
    conceder.disabled = true;
    const terminarAcao = iniciarAcao(conceder);
    explicacao.textContent = 'Enviando concessão…';
    const usuario = selecao.value;
    const razao = motivo.value;
    void ciclo
      .criar(pacienteId, { usuario_id: usuario, motivo: razao })
      .then(() => {
        if (!ativa) return;
        if (motivo.value === razao) {
          motivo.value = '';
          pendenciaConcessao = false;
          informarPendencia();
        }
        explicacao.textContent = 'Concessão enviada. Confira o resultado antes de continuar.';
        void atualizarVinculos().catch(() => {});
      })
      .catch((erro) => {
        if (ativa && !acessoPerdido(erro))
          explicacao.textContent =
            'Não deu para saber se a concessão foi registrada. Confira antes de tentar de novo.';
      })
      .finally(terminarAcao);
  });
  void verificarPendente();

  const vinculos = document.createElement('section');
  const tituloVinculos = document.createElement('h3');
  tituloVinculos.textContent = 'Vínculos profissionais';
  const estadoVinculos = document.createElement('p');
  estadoVinculos.setAttribute('role', 'status');
  const listaVinculos = document.createElement('div');
  const vitrine = criarVitrine({
    itens: [],
    nomes: new Map(),
    consultando: true,
  });
  const maisVinculos = botaoDaCamada({ rotulo: 'Carregar mais vínculos', peso: 'secundario' });
  maisVinculos.hidden = true;
  const tentarVinculos = botaoDaCamada({
    rotulo: 'Tentar consultar vínculos novamente',
    peso: 'secundario',
  });
  tentarVinculos.hidden = true;
  vinculos.append(tituloVinculos, estadoVinculos, listaVinculos, maisVinculos, tentarVinculos);
  const areaRevogacao = document.createElement('section');
  const avisoRevogacao = document.createElement('p');
  avisoRevogacao.textContent = 'Conclua a conferência acima antes de alterar vínculos.';
  vinculos.append(avisoRevogacao);
  raiz.prepend(vinculos);
  raiz.append(areaRevogacao);
  const desmontarLista = ilhaSincrona(
    listaVinculos,
    <ListaVinculos
      vitrine={vitrine}
      aoSelecionar={(vinculo, nome) => {
        // A guarda é a mesma de antes: sem a conferência liberada, nenhuma alteração de
        // vínculo entra. A lista oferece o controle; quem autoriza é o servidor.
        if (liberado) void revogacao.selecionar({ id: vinculo.id, versao: vinculo.versao, nome });
      }}
    />,
  );
  const nomesProfissionais = new Map<string, string>();
  let identificacoesCompletas = false;
  let geracaoIdentificacoes = 0;
  let consultaIdentificacoes: Promise<void> | undefined;
  async function identificarProfissionais(): Promise<void> {
    if (identificacoesCompletas || !ativa) return;
    if (consultaIdentificacoes) return consultaIdentificacoes;
    const geracao = geracaoIdentificacoes;
    const executar = async () => {
      const nomes = new Map<string, string[]>();
      const vistos = new Set<string>();
      let cursor: string | undefined;
      do {
        const pagina = await api.listarProfissionais(cursor);
        if (!ativa) return;
        for (const item of pagina.itens) {
          if (item.perfil !== 'profissional' || !item.usuario_id) continue;
          const id = item.usuario_id.toLowerCase();
          const emails = nomes.get(id) ?? [];
          emails.push(item.email);
          nomes.set(id, emails);
        }
        cursor = pagina.proximo_cursor ?? undefined;
        if (cursor && vistos.has(cursor)) throw new Error('Cursor repetido');
        if (cursor) vistos.add(cursor);
      } while (cursor);
      if (geracao !== geracaoIdentificacoes) return;
      nomesProfissionais.clear();
      for (const [id, emails] of nomes) {
        const email = emails[0];
        if (emails.length === 1 && email) nomesProfissionais.set(id, email);
      }
      identificacoesCompletas = true;
      atualizarIdentificacoes();
    };
    const pendente = executar();
    consultaIdentificacoes = pendente;
    try {
      await pendente;
    } finally {
      if (consultaIdentificacoes === pendente) consultaIdentificacoes = undefined;
    }
  }
  const vinculosExibidos: VinculoExibido[] = [];
  const atualizarIdentificacoes = () => {
    vitrine.definir({ itens: [...vinculosExibidos], nomes: new Map(nomesProfissionais) });
  };
  let cursorVinculos: string | undefined;
  let consultaVinculos: Promise<boolean> | undefined;
  let atualizacaoPendente = false;
  let geracaoAtualizacao = 0;
  async function atualizarVinculos(): Promise<void> {
    revogacao.invalidarSelecao();
    atualizacaoPendente = true;
    geracaoAtualizacao++;
    geracaoIdentificacoes++;
    identificacoesCompletas = false;
    nomesProfissionais.clear();
    atualizarIdentificacoes();
    if (consultaIdentificacoes) await consultaIdentificacoes.catch(() => {});
    if (consultaVinculos) await consultaVinculos;
    if (!ativa) return;
    if (!(await carregarVinculos())) throw new Error('Consulta de vínculos indisponível');
  }
  const revogacao = montarRevogacaoVinculo(
    areaRevogacao,
    async (acessoId, dados) => {
      if (!liberado) throw new Error('Acesso bloqueado');
      liberado = false;
      conceder.disabled = true;
      return ciclo.revogar(pacienteId, acessoId, dados);
    },
    atualizarVinculos,
    acessoPerdido,
    (pendente) => {
      pendenciaRevogacao = pendente;
      informarPendencia();
    },
  );
  function carregarVinculos(): Promise<boolean> {
    if (consultaVinculos) return consultaVinculos;
    const executar = async (): Promise<boolean> => {
      maisVinculos.disabled = tentarVinculos.disabled = true;
      estadoVinculos.textContent = 'Consultando vínculos…';
      vitrine.definir({ consultando: true });
      const reiniciar = atualizacaoPendente;
      const geracao = geracaoAtualizacao;
      try {
        const paginaAtual = await api.listarVinculosProfissionais(
          pacienteId,
          reiniciar ? undefined : cursorVinculos,
        );
        if (!ativa) return false;
        if (reiniciar) {
          if (geracao === geracaoAtualizacao) atualizacaoPendente = false;
          vinculosExibidos.length = 0;
        }
        for (const item of paginaAtual.itens)
          vinculosExibidos.push({
            id: item.id,
            usuarioId: item.usuario_id,
            revogado: item.revogado,
            versao: item.versao,
          });
        atualizarIdentificacoes();
        if (paginaAtual.itens.length)
          void identificarProfissionais().catch((erro) => {
            if (ativa && !acessoPerdido(erro))
              estadoVinculos.textContent =
                'Não foi possível identificar profissionais. Tente atualizar a lista.';
          });
        cursorVinculos = paginaAtual.proximo_cursor ?? undefined;
        maisVinculos.hidden = !cursorVinculos;
        tentarVinculos.hidden = true;
        estadoVinculos.textContent = vinculosExibidos.length
          ? 'Vínculos consultados.'
          : 'Nenhum vínculo profissional encontrado.';
        return true;
      } catch (erro) {
        if (ativa && !acessoPerdido(erro)) {
          estadoVinculos.textContent = mensagemFalha(erro);
          tentarVinculos.hidden = false;
        }
        return false;
      } finally {
        vitrine.definir({ consultando: false });
        maisVinculos.disabled = tentarVinculos.disabled = false;
      }
    };
    const pendente = executar();
    consultaVinculos = pendente;
    void pendente.finally(() => {
      if (consultaVinculos === pendente) consultaVinculos = undefined;
    });
    return pendente;
  }
  maisVinculos.addEventListener('click', () => void carregarVinculos());
  tentarVinculos.addEventListener('click', () => void carregarVinculos());
  void carregarVinculos();

  async function carregar(): Promise<void> {
    const atual = ++consulta;
    status.textContent = 'Consultando equipe…';
    selecao.disabled = anterior.disabled = seguinte.disabled = true;
    selecao.setAttribute('aria-busy', 'true');
    tentar.hidden = true;
    selecao.replaceChildren();
    try {
      const resultado = await api.listarProfissionais(cursores[pagina]);
      if (!ativa || atual !== consulta) return;
      proximo = resultado.proximo_cursor;
      const profissionais = resultado.itens.filter(
        (item) =>
          item.perfil === 'profissional' &&
          item.estado === 'vinculada' &&
          item.ativo === true &&
          item.usuario_id !== null,
      );
      const vazio = document.createElement('option');
      vazio.value = '';
      const unicaPagina = pagina === 0 && !proximo;
      vazio.textContent = profissionais.length
        ? 'Selecione um profissional'
        : unicaPagina
          ? 'Nenhum profissional elegível'
          : 'Nenhum profissional elegível nesta página';
      selecao.append(vazio);
      for (const profissional of profissionais) {
        const opcao = document.createElement('option');
        opcao.value = profissional.usuario_id ?? '';
        opcao.textContent = profissional.email;
        selecao.append(opcao);
      }
      selecao.disabled = profissionais.length === 0;
      anterior.disabled = pagina === 0;
      seguinte.disabled = !proximo;
      anterior.hidden = seguinte.hidden = unicaPagina;
      const paginaAtual = unicaPagina ? '' : `Página ${pagina + 1}. `;
      status.textContent = profissionais.length
        ? `${paginaAtual}Selecione o profissional que vai acompanhar o caso.`
        : `${paginaAtual}Nenhum profissional da equipe pode receber acesso agora.`;
    } catch (erro) {
      if (!ativa || atual !== consulta || acessoPerdido(erro)) return;
      status.textContent = mensagemFalha(erro);
      tentar.hidden = false;
      anterior.disabled = pagina === 0;
    } finally {
      if (atual === consulta) selecao.removeAttribute('aria-busy');
    }
  }
  anterior.addEventListener('click', () => {
    if (pagina > 0) {
      pagina -= 1;
      void carregar();
    }
  });
  seguinte.addEventListener('click', () => {
    if (proximo) {
      cursores = cursores.slice(0, pagina + 1);
      cursores.push(proximo);
      pagina += 1;
      void carregar();
    }
  });
  tentar.addEventListener('click', () => void carregar());
  void carregar();
  return () => {
    ativa = false;
    consulta += 1;
    selecao.removeAttribute('aria-busy');
    desmontarLista();
    revogacao.destruir();
    raiz.replaceChildren();
  };
}
