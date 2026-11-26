import { z } from 'zod';
import { validarSecoesAnamnese } from '../../../packages/contracts/src/anamnese.ts';
import { validarRegistrosSaude } from '../../../packages/contracts/src/saude.ts';
import { validarContextoCuidado } from '../../../packages/contracts/src/contexto-cuidado.ts';
import { validarRedeCuidado } from '../../../packages/contracts/src/rede-cuidado.ts';
import { conteudoDiarioSchema } from '../../../packages/contracts/src/diario.ts';
import { objetivoSchema } from '../../../packages/contracts/src/plano-cuidado.ts';
import { tarefaCuidadoSchema } from '../../../packages/contracts/src/tarefa-cuidado.ts';
import { conteudoEncaminhamentoSchema } from '../../../packages/contracts/src/encaminhamento.ts';
import { conteudoOrientacaoSchema } from '../../../packages/contracts/src/orientacao.ts';
import { objeto } from './turno-execucao-projecao.ts';
const rotulos: Record<string, string> = {
  descricao: 'Descrição',
  responsavel: 'Responsável declarado',
  prazo: 'Prazo',
  prioridade: 'Prioridade',
  estado: 'Estado',
  acaoRealizada: 'Ação realizada',
  justificativa: 'Justificativa',
  data: 'Data',
  dataAcontecimento: 'Data do acontecimento',
  area: 'Área',
  atividade: 'Atividade',
  observacoesCompartilhaveis: 'Observações compartilháveis',
  progresso: 'Progresso',
  orientacao: 'Orientação',
  proximoPasso: 'Próximo passo',
  objetivoRelacionado: 'Objetivo relacionado',
  categoria: 'Categoria',
  contexto: 'Contexto',
  acaoTomada: 'Ação tomada',
  situacaoInicial: 'Situação inicial',
  observacaoProgresso: 'Observação de progresso',
  dataRevisao: 'Data da revisão',
  destino: 'Destino',
  motivo: 'Motivo',
  observacao: 'Observação',
  texto: 'Texto',
  autor: 'Autor declarado',
  destinatarios: 'Destinatários declarados',
  validade: 'Validade',
};
/** Apenas DTOs de negócio já validados. Campo novo sem rótulo falha, nunca some. */
function campos(valor: Record<string, unknown>): string {
  return Object.entries(valor)
    .map(([k, v]) => {
      if (k === 'camposExtras')
        return Object.values(objeto(v))
          .map(
            (item, i) =>
              `Campo adicional ${i + 1} (rótulo não disponível nesta versão): ${z.string().parse(item)}`,
          )
          .join('\n');
      const rotulo = rotulos[k];
      if (!rotulo) throw new Error('Campo de conteúdo sem apresentação aprovada.');
      if (v !== null && typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean')
        throw new Error('Conteúdo incompatível.');
      return `${rotulo}: ${v ?? 'Não informado'}`;
    })
    .join('\n');
}
export function apresentarRedeMinima(conteudo: unknown): string {
  const papeis: Record<string, string> = {
    familiar: 'Familiar',
    cuidador: 'Cuidador',
    responsavel_legal: 'Responsável legal',
    contato_emergencia: 'Contato de emergência',
    profissional: 'Profissional',
    responsavel_financeiro: 'Responsável financeiro',
    paciente: 'Paciente',
  };
  return (
    validarRedeCuidado(conteudo)
      .map(
        (p) => `${p.vinculos.map((v) => papeis[v]).join(', ')}: ${p.nome.trim().split(/\s+/)[0]}`,
      )
      .join('\n') || 'Nenhuma pessoa registrada nesta versão.'
  );
}
export function apresentarFonteCaso(fonte: string, valor: unknown): string {
  const r = objeto(valor);
  switch (fonte) {
    case 'anamnese':
      return (
        validarSecoesAnamnese(r.secoes)
          .map(
            (s, i) =>
              `Seção ${i + 1}\nCampos esperados: ${s.camposEsperados.join(', ')}\n${s.respostas.map((a) => `Campo: ${a.campo}\nEstado: ${a.estado}${a.estado === 'informado' ? `\nValor: ${a.valor}` : ''}${a.estado !== 'pendente' ? `\nFonte: ${a.fonte}\nData: ${a.data}` : ''}`).join('\n')}`,
          )
          .join('\n') || 'Nenhuma seção registrada nesta versão.'
      );
    case 'saude':
      return (
        validarRegistrosSaude(r.registros)
          .map(
            (s) =>
              `Tipo: ${s.tipo}\nDescrição: ${s.descricao}\nOrigem declarada: ${s.origem}\nNatureza da informação: ${s.natureza}\nData: ${s.data}\nSituação de confirmação: ${s.situacao}`,
          )
          .join('\n') || 'Nenhum registro de saúde nesta versão.'
      );
    case 'contexto':
      return (
        validarContextoCuidado(r.conteudo)
          .map((e) => `Categoria: ${e.categoria}\nDescrição: ${e.descricao}`)
          .join('\n') || 'Nenhum elemento de contexto nesta versão.'
      );
    case 'rede':
      return apresentarRedeMinima(r.conteudo);
    case 'diario': {
      const conteudo = conteudoDiarioSchema.parse(r.conteudo);
      return [
        `Tipo: ${z.string().parse(r.tipo)}`,
        `Estado: ${z.string().parse(r.estado)}`,
        `Audiência: ${z.string().parse(r.audiencia)}`,
        `Origem do conteúdo: ${z.string().parse(r.origem_conteudo)}`,
        `Atenção solicitada: ${r.atencao === true ? 'Sim' : 'Não'}`,
        `Retorno solicitado: ${r.retorno_solicitado === true ? 'Sim' : 'Não'}`,
        campos(conteudo),
        ...(r.justificativa !== undefined
          ? [
              `Justificativa de retificação: ${typeof r.justificativa === 'string' ? r.justificativa : z.string().parse(objeto(r.justificativa).motivo)}`,
            ]
          : []),
      ].join('\n');
    }
    case 'objetivo':
      return [
        campos(objetivoSchema.parse(r.objetivo)),
        ...(r.motivo !== undefined ? [`Motivo da revisão: ${z.string().parse(r.motivo)}`] : []),
      ].join('\n');
    case 'tarefa':
      return campos(tarefaCuidadoSchema.parse(r.tarefa));
    case 'encaminhamento':
      return [
        `Etapa: ${z.string().parse(r.etapa)}`,
        campos(
          conteudoEncaminhamentoSchema.parse({
            destino: r.destino,
            motivo: r.motivo,
            responsavel: r.responsavel,
            ...(r.observacao !== undefined ? { observacao: r.observacao } : {}),
          }),
        ),
      ].join('\n');
    case 'orientacao':
      return [
        `Situação: ${z.string().parse(r.situacao)}`,
        campos(
          conteudoOrientacaoSchema.parse({
            texto: r.texto,
            autor: r.autor,
            data: r.data,
            destinatarios: r.destinatarios,
            validade: r.validade,
          }),
        ),
      ].join('\n');
    case 'documento':
      return [
        `Nome: ${z.string().parse(r.nome_visivel)}`,
        `Categoria: ${z.string().parse(r.categoria)}`,
        `Origem: ${r.origem ?? 'Não informada'}`,
        `Data do documento: ${r.data_documento ?? 'Não informada'}`,
        `Estado: ${z.string().parse(r.estado)}`,
        `Audiência: ${z.string().parse(r.audiencia)}`,
        ...(r.descricao !== undefined ? [`Descrição: ${z.string().parse(r.descricao)}`] : []),
        'Arquivo binário não incorporado a este PDF.',
      ].join('\n');
    case 'pendencia': {
      const d = objeto(r.detalhe);
      return `Tipo de pendência: ${z.string().parse(d.tipo)}\nAção registrada: ${z.string().parse(d.acao)}`;
    }
    case 'situacao': {
      const d = objeto(r.detalhe);
      const situacao = d.situacao ?? r.subtipo;
      return `Situação do acompanhamento: ${z.string().parse(situacao)}`;
    }
    default:
      throw new Error('Fonte sem apresentação aprovada.');
  }
}
