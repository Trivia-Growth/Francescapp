import {
  conteudoEvolucaoDiarioSchema,
  type ConteudoEvolucaoDiario,
} from '../packages/contracts/src/diario.ts';

/** Campos de FR-009 compartilhados por Diário e passagem; envio/autorização ficam no chamador. */
export function montarCamposSintese(
  destino: HTMLElement,
  areas: readonly string[],
  prefixo: string,
) {
  function campo<K extends 'input' | 'textarea' | 'select'>(nome: string, rotulo: string, tipo: K) {
    const controle = document.createElement(tipo);
    controle.id = `${prefixo}-${nome}`;
    const label = document.createElement('label');
    label.className = 'modelo-sintese-campo';
    label.htmlFor = controle.id;
    label.append(document.createTextNode(rotulo), controle);
    destino.append(label);
    return controle;
  }
  const area = areas.length
    ? campo('area', 'Área (obrigatória)', 'select')
    : campo('area', 'Área (obrigatória)', 'input');
  if (area instanceof HTMLSelectElement)
    for (const nome of areas) {
      const opcao = document.createElement('option');
      opcao.value = nome;
      opcao.textContent = nome;
      area.append(opcao);
    }
  const data = campo('data', 'Data do atendimento (obrigatória)', 'input');
  data.type = 'date';
  const atividade = campo('atividade', 'Atividade (obrigatória para publicar)', 'textarea');
  const observacoes = campo('observacoes', 'Observações compartilháveis', 'textarea');
  const progresso = campo('progresso', 'Progresso', 'textarea');
  const orientacao = campo('orientacao', 'Orientação', 'textarea');
  const proximo = campo('proximo', 'Próximo passo', 'textarea');
  const objetivo = campo('objetivo', 'Objetivo relacionado', 'input');
  return {
    area,
    data,
    atividade,
    ler(): ConteudoEvolucaoDiario | undefined {
      const valores = {
        data: data.value,
        area: area.value.trim(),
        ...(atividade.value.trim() ? { atividade: atividade.value.trim() } : {}),
        ...(observacoes.value.trim()
          ? { observacoesCompartilhaveis: observacoes.value.trim() }
          : {}),
        ...(progresso.value.trim() ? { progresso: progresso.value.trim() } : {}),
        ...(orientacao.value.trim() ? { orientacao: orientacao.value.trim() } : {}),
        ...(proximo.value.trim() ? { proximoPasso: proximo.value.trim() } : {}),
        ...(objetivo.value.trim() ? { objetivoRelacionado: objetivo.value.trim() } : {}),
      };
      const validado = conteudoEvolucaoDiarioSchema.safeParse(valores);
      return validado.success ? validado.data : undefined;
    },
  };
}
