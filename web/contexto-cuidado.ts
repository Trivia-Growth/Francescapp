import {
  CATEGORIAS_CONTEXTO,
  type CategoriaContexto,
  type ElementoContexto,
} from '../packages/contracts/src/contexto-cuidado.ts';
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
export type ServicoContextoCuidado = ServicoDocumentoPaciente<ElementoContexto[]>;

/** Interface isolada; montagem depende da integração segura do servidor. */
export function montarContextoCuidado(
  raiz: HTMLElement,
  pacienteId: string,
  servico: ServicoContextoCuidado,
  acessoPerdido: (erro: unknown) => void,
  alteracaoPendente: (pendente: boolean) => void = () => {},
  objetivos: readonly ObjetivoDisponivel[] = [],
): () => void {
  return montarEditorDocumentoPaciente<ElementoContexto[]>(
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
        preservados: readonly string[];
        raiz: HTMLElement;
      };
      const linhas: Linha[] = [];
      const campos = elemento('div');
      campos.className = 'contexto-cuidado';
      const adicionarBotoes: HTMLButtonElement[] = [];

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
        const preservados = vinculados.filter(
          (vinculo) => !objetivos.some((objetivo) => objetivo.id === vinculo),
        );
        if (objetivos.length) {
          const grupo = elemento('fieldset');
          grupo.className = 'contexto-cuidado__objetivos';
          grupo.append(elemento('legend', 'Objetivos do plano relacionados'));
          for (const objetivo of objetivos) {
            const marcacao = elemento('label');
            const caixa = elemento('input');
            caixa.type = 'checkbox';
            caixa.value = objetivo.id;
            caixa.checked = vinculados.includes(objetivo.id);
            marcados.push(caixa);
            marcacao.append(caixa, document.createTextNode(` ${objetivo.titulo}`));
            grupo.append(marcacao);
          }
          item.append(grupo);
        }
        // O vínculo preservado é mostrado para que ninguém salve achando que não existe.
        if (preservados.length)
          item.append(
            elemento(
              'p',
              `${preservados.length} objetivo(s) vinculado(s) fora desta lista continuam guardados.`,
            ),
          );
        item.append(remover);
        const linha: Linha = {
          id,
          categoria,
          descricao,
          objetivos: marcados,
          preservados,
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
        lista.append(item);
        return descricao;
      };

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
}
