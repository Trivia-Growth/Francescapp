import { FalhaApi, exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.ts';
import type { ServicoTurnoExecucao } from './servico-turno-execucao-http.ts';
import type {
  CatalogoTurnoPublico,
  CandidatoTurnoPublico,
} from '../packages/contracts/src/turno-execucao-http.ts';
import {
  elementoTurno as el,
  campoTurno,
  selecaoTurno,
  instanteTurno,
  dataLocalTurno,
  botaoTurno,
  estadoTurno,
} from './turno-execucao-campos.ts';
import { rotuloSinal } from './turno-execucao-editor.ts';

/** Controles de coordenação aparecem somente após capacidade recebida do servidor. */
export function montarGestaoExecucaoTurno(
  raiz: HTMLElement,
  servico: ServicoTurnoExecucao,
  opcoes: {
    acessoPerdido(erro: unknown): void;
    alteracaoPendente?(valor: boolean): void;
    administrador: boolean;
  },
) {
  let ativa = true;
  let ocupada = false;
  let rascunho = false;
  let tentativa: {
    descricao: string;
    executar(): Promise<unknown>;
    confirmar(): Promise<boolean>;
    consultada: boolean;
  } | null = null;
  let profissionais: CandidatoTurnoPublico[] = [];
  let familiares: CandidatoTurnoPublico[] = [];
  let cursorProfissional: string | null = null;
  let cursorFamiliar: string | null = null;
  let podeGerir = false;
  let catalogo: CatalogoTurnoPublico[] = [];
  const secao = el('section');
  secao.className = 'turno-execucao';
  const status = estadoTurno('Consultando permissões de coordenação…');
  const conteudo = el('div');
  const conferir = botaoTurno('Conferir alteração pendente', () => void recuperar());
  conferir.hidden = true;
  const repetir = botaoTurno('Repetir exatamente a alteração conferida', () => {
    if (tentativa?.consultada) void enviar();
  });
  repetir.hidden = true;
  const atualizar = botaoTurno('Atualizar gestão do turno', () => void carregar());
  secao.append(
    el('h3', 'Autorizações e configuração do turno'),
    status,
    conferir,
    repetir,
    atualizar,
    conteudo,
  );
  raiz.replaceChildren(secao);
  function controles() {
    for (const grupo of conteudo.querySelectorAll('fieldset'))
      grupo.disabled = ocupada || tentativa !== null;
    conferir.hidden = tentativa === null;
    repetir.hidden = tentativa === null;
    conferir.disabled = ocupada;
    repetir.disabled = ocupada || !tentativa?.consultada;
    atualizar.disabled = ocupada || tentativa !== null;
  }
  function falha(erro: unknown) {
    if (!ativa) return;
    if (
      exigeNovoAcesso(erro) &&
      !(erro instanceof FalhaApi && erro.codigo === 'pendencia_externa')
    ) {
      ativa = false;
      tentativa = null;
      raiz.replaceChildren();
      opcoes.acessoPerdido(erro);
      return;
    }
    status.textContent = mensagemFalha(erro);
  }
  function podeRedesenhar() {
    if (!rascunho) return true;
    if (!window.confirm('Descartar alterações de gestão ainda não enviadas?')) return false;
    rascunho = false;
    opcoes.alteracaoPendente?.(false);
    return true;
  }
  function iniciar(
    descricao: string,
    executar: () => Promise<unknown>,
    confirmar: () => Promise<boolean>,
  ) {
    if (tentativa || ocupada) return;
    tentativa = { descricao, executar, confirmar, consultada: false };
    opcoes.alteracaoPendente?.(true);
    void enviar();
  }
  async function enviar() {
    if (!ativa || ocupada || !tentativa) return;
    ocupada = true;
    tentativa.consultada = false;
    controles();
    status.textContent = `Registrando ${tentativa.descricao}…`;
    try {
      await tentativa.executar();
      if (!ativa) return;
      tentativa = null;
      rascunho = false;
      opcoes.alteracaoPendente?.(false);
      ocupada = false;
      await carregar();
    } catch (erro) {
      if (!resultadoIncerto(erro)) tentativa = null;
      falha(erro);
    } finally {
      ocupada = false;
      if (ativa) controles();
    }
  }
  async function recuperar() {
    if (!ativa || ocupada || !tentativa) return;
    ocupada = true;
    controles();
    try {
      const confirmou = await tentativa.confirmar();
      if (!ativa || !tentativa) return;
      if (confirmou) {
        tentativa = null;
        rascunho = false;
        opcoes.alteracaoPendente?.(false);
        ocupada = false;
        await carregar();
      } else {
        tentativa.consultada = true;
        status.textContent =
          'Resultado ainda sem confirmação. Novas alterações seguem bloqueadas; você pode repetir exatamente o envio anterior.';
      }
    } catch (erro) {
      falha(erro);
    } finally {
      ocupada = false;
      if (ativa) controles();
    }
  }
  async function consultarTodosProfissionaisPara(id: string) {
    let cursor: string | undefined;
    do {
      const pagina = await servico.candidatosMedicacao(cursor ? { cursor_id: cursor } : {});
      const alvo = pagina.itens.find((item) => item.usuario_id === id);
      if (alvo) return alvo;
      cursor = pagina.proximo_cursor ?? undefined;
    } while (cursor && ativa);
    return undefined;
  }
  function desenhar() {
    conteudo.replaceChildren();
    if (!podeGerir) {
      conteudo.append(
        el(
          'p',
          'Gestão de fundamentos e concessões disponível ao Administrador ou case manager atual com vínculo no caso.',
        ),
      );
      return;
    }
    const medicacao = el('fieldset');
    medicacao.append(el('legend', 'Concessão de registro de medicação'));
    medicacao.append(
      el(
        'p',
        'A concessão não comprova habilitação profissional. O servidor confere vínculo e permissão vigentes em cada ato.',
      ),
    );
    for (const pessoa of profissionais) {
      const linha = el(
        'p',
        `${pessoa.nome ?? 'Colaborador sem identificação disponível'} · ${pessoa.concedida ? 'Concedida' : 'Não concedida'} `,
      );
      linha.append(
        botaoTurno(pessoa.concedida ? 'Revogar concessão' : 'Conceder registro', () => {
          const entrada = { usuario_id: pessoa.usuario_id, concedida: !pessoa.concedida };
          const chave = crypto.randomUUID();
          iniciar(
            'concessão de medicação',
            () => servico.concederMedicacao(entrada, chave),
            async () =>
              (await consultarTodosProfissionaisPara(pessoa.usuario_id))?.concedida ===
              entrada.concedida,
          );
        }),
      );
      medicacao.append(linha);
    }
    if (!profissionais.length)
      medicacao.append(el('p', 'Nenhum profissional elegível nesta página.'));
    if (cursorProfissional)
      medicacao.append(
        botaoTurno(
          'Mais profissionais',
          () => void carregarProfissionais(cursorProfissional ?? undefined),
        ),
      );
    conteudo.append(medicacao);
    const fundamentoForm = el('form');
    const grupo = el('fieldset');
    grupo.append(el('legend', 'Fundamento de autorização familiar'));
    grupo.append(
      el(
        'p',
        'Registre a base específica de autorização do caso. Parentesco ou vínculo genérico não substituem este fundamento; a autorização pode ser revogada.',
      ),
    );
    const familiar = selecaoTurno(
      grupo,
      'Familiar com acesso ao caso',
      familiares
        .filter((item) => item.nome?.trim())
        .map((item) => ({ valor: item.usuario_id, rotulo: item.nome ?? '' })),
    );
    if (!familiares.length) grupo.append(el('p', 'Nenhum familiar elegível nesta página.'));
    if (familiares.some((item) => !item.nome?.trim()))
      grupo.append(
        el(
          'p',
          'Há cadastro sem identificação disponível; regularize os dados antes de selecioná-lo.',
        ),
      );
    if (cursorFamiliar)
      grupo.append(
        botaoTurno('Mais familiares', () => void carregarFamiliares(cursorFamiliar ?? undefined)),
      );
    const atual = el('div');
    grupo.append(atual);
    const estado = selecaoTurno(grupo, 'Estado do fundamento', [
      { valor: 'vigente', rotulo: 'Vigente' },
      { valor: 'revogado', rotulo: 'Revogado' },
    ]);
    const fundamento = campoTurno(grupo, 'Fundamento registrado', { longo: true });
    const inicio = campoTurno(grupo, 'Início da vigência', { tipo: 'datetime-local' });
    const fim = campoTurno(grupo, 'Fim da vigência (opcional)', {
      tipo: 'datetime-local',
      obrigatorio: false,
    });
    let consultado: { id: string; versao: number } | null = null;
    const salvar = el('button', 'Registrar nova versão do fundamento');
    salvar.type = 'submit';
    salvar.disabled = true;
    grupo.append(salvar);
    fundamentoForm.append(grupo);
    conteudo.append(fundamentoForm);
    familiar.onchange = () => {
      if (ocupada || tentativa || !familiar.value) return;
      if (!podeRedesenhar()) {
        familiar.value = consultado?.id ?? '';
        return;
      }
      const id = familiar.value;
      consultado = null;
      salvar.disabled = true;
      ocupada = true;
      controles();
      status.textContent = 'Consultando fundamento selecionado…';
      void servico
        .consultarFundamento({ familiar_usuario_id: id })
        .then((registro) => {
          if (!ativa || familiar.value !== id) return;
          consultado = { id, versao: registro?.versao ?? 0 };
          estado.value = registro?.estado ?? '';
          fundamento.value = registro?.fundamento ?? '';
          inicio.value = dataLocalTurno(registro?.vigencia_inicio);
          fim.value = dataLocalTurno(registro?.vigencia_fim ?? undefined);
          atual.replaceChildren(
            el(
              'p',
              registro
                ? `Versão ${registro.versao} registrada em ${new Date(registro.registrado_em).toLocaleString('pt-BR')}.`
                : 'Nenhum fundamento registrado.',
            ),
          );
          salvar.disabled = false;
          status.textContent = 'Fundamento consultado.';
        })
        .catch(falha)
        .finally(() => {
          ocupada = false;
          if (ativa) controles();
        });
    };
    fundamentoForm.oninput = (evento) => {
      if (evento.target !== familiar) {
        rascunho = true;
        opcoes.alteracaoPendente?.(true);
      }
    };
    fundamentoForm.onsubmit = (evento) => {
      evento.preventDefault();
      if (ocupada || tentativa || !consultado || consultado.id !== familiar.value) return;
      try {
        const entrada = {
          familiar_usuario_id: consultado.id,
          versao_esperada: consultado.versao,
          estado: estado.value as 'vigente' | 'revogado',
          fundamento: fundamento.value.trim(),
          vigencia_inicio: instanteTurno(inicio.value),
          vigencia_fim: fim.value ? instanteTurno(fim.value) : null,
        };
        if (!entrada.fundamento || !['vigente', 'revogado'].includes(entrada.estado))
          throw new Error();
        const chave = crypto.randomUUID();
        iniciar(
          'fundamento familiar',
          () => servico.gravarFundamento(entrada, chave),
          async () => {
            const salvo = await servico.consultarFundamento({
              familiar_usuario_id: entrada.familiar_usuario_id,
            });
            return (
              salvo?.versao === entrada.versao_esperada + 1 &&
              salvo.estado === entrada.estado &&
              salvo.fundamento === entrada.fundamento
            );
          },
        );
      } catch {
        status.textContent = 'Confira familiar, fundamento, estado e vigência.';
      }
    };
    if (opcoes.administrador) {
      const tipos = el('fieldset');
      tipos.append(el('legend', 'Catálogo de medidas e observações'));
      for (const campo of catalogo) {
        const form = el('form');
        const titulo = el(
          'h4',
          `${rotuloSinal(campo.tipo)}${campo.observacao ? ' — observação de rotina' : campo.unidade ? ` (${campo.unidade})` : ''}`,
        );
        form.append(titulo);
        const label = el('label', 'Disponível para novos registros');
        const ativo = el('input');
        ativo.type = 'checkbox';
        ativo.checked = campo.ativo;
        label.append(ativo);
        form.append(label);
        const referencia = campoTurno(form, 'Referência informativa (opcional)', {
          valor: campo.referencia_informativa ?? '',
          obrigatorio: false,
          longo: true,
          ajuda:
            'Texto informado pela equipe. Não gera alerta, interpretação ou classificação automática.',
        });
        referencia.maxLength = 300;
        const salvar = el('button', 'Salvar configuração do tipo');
        salvar.type = 'submit';
        form.append(salvar);
        tipos.append(form);
        form.oninput = () => {
          rascunho = true;
          opcoes.alteracaoPendente?.(true);
        };
        form.onsubmit = (evento) => {
          evento.preventDefault();
          if (ocupada || tentativa) return;
          const entrada = {
            tipo: campo.tipo,
            ativo: ativo.checked,
            referencia_informativa: referencia.value.trim() || null,
          };
          const chave = crypto.randomUUID();
          iniciar(
            'configuração do catálogo',
            () => servico.configurarCatalogo(entrada, chave),
            async () =>
              (await servico.catalogo()).some(
                (item) =>
                  item.tipo === entrada.tipo &&
                  item.ativo === entrada.ativo &&
                  item.referencia_informativa === entrada.referencia_informativa,
              ),
          );
        };
      }
      conteudo.append(tipos);
    }
  }
  async function carregarProfissionais(cursor?: string) {
    if (!ativa || ocupada || !podeRedesenhar()) return;
    ocupada = true;
    controles();
    try {
      const pagina = await servico.candidatosMedicacao(cursor ? { cursor_id: cursor } : {});
      if (!ativa) return;
      profissionais = cursor ? [...profissionais, ...pagina.itens] : pagina.itens;
      cursorProfissional = pagina.proximo_cursor;
      podeGerir = pagina.pode_gerir;
      desenhar();
    } catch (erro) {
      falha(erro);
    } finally {
      ocupada = false;
      if (ativa) controles();
    }
  }
  async function carregarFamiliares(cursor?: string) {
    if (!ativa || ocupada || !podeRedesenhar()) return;
    ocupada = true;
    controles();
    try {
      const pagina = await servico.familiares(cursor ? { cursor_id: cursor } : {});
      if (!ativa) return;
      familiares = cursor ? [...familiares, ...pagina.itens] : pagina.itens;
      cursorFamiliar = pagina.proximo_cursor;
      desenhar();
    } catch (erro) {
      falha(erro);
    } finally {
      ocupada = false;
      if (ativa) controles();
    }
  }
  async function carregar() {
    if (!ativa || ocupada || tentativa || !podeRedesenhar()) return;
    ocupada = true;
    controles();
    try {
      const pagina = await servico.candidatosMedicacao({});
      if (!ativa) return;
      profissionais = pagina.itens;
      cursorProfissional = pagina.proximo_cursor;
      podeGerir = pagina.pode_gerir;
      if (podeGerir) {
        const [fam, tipos] = await Promise.all([
          servico.familiares({}),
          opcoes.administrador ? servico.catalogo() : Promise.resolve([]),
        ]);
        if (!ativa) return;
        familiares = fam.itens;
        cursorFamiliar = fam.proximo_cursor;
        catalogo = tipos;
      }
      desenhar();
      status.textContent = 'Permissões e configuração consultadas.';
    } catch (erro) {
      falha(erro);
    } finally {
      ocupada = false;
      if (ativa) controles();
    }
  }
  controles();
  void carregar();
  return () => {
    ativa = false;
    tentativa = null;
    profissionais = [];
    familiares = [];
    catalogo = [];
    raiz.replaceChildren();
  };
}
