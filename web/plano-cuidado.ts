import {
  objetivoSchema,
  type Objetivo,
  type RevisaoObjetivo,
} from '../packages/contracts/src/plano-cuidado.js';
import type { criarCicloPlano } from './ciclo-plano.js';
import { FalhaApi, exigeNovoAcesso, mensagemFalha, resultadoIncerto } from './api.js';

export type ObjetivoAtual = { objetivo_id: string; versao: number; objetivo: Objetivo };
export type VersaoHistoricoObjetivo = ObjetivoAtual & {
  ator_usuario_id: string;
  data: string;
  motivo?: string;
};
export type ServicoPlanoCuidado = {
  consultarHistorico(pacienteId: string, objetivoId: string): Promise<VersaoHistoricoObjetivo[]>;
  consultarObjetivos(pacienteId: string): Promise<ObjetivoAtual[]>;
  ciclo: ReturnType<typeof criarCicloPlano>;
  revisarObjetivo(
    pacienteId: string,
    objetivoId: string,
    versaoEsperada: number,
    revisao: RevisaoObjetivo,
  ): Promise<void>;
};

/** Interface isolada; sua montagem depende da integração segura e das decisões pendentes. */
export function montarPlanoCuidado(
  raiz: HTMLElement,
  pacienteId: string,
  servico: ServicoPlanoCuidado,
  acessoPerdido: (erro: unknown) => void,
  alteracaoPendente: (pendente: boolean) => void = () => {},
): () => void {
  let ativa = true;
  let gravando = false;
  let bloqueada = false;
  let criacaoIncerta = true;
  let recuperando = false;
  const elemento = <K extends keyof HTMLElementTagNameMap>(tipo: K, texto?: string) => {
    const el = document.createElement(tipo);
    if (texto !== undefined) el.textContent = texto;
    return el;
  };
  const perdeuAcesso = (erro: unknown) => {
    if (!exigeNovoAcesso(erro)) return false;
    ativa = false;
    raiz.replaceChildren();
    acessoPerdido(erro);
    return true;
  };
  const consultar = () => {
    const status = elemento('p', 'Carregando plano de cuidado…');
    status.setAttribute('role', 'status');
    raiz.replaceChildren(status);
    void servico
      .consultarObjetivos(pacienteId)
      .then((objetivos) => {
        if (!ativa) return;
        desenhar(objetivos);
      })
      .catch((erro: unknown) => {
        if (!ativa || perdeuAcesso(erro)) return;
        status.textContent = mensagemFalha(erro);
        const tentar = elemento('button', 'Tentar novamente');
        tentar.type = 'button';
        tentar.addEventListener('click', consultar);
        raiz.append(tentar);
      });
  };
  const desenhar = (objetivos: ObjetivoAtual[]) => {
    const secao = elemento('section');
    secao.append(elemento('h2', 'Plano de cuidado'));
    const formulario = elemento('div');
    if (criacaoIncerta) {
      const aviso = elemento(
        'p',
        'Confirme a situação de criação antes de adicionar outro objetivo.',
      );
      aviso.setAttribute('role', 'status');
      const recuperar = elemento('button', 'Confirmar situação de criação');
      recuperar.type = 'button';
      recuperar.dataset.recuperacaoPlano = '';
      recuperar.disabled = recuperando;
      recuperar.onclick = () => {
        if (recuperando || formulario.querySelector('form')) return;
        recuperando = true;
        recuperar.disabled = true;
        aviso.textContent = 'Confirmando situação de criação…';
        void (async () => {
          let situacao = await servico.ciclo.consultar();
          if (!situacao.resultado_pendente) {
            await servico.ciclo.encerrar();
            situacao = await servico.ciclo.consultar();
          }
          if (!ativa) return;
          if (situacao.resultado_pendente) {
            aviso.textContent =
              situacao.resultado_pendente.resultado === 'confirmada'
                ? 'Uma criação anterior foi confirmada. Confira o plano correspondente.'
                : 'Uma criação anterior foi cancelada.';
            recuperar.textContent = 'Reconhecer resultado e liberar criação';
            let reconhecido = false;
            recuperar.onclick = () => {
              if (recuperando || formulario.querySelector('form')) return;
              recuperando = true;
              recuperar.disabled = true;
              void (async () => {
                if (!reconhecido) {
                  await servico.ciclo.reconhecer();
                  reconhecido = true;
                }
                await servico.ciclo.consultar();
                servico.ciclo.liberar();
                if (!ativa) return;
                criacaoIncerta = false;
                bloqueada = false;
                consultar();
              })()
                .catch((erro: unknown) => {
                  if (!ativa || perdeuAcesso(erro)) return;
                  aviso.textContent = 'Não foi possível reconhecer o resultado. Tente novamente.';
                  recuperar.disabled = false;
                })
                .finally(() => {
                  recuperando = false;
                });
            };
            recuperar.disabled = false;
            return;
          }
          servico.ciclo.liberar();
          criacaoIncerta = false;
          bloqueada = false;
          consultar();
        })()
          .catch((erro: unknown) => {
            if (!ativa || perdeuAcesso(erro)) return;
            aviso.textContent = 'Não foi possível confirmar a situação. Tente novamente.';
            recuperar.disabled = false;
          })
          .finally(() => {
            recuperando = false;
          });
      };
      secao.append(aviso, recuperar);
    }
    if (!objetivos.length) secao.append(elemento('p', 'Nenhum objetivo registrado.'));
    const lista = elemento('div');
    const abrir = (atual?: ObjetivoAtual) => {
      if (gravando || bloqueada || recuperando || formulario.querySelector('form')) return;
      const botaoRecuperacao = secao.querySelector<HTMLButtonElement>('[data-recuperacao-plano]');
      if (botaoRecuperacao) botaoRecuperacao.disabled = true;
      const form = elemento('form');
      form.append(elemento('h3', atual ? 'Revisar objetivo' : 'Novo objetivo'));
      const campos = elemento('fieldset');
      campos.append(elemento('legend', 'Dados do objetivo'));
      const criarCampo = (nome: string, tipo: 'input' | 'textarea' = 'input') => {
        const label = elemento('label', nome);
        const controle = elemento(tipo);
        controle.required = true;
        label.append(controle);
        campos.append(label);
        return controle;
      };
      const descricao = criarCampo('Objetivo', 'textarea');
      const area = criarCampo('Área');
      const responsavel = criarCampo('Responsável');
      const situacaoInicial = criarCampo('Situação inicial', 'textarea');
      const observacaoProgresso = criarCampo('Como observar o progresso', 'textarea');
      const dataRevisao = criarCampo('Data de revisão') as HTMLInputElement;
      dataRevisao.type = 'date';
      const labelEstado = elemento('label', 'Estado');
      const estado = elemento('select');
      for (const valor of [
        'proposto',
        'em andamento',
        'atingido',
        'pausado',
        'revisar',
        'encerrado',
      ]) {
        const opcao = elemento('option', valor);
        opcao.value = valor;
        estado.append(opcao);
      }
      labelEstado.append(estado);
      campos.append(labelEstado);
      const motivo = atual ? criarCampo('Motivo da revisão', 'textarea') : null;
      if (atual) {
        const objetivo = atual.objetivo;
        descricao.value = objetivo.descricao;
        area.value = objetivo.area;
        responsavel.value = objetivo.responsavel;
        situacaoInicial.value = objetivo.situacaoInicial;
        observacaoProgresso.value = objetivo.observacaoProgresso;
        dataRevisao.value = objetivo.dataRevisao;
        estado.value = objetivo.estado;
      }
      const salvar = elemento('button', atual ? 'Salvar revisão' : 'Salvar objetivo');
      salvar.type = 'submit';
      const cancelar = elemento('button', 'Cancelar');
      cancelar.type = 'button';
      const aviso = elemento('p');
      aviso.setAttribute('role', 'status');
      const recuperacao = elemento('div');
      const consultarAtual = elemento('button', 'Consultar versão atual');
      consultarAtual.type = 'button';
      consultarAtual.hidden = true;
      consultarAtual.addEventListener('click', () => {
        consultarAtual.disabled = true;
        recuperacao.replaceChildren(elemento('p', 'Consultando plano de cuidado…'));
        void servico
          .consultarObjetivos(pacienteId)
          .then((atuais) => {
            if (!ativa) return;
            recuperacao.replaceChildren(elemento('h4', 'Plano atual'));
            if (!atuais.length) recuperacao.append(elemento('p', 'Nenhum objetivo registrado.'));
            for (const registro of atuais) {
              const item = elemento('article');
              item.append(elemento('h5', registro.objetivo.descricao));
              for (const [rotulo, valor] of [
                ['Área', registro.objetivo.area],
                ['Responsável', registro.objetivo.responsavel],
                ['Situação inicial', registro.objetivo.situacaoInicial],
                ['Como observar o progresso', registro.objetivo.observacaoProgresso],
                ['Data de revisão', registro.objetivo.dataRevisao],
                ['Estado', registro.objetivo.estado],
              ])
                item.append(elemento('p', `${rotulo}: ${valor}`));
              recuperacao.append(item);
            }
            const descartar = elemento('button', 'Descartar rascunho e abrir plano atual');
            descartar.type = 'button';
            descartar.addEventListener('click', () => {
              bloqueada = false;
              alteracaoPendente(false);
              desenhar(atuais);
            });
            recuperacao.append(descartar);
            consultarAtual.disabled = false;
          })
          .catch((erro: unknown) => {
            if (!ativa || perdeuAcesso(erro)) return;
            recuperacao.replaceChildren(elemento('p', mensagemFalha(erro)));
            consultarAtual.disabled = false;
          });
      });
      cancelar.addEventListener('click', () => {
        formulario.replaceChildren();
        if (botaoRecuperacao) botaoRecuperacao.disabled = false;
        alteracaoPendente(false);
      });
      form.addEventListener('input', () => alteracaoPendente(true));
      form.addEventListener('change', () => alteracaoPendente(true));
      form.addEventListener('submit', (evento) => {
        evento.preventDefault();
        if (gravando || bloqueada) return;
        const validado = objetivoSchema.safeParse({
          descricao: descricao.value,
          area: area.value,
          responsavel: responsavel.value,
          situacaoInicial: situacaoInicial.value,
          observacaoProgresso: observacaoProgresso.value,
          dataRevisao: dataRevisao.value,
          estado: estado.value,
        });
        const razao = motivo?.value.trim();
        if (!validado.success || (atual && !razao)) {
          aviso.textContent = 'Preencha todos os campos e confira a data de revisão.';
          return;
        }
        gravando = true;
        campos.disabled = salvar.disabled = cancelar.disabled = true;
        aviso.textContent = 'Salvando objetivo…';
        const operacao = atual
          ? servico.revisarObjetivo(pacienteId, atual.objetivo_id, atual.versao, {
              objetivo: validado.data,
              motivo: razao ?? '',
            })
          : servico.ciclo.criar(pacienteId, validado.data);
        void operacao
          .then(() => {
            if (!ativa) return;
            gravando = false;
            alteracaoPendente(false);
            if (!atual) criacaoIncerta = true;
            consultar();
          })
          .catch((erro: unknown) => {
            if (!ativa || perdeuAcesso(erro)) return;
            gravando = false;
            if (!atual || resultadoIncerto(erro)) {
              bloqueada = true;
              if (!atual) {
                criacaoIncerta = true;
                const confirmar = elemento('button', 'Descartar rascunho e confirmar criação');
                confirmar.type = 'button';
                confirmar.addEventListener('click', () => {
                  alteracaoPendente(false);
                  consultar();
                });
                recuperacao.replaceChildren(confirmar);
              }
              aviso.textContent =
                'Não foi possível confirmar o salvamento. Preserve seu rascunho e consulte a versão atual antes de tentar novamente.';
              campos.disabled = false;
              consultarAtual.hidden = false;
              return;
            }
            const conflito = erro instanceof FalhaApi && erro.codigo === 'conflito_versao';
            bloqueada = conflito;
            consultarAtual.hidden = !conflito;
            campos.disabled = false;
            salvar.disabled = conflito;
            cancelar.disabled = conflito;
            aviso.textContent = conflito
              ? 'O objetivo foi alterado por outra pessoa. Preserve seu rascunho e consulte a versão atual antes de revisar novamente.'
              : mensagemFalha(erro);
          });
      });
      form.append(campos, salvar, cancelar, aviso, consultarAtual, recuperacao);
      formulario.replaceChildren(form);
      descricao.focus();
    };
    for (const atual of objetivos) {
      const item = elemento('article');
      item.append(elemento('h3', atual.objetivo.descricao));
      for (const [rotulo, valor] of [
        ['Área', atual.objetivo.area],
        ['Responsável', atual.objetivo.responsavel],
        ['Situação inicial', atual.objetivo.situacaoInicial],
        ['Como observar o progresso', atual.objetivo.observacaoProgresso],
        ['Data de revisão', atual.objetivo.dataRevisao],
        ['Estado', atual.objetivo.estado],
      ])
        item.append(elemento('p', `${rotulo}: ${valor}`));
      const revisar = elemento('button', 'Revisar objetivo');
      revisar.type = 'button';
      revisar.addEventListener('click', () => abrir(atual));
      const historico = elemento('div');
      const consultarHistorico = elemento('button', 'Consultar histórico');
      consultarHistorico.type = 'button';
      consultarHistorico.addEventListener('click', () => {
        consultarHistorico.disabled = true;
        const status = elemento('p', 'Carregando histórico…');
        status.setAttribute('role', 'status');
        historico.replaceChildren(status);
        void servico
          .consultarHistorico(pacienteId, atual.objetivo_id)
          .then((versoes) => {
            if (!ativa || !raiz.contains(item)) return;
            historico.replaceChildren(elemento('h4', 'Histórico do objetivo'));
            if (!versoes.length) historico.append(elemento('p', 'Nenhuma versão encontrada.'));
            for (const versao of versoes) {
              const registro = elemento('section');
              registro.append(elemento('h5', `Versão ${versao.versao}`));
              for (const [rotulo, valor] of [
                ['Objetivo', versao.objetivo.descricao],
                ['Área', versao.objetivo.area],
                ['Responsável', versao.objetivo.responsavel],
                ['Situação inicial', versao.objetivo.situacaoInicial],
                ['Como observar o progresso', versao.objetivo.observacaoProgresso],
                ['Data de revisão', versao.objetivo.dataRevisao],
                ['Estado', versao.objetivo.estado],
                ['Registrado por', versao.ator_usuario_id],
                ['Data do registro', versao.data],
                ...(versao.motivo ? [['Motivo da revisão', versao.motivo]] : []),
              ])
                registro.append(elemento('p', `${rotulo}: ${valor}`));
              historico.append(registro);
            }
            consultarHistorico.disabled = false;
          })
          .catch((erro: unknown) => {
            if (!ativa || perdeuAcesso(erro) || !raiz.contains(item)) return;
            status.textContent = mensagemFalha(erro);
            consultarHistorico.disabled = false;
          });
      });
      item.append(revisar, consultarHistorico, historico);
      lista.append(item);
    }
    const adicionar = elemento('button', 'Adicionar objetivo');
    adicionar.type = 'button';
    adicionar.disabled = criacaoIncerta;
    adicionar.addEventListener('click', () => abrir());
    secao.append(lista, adicionar, formulario);
    raiz.replaceChildren(secao);
  };
  consultar();
  return () => {
    ativa = false;
    raiz.replaceChildren();
  };
}
