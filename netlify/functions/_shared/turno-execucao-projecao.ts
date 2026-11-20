import { z } from 'zod';
import { campoCifradoSchema, uuidSchema } from '../../../packages/contracts/src/comum.ts';
import {
  metadadosAadExecucaoTurnoSchema,
  gravacaoExecucaoTurnoSchema,
} from '../../../packages/contracts/src/turno-execucao.ts';
import {
  type gravarExecucaoPublicaSchema,
  registroExecucaoPublicoSchema,
} from '../../../packages/contracts/src/turno-execucao-http.ts';
import type { CampoCifrado, MetadadosAad } from '../../../packages/contracts/src/rpc.ts';
export type CifraExecucao = {
  cifrar(valor: string, aad: MetadadosAad): Promise<CampoCifrado>;
  decifrar(valor: CampoCifrado, aad: MetadadosAad): Promise<string>;
};
export const objeto = (valor: unknown) => z.record(z.string(), z.unknown()).parse(valor);
export const tabelasExecucao = {
  afericao: 'cadastro.turno_medida_versao',
  rotina: 'cadastro.turno_medida_versao',
  prescricao: 'cadastro.turno_prescricao_versao',
  administracao: 'cadastro.turno_administracao_versao',
  ocorrencia: 'cadastro.turno_ocorrencia_versao',
} as const;
export function aadExecucao(
  tabela: string,
  paciente: string,
  turno: string | null,
  registro: string,
  versao: number,
  campo: string,
) {
  return metadadosAadExecucaoTurnoSchema.parse({
    tabela,
    paciente_id: paciente,
    turno_id: turno,
    registro_id: registro,
    versao,
    campo,
    formato: 1,
  });
}
export async function cifrarExecucao(
  entrada: z.output<typeof gravarExecucaoPublicaSchema>,
  paciente: string,
  chave: string,
  digest: string,
  cifra: CifraExecucao,
) {
  const classe = entrada.conteudo.classe;
  const dados = { ...entrada.conteudo.dados } as Record<string, unknown>;
  const turno = 'turno_id' in entrada.conteudo.dados ? entrada.conteudo.dados.turno_id : null;
  const versao = entrada.versao_esperada + 1;
  const tabela = tabelasExecucao[classe];
  const aad: Record<string, unknown> = {};
  const cifrar = async (campo: string, valor: string) => {
    const contexto = aadExecucao(tabela, paciente, turno, entrada.registro_id, versao, campo);
    aad[campo] = contexto;
    return cifra.cifrar(valor, contexto);
  };
  if (entrada.conteudo.classe === 'prescricao')
    for (const campo of ['nome', 'dose', 'via', 'fonte_documental'] as const)
      dados[campo] = await cifrar(campo, entrada.conteudo.dados[campo]);
  if (entrada.conteudo.classe === 'administracao') {
    dados.executor = {
      nome: await cifrar('executor_nome', entrada.conteudo.dados.executor.nome),
      vinculo: await cifrar('executor_vinculo', entrada.conteudo.dados.executor.vinculo),
    };
    if (entrada.conteudo.dados.motivo !== undefined)
      dados.motivo = await cifrar('motivo_situacao', entrada.conteudo.dados.motivo);
  }
  if (entrada.conteudo.classe === 'ocorrencia') {
    dados.descricao = await cifrar('descricao', entrada.conteudo.dados.descricao);
    dados.providencia = await cifrar('providencia', entrada.conteudo.dados.providencia);
  }
  if (entrada.conteudo.classe === 'rotina' && entrada.conteudo.dados.observacao !== undefined)
    dados.observacao = await cifrar('observacao', entrada.conteudo.dados.observacao);
  const privado = gravacaoExecucaoTurnoSchema.parse({
    registro_id: entrada.registro_id,
    versao,
    versao_esperada: entrada.versao_esperada,
    conteudo: { classe, dados },
    ...(entrada.motivo === undefined ? {} : { motivo: await cifrar('motivo', entrada.motivo) }),
    chave_idempotencia: chave,
    digest_idempotencia: digest,
  });
  return { ...privado, aad };
}
export async function abrirRegistroExecucao(
  valor: unknown,
  paciente: string,
  cifra: CifraExecucao,
  nomes: ReadonlyMap<string, string | null> = new Map(),
) {
  const r = objeto(valor);
  const d = objeto(r.dados);
  const classe = z
    .enum(['afericao', 'prescricao', 'administracao', 'ocorrencia', 'rotina'])
    .parse(r.classe);
  const id = uuidSchema.parse(r.id);
  const versao = z.number().int().positive().parse(r.versao);
  if (uuidSchema.parse(r.paciente_id).toLowerCase() !== paciente.toLowerCase())
    throw new Error('Resposta incompatível.');
  const turno = r.turno_id === null ? null : uuidSchema.parse(r.turno_id);
  const tabela = tabelasExecucao[classe];
  const abrir = async (campo: string) =>
    cifra.decifrar(
      campoCifradoSchema.parse(d[campo]),
      aadExecucao(tabela, paciente, turno, id, versao, campo),
    );
  let dados: Record<string, unknown>;
  if (classe === 'afericao')
    dados = {
      turno_id: turno,
      tipo: d.tipo,
      valor: Number(d.valor),
      unidade: d.unidade,
      instante_afericao: d.instante_ocorrencia,
    };
  else if (classe === 'prescricao')
    dados = {
      nome: await abrir('nome'),
      dose: await abrir('dose'),
      via: await abrir('via'),
      horarios: d.horarios,
      vigencia_inicio: d.vigencia_inicio,
      vigencia_fim: d.vigencia_fim,
      fonte_documental: await abrir('fonte_documental'),
    };
  else if (classe === 'administracao')
    dados = {
      turno_id: turno,
      item_id: d.item_id,
      versao: d.item_versao,
      executor: { nome: await abrir('executor_nome'), vinculo: await abrir('executor_vinculo') },
      situacao: d.situacao,
      ...(d.motivo_situacao == null ? {} : { motivo: await abrir('motivo_situacao') }),
    };
  else if (classe === 'ocorrencia')
    dados = {
      turno_id: turno,
      descricao: await abrir('descricao'),
      providencia: await abrir('providencia'),
      instante_ocorrencia: d.instante_ocorrencia,
      ...(d.anexo_documento_id == null ? {} : { anexo_documento_id: d.anexo_documento_id }),
    };
  else {
    dados = { turno_id: turno, tipo: d.tipo, instante_ocorrencia: d.instante_ocorrencia };
    if (d.tipo === 'refeicao') Object.assign(dados, { momento: d.momento, aceitacao: d.aceitacao });
    else if (d.tipo === 'hidratacao') dados.mililitros = Number(d.valor);
    else if (d.tipo === 'sono')
      Object.assign(dados, { inicio: d.inicio, fim: d.fim, qualidade: d.qualidade });
    else if (d.tipo === 'eliminacao')
      Object.assign(dados, { eliminacao: d.eliminacao, contagem: d.contagem });
    // O estado observado é gravado na coluna `qualidade` (CHECK da migration 20261127200000:
    // `tipo='estado_emocional' and qualidade is not null and valor is null`). Sem esta linha
    // a projeção emitia o tipo sem o termo, o schema público recusava, e a PRIMEIRA ficha com
    // estado emocional derrubava o relatório de turno do período inteiro (FR-062).
    else if (d.tipo === 'estado_emocional') dados.qualidade = d.qualidade;
    if (d.observacao != null) dados.observacao = await abrir('observacao');
  }
  let prescricao: { nome: string; dose: string; via: string; versao: number } | undefined;
  if (classe === 'administracao') {
    const p = objeto(d.prescricao_referenciada);
    const conteudo = objeto(p.dados);
    if (
      p.paciente_id !== paciente ||
      p.registro_id !== d.item_id ||
      p.versao !== d.item_versao ||
      p.turno_id !== null
    )
      throw new Error('Referência de prescrição incompatível.');
    const abrirItem = async (campo: 'nome' | 'dose' | 'via') =>
      cifra.decifrar(
        campoCifradoSchema.parse(conteudo[campo]),
        aadExecucao(
          'cadastro.turno_prescricao_versao',
          paciente,
          null,
          uuidSchema.parse(p.registro_id),
          Number(p.versao),
          campo,
        ),
      );
    prescricao = {
      nome: await abrirItem('nome'),
      dose: await abrirItem('dose'),
      via: await abrirItem('via'),
      versao: Number(p.versao),
    };
  }
  const autor = uuidSchema.parse(
    d.registrador_usuario_id ?? d.autor_usuario_id ?? r.autor_usuario_id,
  );
  return registroExecucaoPublicoSchema.parse({
    paciente_id: paciente,
    turno_id: turno,
    registro_id: id,
    versao,
    conteudo: { classe, dados },
    ...(d.motivo == null ? {} : { motivo: await abrir('motivo') }),
    registrador_usuario_id: autor,
    registrador_nome: nomes.get(autor) ?? null,
    ...(prescricao ? { prescricao_referenciada: prescricao } : {}),
    criado_em: r.registrado_em,
    instante_ocorrencia: r.instante_ocorrencia,
    retificada: versao > 1,
  });
}
export async function nomesExecucao(
  valor: unknown,
  cifra: CifraExecucao,
): Promise<Map<string, string | null>> {
  const nomes = new Map<string, string | null>();
  for (const item of z.array(z.unknown()).parse(valor)) {
    const r = objeto(item);
    const id = uuidSchema.parse(r.usuario_id);
    let nome: string | null = null;
    if (r.nome_cifrado != null && r.operacao_id != null)
      nome = await cifra.decifrar(campoCifradoSchema.parse(r.nome_cifrado), {
        tabela: 'identidade.acesso_gerenciado',
        registro_id: uuidSchema.parse(r.operacao_id),
        campo: 'nome',
        formato: 1,
      });
    nomes.set(id, nome);
  }
  return nomes;
}
