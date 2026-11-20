import { FalhaApi } from './api.ts';
import { statusErroHttp } from '../packages/contracts/src/erros.ts';
import type { Turno } from '../packages/contracts/src/turno.ts';
import type {
  ReferenciaPassagem,
  PublicarPassagem,
} from '../packages/contracts/src/turno-passagem.ts';
import { montarCamposSintese } from './modelo-sintese.js';
import type { ServicoTurnoHttp } from './servico-turno-http.ts';

export function montarPassagemTurno(
  raiz: HTMLElement,
  pacienteId: string,
  turno: Turno,
  servico: ServicoTurnoHttp,
  opcoes: {
    acessoPerdido(): void;
    alteracaoPendente?(valor: boolean): void;
    encerrar(registroId: string): Promise<void>;
  },
): () => void {
  let ativa = true;
  let ocupada = false;
  let novaVersao = false;
  let recusaDefinitiva = false;
  let consultaAposRecusa = false;
  let camposRascunho: Record<string, string> | null = null;
  let capturarEditor = () => {};
  let rascunho: PublicarPassagem['conteudo'] | null = null;
  let identidades: { usuario_id: string; rotulo: string | null }[] = [];
  const nome = (id: string) =>
    identidades.find((p) => p.usuario_id === id)?.rotulo ?? 'Identidade histórica indisponível';
  let publicacao: { entrada: PublicarPassagem; chave: string } | null = null;
  let chaveCiencia = crypto.randomUUID();
  let desmontarEditor = () => {};
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const conteudo = document.createElement('div');
  const atualizar = document.createElement('button');
  atualizar.type = 'button';
  atualizar.textContent = 'Consultar passagem';
  atualizar.className = 'button-secondary';
  const descartar = document.createElement('button');
  descartar.type = 'button';
  descartar.textContent = 'Descartar tentativa e editar síntese';
  descartar.className = 'button-secondary';
  descartar.hidden = true;
  raiz.replaceChildren(status, conteudo, atualizar, descartar);
  const data = (iso: string) => new Date(iso).toLocaleString('pt-BR');
  function texto(destino: HTMLElement, valor: string) {
    const p = document.createElement('p');
    p.textContent = valor;
    destino.append(p);
  }
  function referencia(destino: HTMLElement, valor: ReferenciaPassagem) {
    texto(
      destino,
      `Turno iniciado em ${data(valor.turno_aberto_em)}${valor.turno_encerrado_em ? ` e encerrado em ${data(valor.turno_encerrado_em)}` : ' · Ainda aberto'}.`,
    );
    texto(
      destino,
      `Autor: ${nome(valor.autor_usuario_id)} · Publicada em ${data(valor.publicado_em)} · Versão de passagem ${valor.versao_passagem}`,
    );
    for (const [nome, valorCampo] of [
      ['Área', valor.conteudo.area],
      ['Data do atendimento', valor.conteudo.data],
      ['Atividade', valor.conteudo.atividade],
      ['Observações compartilháveis', valor.conteudo.observacoesCompartilhaveis],
      ['Progresso', valor.conteudo.progresso],
      ['Orientação', valor.conteudo.orientacao],
      ['Próximo passo', valor.conteudo.proximoPasso],
      ['Objetivo relacionado', valor.conteudo.objetivoRelacionado],
    ])
      if (valorCampo) texto(destino, `${nome}: ${valorCampo}`);
  }
  function falha(erro: unknown) {
    const codigo = erro && typeof erro === 'object' && 'codigo' in erro ? String(erro.codigo) : '';
    if (codigo === 'sem_permissao' || codigo === 'nao_autenticado') {
      ativa = false;
      desmontarEditor();
      raiz.replaceChildren();
      opcoes.acessoPerdido();
      return;
    }
    recusaDefinitiva =
      erro instanceof FalhaApi &&
      !erro.exigeReautenticacao &&
      ((codigo === 'conflito_versao' && erro.status === statusErroHttp.conflito_versao) ||
        (codigo === 'entrada_invalida' && erro.status === statusErroHttp.entrada_invalida));
    consultaAposRecusa = false;
    status.textContent =
      codigo === 'conflito_versao'
        ? 'A síntese ou o vínculo mudou. Consulte a passagem e publique nova versão explicitamente se necessário. O turno não foi tratado como encerrado.'
        : 'Resultado não confirmado. Consulte a passagem antes de repetir; nenhuma ciência ou publicação foi presumida.';
  }
  async function executar(acao: () => Promise<void>) {
    if (!ativa || ocupada) return;
    ocupada = true;
    atualizar.disabled = descartar.disabled = true;
    raiz.setAttribute('aria-busy', 'true');
    for (const b of conteudo.querySelectorAll('button')) b.disabled = true;
    try {
      await acao();
    } catch (erro) {
      if (ativa) falha(erro);
    } finally {
      ocupada = false;
      if (ativa) {
        atualizar.disabled = descartar.disabled = false;
        descartar.hidden = !publicacao || !recusaDefinitiva || !consultaAposRecusa;
        raiz.setAttribute('aria-busy', 'false');
      }
    }
  }
  async function carregar() {
    if (!publicacao) capturarEditor();
    status.textContent = 'Consultando passagem…';
    const passagem = await servico.consultarPassagem(pacienteId, turno.turno_id);
    if (!ativa) return;
    if (publicacao && recusaDefinitiva) consultaAposRecusa = true;
    identidades = passagem.identidades;
    desmontarEditor();
    capturarEditor = () => {};
    conteudo.replaceChildren();
    texto(
      conteudo,
      'Identificação exibida conforme cadastro disponível; não comprova o nome usado na época do registro.',
    );
    if (passagem.anterior) {
      const anterior = document.createElement('section');
      const titulo = document.createElement('h4');
      titulo.textContent = 'Passagem do turno anterior';
      anterior.append(titulo);
      referencia(anterior, passagem.anterior.referencia);
      if (passagem.anterior.ciencia)
        texto(
          anterior,
          `Ciência registrada por ${nome(passagem.anterior.ciencia.usuario_id)} em ${data(passagem.anterior.ciencia.registrada_em)}.`,
        );
      else {
        texto(
          anterior,
          'Passagem consultada. Ciência ainda pendente; ler esta tela não registra ciência.',
        );
        const ciencia = document.createElement('button');
        ciencia.type = 'button';
        ciencia.className = 'button-primary';
        ciencia.textContent = 'Registrar minha ciência';
        ciencia.addEventListener(
          'click',
          () =>
            void executar(async () => {
              await servico.registrarCiencia(pacienteId, turno.turno_id, chaveCiencia);
              if (!ativa) return;
              chaveCiencia = crypto.randomUUID();
              await carregar();
            }),
        );
        anterior.append(ciencia);
      }
      conteudo.append(anterior);
    } else texto(conteudo, 'Nenhuma passagem anterior destinada a este turno.');
    const titulo = document.createElement('h4');
    titulo.textContent = 'Minha síntese de passagem';
    conteudo.append(titulo);
    if (passagem.propria) {
      if (
        publicacao &&
        passagem.propria.versao_passagem === publicacao.entrada.versao_esperada + 1 &&
        JSON.stringify(passagem.propria.conteudo) === JSON.stringify(publicacao.entrada.conteudo)
      ) {
        publicacao = null;
        rascunho = null;
        camposRascunho = null;
        novaVersao = false;
        opcoes.alteracaoPendente?.(false);
      }
      referencia(conteudo, passagem.propria);
      const recebimento = passagem.recebimento;
      if (recebimento) texto(conteudo, `Destinatário: ${nome(recebimento.usuario_id)}.`);
      texto(
        conteudo,
        !recebimento
          ? 'Aguardando o próximo turno.'
          : recebimento.ciencia
            ? `Consultada${recebimento.consultado_em ? ` em ${data(recebimento.consultado_em)}` : ''}. Ciência registrada por ${nome(recebimento.ciencia.usuario_id)} em ${data(recebimento.ciencia.registrada_em)}.`
            : recebimento.consultado_em
              ? `Consultada em ${data(recebimento.consultado_em)}. Ciência ainda não registrada.`
              : `Enviada a ${nome(recebimento.usuario_id)} no turno seguinte; ainda não consultada.`,
      );
      if (turno.situacao === 'aberto' && !novaVersao && !publicacao) {
        const republicar = document.createElement('button');
        republicar.type = 'button';
        republicar.className = 'button-secondary';
        republicar.textContent = 'Publicar nova versão de passagem';
        republicar.addEventListener('click', () => {
          novaVersao = true;
          void executar(carregar);
        });
        conteudo.append(republicar);
        const confirmar = document.createElement('input');
        confirmar.type = 'checkbox';
        const label = document.createElement('label');
        label.append(
          confirmar,
          document.createTextNode(' Confirmo o encerramento com esta síntese publicada.'),
        );
        const encerrar = document.createElement('button');
        encerrar.type = 'button';
        encerrar.textContent = 'Encerrar meu turno';
        encerrar.className = 'button-primary';
        encerrar.disabled = true;
        confirmar.addEventListener('change', () => {
          encerrar.disabled = !confirmar.checked || ocupada;
        });
        const registroId = passagem.propria.registro_id;
        encerrar.addEventListener('click', () => {
          if (!confirmar.checked) return;
          void executar(() => opcoes.encerrar(registroId));
        });
        conteudo.append(label, encerrar);
      }
    }
    if ((!passagem.propria || novaVersao || publicacao) && !passagem.area_passagem)
      texto(
        conteudo,
        'O modelo por área de passagem ainda não foi configurado pela equipe. Publicação e encerramento indisponíveis.',
      );
    else if (
      (!passagem.propria || novaVersao || publicacao) &&
      turno.situacao === 'aberto' &&
      passagem.area_passagem
    ) {
      const form = document.createElement('form');
      form.noValidate = true;
      const campos = montarCamposSintese(
        form,
        [passagem.area_passagem],
        `passagem-${turno.turno_id}`,
      );
      const valores = publicacao?.entrada.conteudo ?? rascunho;
      if (valores) {
        campos.data.value = valores.data;
        campos.atividade.value = valores.atividade ?? '';
        for (const [campo, valor] of [
          ['observacoes', valores.observacoesCompartilhaveis],
          ['progresso', valores.progresso],
          ['orientacao', valores.orientacao],
          ['proximo', valores.proximoPasso],
          ['objetivo', valores.objetivoRelacionado],
        ]) {
          const controle = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(
            `[id$="-${campo}"]`,
          );
          if (controle) controle.value = valor ?? '';
        }
        if (valores.area !== passagem.area_passagem)
          texto(
            form,
            `Área anterior: ${valores.area}. Confira a área atual antes de enviar nova tentativa.`,
          );
      }
      if (!publicacao && camposRascunho)
        for (const controle of form.querySelectorAll<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >('input,textarea,select')) {
          const valor = camposRascunho[controle.id];
          if (
            valor !== undefined &&
            (!(controle instanceof HTMLSelectElement) ||
              [...controle.options].some((opcao) => opcao.value === valor))
          )
            controle.value = valor;
        }
      texto(
        form,
        'A síntese será publicada no Diário para a equipe e vinculada a este turno na mesma operação.',
      );
      const publicar = document.createElement('button');
      publicar.type = 'submit';
      publicar.className = 'button-primary';
      publicar.textContent = publicacao
        ? 'Repetir publicação pendente'
        : 'Publicar síntese de passagem';
      if (publicacao) {
        texto(
          form,
          'Publicação anterior sem confirmação. A repetição usa os mesmos dados e a mesma chave; consulte antes de repetir.',
        );
        for (const campo of form.querySelectorAll<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >('input,textarea,select'))
          campo.disabled = true;
        if (
          passagem.propria &&
          passagem.propria.versao_passagem !== publicacao.entrada.versao_esperada
        ) {
          publicar.disabled = true;
          texto(
            form,
            'Outra versão está vigente. A tentativa pendente não será reapresentada com versão alterada automaticamente.',
          );
        }
      }
      form.addEventListener('input', () => opcoes.alteracaoPendente?.(true));
      form.append(publicar);
      conteudo.append(form);
      form.addEventListener('submit', (evento) => {
        evento.preventDefault();
        if (ocupada) return;
        const valor = campos.ler();
        if (!publicacao && (!valor || !valor.atividade)) {
          status.textContent = 'Informe data, área e atividade para publicar.';
          campos.atividade.focus();
          return;
        }
        if (!publicacao && valor) {
          recusaDefinitiva = false;
          consultaAposRecusa = false;
          publicacao = {
            entrada: { conteudo: valor, versao_esperada: passagem.propria?.versao_passagem ?? 0 },
            chave: crypto.randomUUID(),
          };
        }
        const comando = publicacao;
        if (!comando) return;
        void executar(async () => {
          await servico.publicarPassagem(
            pacienteId,
            turno.turno_id,
            comando.entrada,
            comando.chave,
          );
          if (!ativa) return;
          await carregar();
        });
      });
      capturarEditor = () => {
        camposRascunho = Object.fromEntries(
          [
            ...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
              'input,textarea,select',
            ),
          ].map((controle) => [controle.id, controle.value]),
        );
      };
      desmontarEditor = () => form.replaceChildren();
    }
    status.textContent = 'Passagem consultada. Ciência exige confirmação própria.';
  }
  descartar.addEventListener('click', () => {
    if (ocupada || !publicacao || !recusaDefinitiva || !consultaAposRecusa) return;
    rascunho = publicacao.entrada.conteudo;
    camposRascunho = null;
    publicacao = null;
    novaVersao = true;
    descartar.hidden = true;
    void executar(carregar);
  });
  atualizar.addEventListener('click', () => void executar(carregar));
  void executar(carregar);
  return () => {
    ativa = false;
    desmontarEditor();
    raiz.replaceChildren();
  };
}
