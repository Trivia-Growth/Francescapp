import {
  CATEGORIAS_CONTEXTO,
  type CategoriaContexto,
  type ElementoContexto,
} from '../packages/contracts/src/contexto-cuidado.ts';
import { exigeNovoAcesso } from './api.ts';
import { montarEditorDocumentoPaciente } from './editor-documento-paciente.ts';
import type { ServicoDocumentoPaciente } from './servico-documento-paciente-http.ts';

/** FR-005: rótulos em português do usuário, na ordem em que o requisito os lista. */
const ROTULOS: Record<CategoriaContexto, string> = {
  rotina: 'Rotina',
  recursos: 'Recursos',
  barreiras: 'Barreiras',
  preferencias: 'Preferências',
  pontos_fortes: 'Pontos fortes',
  importante_para_paciente: 'O que o paciente considera importante',
};

const AJUDA: Record<CategoriaContexto, string> = {
  rotina: 'Como são os dias do paciente: horários, hábitos e compromissos fixos.',
  recursos: 'O que já apoia o cuidado: pessoas, serviços, benefícios, equipamentos.',
  barreiras: 'O que dificulta o cuidado: distância, custo, falta de apoio, saúde.',
  preferencias: 'Como o paciente prefere ser cuidado, abordado e informado.',
  pontos_fortes: 'Capacidades e qualidades do paciente que o cuidado pode usar.',
  importante_para_paciente: 'O que o próprio paciente diz que mais importa para ele.',
};

export type ObjetivoDisponivel = { id: string; titulo: string };
export type ConsultaObjetivosContexto = (
  pacienteId: string,
  cursor?: string,
) => Promise<{ itens: ObjetivoDisponivel[]; proximo_cursor: string | null }>;
export type ServicoContextoCuidado = ServicoDocumentoPaciente<ElementoContexto[]>;

/** Interface isolada; montagem depende da integração segura do servidor. */
export function montarContextoCuidado(
  raiz: HTMLElement,
  pacienteId: string,
  servico: ServicoContextoCuidado,
  acessoPerdido: (erro: unknown) => void,
  alteracaoPendente: (pendente: boolean) => void = () => {},
  objetivos: readonly ObjetivoDisponivel[] = [],
  consultarObjetivos?: ConsultaObjetivosContexto,
): () => void {
  let ativa = true;
  let geracao = 0;
  const desmontarEditor = montarEditorDocumentoPaciente<ElementoContexto[]>(
    raiz,
    pacienteId,
    servico,
    acessoPerdido,
    {
      titulo: 'Contexto do cuidado',
      carregando: 'Carregando contexto do cuidado…',
      salvar: 'Salvar contexto',
      salvando: 'Salvando contexto do cuidado…',
      salvo: 'Contexto do cuidado salvo.',
      vazio: 'Nenhum elemento registrado ainda. Use “Adicionar” em cada bloco.',
      conflito:
        'O contexto foi alterado por outra pessoa. Copie seu rascunho antes de recarregar a página para consultar a versão atual; suas alterações ainda não foram salvas.',
    },
    (conteudo, aoAlterar) => {
      const geracaoAtual = ++geracao;
      const disponiveis = new Map(objetivos.map((objetivo) => [objetivo.id, objetivo]));
      const elemento = <K extends keyof HTMLElementTagNameMap>(tipo: K, texto?: string) => {
        const el = document.createElement(tipo);
        if (texto !== undefined) el.textContent = texto;
        return el;
      };
      type Linha = {
        id: string;
        categoria: CategoriaContexto;
        descricao: HTMLTextAreaElement;
        objetivos: HTMLInputElement[];
        /** Vínculos que vieram do documento e não têm caixa nesta tela — objetivo
         * arquivado, de outra página, ou lista de objetivos não carregada. Sem isso
         * um salvamento comum apagaria silenciosamente o vínculo que FR-005 exige. */
        preservados: string[];
        grupo: HTMLFieldSetElement;
        avisoPreservados: HTMLParagraphElement;
        raiz: HTMLElement;
      };
      const linhas: Linha[] = [];
      const campos = elemento('div');
      campos.className = 'contexto-cuidado';
      const adicionarBotoes: HTMLButtonElement[] = [];

      const atualizarObjetivos = (linha: Linha) => {
        for (const objetivo of disponiveis.values()) {
          if (linha.objetivos.some((caixa) => caixa.value === objetivo.id)) continue;
          const caixa = elemento('input');
          caixa.type = 'checkbox';
          caixa.value = objetivo.id;
          caixa.checked = linha.preservados.includes(objetivo.id);
          linha.preservados = linha.preservados.filter((id) => id !== objetivo.id);
          const marcacao = elemento('label');
          marcacao.append(caixa, document.createTextNode(` ${objetivo.titulo}`));
          linha.objetivos.push(caixa);
          linha.grupo.append(marcacao);
        }
        linha.grupo.hidden = linha.objetivos.length === 0;
        linha.avisoPreservados.textContent = linha.preservados.length
          ? `${linha.preservados.length} objetivo(s) vinculado(s) fora desta lista continuam guardados.`
          : '';
        linha.avisoPreservados.hidden = linha.preservados.length === 0;
      };

      const criarLinha = (
        categoria: CategoriaContexto,
        lista: HTMLElement,
        inicial?: ElementoContexto,
      ) => {
        const item = elemento('li');
        item.className = 'contexto-cuidado__item';
        const id = inicial?.id ?? crypto.randomUUID();
        const idCampo = `contexto-${id}`;
        const rotulo = elemento('label', 'Descrição');
        rotulo.htmlFor = idCampo;
        const descricao = elemento('textarea');
        descricao.id = idCampo;
        descricao.rows = 3;
        descricao.maxLength = 2000;
        descricao.value = inicial?.descricao ?? '';
        descricao.placeholder = AJUDA[categoria];
        const remover = elemento('button', 'Remover');
        remover.type = 'button';
        const marcados: HTMLInputElement[] = [];
        item.append(rotulo, descricao);
        const vinculados = inicial?.objetivos ?? [];
        const preservados = [...vinculados];
        const grupo = elemento('fieldset');
        grupo.className = 'contexto-cuidado__objetivos';
        grupo.append(elemento('legend', 'Objetivos do plano relacionados'));
        grupo.hidden = true;
        const avisoPreservados = elemento('p');
        item.append(grupo, avisoPreservados);
        item.append(remover);
        const linha: Linha = {
          id,
          categoria,
          descricao,
          objetivos: marcados,
          preservados,
          grupo,
          avisoPreservados,
          raiz: item,
        };
        const nomearRemocao = () => {
          const alvo = descricao.value.trim();
          remover.setAttribute(
            'aria-label',
            `Remover de ${ROTULOS[categoria].toLowerCase()}: ${alvo || 'elemento em branco'}`,
          );
        };
        nomearRemocao();
        descricao.addEventListener('input', nomearRemocao);
        remover.addEventListener('click', () => {
          const indice = linhas.indexOf(linha);
          if (indice >= 0) linhas.splice(indice, 1);
          item.remove();
          aoAlterar();
        });
        linhas.push(linha);
        atualizarObjetivos(linha);
        lista.append(item);
        return descricao;
      };

      if (consultarObjetivos) {
        const consultarPagina = consultarObjetivos;
        const avisoObjetivos = elemento('p', 'Carregando objetivos do plano…');
        avisoObjetivos.setAttribute('aria-live', 'polite');
        const carregarMais = elemento('button', 'Carregar mais objetivos');
        carregarMais.type = 'button';
        carregarMais.hidden = true;
        let cursor: string | undefined;
        let carregando = false;
        let terminou = false;
        const cursores = new Set<string>();
        const carregar = async () => {
          if (!ativa || geracaoAtual !== geracao || carregando || terminou) return;
          carregando = true;
          carregarMais.disabled = true;
          avisoObjetivos.textContent = 'Carregando objetivos do plano…';
          try {
            const pagina = await consultarPagina(pacienteId, cursor);
            if (!ativa || geracaoAtual !== geracao) return;
            if (
              pagina.proximo_cursor &&
              (pagina.proximo_cursor === cursor || cursores.has(pagina.proximo_cursor))
            )
              throw new Error('Cursor repetido.');
            for (const objetivo of pagina.itens) disponiveis.set(objetivo.id, objetivo);
            for (const linha of linhas) atualizarObjetivos(linha);
            if (cursor) cursores.add(cursor);
            cursor = pagina.proximo_cursor ?? undefined;
            terminou = !cursor;
            carregarMais.textContent = 'Carregar mais objetivos';
            carregarMais.hidden = terminou;
            avisoObjetivos.textContent = disponiveis.size
              ? `${disponiveis.size} objetivo(s) do plano disponível(is) para vínculo.`
              : 'Nenhum objetivo disponível no plano deste caso.';
          } catch (erro) {
            if (!ativa || geracaoAtual !== geracao) return;
            if (exigeNovoAcesso(erro)) {
              ativa = false;
              desmontarEditor();
              acessoPerdido(erro);
              return;
            }
            avisoObjetivos.textContent =
              'Não foi possível carregar os objetivos. Seus vínculos anteriores continuam guardados.';
            carregarMais.textContent = 'Tentar carregar objetivos novamente';
            carregarMais.hidden = false;
          } finally {
            carregando = false;
            if (ativa && geracaoAtual === geracao) carregarMais.disabled = false;
          }
        };
        carregarMais.addEventListener('click', () => {
          void carregar();
        });
        campos.append(avisoObjetivos, carregarMais);
        void carregar();
      }

      for (const categoria of CATEGORIAS_CONTEXTO) {
        const bloco = elemento('fieldset');
        bloco.className = 'contexto-cuidado__bloco';
        bloco.append(elemento('legend', ROTULOS[categoria]));
        bloco.append(elemento('p', AJUDA[categoria]));
        const lista = elemento('ul');
        lista.className = 'contexto-cuidado__lista';
        bloco.append(lista);
        for (const existente of conteudo ?? [])
          if (existente.categoria === categoria) criarLinha(categoria, lista, existente);
        const adicionar = elemento('button', `Adicionar em ${ROTULOS[categoria].toLowerCase()}`);
        adicionar.type = 'button';
        adicionar.addEventListener('click', () => {
          criarLinha(categoria, lista).focus();
          aoAlterar();
        });
        adicionarBotoes.push(adicionar);
        bloco.append(adicionar);
        campos.append(bloco);
      }

      return {
        campos,
        vazio: !(conteudo ?? []).length,
        conteudo: conteudo ?? [],
        bloquear: () => {
          campos.setAttribute('inert', '');
          for (const botao of adicionarBotoes) botao.disabled = true;
        },
        liberar: () => {
          campos.removeAttribute('inert');
          for (const botao of adicionarBotoes) botao.disabled = false;
        },
        coletar: () => {
          const vazia = linhas.find((linha) => !linha.descricao.value.trim());
          if (vazia)
            return { aviso: 'Preencha ou remova os elementos em branco.', foco: vazia.descricao };
          return {
            conteudo: linhas.map((linha) => ({
              id: linha.id,
              categoria: linha.categoria,
              descricao: linha.descricao.value.trim(),
              objetivos: [
                ...linha.objetivos.filter((caixa) => caixa.checked).map((c) => c.value),
                ...linha.preservados,
              ],
            })),
          };
        },
      };
    },
    alteracaoPendente,
  );
  return () => {
    ativa = false;
    geracao += 1;
    desmontarEditor();
  };
}
