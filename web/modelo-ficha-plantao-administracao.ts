import {
  gravarCampoExtraEscopoSchema,
  type CampoExtraCatalogoGeneralizado,
  type GravarCampoExtraEscopo,
  type TipoCampoExtra,
} from '../packages/contracts/src/campo-extra-catalogo.ts';
import type { ServicoModeloFormulario } from './servico-catalogo-administrado-http.ts';
import { FalhaApi, exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.ts';

const rotulosDeTipo: readonly (readonly [TipoCampoExtra, string])[] = [
  ['texto', 'Texto curto'],
  ['texto_longo', 'Texto longo'],
  ['numero', 'Número'],
  ['data', 'Data'],
  ['booleano', 'Sim ou não'],
  ['lista', 'Lista de opções'],
];

/** FR-078. Modelo da ficha de plantão: acrescentar campo, definir a ordem, marcar
 * obrigatoriedade, escolher a visibilidade e desativar — inclusive campos de fábrica.
 * Nada é apagado: desativar mantém a resposta antiga legível. Cada escrita é
 * reautorizada pelo servidor e pelo banco; esconder controle aqui não é autorizar. */
export function montarModeloFichaPlantao(
  raiz: HTMLElement,
  servico: ServicoModeloFormulario,
  acessoPerdido: (erro: unknown) => void,
): () => void {
  let ativa = true;
  let ocupado = false;
  let tentativa: { entrada: GravarCampoExtraEscopo; chave: string; consultada: boolean } | null =
    null;
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
  const atualizar = el('button', 'Atualizar modelo');
  atualizar.type = 'button';
  const estadoTentativa = () => {
    recuperacao.replaceChildren();
    if (!tentativa) return;
    recuperacao.append(
      el(
        'p',
        `Campo: ${tentativa.entrada.nome}. Resultado aguardando confirmação; novas alterações estão bloqueadas. Consulte e repita o mesmo envio se necessário.`,
      ),
      repetir,
    );
    repetir.disabled = ocupado || !tentativa.consultada;
  };
  const bloquearFormularios = () => {
    for (const grupo of conteudo.querySelectorAll('fieldset'))
      grupo.disabled = ocupado || tentativa !== null;
  };
  raiz.replaceChildren(
    el('h2', 'Ficha de plantão — modelo'),
    el(
      'p',
      'Campos da ficha preenchida ao fim do plantão. Desativar um campo não apaga nenhuma resposta já gravada: ela continua legível na ficha antiga, marcada como de campo desativado. Obrigatoriedade vale para fichas novas.',
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
  const formulario = (campo?: CampoExtraCatalogoGeneralizado, proximaOrdem = 1) => {
    const form = el('form');
    const grupo = el('fieldset');
    grupo.append(el('legend', campo ? `Editar ${campo.nome}` : 'Novo campo da ficha'));
    const campoDeTexto = (rotulo: string, valor = '') => {
      const label = el('label', rotulo);
      const controle = el('input');
      controle.value = valor;
      label.append(controle);
      grupo.append(label);
      return controle;
    };
    const nome = campoDeTexto('Nome do campo', campo?.nome);
    nome.required = true;
    nome.maxLength = 120;
    const labelTipo = el('label', 'Tipo');
    const tipo = el('select');
    for (const [valor, rotulo] of rotulosDeTipo) {
      const opcao = el('option', rotulo);
      opcao.value = valor;
      tipo.append(opcao);
    }
    tipo.value = campo?.tipo ?? 'texto_longo';
    labelTipo.append(tipo);
    grupo.append(labelTipo);
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
    const ordem = campoDeTexto('Posição na ficha', String(campo?.ordem ?? proximaOrdem));
    ordem.type = 'number';
    ordem.min = '0';
    ordem.max = '999999999';
    ordem.required = true;
    const labelVisibilidade = el('label', 'Quem pode ler');
    const visibilidade = el('select');
    for (const [valor, rotulo] of [
      ['interna', 'Nota interna da equipe'],
      ['compartilhavel', 'Pode ser compartilhado com a família'],
    ] as const) {
      const opcao = el('option', rotulo);
      opcao.value = valor;
      visibilidade.append(opcao);
    }
    visibilidade.value = campo?.visibilidade ?? 'interna';
    labelVisibilidade.append(visibilidade);
    grupo.append(labelVisibilidade);
    const obrigatorio = campoDeTexto('Preenchimento obrigatório');
    obrigatorio.type = 'checkbox';
    obrigatorio.checked = campo?.obrigatorio ?? false;
    const ativo = campoDeTexto('Campo ativo');
    ativo.type = 'checkbox';
    ativo.checked = campo?.ativo ?? true;
    const salvar = el('button', campo ? 'Salvar campo' : 'Criar campo');
    salvar.type = 'submit';
    grupo.append(salvar);
    form.append(grupo);
    form.onsubmit = (evento) => {
      evento.preventDefault();
      if (ocupado || tentativa) return;
      const dados = gravarCampoExtraEscopoSchema.safeParse({
        campo_id: campo?.campo_id ?? crypto.randomUUID(),
        escopo: 'ficha_plantao',
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
        ordem: Number(ordem.value),
        obrigatorio: obrigatorio.checked,
        visibilidade: visibilidade.value,
        versao_esperada: campo?.versao ?? 0,
      });
      if (!dados.success) {
        status.textContent =
          'Confira nome, tipo, posição e opções (1 a 20 opções, até 120 caracteres cada).';
        return;
      }
      tentativa = {
        entrada: structuredClone(dados.data),
        chave: crypto.randomUUID(),
        consultada: false,
      };
      void enviarTentativa();
    };
    return form;
  };
  const carregar = async () => {
    if (ocupado) return;
    ocupado = true;
    atualizar.disabled = true;
    status.textContent = 'Carregando o modelo da ficha…';
    // A frase sozinha trocava o painel inteiro por uma linha de texto. A região passa a
    // dizer que está em consulta, e web/styles.css lhe dá a forma do que vem.
    conteudo.setAttribute('aria-busy', 'true');
    try {
      const campos = await servico.consultar();
      if (!ativa) return;
      if (tentativa) {
        const pendente = tentativa;
        const confirmado = campos.some(
          (campo) =>
            campo.campo_id === pendente.entrada.campo_id &&
            campo.versao === pendente.entrada.versao_esperada + 1 &&
            campo.nome === pendente.entrada.nome &&
            campo.tipo === pendente.entrada.tipo &&
            campo.ativo === pendente.entrada.ativo &&
            campo.ordem === pendente.entrada.ordem &&
            campo.obrigatorio === pendente.entrada.obrigatorio &&
            campo.visibilidade === pendente.entrada.visibilidade,
        );
        if (confirmado) tentativa = null;
        else pendente.consultada = true;
      }
      conteudo.replaceChildren();
      const proxima = campos.reduce((maior, campo) => Math.max(maior, campo.ordem), 0) + 1;
      conteudo.append(el('h3', 'Novo campo'), formulario(undefined, proxima));
      conteudo.append(el('h3', 'Campos da ficha'));
      if (!campos.length)
        conteudo.append(el('p', 'Nenhum campo no modelo. Crie o primeiro campo da ficha acima.'));
      for (const campo of campos) {
        const detalhe = el('details');
        const marcas = [
          `posição ${campo.ordem}`,
          campo.ativo ? 'ativo' : 'desativado',
          campo.obrigatorio ? 'obrigatório' : 'opcional',
          campo.visibilidade === 'compartilhavel' ? 'compartilhável' : 'interno',
          ...(campo.de_fabrica ? ['de fábrica'] : []),
        ];
        detalhe.append(
          el('summary', `${campo.nome} — ${marcas.join(', ')}`),
          formulario(campo, proxima),
        );
        conteudo.append(detalhe);
      }
      status.textContent = tentativa
        ? 'Consulta concluída. O envio anterior ainda precisa de confirmação; confira e repita exatamente o mesmo envio.'
        : 'Modelo da ficha atualizado.';
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
    status.textContent = 'Salvando alteração do modelo…';
    try {
      await servico.gravar(tentativa.entrada, tentativa.chave);
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
