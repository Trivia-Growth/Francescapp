import {
  salvarSaudeSchema,
  type RegistroSaude,
  type Saude,
} from '../packages/contracts/src/saude.ts';
import { FalhaApi, exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.js';
import { esqueletoCarregando } from './esqueleto.js';

export type ServicoSaude = {
  consultar(pacienteId: string): Promise<Saude | null>;
  salvar(pacienteId: string, versaoEsperada: number, registros: RegistroSaude[]): Promise<Saude>;
};

const TIPOS = [
  ['historico', 'Histórico'],
  ['avaliacao', 'Avaliação'],
  ['diagnostico', 'Diagnóstico'],
] as const;
const NATUREZAS = [
  ['profissional', 'Profissional'],
  ['relato_leigo', 'Relato de quem convive'],
  ['documento', 'Documento'],
] as const;
const SITUACOES = [
  ['confirmado', 'Confirmado'],
  ['hipotese', 'Hipótese'],
] as const;
const rotuloDe = (lista: readonly (readonly [string, string])[], valor: string) =>
  lista.find(([chave]) => chave === valor)?.[1] ?? valor;

/** FR-004: histórico de saúde, avaliações e diagnósticos ou hipóteses.
 * A origem e a natureza ficam sempre visíveis: um relato de quem convive continua
 * identificado como relato, e hipótese nunca é apresentada como diagnóstico fechado.
 * A tela organiza o registro; validação clínica é do profissional habilitado. */
export function montarSaude(
  raiz: HTMLElement,
  pacienteId: string,
  servico: ServicoSaude,
  acessoPerdido: (erro: unknown) => void,
  alteracaoPendente: (pendente: boolean) => void = () => {},
): () => void {
  let ativa = true;
  let versao = 0;
  let conflitoVersao = false;
  let pendente: { registros: RegistroSaude[] } | null = null;
  const descartarAcesso = (erro: unknown): boolean => {
    if (!exigeNovoAcesso(erro)) return false;
    ativa = false;
    pendente = null;
    raiz.replaceChildren();
    acessoPerdido(erro);
    return true;
  };
  const elemento = <K extends keyof HTMLElementTagNameMap>(tipo: K, texto?: string) => {
    const el = document.createElement(tipo);
    if (texto !== undefined) el.textContent = texto;
    return el;
  };
  const status = elemento('p', 'Carregando histórico de saúde…');
  status.setAttribute('role', 'status');
  raiz.replaceChildren(esqueletoCarregando(3, true), status);

  const desenhar = (resultado: Saude | null) => {
    if (!ativa) return;
    versao = resultado?.versao ?? 0;
    const form = elemento('form');
    form.className = 'secao-saude';
    const campos = elemento('div');
    campos.className = 'saude-lista';
    const aviso = elemento('p');
    aviso.setAttribute('role', 'status');
    const salvar = elemento('button', 'Salvar histórico de saúde');
    salvar.type = 'submit';
    const retry = elemento('button', 'Tentar confirmar salvamento');
    retry.type = 'button';
    retry.hidden = true;
    form.append(elemento('h2', 'Histórico de saúde'));
    form.append(
      elemento(
        'p',
        'Registre histórico, avaliações e diagnósticos. A origem fica visível em cada item, e hipótese não vira diagnóstico.',
      ),
    );
    const resumo = elemento('p');
    form.append(resumo, campos);

    type Linha = {
      id: string;
      tipo: HTMLSelectElement;
      descricao: HTMLTextAreaElement;
      origem: HTMLInputElement;
      natureza: HTMLSelectElement;
      data: HTMLInputElement;
      situacao: HTMLSelectElement;
      legenda: HTMLElement;
      grupo: HTMLElement;
    };
    const linhas: Linha[] = [];
    const registroDe = (linha: Linha): RegistroSaude =>
      ({
        id: linha.id,
        tipo: linha.tipo.value,
        descricao: linha.descricao.value,
        origem: linha.origem.value,
        natureza: linha.natureza.value,
        data: linha.data.value,
        situacao: linha.situacao.value,
      }) as RegistroSaude;
    const atualizarResumo = () => {
      if (!linhas.length) {
        resumo.textContent = 'Nenhum registro de saúde. Adicione o primeiro abaixo.';
        return;
      }
      const hipoteses = linhas.filter((l) => l.situacao.value === 'hipotese').length;
      const relatos = linhas.filter((l) => l.natureza.value === 'relato_leigo').length;
      resumo.textContent = `${linhas.length} registro(s); ${hipoteses} em hipótese; ${relatos} vindo(s) de relato de quem convive.`;
    };
    const atualizarLegenda = (linha: Linha) => {
      const natureza = rotuloDe(NATUREZAS, linha.natureza.value);
      const situacao = rotuloDe(SITUACOES, linha.situacao.value);
      linha.legenda.textContent = `${rotuloDe(TIPOS, linha.tipo.value)} — ${natureza} — ${situacao}`;
      linha.grupo.dataset.natureza = linha.natureza.value;
      linha.grupo.dataset.situacao = linha.situacao.value;
    };
    const adicionar = (registro?: RegistroSaude) => {
      const grupo = elemento('fieldset');
      grupo.className = 'saude-item';
      const legenda = elemento('legend');
      grupo.append(legenda);
      const selecionar = (
        rotulo: string,
        opcoes: readonly (readonly [string, string])[],
        valor: string | undefined,
      ) => {
        const campo = elemento('select');
        for (const [chave, texto] of opcoes) {
          const opcao = elemento('option', texto);
          opcao.value = chave;
          campo.append(opcao);
        }
        campo.value = valor ?? opcoes[0]?.[0] ?? '';
        const label = elemento('label', rotulo);
        label.append(campo);
        grupo.append(label);
        return campo;
      };
      const tipo = selecionar('Tipo', TIPOS, registro?.tipo);
      const descricao = elemento('textarea');
      descricao.value = registro?.descricao ?? '';
      descricao.rows = 3;
      const rotularTexto = (rotulo: string, controle: HTMLElement) => {
        const label = elemento('label', rotulo);
        label.append(controle);
        grupo.append(label);
      };
      rotularTexto('Descrição', descricao);
      const origem = elemento('input');
      origem.value = registro?.origem ?? '';
      origem.placeholder = 'Quem informou (profissional, familiar, documento)';
      rotularTexto('Origem', origem);
      const natureza = selecionar('Natureza da origem', NATUREZAS, registro?.natureza);
      const data = elemento('input');
      data.type = 'date';
      data.value = registro?.data ?? '';
      rotularTexto('Data', data);
      const situacao = selecionar('Situação', SITUACOES, registro?.situacao);
      const remover = elemento('button', 'Remover registro');
      remover.type = 'button';
      grupo.append(remover);
      const linha: Linha = {
        id: registro?.id ?? crypto.randomUUID(),
        tipo,
        descricao,
        origem,
        natureza,
        data,
        situacao,
        legenda,
        grupo,
      };
      for (const campo of [tipo, natureza, situacao])
        campo.addEventListener('change', () => {
          atualizarLegenda(linha);
          atualizarResumo();
        });
      remover.addEventListener('click', () => {
        const posicao = linhas.indexOf(linha);
        if (posicao >= 0) linhas.splice(posicao, 1);
        grupo.remove();
        alteracaoPendente(true);
        atualizarResumo();
        aviso.textContent = 'Registro removido do rascunho. Salve para confirmar.';
      });
      linhas.push(linha);
      campos.append(grupo);
      atualizarLegenda(linha);
      atualizarResumo();
      return linha;
    };
    for (const registro of resultado?.registros ?? []) adicionar(registro);
    atualizarResumo();

    const adicionarBotao = elemento('button', 'Adicionar registro');
    adicionarBotao.type = 'button';
    adicionarBotao.addEventListener('click', () => {
      const linha = adicionar();
      alteracaoPendente(true);
      aviso.textContent = '';
      linha.descricao.focus();
    });
    form.append(adicionarBotao, salvar, retry, aviso);

    const enviar = async () => {
      if (!pendente) return;
      salvar.disabled = retry.disabled = adicionarBotao.disabled = true;
      aviso.textContent = 'Salvando histórico de saúde…';
      try {
        const salvo = await servico.salvar(pacienteId, versao, pendente.registros);
        if (!ativa) return;
        pendente = null;
        alteracaoPendente(false);
        desenhar(salvo);
        const mensagem = raiz.querySelector('[role="status"]');
        if (mensagem) mensagem.textContent = 'Histórico de saúde salvo.';
      } catch (erro) {
        if (!ativa || descartarAcesso(erro)) return;
        if (resultadoIncerto(erro)) {
          aviso.textContent =
            'Não foi possível confirmar o salvamento. Tente confirmar antes de editar novamente.';
          retry.hidden = false;
          retry.disabled = false;
        } else {
          pendente = null;
          campos.removeAttribute('inert');
          conflitoVersao = erro instanceof FalhaApi && erro.codigo === 'conflito_versao';
          salvar.disabled = conflitoVersao;
          adicionarBotao.disabled = false;
          retry.hidden = true;
          aviso.textContent = conflitoVersao
            ? 'O histórico foi alterado por outra pessoa. Copie seu rascunho antes de recarregar a página; suas alterações ainda não foram salvas.'
            : mensagemFalha(erro);
        }
      }
    };
    form.addEventListener('input', () => alteracaoPendente(true));
    form.addEventListener('change', () => alteracaoPendente(true));
    form.addEventListener('submit', (evento) => {
      evento.preventDefault();
      if (pendente || conflitoVersao) return;
      const validada = salvarSaudeSchema.safeParse({
        versao_esperada: versao,
        registros: linhas.map(registroDe),
      });
      if (!validada.success) {
        aviso.textContent =
          'Preencha descrição, origem e data de cada registro; confira as datas informadas.';
        const faltando = linhas.find(
          (linha) =>
            !linha.descricao.value.trim() || !linha.origem.value.trim() || !linha.data.value,
        );
        (faltando?.descricao ?? salvar).focus();
        return;
      }
      pendente = { registros: validada.data.registros };
      alteracaoPendente(true);
      campos.setAttribute('inert', '');
      void enviar();
    });
    retry.addEventListener('click', () => {
      void enviar();
    });
    raiz.replaceChildren(form);
  };

  const consultar = () => {
    status.textContent = 'Carregando histórico de saúde…';
    raiz.replaceChildren(esqueletoCarregando(3, true), status);
    void servico
      .consultar(pacienteId)
      .then(desenhar)
      .catch((erro: unknown) => {
        if (!ativa || descartarAcesso(erro)) return;
        status.textContent = mensagemFalha(erro);
        const tentarNovamente = elemento('button', 'Tentar novamente');
        tentarNovamente.type = 'button';
        tentarNovamente.addEventListener('click', consultar);
        raiz.replaceChildren(status, tentarNovamente);
      });
  };
  consultar();
  return () => {
    ativa = false;
    pendente = null;
    raiz.replaceChildren();
  };
}
