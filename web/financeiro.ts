import { esqueletoCarregando, iniciarAcao } from './esqueleto.js';
import type {
  ApuracaoRepasse,
  DespesaVersao,
  ValorAcordado,
} from '../packages/contracts/src/index.ts';
import {
  MIMES_COMPROVANTE,
  TAMANHO_MAXIMO_COMPROVANTE_BYTES,
} from '../packages/contracts/src/financeiro.ts';
import { nomeComprovante, type ServicoFinanceiro } from './servico-financeiro-http.js';
import { botao as botaoDaCamada } from './ui/basicos.js';

/** Valor é inteiro em centavos no contrato. A conversão vive só aqui: nenhuma tela manda
 * número com vírgula para o servidor, e nenhum contrato carrega texto formatado. */
export function formatarCentavos(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Aceita "1234,56", "1234.56" e "1234". Recusa qualquer outra coisa devolvendo null — não
 * arredonda, não adivinha e não aceita número negativo ou com mais de dois decimais. */
export function lerCentavos(texto: string): number | null {
  const limpo = texto.trim().replace(/\s/g, '').replace(/^R\$/, '');
  if (!/^\d{1,9}([.,]\d{1,2})?$/.test(limpo)) return null;
  const [inteiro, decimal = ''] = limpo.replace(',', '.').split('.');
  const centavos = Number(inteiro) * 100 + Number(decimal.padEnd(2, '0'));
  return Number.isSafeInteger(centavos) && centavos > 0 ? centavos : null;
}

const SITUACOES: Record<string, string> = {
  apurada: 'Apurada',
  pendente_resolucao: 'Turno em aberto, pendente de resolução',
  pendente_valor: 'Sem valor vigente na data',
};

type Aba = 'valores' | 'despesas' | 'apuracao';

function campo(
  rotulo: string,
  tipo: string,
  extras: Partial<HTMLInputElement> & { inputMode?: string } = {},
): { bloco: HTMLElement; entrada: HTMLInputElement } {
  const bloco = document.createElement('p');
  bloco.className = 'financeiro__campo';
  const entrada = document.createElement('input');
  entrada.type = tipo;
  entrada.id = `financeiro-${rotulo.toLowerCase().replace(/[^a-z]+/g, '-')}-${Math.random().toString(36).slice(2, 8)}`;
  Object.assign(entrada, extras);
  const texto = document.createElement('label');
  texto.htmlFor = entrada.id;
  texto.textContent = rotulo;
  bloco.append(texto, entrada);
  return { bloco, entrada };
}

/** Financeiro do cuidado (FR-068, FR-069, FR-070): valor acordado por turno, despesa do caso
 * com comprovante e apuração de repasse por período.
 *
 * Três regras de apresentação que são requisito, não estilo:
 *
 * - Estado vazio só aparece DEPOIS de uma consulta que voltou com sucesso. Erro nunca mostra
 *   lista vazia, nunca mostra dado de exemplo e nunca mostra total.
 * - Falha ao gravar despesa não apresenta sucesso e não repete sozinha. A repetição é um
 *   clique explícito que reaproveita o mesmo identificador e a mesma chave de idempotência,
 *   de modo que o banco reconheça a repetição em vez de criar segundo lançamento.
 * - Nenhum valor trafega como texto formatado: a tela formata centavos, o contrato não. */
export function montarFinanceiro(
  raiz: HTMLElement,
  servico: ServicoFinanceiro,
  contexto: { profissionalPadrao?: string; casoPadrao?: string } = {},
): () => void {
  let ativa = true;
  const secao = document.createElement('section');
  secao.className = 'financeiro';
  const titulo = document.createElement('h2');
  titulo.textContent = 'Financeiro do cuidado';
  const explicacao = document.createElement('p');
  explicacao.className = 'financeiro__explicacao';
  explicacao.textContent =
    'Valores combinados por turno, despesas do caso e apuração de repasse. Quem cuida do caso não vê esta área; o acesso vem da concessão financeira e é conferido no servidor a cada consulta.';
  const navegacao = document.createElement('div');
  navegacao.className = 'financeiro__abas';
  navegacao.setAttribute('role', 'tablist');
  const painel = document.createElement('div');
  painel.className = 'financeiro__painel';
  secao.append(titulo, explicacao, navegacao, painel);
  raiz.replaceChildren(secao);

  const abas: { id: Aba; rotulo: string; montar: (destino: HTMLElement) => void }[] = [
    { id: 'valores', rotulo: 'Valor por turno', montar: montarValores },
    { id: 'despesas', rotulo: 'Despesas do caso', montar: montarDespesas },
    { id: 'apuracao', rotulo: 'Apuração', montar: montarApuracao },
  ];
  const botoes = new Map<Aba, HTMLButtonElement>();
  for (const aba of abas) {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'financeiro__aba';
    botao.textContent = aba.rotulo;
    botao.setAttribute('role', 'tab');
    botao.addEventListener('click', () => abrir(aba.id));
    botoes.set(aba.id, botao);
    navegacao.append(botao);
  }
  function abrir(id: Aba) {
    for (const [chave, botao] of botoes)
      botao.setAttribute('aria-selected', chave === id ? 'true' : 'false');
    painel.replaceChildren();
    abas.find((aba) => aba.id === id)?.montar(painel);
  }

  /** Bloco de estados comum às três telas: carregando, erro, vazio e sucesso. O estado vazio
   * é desenhado por `aoVazio`, e só é alcançado quando a consulta devolveu com sucesso. */
  function cicloDeConsulta<T>(
    destino: HTMLElement,
    consultar: () => Promise<T>,
    desenhar: (dados: T, lista: HTMLElement) => 'vazio' | 'cheio',
    textos: { carregando: string; vazio: string; erro: string; botao: string },
  ) {
    const status = document.createElement('p');
    status.className = 'financeiro__status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const lista = document.createElement('div');
    lista.className = 'financeiro__lista';
    const consultarBotao = botaoDaCamada({ rotulo: textos.botao, peso: 'secundario' });
    destino.append(status, consultarBotao, lista);
    const executar = async () => {
      status.textContent = textos.carregando;
      consultarBotao.disabled = true;
      lista.setAttribute('aria-busy', 'true');
      lista.replaceChildren(esqueletoCarregando(3, true));
      const finalizar = iniciarAcao(consultarBotao);
      try {
        const dados = await consultar();
        if (!ativa) return;
        lista.replaceChildren();
        const resultado = desenhar(dados, lista);
        if (resultado === 'vazio') {
          const vazio = document.createElement('p');
          vazio.className = 'financeiro__vazio';
          vazio.textContent = textos.vazio;
          lista.append(vazio);
        }
        status.textContent = resultado === 'vazio' ? textos.vazio : 'Consulta concluída.';
      } catch (erro) {
        if (!ativa) return;
        // Erro NUNCA vira lista vazia nem dado de exemplo: a área de dados fica limpa e o
        // status diz o que aconteceu.
        lista.replaceChildren();
        const codigo =
          erro && typeof erro === 'object' && 'codigo' in erro ? String(erro.codigo) : '';
        status.textContent =
          codigo === 'sem_permissao'
            ? 'Sua conta não tem acesso ao financeiro.'
            : `${textos.erro} Tente consultar de novo.`;
      } finally {
        finalizar();
        lista.removeAttribute('aria-busy');
        if (ativa) consultarBotao.disabled = false;
      }
    };
    consultarBotao.addEventListener('click', () => void executar());
    return { status, lista, executar };
  }

  function montarValores(destino: HTMLElement) {
    const formulario = document.createElement('form');
    formulario.noValidate = true;
    formulario.className = 'financeiro__formulario';
    const profissional = campo('Profissional (identificador)', 'text', {
      required: true,
      autocomplete: 'off',
      value: contexto.profissionalPadrao ?? '',
    });
    formulario.append(profissional.bloco);
    destino.append(formulario);

    const ciclo = cicloDeConsulta<ValorAcordado[]>(
      destino,
      () => servico.listarValores(profissional.entrada.value.trim()),
      (valores, lista) => {
        if (valores.length === 0) return 'vazio';
        for (const valor of valores) {
          const linha = document.createElement('div');
          linha.className = 'financeiro__linha';
          const cabecalho = document.createElement('p');
          cabecalho.className = 'financeiro__destaque';
          cabecalho.textContent = `${formatarCentavos(valor.valor_turno_centavos)} por turno`;
          const vigencia = document.createElement('p');
          vigencia.textContent = valor.vigencia.fim
            ? `Vigente de ${valor.vigencia.inicio} a ${valor.vigencia.fim}`
            : `Vigente desde ${valor.vigencia.inicio}`;
          const motivo = document.createElement('p');
          motivo.className = 'financeiro__secundario';
          motivo.textContent = valor.motivo;
          linha.append(cabecalho, vigencia, motivo);
          lista.append(linha);
        }
        return 'cheio';
      },
      {
        carregando: 'Consultando valores combinados…',
        vazio: 'Nenhum valor combinado registrado para esta pessoa.',
        erro: 'Não foi possível consultar os valores.',
        botao: 'Consultar valores',
      },
    );

    const registro = document.createElement('form');
    registro.noValidate = true;
    registro.className = 'financeiro__formulario';
    const subtitulo = document.createElement('h3');
    subtitulo.textContent = 'Registrar novo valor';
    const dinheiro = campo('Valor por turno', 'text', {
      required: true,
      inputMode: 'decimal',
      autocomplete: 'off',
      placeholder: '0,00',
    });
    dinheiro.entrada.setAttribute('inputmode', 'decimal');
    const inicio = campo('Início da vigência', 'date', { required: true });
    const motivo = campo('Motivo', 'text', { required: true, maxLength: 2000 });
    const salvar = botaoDaCamada({ rotulo: 'Registrar valor', tipo: 'submit', peso: 'principal' });
    const aviso = document.createElement('p');
    aviso.className = 'financeiro__aviso';
    aviso.setAttribute('role', 'status');
    aviso.setAttribute('aria-live', 'polite');
    registro.append(subtitulo, dinheiro.bloco, inicio.bloco, motivo.bloco, salvar, aviso);
    destino.append(registro);

    let tentativa = { valor_id: crypto.randomUUID(), chave: crypto.randomUUID() };
    registro.addEventListener('submit', (evento) => {
      evento.preventDefault();
      const centavos = lerCentavos(dinheiro.entrada.value);
      if (centavos === null) {
        aviso.textContent = 'Informe o valor em reais, com até dois decimais.';
        dinheiro.entrada.focus();
        return;
      }
      salvar.disabled = true;
      aviso.textContent = 'Registrando…';
      const finalizar = iniciarAcao(salvar);
      void servico
        .registrarValor(
          {
            valor_id: tentativa.valor_id,
            profissional_usuario_id: profissional.entrada.value.trim(),
            valor_turno_centavos: centavos,
            vigencia: { inicio: inicio.entrada.value, fim: null },
            motivo: motivo.entrada.value.trim(),
          },
          tentativa.chave,
        )
        .then(() => {
          if (!ativa) return;
          aviso.textContent = 'Valor registrado.';
          tentativa = { valor_id: crypto.randomUUID(), chave: crypto.randomUUID() };
          void ciclo.executar();
        })
        .catch((erro: unknown) => {
          if (!ativa) return;
          const codigo =
            erro && typeof erro === 'object' && 'codigo' in erro ? String(erro.codigo) : '';
          aviso.textContent =
            codigo === 'conflito'
              ? 'Já existe valor vigente nesse período. Encerre a vigência anterior.'
              : codigo === 'sem_permissao'
                ? 'Sua conta não pode registrar valores.'
                : 'Não foi possível registrar. Nada foi salvo com sucesso — confira e tente de novo.';
        })
        .finally(() => {
          finalizar();
          if (ativa) salvar.disabled = false;
        });
    });
  }

  function montarDespesas(destino: HTMLElement) {
    const filtro = document.createElement('form');
    filtro.noValidate = true;
    filtro.className = 'financeiro__formulario';
    const caso = campo('Caso (identificador)', 'text', {
      required: true,
      autocomplete: 'off',
      value: contexto.casoPadrao ?? '',
    });
    filtro.append(caso.bloco);
    destino.append(filtro);

    const ciclo = cicloDeConsulta<DespesaVersao[]>(
      destino,
      () => servico.listarDespesas(caso.entrada.value.trim()),
      (despesas, lista) => {
        if (despesas.length === 0) return 'vazio';
        for (const despesa of despesas) {
          const linha = document.createElement('div');
          linha.className = 'financeiro__linha';
          const cabecalho = document.createElement('p');
          cabecalho.className = 'financeiro__destaque';
          cabecalho.textContent = `${formatarCentavos(despesa.valor_centavos)} — ${despesa.data}`;
          const descricao = document.createElement('p');
          descricao.textContent = despesa.descricao;
          const autorizacao = document.createElement('p');
          autorizacao.className = 'financeiro__secundario';
          autorizacao.textContent = `Autorização: ${despesa.autorizacao}`;
          const versao = document.createElement('p');
          versao.className = 'financeiro__secundario';
          versao.textContent =
            despesa.versao === 1
              ? 'Lançamento original'
              : `Retificação da versão ${despesa.retificacao_de_versao ?? despesa.versao - 1}`;
          linha.append(cabecalho, descricao, autorizacao, versao);
          if (despesa.tem_comprovante) {
            const baixar = botaoDaCamada({ rotulo: 'Abrir comprovante', peso: 'discreto' });
            const retorno = document.createElement('p');
            retorno.className = 'financeiro__aviso';
            retorno.setAttribute('role', 'status');
            retorno.setAttribute('aria-live', 'polite');
            baixar.addEventListener('click', () => {
              baixar.disabled = true;
              retorno.textContent = 'Buscando comprovante…';
              const finalizar = iniciarAcao(baixar);
              void servico
                .baixarComprovante(caso.entrada.value.trim(), despesa.despesa_id)
                .then((blob) => {
                  if (!ativa) return;
                  // Endereço temporário do próprio navegador, revogado em seguida: nenhuma
                  // URL do servidor é emitida, guardada ou compartilhável.
                  const endereco = URL.createObjectURL(blob);
                  const ligacao = document.createElement('a');
                  ligacao.href = endereco;
                  ligacao.download = 'comprovante';
                  ligacao.rel = 'noopener noreferrer';
                  ligacao.click();
                  URL.revokeObjectURL(endereco);
                  retorno.textContent = 'Comprovante baixado.';
                })
                .catch((erro: unknown) => {
                  if (!ativa) return;
                  const codigo =
                    erro && typeof erro === 'object' && 'codigo' in erro ? String(erro.codigo) : '';
                  retorno.textContent =
                    codigo === 'sem_permissao'
                      ? 'Sua conta não pode abrir este comprovante.'
                      : 'Não foi possível abrir o comprovante agora.';
                })
                .finally(() => {
                  finalizar();
                  if (ativa) baixar.disabled = false;
                });
            });
            linha.append(baixar, retorno);
          }
          lista.append(linha);
        }
        return 'cheio';
      },
      {
        carregando: 'Consultando despesas do caso…',
        vazio: 'Nenhuma despesa registrada neste caso.',
        erro: 'Não foi possível consultar as despesas.',
        botao: 'Consultar despesas',
      },
    );

    const registro = document.createElement('form');
    registro.noValidate = true;
    registro.className = 'financeiro__formulario';
    const subtitulo = document.createElement('h3');
    subtitulo.textContent = 'Registrar despesa';
    const descricao = campo('Descrição', 'text', { required: true, maxLength: 2000 });
    const dinheiro = campo('Valor', 'text', {
      required: true,
      autocomplete: 'off',
      placeholder: '0,00',
    });
    dinheiro.entrada.setAttribute('inputmode', 'decimal');
    const data = campo('Data', 'date', { required: true });
    const responsavel = campo('Responsável (identificador)', 'text', { required: true });
    const autorizacao = campo('Autorização aplicável', 'text', { required: true, maxLength: 512 });
    const arquivo = campo('Comprovante', 'file', { required: true });
    arquivo.entrada.accept = MIMES_COMPROVANTE.join(',');
    const salvar = botaoDaCamada({
      rotulo: 'Registrar despesa',
      tipo: 'submit',
      peso: 'principal',
    });
    const repetir = botaoDaCamada({
      rotulo: 'Tentar de novo este mesmo lançamento',
      peso: 'secundario',
    });
    repetir.hidden = true;
    const aviso = document.createElement('p');
    aviso.className = 'financeiro__aviso';
    aviso.setAttribute('role', 'status');
    aviso.setAttribute('aria-live', 'polite');
    registro.append(
      subtitulo,
      descricao.bloco,
      dinheiro.bloco,
      data.bloco,
      responsavel.bloco,
      autorizacao.bloco,
      arquivo.bloco,
      salvar,
      repetir,
      aviso,
    );
    destino.append(registro);

    // Identificador e chave de idempotência da TENTATIVA, não do clique: enquanto o mesmo
    // lançamento não tiver sido confirmado, repetir reusa os dois, e o banco reconhece a
    // repetição em vez de criar segundo lançamento.
    let tentativa = { despesa_id: crypto.randomUUID(), chave: crypto.randomUUID() };
    let emCurso = false;

    const gravar = async () => {
      if (emCurso) return;
      const centavos = lerCentavos(dinheiro.entrada.value);
      const selecionado = arquivo.entrada.files?.[0] ?? null;
      if (centavos === null) {
        aviso.textContent = 'Informe o valor em reais, com até dois decimais.';
        dinheiro.entrada.focus();
        return;
      }
      if (!selecionado) {
        aviso.textContent = 'Anexe o comprovante da despesa.';
        arquivo.entrada.focus();
        return;
      }
      const tipo = MIMES_COMPROVANTE.find((mime) => mime === selecionado.type);
      if (!tipo || selecionado.size === 0 || selecionado.size > TAMANHO_MAXIMO_COMPROVANTE_BYTES) {
        aviso.textContent = 'O comprovante precisa ser JPEG, PNG, WebP ou PDF, de até 5 MB.';
        return;
      }
      emCurso = true;
      salvar.disabled = repetir.disabled = true;
      aviso.textContent = 'Registrando despesa…';
      const finalizar = iniciarAcao(salvar);
      try {
        const bytes = new Uint8Array(await selecionado.arrayBuffer());
        let binario = '';
        for (const byte of bytes) binario += String.fromCharCode(byte);
        const base64 = btoa(binario);
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
        let hex = '';
        for (const byte of digest) hex += byte.toString(16).padStart(2, '0');
        await servico.registrarDespesa(
          {
            despesa_id: tentativa.despesa_id,
            paciente_id: caso.entrada.value.trim(),
            descricao: descricao.entrada.value.trim(),
            valor_centavos: centavos,
            data: data.entrada.value,
            responsavel_usuario_id: responsavel.entrada.value.trim(),
            autorizacao: autorizacao.entrada.value.trim(),
            comprovante: {
              objeto_nome: nomeComprovante(tentativa.despesa_id),
              mime_type: tipo,
              tamanho_bytes: bytes.byteLength,
              digest: hex,
            },
          },
          tentativa.chave,
        );
        await servico.enviarComprovante(
          caso.entrada.value.trim(),
          tentativa.despesa_id,
          { arquivo_base64: base64, mime_type: tipo, tamanho_bytes: bytes.byteLength },
          crypto.randomUUID(),
        );
        if (!ativa) return;
        aviso.textContent = 'Despesa registrada com o comprovante.';
        repetir.hidden = true;
        tentativa = { despesa_id: crypto.randomUUID(), chave: crypto.randomUUID() };
        void ciclo.executar();
      } catch (erro) {
        if (!ativa) return;
        const codigo =
          erro && typeof erro === 'object' && 'codigo' in erro ? String(erro.codigo) : '';
        // Falha NUNCA vira sucesso e NUNCA repete sozinha: quem decide repetir é a pessoa, e
        // a repetição reaproveita o mesmo lançamento.
        aviso.textContent =
          codigo === 'conflito_idempotencia'
            ? 'Este lançamento já foi recebido antes com conteúdo diferente. Confira a lista antes de lançar de novo.'
            : codigo === 'sem_permissao'
              ? 'Sua conta não pode registrar despesas.'
              : 'A despesa não foi salva. Nada foi registrado como concluído; se quiser, tente de novo este mesmo lançamento.';
        repetir.hidden = codigo === 'sem_permissao';
      } finally {
        emCurso = false;
        finalizar();
        if (ativa) salvar.disabled = repetir.disabled = false;
      }
    };

    registro.addEventListener('submit', (evento) => {
      evento.preventDefault();
      void gravar();
    });
    repetir.addEventListener('click', () => void gravar());
  }

  function montarApuracao(destino: HTMLElement) {
    const formulario = document.createElement('form');
    formulario.noValidate = true;
    formulario.className = 'financeiro__formulario';
    const profissional = campo('Profissional (identificador)', 'text', {
      required: true,
      autocomplete: 'off',
      value: contexto.profissionalPadrao ?? '',
    });
    const inicio = campo('Início do período', 'date', { required: true });
    const fim = campo('Fim do período', 'date', { required: true });
    formulario.append(profissional.bloco, inicio.bloco, fim.bloco);
    destino.append(formulario);

    const resumo = document.createElement('p');
    resumo.className = 'financeiro__destaque';
    destino.append(resumo);

    cicloDeConsulta<ApuracaoRepasse>(
      destino,
      () =>
        servico.consultarApuracao({
          profissional_usuario_id: profissional.entrada.value.trim(),
          periodo_inicio: inicio.entrada.value,
          periodo_fim: fim.entrada.value,
        }),
      (apuracao, lista) => {
        resumo.textContent = `Total ${formatarCentavos(apuracao.total_centavos)} — ${apuracao.pendentes} pendência(s) — consultado em ${apuracao.consultado_em}`;
        if (apuracao.linhas.length === 0) return 'vazio';
        for (const linha of apuracao.linhas) {
          const item = document.createElement('div');
          item.className = 'financeiro__linha';
          const valor = document.createElement('p');
          valor.className = 'financeiro__destaque';
          valor.textContent =
            linha.valor_centavos === null ? 'Sem valor' : formatarCentavos(linha.valor_centavos);
          const situacao = document.createElement('p');
          situacao.textContent = SITUACOES[linha.situacao] ?? linha.situacao;
          const turno = document.createElement('p');
          turno.className = 'financeiro__secundario';
          turno.textContent = `Turno ${linha.turno_id}${linha.data ? ` — ${linha.data}` : ''}`;
          item.append(valor, situacao, turno);
          lista.append(item);
        }
        return 'cheio';
      },
      {
        carregando: 'Apurando o período…',
        vazio: 'Nenhum turno no período consultado.',
        erro: 'Não foi possível apurar o período.',
        botao: 'Apurar período',
      },
    );
    // Sem total antes da consulta: o resumo só ganha texto quando a apuração volta.
    resumo.textContent = '';
  }

  abrir('valores');
  return () => {
    ativa = false;
    raiz.replaceChildren();
  };
}
