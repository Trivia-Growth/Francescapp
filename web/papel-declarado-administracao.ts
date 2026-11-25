import {
  gravarPapelDeclaradoSchema,
  type GravarPapelDeclarado,
  type PapelDeclarado,
} from '../packages/contracts/src/papel-declarado.ts';
import type { ServicoPapelDeclarado } from './servico-catalogo-administrado-http.ts';
import { FalhaApi, exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.ts';
import { botao, estadoVazio } from './ui/basicos.js';

/** FR-079. Catálogo de papéis declarados do profissional. É rótulo impresso na ficha:
 * não concede, amplia nem restringe acesso nenhum — perfil e vínculo com o caso
 * continuam sendo os únicos controles. Desativar um papel não reescreve ficha antiga. */
export function montarPapelDeclaradoAdministracao(
  raiz: HTMLElement,
  servico: ServicoPapelDeclarado,
  acessoPerdido: (erro: unknown) => void,
): () => void {
  let ativa = true;
  let ocupado = false;
  let tentativa: { entrada: GravarPapelDeclarado; chave: string; consultada: boolean } | null =
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
  const repetir = botao({ rotulo: 'Repetir exatamente o envio conferido', peso: 'secundario' });
  const atualizar = botao({ rotulo: 'Atualizar catálogo de papéis', peso: 'secundario' });
  const estadoTentativa = () => {
    recuperacao.replaceChildren();
    if (!tentativa) return;
    recuperacao.append(
      el(
        'p',
        `Papel: ${tentativa.entrada.nome}. Resultado aguardando confirmação; novas alterações estão bloqueadas. Consulte e repita o mesmo envio se necessário.`,
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
    el('h2', 'Papéis declarados'),
    el(
      'p',
      'Termos que o profissional escolhe ao assinar a ficha de plantão, como Acompanhante terapêutico e Enfermeira. O papel é rótulo do registro: não dá, tira nem amplia acesso — quem decide acesso continua sendo o perfil e o vínculo com o caso. Desativar um papel não altera ficha já gravada.',
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
  const enviar = (entrada: unknown) => {
    if (ocupado || tentativa) return;
    const dados = gravarPapelDeclaradoSchema.safeParse(entrada);
    if (!dados.success) {
      status.textContent = 'Informe um nome de papel com 1 a 80 caracteres.';
      return;
    }
    tentativa = {
      entrada: structuredClone(dados.data),
      chave: crypto.randomUUID(),
      consultada: false,
    };
    void enviarTentativa();
  };
  const formulario = (papel?: PapelDeclarado) => {
    const form = el('form');
    const grupo = el('fieldset');
    grupo.append(el('legend', papel ? `Renomear ${papel.nome}` : 'Novo papel'));
    const label = el('label', 'Nome do papel');
    const nome = el('input');
    nome.value = papel?.nome ?? '';
    nome.required = true;
    nome.maxLength = 80;
    label.append(nome);
    grupo.append(label);
    const salvar = botao({
      rotulo: papel ? 'Salvar nome' : 'Criar papel',
      peso: 'principal',
      tipo: 'submit',
    });
    grupo.append(salvar);
    form.append(grupo);
    form.onsubmit = (evento) => {
      evento.preventDefault();
      enviar({
        papel_id: papel?.papel_id ?? crypto.randomUUID(),
        nome: nome.value,
        ativo: papel?.ativo ?? true,
        versao_esperada: papel?.versao ?? 0,
      });
    };
    return form;
  };
  const carregar = async () => {
    if (ocupado) return;
    ocupado = true;
    atualizar.disabled = true;
    status.textContent = 'Carregando papéis declarados…';
    // A frase sozinha trocava o painel inteiro por uma linha de texto. A região passa a
    // dizer que está em consulta, e web/styles.css lhe dá a forma do que vem.
    conteudo.setAttribute('aria-busy', 'true');
    try {
      const papeis = await servico.consultar();
      if (!ativa) return;
      if (tentativa) {
        const pendente = tentativa;
        const confirmado = papeis.some(
          (papel) =>
            papel.papel_id === pendente.entrada.papel_id &&
            papel.versao === pendente.entrada.versao_esperada + 1 &&
            papel.nome === pendente.entrada.nome &&
            papel.ativo === pendente.entrada.ativo,
        );
        if (confirmado) tentativa = null;
        else pendente.consultada = true;
      }
      conteudo.replaceChildren(el('h3', 'Novo papel'), formulario());
      conteudo.append(el('h3', 'Papéis do catálogo'));
      if (!papeis.length)
        conteudo.append(estadoVazio('Nenhum papel no catálogo.', 'Crie o primeiro papel acima.'));
      for (const papel of papeis) {
        const detalhe = el('details');
        const marcas = [
          papel.ativo ? 'ativo' : 'desativado',
          ...(papel.de_fabrica ? ['de fábrica'] : []),
        ];
        const alternar = botao({
          rotulo: papel.ativo ? 'Desativar papel' : 'Reativar papel',
          peso: 'secundario',
        });
        alternar.onclick = () =>
          enviar({
            papel_id: papel.papel_id,
            nome: papel.nome,
            ativo: !papel.ativo,
            versao_esperada: papel.versao,
          });
        const acao = el('p');
        acao.append(alternar);
        detalhe.append(
          el('summary', `${papel.nome} — ${marcas.join(', ')}`),
          formulario(papel),
          acao,
        );
        conteudo.append(detalhe);
      }
      status.textContent = tentativa
        ? 'Consulta concluída. O envio anterior ainda precisa de confirmação; confira e repita exatamente o mesmo envio.'
        : 'Catálogo de papéis atualizado.';
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
    status.textContent = 'Salvando papel…';
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
