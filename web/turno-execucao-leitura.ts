import type {
  RegistroExecucaoPublico,
  RelatorioTurnoPublico,
} from '../packages/contracts/src/turno-execucao-http.ts';
import { elementoTurno as el } from './turno-execucao-campos.ts';
import { rotulosClasse, rotuloSinal } from './turno-execucao-editor.ts';
export function dataTurno(valor: string) {
  return new Date(valor).toLocaleString('pt-BR');
}
const rotulos: Record<string, string> = {
  cafe: 'Café',
  almoco: 'Almoço',
  lanche: 'Lanche',
  jantar: 'Jantar',
  ceia: 'Ceia',
  total: 'Total',
  parcial: 'Parcial',
  minima: 'Mínima',
  recusou: 'Recusou',
  tranquilo: 'Tranquilo',
  agitado: 'Agitado',
  nao_dormiu: 'Não dormiu',
  urina: 'Urina',
  fezes: 'Fezes',
  administrado: 'Administrado',
  recusado: 'Recusado',
  adiado: 'Adiado',
  nao_administrado: 'Não administrado',
};
function linha(destino: HTMLElement, rotulo: string, valor: string) {
  destino.append(el('p', `${rotulo}: ${valor}`));
}
export function apresentarRegistroTurno(registro: RegistroExecucaoPublico) {
  const artigo = el('article');
  artigo.className = 'turno-execucao__registro';
  const conteudo = registro.conteudo;
  artigo.append(el('h4', `${rotulosClasse[conteudo.classe]} · versão ${registro.versao}`));
  linha(
    artigo,
    'Registrador',
    registro.registrador_nome ?? 'Registrador sem identificação disponível',
  );
  linha(artigo, 'Registrado pelo sistema em', dataTurno(registro.criado_em));
  linha(artigo, 'Instante informado', dataTurno(registro.instante_ocorrencia));
  if (registro.retificada) artigo.append(el('p', 'Versão anterior preservada no histórico.'));
  if (conteudo.classe === 'afericao') {
    linha(
      artigo,
      rotuloSinal(conteudo.dados.tipo),
      `${conteudo.dados.valor} ${conteudo.dados.unidade}`,
    );
  } else if (conteudo.classe === 'prescricao') {
    for (const [nome, valor] of [
      ['Medicamento transcrito', conteudo.dados.nome],
      ['Dose prescrita', conteudo.dados.dose],
      ['Via prescrita', conteudo.dados.via],
      ['Horários previstos', conteudo.dados.horarios.join(', ')],
      ['Vigência inicial', dataTurno(conteudo.dados.vigencia_inicio)],
      [
        'Vigência final',
        conteudo.dados.vigencia_fim
          ? dataTurno(conteudo.dados.vigencia_fim)
          : 'Não informada na fonte',
      ],
      ['Fonte documental', conteudo.dados.fonte_documental],
    ])
      linha(artigo, nome ?? '', valor ?? '');
  } else if (conteudo.classe === 'administracao') {
    linha(artigo, 'Executor declarado — quem administrou', conteudo.dados.executor.nome);
    linha(artigo, 'Vínculo declarado do executor', conteudo.dados.executor.vinculo);
    linha(artigo, 'Situação', rotulos[conteudo.dados.situacao] ?? conteudo.dados.situacao);
    linha(artigo, 'Versão da prescrição referenciada', String(conteudo.dados.versao));
    if (conteudo.dados.motivo) linha(artigo, 'Motivo da situação', conteudo.dados.motivo);
  } else if (conteudo.classe === 'ocorrencia') {
    linha(artigo, 'Descrição', conteudo.dados.descricao);
    linha(artigo, 'Providência tomada', conteudo.dados.providencia);
  } else {
    const dados = conteudo.dados;
    if (dados.tipo === 'refeicao') {
      linha(artigo, 'Momento da refeição', rotulos[dados.momento] ?? dados.momento);
      linha(artigo, 'Aceitação observada', rotulos[dados.aceitacao] ?? dados.aceitacao);
    } else if (dados.tipo === 'hidratacao')
      linha(artigo, 'Hidratação informada', `${dados.mililitros} mL`);
    else if (dados.tipo === 'sono') {
      linha(artigo, 'Início do sono', dataTurno(dados.inicio));
      linha(artigo, 'Fim do sono', dataTurno(dados.fim));
      linha(artigo, 'Qualidade observada', rotulos[dados.qualidade] ?? dados.qualidade);
    } else if (dados.tipo === 'eliminacao') {
      linha(artigo, 'Eliminação', rotulos[dados.eliminacao] ?? dados.eliminacao);
      linha(artigo, 'Contagem observada', String(dados.contagem));
    } else {
      // Estado emocional observado (FR-076): termo declarado, vindo do catálogo
      // administrado. O rótulo diz "observado" de propósito — não é medida, não é escala
      // validada e não há número algum a apresentar.
      linha(artigo, 'Estado emocional observado', rotulos[dados.qualidade] ?? dados.qualidade);
    }
    if (dados.observacao) linha(artigo, 'Observações adicionais', dados.observacao);
  }
  if (registro.motivo) linha(artigo, 'Motivo da retificação', registro.motivo);
  return artigo;
}
export function apresentarRelatorioTurno(relatorio: RelatorioTurnoPublico) {
  const secao = el('section');
  secao.append(
    el(
      'h3',
      relatorio.tipo === 'semanal'
        ? 'Consolidado de sete dias'
        : relatorio.tipo === 'diario'
          ? 'Consolidado diário'
          : relatorio.tipo === 'caso'
            ? 'Exportação do caso'
            : 'Relatório de turno',
    ),
  );
  secao.append(
    el(
      'p',
      `${dataTurno(relatorio.inicio)} a ${dataTurno(relatorio.fim)}. Dados consultados na persistência, conforme sua autorização.`,
    ),
  );
  if (!relatorio.itens.length) secao.append(el('p', 'Nenhum registro neste período.'));
  for (const evento of relatorio.itens) {
    if ('registrador_usuario_id' in evento.dados) {
      secao.append(apresentarRegistroTurno(evento.dados));
    } else if ('aberto_em' in evento.dados) {
      const turno = el('article');
      turno.append(el('h4', 'Turno'));
      linha(turno, 'Abertura registrada', dataTurno(evento.dados.aberto_em));
      if (evento.dados.encerrado_em)
        linha(turno, 'Encerramento registrado', dataTurno(evento.dados.encerrado_em));
      linha(turno, 'Situação', evento.dados.situacao === 'aberto' ? 'Aberto' : 'Encerrado');
      secao.append(turno);
    } else if ('autor_nome' in evento.dados) {
      const passagem = el('article');
      passagem.append(el('h4', 'Passagem de turno'));
      linha(passagem, 'Autor', evento.dados.autor_nome ?? 'Autor sem identificação disponível');
      linha(passagem, 'Publicada em', dataTurno(evento.dados.publicado_em));
      linha(
        passagem,
        'Audiência',
        evento.dados.audiencia === 'equipe' ? 'Equipe' : 'Equipe e família',
      );
      passagem.append(el('p', evento.dados.conteudo));
      secao.append(passagem);
    }
  }
  for (const lacuna of relatorio.lacunas)
    secao.append(
      el('p', `Lacuna de cobertura: ${dataTurno(lacuna.inicio)} a ${dataTurno(lacuna.fim)}.`),
    );
  secao.append(
    el('p', 'Valores apresentados como registrados, sem interpretação clínica automática.'),
  );
  return secao;
}
