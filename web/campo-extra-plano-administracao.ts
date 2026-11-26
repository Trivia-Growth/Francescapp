import type { CampoExtraCatalogo } from '../packages/contracts/src/plano-cuidado.ts';
import { contratosRotas } from '../packages/contracts/src/rotas.ts';
import type { ServicoPlanoCuidado } from './plano-cuidado.ts';
import { FalhaApi, exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.ts';

/** Metadados globais. Cada escrita é reautorizada pelo servidor e pelo banco. */
export function montarAdministracaoPlano(
  raiz: HTMLElement,
  servico: ServicoPlanoCuidado,
  acessoPerdido: (erro: unknown) => void,
  consultarEquipe: () => Promise<readonly { usuario_id: string; rotulo: string; ativo: boolean }[]>,
): () => void {
  let ativa = true;
  let ocupado = false;
  type Tentativa =
    | {
        tipo: 'campo';
        entrada: Parameters<NonNullable<ServicoPlanoCuidado['gravarCampoExtra']>>[0];
        chave: string;
        consultada: boolean;
      }
    | {
        tipo: 'aprovador';
        entrada: Parameters<NonNullable<ServicoPlanoCuidado['gravarAprovador']>>[0];
        chave: string;
        consultada: boolean;
      };
  let tentativa: Tentativa | null = null;
  const el = <K extends keyof HTMLElementTagNameMap>(tipo: K, texto?: string) => {
    const item = document.createElement(tipo);
    if (texto !== undefined) item.textContent = texto;
    return item;
  };
  const status = el('p');
  status.setAttribute('role', 'status');
  const conteudo = el('div');
  const recuperacao = el('div');
  const repetir = el('button', 'Repetir exatamente o envio conferido');
  repetir.type = 'button';
  const estadoTentativa = () => {
    recuperacao.replaceChildren();
    if (!tentativa) return;
    const alvo =
      tentativa.tipo === 'campo' ? `Campo: ${tentativa.entrada.nome}` : 'Indicação de aprovador';
    recuperacao.append(
      el(
        'p',
        `${alvo}. Resultado aguardando confirmação; novas alterações estão bloqueadas. Consulte e repita o mesmo envio se necessário.`,
      ),
      repetir,
    );
    repetir.disabled = ocupado || !tentativa.consultada;
  };
  const bloquearFormularios = () => {
    for (const grupo of conteudo.querySelectorAll('fieldset'))
      grupo.disabled = ocupado || tentativa !== null;
  };
  const atualizar = el('button', 'Atualizar catálogo e aprovadores');
  atualizar.type = 'button';
  raiz.replaceChildren(
    el('h2', 'Plano de cuidado — administração'),
    el(
      'p',
      'Campos globais opcionais para todos os objetivos. Aprovação registra um carimbo e não impede o cuidado.',
    ),
    status,
    atualizar,
    recuperacao,
    conteudo,
  );
  const falha = (erro: unknown) => {
    if (!ativa) return;
    if (
      exigeNovoAcesso(erro) &&
      !(erro instanceof FalhaApi && erro.codigo === 'pendencia_externa')
    ) {
      ativa = false;
      raiz.replaceChildren();
      acessoPerdido(erro);
      return;
    }
    status.textContent = mensagemFalha(erro);
  };
  const carregar = async () => {
    if (ocupado) return;
    ocupado = true;
    atualizar.disabled = true;
    status.textContent = 'Carregando catálogo e aprovadores…';
    // A frase sozinha trocava o painel inteiro por uma linha de texto. A região passa a
    // dizer que está em consulta, e web/styles.css lhe dá a forma do que vem.
    conteudo.setAttribute('aria-busy', 'true');
    try {
      if (!servico.consultarCatalogo || !servico.consultarAprovadores)
        throw new Error('Serviço indisponível.');
      const [campos, aprovadores, equipe] = await Promise.all([
        servico.consultarCatalogo(),
        servico.consultarAprovadores(),
        consultarEquipe(),
      ]);
      if (!ativa) return;
      if (tentativa) {
        const pendente = tentativa;
        const confirmado =
          pendente.tipo === 'campo'
            ? campos.some(
                (campo) =>
                  campo.campo_id === pendente.entrada.campo_id &&
                  campo.versao === pendente.entrada.versao_esperada + 1 &&
                  campo.nome === pendente.entrada.nome &&
                  campo.tipo === pendente.entrada.tipo &&
                  campo.ativo === pendente.entrada.ativo &&
                  JSON.stringify(campo.opcoes) === JSON.stringify(pendente.entrada.opcoes),
              )
            : aprovadores.some(
                (item) =>
                  item.usuario_id === pendente.entrada.usuario_id_aprovador &&
                  item.versao === pendente.entrada.versao_esperada + 1 &&
                  item.ativo === pendente.entrada.ativo,
              );
        if (confirmado) tentativa = null;
        else pendente.consultada = true;
      }
      conteudo.replaceChildren();
      const formularioCampo = (campo?: CampoExtraCatalogo) => {
        const form = el('form');
        const grupo = el('fieldset');
        grupo.append(el('legend', campo ? `Editar ${campo.nome}` : 'Novo campo adicional'));
        const entrada = (rotulo: string, valor = '') => {
          const label = el('label', rotulo);
          const controle = el('input');
          controle.value = valor;
          label.append(controle);
          grupo.append(label);
          return controle;
        };
        const nome = entrada('Nome', campo?.nome);
        nome.required = true;
        nome.maxLength = 120;
        const label = el('label', 'Tipo');
        const tipo = el('select');
        for (const [valor, rotulo] of [
          ['texto', 'Texto'],
          ['numero', 'Número'],
          ['data', 'Data'],
          ['lista', 'Lista de opções'],
        ]) {
          const opcao = el('option', rotulo);
          opcao.value = valor ?? '';
          tipo.append(opcao);
        }
        tipo.value = campo?.tipo ?? 'texto';
        label.append(tipo);
        grupo.append(label);
        const labelOpcoes = el('label', 'Opções (uma por linha, de 1 a 20)');
        const opcoes = el('textarea');
        opcoes.value = campo?.opcoes?.join('\n') ?? '';
        labelOpcoes.append(opcoes);
        grupo.append(labelOpcoes);
        const alternar = () => {
          labelOpcoes.hidden = tipo.value !== 'lista';
          opcoes.required = tipo.value === 'lista';
        };
        tipo.onchange = alternar;
        alternar();
        const ativo = entrada('Campo ativo');
        ativo.type = 'checkbox';
        ativo.checked = campo?.ativo ?? true;
        const salvar = el('button', campo ? 'Salvar campo' : 'Criar campo');
        salvar.type = 'submit';
        grupo.append(salvar);
        form.append(grupo);
        form.onsubmit = (evento) => {
          evento.preventDefault();
          if (ocupado || tentativa || !servico.gravarCampoExtra) return;
          const dados = contratosRotas.gravarCampoExtraPlano.entrada.safeParse({
            campo_id: campo?.campo_id ?? crypto.randomUUID(),
            nome: nome.value,
            tipo: tipo.value,
            opcoes:
              tipo.value === 'lista'
                ? opcoes.value
                    .split('\n')
                    .map((opcao) => opcao.trim())
                    .filter(Boolean)
                : null,
            ativo: ativo.checked,
            versao_esperada: campo?.versao ?? 0,
          });
          if (!dados.success) {
            status.textContent =
              'Confira nome, tipo e opções (1 a 20 opções, até 120 caracteres cada).';
            return;
          }
          tentativa = {
            tipo: 'campo',
            entrada: structuredClone(dados.data),
            chave: crypto.randomUUID(),
            consultada: false,
          };
          void enviarTentativa();
        };
        return form;
      };
      conteudo.append(el('h3', 'Campos adicionais'), formularioCampo());
      if (!campos.length)
        conteudo.append(el('p', 'Nenhum campo cadastrado. Crie um campo opcional acima.'));
      for (const campo of campos) {
        const detalhe = el('details');
        detalhe.append(
          el('summary', `${campo.nome} — ${campo.ativo ? 'ativo' : 'desativado'}`),
          formularioCampo(campo),
        );
        conteudo.append(detalhe);
      }
      conteudo.append(
        el('h3', 'Aprovadores'),
        el(
          'p',
          'Administradores podem aprovar por padrão. Selecione um colaborador para indicar ou reativar um aprovador extra.',
        ),
      );
      const form = el('form');
      const grupo = el('fieldset');
      grupo.append(el('legend', 'Indicar aprovador'));
      const label = el('label', 'Colaborador');
      const usuario = el('select');
      usuario.required = true;
      if (usuario instanceof HTMLSelectElement) {
        const vazio = el('option', 'Selecione um colaborador');
        vazio.value = '';
        usuario.append(vazio);
        for (const pessoa of equipe.filter((item) => item.ativo)) {
          const opcao = el('option', pessoa.rotulo);
          opcao.value = pessoa.usuario_id;
          usuario.append(opcao);
        }
      }
      label.append(usuario);
      grupo.append(label);
      const indicar = el('button', 'Indicar aprovador');
      indicar.type = 'submit';
      grupo.append(indicar);
      form.append(grupo);
      conteudo.append(form);
      const gravarAprovador = (
        id: string,
        ativo: boolean,
        versao: number,
        controle: HTMLFieldSetElement | HTMLButtonElement,
      ) => {
        if (ocupado || tentativa || !servico.gravarAprovador) return;
        const entrada = contratosRotas.gravarAprovadorPlano.entrada.safeParse({
          usuario_id_aprovador: id,
          ativo,
          versao_esperada: versao,
        });
        if (!entrada.success) {
          status.textContent = 'Informe um identificador de colaborador válido.';
          return;
        }
        controle.disabled = true;
        tentativa = {
          tipo: 'aprovador',
          entrada: structuredClone(entrada.data),
          chave: crypto.randomUUID(),
          consultada: false,
        };
        void enviarTentativa();
      };
      form.onsubmit = (evento) => {
        evento.preventDefault();
        const existente = aprovadores.find((item) => item.usuario_id === usuario.value.trim());
        gravarAprovador(usuario.value.trim(), true, existente?.versao ?? 0, grupo);
      };
      for (const aprovador of aprovadores) {
        const linha = el(
          'p',
          `${equipe.find((pessoa) => pessoa.usuario_id === aprovador.usuario_id)?.rotulo ?? 'Colaborador sem identificação disponível'} — ${aprovador.ativo ? 'ativo' : 'desativado'} `,
        );
        const alternar = el('button', aprovador.ativo ? 'Remover indicação' : 'Reativar indicação');
        alternar.type = 'button';
        alternar.onclick = () =>
          gravarAprovador(aprovador.usuario_id, !aprovador.ativo, aprovador.versao, alternar);
        linha.append(alternar);
        conteudo.append(linha);
      }
      if (!aprovadores.length) conteudo.append(el('p', 'Nenhum aprovador extra indicado.'));
      status.textContent = tentativa
        ? 'Consulta concluída. O envio anterior ainda precisa de confirmação; confira e repita exatamente o mesmo envio.'
        : 'Catálogo e aprovadores atualizados.';
    } catch (erro) {
      falha(erro);
    } finally {
      ocupado = false;
      atualizar.disabled = false;
      conteudo.removeAttribute('aria-busy');
      if (ativa) {
        bloquearFormularios();
        estadoTentativa();
      }
    }
  };
  async function enviarTentativa() {
    if (!ativa || ocupado || !tentativa) return;
    ocupado = true;
    atualizar.disabled = true;
    tentativa.consultada = false;
    bloquearFormularios();
    estadoTentativa();
    status.textContent = 'Salvando alteração…';
    try {
      if (tentativa.tipo === 'campo') {
        if (!servico.gravarCampoExtra) throw new Error('Serviço indisponível.');
        await servico.gravarCampoExtra(tentativa.entrada, tentativa.chave);
      } else {
        if (!servico.gravarAprovador) throw new Error('Serviço indisponível.');
        await servico.gravarAprovador(tentativa.entrada, tentativa.chave);
      }
      if (!ativa) return;
      tentativa = null;
      ocupado = false;
      await carregar();
    } catch (erro) {
      if (!resultadoIncerto(erro)) tentativa = null;
      falha(erro);
    } finally {
      ocupado = false;
      atualizar.disabled = false;
      if (ativa) {
        bloquearFormularios();
        estadoTentativa();
      }
    }
  }
  repetir.onclick = () => {
    if (tentativa?.consultada) void enviarTentativa();
  };
  atualizar.onclick = () => {
    void carregar();
  };
  void carregar();
  return () => {
    ativa = false;
    raiz.replaceChildren();
  };
}
