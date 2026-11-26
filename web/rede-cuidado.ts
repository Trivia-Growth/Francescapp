import {
  VINCULOS_REDE,
  type PessoaRede,
  type VinculoRede,
} from '../packages/contracts/src/rede-cuidado.ts';
import { montarEditorDocumentoPaciente } from './editor-documento-paciente.ts';
import type { ServicoDocumentoPaciente } from './servico-documento-paciente-http.ts';

/** FR-002: os sete vínculos do requisito, com os rótulos que a equipe usa. */
const ROTULOS: Record<VinculoRede, string> = {
  paciente: 'Paciente',
  familiar: 'Familiar',
  cuidador: 'Cuidador',
  responsavel_legal: 'Responsável legal',
  contato_emergencia: 'Contato de emergência',
  profissional: 'Profissional',
  responsavel_financeiro: 'Responsável financeiro',
};

export type ServicoRedeCuidado = ServicoDocumentoPaciente<PessoaRede[]>;

/** Interface isolada; montagem depende da integração segura do servidor. */
export function montarRedeCuidado(
  raiz: HTMLElement,
  pacienteId: string,
  servico: ServicoRedeCuidado,
  acessoPerdido: (erro: unknown) => void,
  alteracaoPendente: (pendente: boolean) => void = () => {},
): () => void {
  return montarEditorDocumentoPaciente<PessoaRede[]>(
    raiz,
    pacienteId,
    servico,
    acessoPerdido,
    {
      titulo: 'Rede de cuidado',
      carregando: 'Carregando rede de cuidado…',
      salvar: 'Salvar rede de cuidado',
      salvando: 'Salvando rede de cuidado…',
      salvo: 'Rede de cuidado salva.',
      vazio: 'Nenhuma pessoa registrada ainda. Use “Adicionar pessoa”.',
      conflito:
        'A rede foi alterada por outra pessoa. Copie seu rascunho antes de recarregar a página para consultar a versão atual; suas alterações ainda não foram salvas.',
    },
    (conteudo, aoAlterar) => {
      const elemento = <K extends keyof HTMLElementTagNameMap>(tipo: K, texto?: string) => {
        const el = document.createElement(tipo);
        if (texto !== undefined) el.textContent = texto;
        return el;
      };
      type Linha = {
        id: string;
        nome: HTMLInputElement;
        contato: HTMLInputElement;
        observacao: HTMLTextAreaElement;
        vinculos: HTMLInputElement[];
      };
      const linhas: Linha[] = [];
      const campos = elemento('div');
      campos.className = 'rede-cuidado';
      const lista = elemento('ul');
      lista.className = 'rede-cuidado__lista';
      campos.append(lista);
      const adicionar = elemento('button', 'Adicionar pessoa');
      adicionar.type = 'button';

      const criarLinha = (inicial?: PessoaRede) => {
        const item = elemento('li');
        item.className = 'rede-cuidado__pessoa';
        const id = inicial?.id ?? crypto.randomUUID();
        const campo = (
          etiqueta: string,
          sufixo: string,
          limite: number,
          multilinha = false,
        ): [HTMLLabelElement, HTMLInputElement | HTMLTextAreaElement] => {
          const rotulo = elemento('label', etiqueta);
          rotulo.htmlFor = `rede-${id}-${sufixo}`;
          const entrada = multilinha ? elemento('textarea') : elemento('input');
          entrada.id = rotulo.htmlFor;
          entrada.maxLength = limite;
          if (entrada instanceof HTMLTextAreaElement) entrada.rows = 2;
          return [rotulo, entrada];
        };
        const [rotuloNome, nome] = campo('Nome', 'nome', 200) as [
          HTMLLabelElement,
          HTMLInputElement,
        ];
        nome.required = true;
        nome.value = inicial?.nome ?? '';
        const [rotuloContato, contato] = campo('Contato (opcional)', 'contato', 200) as [
          HTMLLabelElement,
          HTMLInputElement,
        ];
        contato.value = inicial?.contato ?? '';
        const [rotuloObservacao, observacao] = campo(
          'Observação (opcional)',
          'observacao',
          1000,
          true,
        ) as [HTMLLabelElement, HTMLTextAreaElement];
        observacao.value = inicial?.observacao ?? '';

        const grupo = elemento('fieldset');
        grupo.className = 'rede-cuidado__vinculos';
        grupo.append(elemento('legend', 'Vínculos com o paciente'));
        // O vínculo descreve a relação; ele não concede acesso ao caso. Quem pode ver
        // a ficha continua sendo definido na aba de acesso, nunca aqui.
        grupo.append(
          elemento(
            'p',
            'Vínculo é descritivo: marcar aqui não dá acesso à ficha. O acesso é concedido separadamente.',
          ),
        );
        const marcados: HTMLInputElement[] = [];
        for (const vinculo of VINCULOS_REDE) {
          const marcacao = elemento('label');
          const caixa = elemento('input');
          caixa.type = 'checkbox';
          caixa.value = vinculo;
          caixa.checked = Boolean(inicial?.vinculos.includes(vinculo));
          marcados.push(caixa);
          marcacao.append(caixa, document.createTextNode(` ${ROTULOS[vinculo]}`));
          grupo.append(marcacao);
        }
        const remover = elemento('button', 'Remover pessoa');
        remover.type = 'button';
        item.append(
          rotuloNome,
          nome,
          rotuloContato,
          contato,
          rotuloObservacao,
          observacao,
          grupo,
          remover,
        );
        const linha: Linha = { id, nome, contato, observacao, vinculos: marcados };
        // Sem isto, um leitor de tela anuncia "Remover pessoa" N vezes iguais
        // para uma ação destrutiva e sem confirmação.
        const nomearRemocao = () =>
          remover.setAttribute(
            'aria-label',
            `Remover ${nome.value.trim() || 'pessoa sem nome'} da rede de cuidado`,
          );
        nomearRemocao();
        nome.addEventListener('input', nomearRemocao);
        remover.addEventListener('click', () => {
          const indice = linhas.indexOf(linha);
          if (indice >= 0) linhas.splice(indice, 1);
          item.remove();
          aoAlterar();
        });
        linhas.push(linha);
        lista.append(item);
        return nome;
      };

      for (const pessoa of conteudo ?? []) criarLinha(pessoa);
      adicionar.addEventListener('click', () => {
        criarLinha().focus();
        aoAlterar();
      });
      campos.append(adicionar);

      return {
        campos,
        vazio: !(conteudo ?? []).length,
        conteudo: conteudo ?? [],
        bloquear: () => {
          campos.setAttribute('inert', '');
          adicionar.disabled = true;
        },
        liberar: () => {
          campos.removeAttribute('inert');
          adicionar.disabled = false;
        },
        coletar: () => {
          const semNome = linhas.find((linha) => !linha.nome.value.trim());
          if (semNome) return { aviso: 'Informe o nome de cada pessoa.', foco: semNome.nome };
          const semVinculo = linhas.find((linha) => !linha.vinculos.some((c) => c.checked));
          if (semVinculo)
            return {
              aviso: 'Marque ao menos um vínculo para cada pessoa.',
              foco: semVinculo.vinculos[0],
            };
          return {
            conteudo: linhas.map((linha) => ({
              id: linha.id,
              nome: linha.nome.value.trim(),
              vinculos: linha.vinculos.filter((c) => c.checked).map((c) => c.value),
              contato: linha.contato.value.trim() || null,
              observacao: linha.observacao.value.trim() || null,
            })),
          };
        },
      };
    },
    alteracaoPendente,
  );
}
