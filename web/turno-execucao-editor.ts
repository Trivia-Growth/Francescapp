import {
  conteudoExecucaoPublicoSchema,
  type CatalogoTurnoPublico,
  type ConteudoExecucaoPublico,
  type RegistroExecucaoPublico,
} from '../packages/contracts/src/turno-execucao-http.ts';
import {
  elementoTurno as el,
  campoTurno,
  selecaoTurno,
  numeroTurno,
  instanteTurno,
  dataLocalTurno,
  estadoTurno,
} from './turno-execucao-campos.ts';

export type ClasseExecucao = ConteudoExecucaoPublico['classe'];
export const rotulosClasse: Record<ClasseExecucao, string> = {
  afericao: 'Aferição',
  prescricao: 'Medicação prescrita',
  administracao: 'Administração de medicação',
  ocorrencia: 'Ocorrência',
  rotina: 'Rotina',
};
const rotulosSinais: Record<string, string> = {
  pressao_sistolica: 'Pressão arterial sistólica',
  pressao_diastolica: 'Pressão arterial diastólica',
  frequencia_cardiaca: 'Frequência cardíaca',
  frequencia_respiratoria: 'Frequência respiratória',
  temperatura: 'Temperatura',
  saturacao_oxigenio: 'Saturação de oxigênio',
  glicemia_capilar: 'Glicemia capilar',
  dor: 'Dor (escala 0 a 10)',
};
export function rotuloSinal(tipo: string) {
  return rotulosSinais[tipo] ?? tipo;
}

/** Formulário explícito. Instantes informados são dados clínicos; autoria vem do servidor. */
export function montarEditorExecucao(
  raiz: HTMLElement,
  classe: ClasseExecucao,
  contexto: {
    turnoId: string | null;
    catalogo: readonly CatalogoTurnoPublico[];
    prescricoes: readonly RegistroExecucaoPublico[];
    atual?: RegistroExecucaoPublico;
  },
  opcoes: {
    enviar(conteudo: ConteudoExecucaoPublico, motivo?: string): void;
    cancelar(): void;
    alteracaoPendente(valor: boolean): void;
  },
) {
  const atual = contexto.atual?.conteudo;
  const form = el('form');
  form.className = 'turno-execucao__editor';
  const grupo = el('fieldset');
  grupo.append(
    el(
      'legend',
      contexto.atual
        ? `Retificar ${rotulosClasse[classe].toLocaleLowerCase('pt-BR')}`
        : rotulosClasse[classe],
    ),
  );
  const status = estadoTurno();
  let ler: () => unknown;
  const turnoId = contexto.atual?.turno_id ?? contexto.turnoId;
  if (classe === 'afericao') {
    const dados = atual?.classe === 'afericao' ? atual.dados : undefined;
    const tipos = contexto.catalogo.filter((item) => !item.observacao && item.ativo);
    const tipo = selecaoTurno(
      grupo,
      'Tipo de aferição',
      tipos.map((item) => ({ valor: item.tipo, rotulo: rotuloSinal(item.tipo) })),
      dados?.tipo,
    );
    const unidade = el('p');
    const referencia = el('p');
    grupo.append(unidade, referencia);
    const valor = campoTurno(grupo, 'Valor aferido', {
      tipo: 'number',
      valor: dados ? String(dados.valor) : '',
    });
    if (valor instanceof HTMLInputElement) valor.step = 'any';
    const instante = campoTurno(grupo, 'Data e horário da aferição', {
      tipo: 'datetime-local',
      valor: dataLocalTurno(dados?.instante_afericao),
    });
    const atualizar = () => {
      const selecionado = tipos.find((item) => item.tipo === tipo.value);
      unidade.textContent = selecionado?.unidade
        ? `Unidade: ${selecionado.unidade}`
        : 'Selecione o tipo para conferir a unidade.';
      referencia.textContent = selecionado?.referencia_informativa
        ? `Referência informativa: ${selecionado.referencia_informativa}`
        : 'Nenhuma referência informativa configurada para este tipo.';
    };
    tipo.onchange = atualizar;
    atualizar();
    grupo.append(
      el(
        'p',
        'O sistema registra o valor informado, sem interpretar gravidade ou recomendar conduta.',
      ),
    );
    ler = () => ({
      classe,
      dados: {
        turno_id: turnoId,
        tipo: tipo.value,
        valor: numeroTurno(valor),
        unidade: tipos.find((item) => item.tipo === tipo.value)?.unidade,
        instante_afericao: instanteTurno(instante.value),
      },
    });
  } else if (classe === 'prescricao') {
    const dados = atual?.classe === 'prescricao' ? atual.dados : undefined;
    grupo.append(
      el(
        'p',
        'Transcreva uma prescrição externa já existente. Nenhuma dose, via ou decisão clínica é sugerida pelo sistema.',
      ),
    );
    const nome = campoTurno(grupo, 'Medicamento conforme prescrição', { valor: dados?.nome });
    const dose = campoTurno(grupo, 'Dose prescrita', { valor: dados?.dose });
    const via = campoTurno(grupo, 'Via prescrita', { valor: dados?.via });
    const horarios = campoTurno(grupo, 'Horários previstos', {
      valor: dados?.horarios.join('\n'),
      longo: true,
      ajuda: 'Um horário por linha, no formato HH:MM:SS (até 48). Copie da prescrição.',
    });
    const inicio = campoTurno(grupo, 'Início da vigência', {
      tipo: 'datetime-local',
      valor: dataLocalTurno(dados?.vigencia_inicio),
    });
    const fim = campoTurno(grupo, 'Fim da vigência (se informado na fonte)', {
      tipo: 'datetime-local',
      valor: dataLocalTurno(dados?.vigencia_fim ?? undefined),
      obrigatorio: false,
    });
    const fonte = campoTurno(grupo, 'Fonte documental da prescrição', {
      valor: dados?.fonte_documental,
      longo: true,
    });
    ler = () => ({
      classe,
      dados: {
        nome: nome.value,
        dose: dose.value,
        via: via.value,
        horarios: horarios.value
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean),
        vigencia_inicio: instanteTurno(inicio.value),
        vigencia_fim: fim.value ? instanteTurno(fim.value) : null,
        fonte_documental: fonte.value,
      },
    });
  } else if (classe === 'administracao') {
    const dados = atual?.classe === 'administracao' ? atual.dados : undefined;
    const prescricoes = contexto.prescricoes.filter(
      (item) => item.conteudo.classe === 'prescricao',
    );
    const selecao = selecaoTurno(
      grupo,
      'Item prescrito e versão',
      prescricoes.map((item) => ({
        valor: `${item.registro_id}:${item.versao}`,
        rotulo:
          item.conteudo.classe === 'prescricao'
            ? `${item.conteudo.dados.nome} · ${item.conteudo.dados.dose} · ${item.conteudo.dados.via} · versão ${item.versao}`
            : '',
      })),
      dados ? `${dados.item_id}:${dados.versao}` : undefined,
    );
    if (
      dados &&
      !prescricoes.some(
        (item) => item.registro_id === dados.item_id && item.versao === dados.versao,
      )
    ) {
      const historica = el(
        'option',
        `Prescrição histórica, versão ${dados.versao} — identificação indisponível`,
      );
      historica.value = `${dados.item_id}:${dados.versao}`;
      selecao.append(historica);
      selecao.value = historica.value;
    }
    selecao.disabled = Boolean(dados);
    const detalhe = el('p');
    grupo.append(detalhe);
    selecao.onchange = () => {
      const item = prescricoes.find(
        (item) => `${item.registro_id}:${item.versao}` === selecao.value,
      );
      detalhe.textContent =
        item?.conteudo.classe === 'prescricao'
          ? `Horários prescritos: ${item.conteudo.dados.horarios.join(', ')}. Fonte: ${item.conteudo.dados.fonte_documental}`
          : '';
    };
    selecao.dispatchEvent(new Event('change'));
    const executor = campoTurno(grupo, 'Quem administrou — nome declarado', {
      valor: dados?.executor.nome,
    });
    const vinculo = campoTurno(grupo, 'Vínculo do executor declarado', {
      valor: dados?.executor.vinculo,
      ajuda:
        'Pode ser profissional externo sem conta. O registrador é identificado pelo acesso autenticado.',
    });
    const situacao = selecaoTurno(
      grupo,
      'Situação da administração',
      [
        { valor: 'administrado', rotulo: 'Administrado' },
        { valor: 'recusado', rotulo: 'Recusado' },
        { valor: 'adiado', rotulo: 'Adiado' },
        { valor: 'nao_administrado', rotulo: 'Não administrado' },
      ],
      dados?.situacao,
    );
    const motivo = campoTurno(grupo, 'Motivo da situação', {
      valor: dados?.motivo,
      longo: true,
      obrigatorio: dados?.situacao !== 'administrado',
    });
    situacao.onchange = () => {
      motivo.required = situacao.value !== 'administrado';
    };
    ler = () => {
      const [item_id, versao] = selecao.value.split(':');
      return {
        classe,
        dados: {
          turno_id: turnoId,
          item_id,
          versao: Number(versao),
          executor: { nome: executor.value, vinculo: vinculo.value },
          situacao: situacao.value,
          ...(motivo.value.trim() ? { motivo: motivo.value } : {}),
        },
      };
    };
  } else if (classe === 'ocorrencia') {
    const dados = atual?.classe === 'ocorrencia' ? atual.dados : undefined;
    const descricao = campoTurno(grupo, 'Descrição da ocorrência', {
      valor: dados?.descricao,
      longo: true,
    });
    const instante = campoTurno(grupo, 'Data e horário da ocorrência', {
      tipo: 'datetime-local',
      valor: dataLocalTurno(dados?.instante_ocorrencia),
    });
    const providencia = campoTurno(grupo, 'Providência tomada', {
      valor: dados?.providencia,
      longo: true,
    });
    grupo.append(
      el(
        'p',
        'Após confirmar o registro, você poderá anexar uma foto privada ou converter a ocorrência em ação.',
      ),
    );
    ler = () => ({
      classe,
      dados: {
        turno_id: turnoId,
        descricao: descricao.value,
        instante_ocorrencia: instanteTurno(instante.value),
        providencia: providencia.value,
        ...(dados?.anexo_documento_id ? { anexo_documento_id: dados.anexo_documento_id } : {}),
      },
    });
  } else {
    const dados = atual?.classe === 'rotina' ? atual.dados : undefined;
    const tipo = selecaoTurno(
      grupo,
      'Observação de rotina',
      [
        { valor: 'refeicao', rotulo: 'Refeição' },
        { valor: 'hidratacao', rotulo: 'Hidratação' },
        { valor: 'sono', rotulo: 'Sono' },
        { valor: 'eliminacao', rotulo: 'Eliminação' },
      ],
      dados?.tipo,
    );
    const instante = campoTurno(grupo, 'Data e horário da observação', {
      tipo: 'datetime-local',
      valor: dataLocalTurno(dados?.instante_ocorrencia),
    });
    const especificos = el('div');
    grupo.append(especificos);
    let lerEspecificos: () => Record<string, unknown> = () => ({});
    const construir = () => {
      especificos.replaceChildren();
      if (tipo.value === 'refeicao') {
        const momento = selecaoTurno(
          especificos,
          'Momento da refeição',
          [
            { valor: 'cafe', rotulo: 'Café' },
            { valor: 'almoco', rotulo: 'Almoço' },
            { valor: 'lanche', rotulo: 'Lanche' },
            { valor: 'jantar', rotulo: 'Jantar' },
            { valor: 'ceia', rotulo: 'Ceia' },
          ],
          dados?.tipo === 'refeicao' ? dados.momento : undefined,
        );
        const aceitacao = selecaoTurno(
          especificos,
          'Aceitação observada',
          [
            { valor: 'total', rotulo: 'Total' },
            { valor: 'parcial', rotulo: 'Parcial' },
            { valor: 'minima', rotulo: 'Mínima' },
            { valor: 'recusou', rotulo: 'Recusou' },
          ],
          dados?.tipo === 'refeicao' ? dados.aceitacao : undefined,
        );
        lerEspecificos = () => ({ momento: momento.value, aceitacao: aceitacao.value });
      } else if (tipo.value === 'hidratacao') {
        const volume = campoTurno(especificos, 'Volume informado (mL)', {
          tipo: 'number',
          valor: dados?.tipo === 'hidratacao' ? String(dados.mililitros) : '',
        });
        if (volume instanceof HTMLInputElement) {
          volume.min = '0';
          volume.step = 'any';
        }
        lerEspecificos = () => ({ mililitros: numeroTurno(volume) });
      } else if (tipo.value === 'sono') {
        const inicio = campoTurno(especificos, 'Início do sono', {
          tipo: 'datetime-local',
          valor: dados?.tipo === 'sono' ? dataLocalTurno(dados.inicio) : '',
        });
        const fim = campoTurno(especificos, 'Fim do sono', {
          tipo: 'datetime-local',
          valor: dados?.tipo === 'sono' ? dataLocalTurno(dados.fim) : '',
        });
        const qualidade = selecaoTurno(
          especificos,
          'Qualidade observada',
          [
            { valor: 'tranquilo', rotulo: 'Tranquilo' },
            { valor: 'agitado', rotulo: 'Agitado' },
            { valor: 'nao_dormiu', rotulo: 'Não dormiu' },
          ],
          dados?.tipo === 'sono' ? dados.qualidade : undefined,
        );
        lerEspecificos = () => ({
          inicio: instanteTurno(inicio.value),
          fim: instanteTurno(fim.value),
          qualidade: qualidade.value,
        });
      } else if (tipo.value === 'eliminacao') {
        const eliminacao = selecaoTurno(
          especificos,
          'Tipo de eliminação',
          [
            { valor: 'urina', rotulo: 'Urina' },
            { valor: 'fezes', rotulo: 'Fezes' },
          ],
          dados?.tipo === 'eliminacao' ? dados.eliminacao : undefined,
        );
        const contagem = campoTurno(especificos, 'Contagem observada', {
          tipo: 'number',
          valor: dados?.tipo === 'eliminacao' ? String(dados.contagem) : '',
        });
        if (contagem instanceof HTMLInputElement) {
          contagem.min = '0';
          contagem.step = '1';
        }
        lerEspecificos = () => ({ eliminacao: eliminacao.value, contagem: numeroTurno(contagem) });
      } else lerEspecificos = () => ({});
    };
    tipo.onchange = construir;
    construir();
    const observacao = campoTurno(grupo, 'Observações adicionais (opcional)', {
      valor: dados?.observacao,
      longo: true,
      obrigatorio: false,
    });
    grupo.append(
      el(
        'p',
        'Observações registradas sem avaliação automática de adequação, gravidade ou recomendação.',
      ),
    );
    ler = () => ({
      classe,
      dados: {
        turno_id: turnoId,
        tipo: tipo.value,
        instante_ocorrencia: instanteTurno(instante.value),
        ...lerEspecificos(),
        ...(observacao.value.trim() ? { observacao: observacao.value } : {}),
      },
    });
  }
  const motivo = contexto.atual
    ? campoTurno(grupo, 'Motivo da retificação', { longo: true })
    : null;
  const salvar = el('button', contexto.atual ? 'Salvar retificação' : 'Registrar');
  salvar.type = 'submit';
  salvar.className = 'button-primary';
  const cancelar = el('button', 'Cancelar edição');
  cancelar.type = 'button';
  cancelar.onclick = opcoes.cancelar;
  grupo.append(salvar, cancelar);
  form.append(grupo, status);
  raiz.replaceChildren(form);
  form.oninput = () => opcoes.alteracaoPendente(true);
  form.onchange = () => opcoes.alteracaoPendente(true);
  form.onsubmit = (evento) => {
    evento.preventDefault();
    try {
      const resultado = conteudoExecucaoPublicoSchema.safeParse(ler());
      if (!resultado.success || (motivo && !motivo.value.trim())) {
        status.textContent =
          'Confira os campos, data, horário e motivo obrigatório. Nenhum registro foi enviado.';
        return;
      }
      opcoes.enviar(resultado.data, motivo?.value.trim());
    } catch (erro) {
      status.textContent = erro instanceof Error ? erro.message : 'Confira os dados informados.';
    }
  };
  return {
    bloquear(valor: boolean) {
      grupo.disabled = valor;
    },
    informar(mensagem: string) {
      status.textContent = mensagem;
    },
    focar() {
      form.querySelector<HTMLElement>('input,select,textarea')?.focus();
    },
    desmontar() {
      form.oninput = null;
      form.onchange = null;
      form.onsubmit = null;
      raiz.replaceChildren();
    },
  };
}
