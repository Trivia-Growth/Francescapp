/* Contatos do paciente (telefone/e-mail) no painel React da ficha.
 *
 * O que NÃO mudou, de propósito (VIS-018):
 *
 * - **Nenhuma frase mudou de palavra.**
 * - A ficha captura a identidade ao compor a seção. Sem sessão, o formulário
 *   não monta.
 * - `verificarIdentidade` continua lançando — nunca chamando `acessoPerdido` sozinha — e
 *   continua limpando a tela (lista e campo) ANTES de lançar; quem decide avisar é sempre
 *   quem a chama, como antes.
 * - A reconciliação (`reconciliar`) continua disparada sozinha na montagem, e de novo a
 *   cada clique em "Conferir novamente" e a cada criação bem-sucedida. Resultado pendente
 *   de OUTRO paciente nunca é reconhecido, e a tela nunca repete o `paciente_id` recebido.
 * - Uma falha comum de envio mantém a trava de escrita (`bloqueada`) — só a conferência
 *   pode reabri-la; é o mesmo desenho de "qualquer falha aqui passa pela barreira" que
 *   `tarefas-cuidado.tsx`/`plano-cuidado.tsx` documentam para os próprios protocolos.
 *
 * **O campo "valor" é NÃO controlado** (o DOM é quem tem o valor, como na versão
 * imperativa) porque ele precisa ser limpo programaticamente após uma criação bem-
 * sucedida — por isso usa `EnvelopeCampo` com uma referência direta ao `<input>`, em vez
 * de `Campo` (que não aceita `ref`, armadilha já medida nesta frente). O seletor de tipo é
 * CONTROLADO: nenhuma prova crua atribui `.value` nele, e ser controlado é o que já
 * deriva o rótulo/tipo/tamanho do campo "valor" sem duplicar o estado em dois lugares.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { consultaBarreiraContatoSchema } from '../packages/contracts/src/barreira-contato.js';
import { novoContatoSchema, type PacienteAdministrativo } from '../packages/contracts/src/index.js';
import { exigeNovoAcesso, FalhaApi, mensagemFalha, type ClienteFFCM } from './api.js';
import { Botao } from './componentes/ui/botao.js';
import { classeControle, EnvelopeCampo } from './componentes/ui/campo.js';
import { Esqueleto } from './componentes/ui/esqueleto.js';
import { EstadoVazio } from './componentes/ui/estado-vazio.js';
import { SelecaoAprimorada } from './componentes/ui/selecao-aprimorada.js';
import { Superficie } from './componentes/ui/superficie.js';
import { criarCicloContato } from './ciclo-contato.js';
import { confirmar } from './confirmacao.js';
import './estilos/tema.css';
import { Formulario } from './telas/formulario.js';

type Identidade = { usuario_id: string; session_id: string };
type ResultadoPendenteContato = NonNullable<
  ReturnType<typeof consultaBarreiraContatoSchema.parse>['resultado_pendente']
>;
type ContatoAdministrativo = PacienteAdministrativo['contatos'][number];

type ListaConteudo =
  | { tipo: 'carregando' }
  | { tipo: 'limpo' }
  | { tipo: 'atualizando' }
  | { tipo: 'vazio' }
  | { tipo: 'erro'; texto: string }
  | { tipo: 'lista'; contatos: readonly ContatoAdministrativo[] };

export function TelaContatoPaciente({
  pacienteId,
  api,
  identidade,
  acessoPerdido,
  alteracaoPendente,
}: {
  pacienteId: string;
  api: ClienteFFCM;
  identidade: Identidade;
  acessoPerdido: (erro: unknown) => void;
  alteracaoPendente: (pendente: boolean) => void;
}) {
  const [listaConteudo, definirListaConteudo] = useState<ListaConteudo>({ tipo: 'carregando' });
  const [bloqueada, definirBloqueada] = useState(true);
  const [recuperarVisivel, definirRecuperarVisivel] = useState(false);
  const [recuperarOcupado, definirRecuperarOcupado] = useState(false);
  const [status, definirStatus] = useState('');
  const [tipoContato, definirTipoContato] = useState<'telefone' | 'email'>('telefone');

  const valorRef = useRef<HTMLInputElement>(null);
  const apiAtual = useRef(api);
  apiAtual.current = api;
  const avisarPerda = useRef(acessoPerdido);
  avisarPerda.current = acessoPerdido;
  const avisarPendente = useRef(alteracaoPendente);
  avisarPendente.current = alteracaoPendente;

  /* Bookkeeping PURO do protocolo — nunca lido na tela, por isso vive em ref e não em
     estado: ler o `useState` nos pontos em que são usados devolveria o valor do render
     anterior, no meio de um fluxo assíncrono. */
  const contatosAtualizadosRef = useRef(false);
  const identidadeInvalidadaRef = useRef(false);
  const etapaRef = useRef<'encerrar' | 'reconhecer' | null>(null);
  const contatoConfirmadoRef = useRef(false);
  const resultadoPendenteRef = useRef<ResultadoPendenteContato | null>(null);

  const cicloRef = useRef<ReturnType<typeof criarCicloContato> | null>(null);
  cicloRef.current ??= criarCicloContato({
    identidadeAtual: () => apiAtual.current.identidadeAtual(),
    consultar: () => apiAtual.current.consultarBarreiraContato(),
    reservar: async (entrada) => (await apiAtual.current.reservarBarreiraContato(entrada)).estado,
    criar: ({ entrada, paciente_id, chave, reserva_id, geracao_reserva }) =>
      apiAtual.current.criarContato(paciente_id, entrada, chave, { reserva_id, geracao_reserva }),
    encerrar: async (entrada) => (await apiAtual.current.encerrarBarreiraContato(entrada)).estado,
    reconhecer: async (entrada) =>
      (await apiAtual.current.reconhecerBarreiraContato(entrada)).estado,
  });
  const ciclo = cicloRef.current;

  /** Lança sempre que a sessão capturada na montagem não bate mais com a atual — e LIMPA
   *  a tela (lista e campo) ANTES de lançar, para o conteúdo nunca ficar visível atrás do
   *  fluxo de nova entrada. Nunca chama `acessoPerdido` sozinha: quem chama decide. */
  const verificarIdentidade = useCallback((): void => {
    let atualApi: ReturnType<ClienteFFCM['identidadeAtual']> = null;
    try {
      atualApi = apiAtual.current.identidadeAtual();
    } catch {
      // Falha ao consultar identidade não comprova sessão vigente.
    }
    if (
      identidadeInvalidadaRef.current ||
      !atualApi ||
      atualApi.usuario_id.toLowerCase() !== identidade.usuario_id.toLowerCase() ||
      atualApi.session_id.toLowerCase() !== identidade.session_id.toLowerCase()
    ) {
      identidadeInvalidadaRef.current = true;
      contatosAtualizadosRef.current = false;
      flushSync(() => {
        definirListaConteudo({ tipo: 'limpo' });
        definirBloqueada(true);
      });
      if (valorRef.current) valorRef.current.value = '';
      throw new FalhaApi('nao_autenticado', 401);
    }
  }, [identidade]);

  const mostrarContatos = useCallback(
    (paciente: PacienteAdministrativo) => {
      verificarIdentidade();
      if (paciente.id.toLowerCase() !== pacienteId.toLowerCase())
        throw new Error('Paciente divergente');
      flushSync(() => {
        definirListaConteudo(
          paciente.contatos.length === 0
            ? { tipo: 'vazio' }
            : { tipo: 'lista', contatos: paciente.contatos },
        );
      });
      contatosAtualizadosRef.current = true;
    },
    [verificarIdentidade, pacienteId],
  );

  /** Confere o resultado pendente contra o contato realmente gravado — nunca aceita o
   *  recibo como prova por si só (FR aplicável de conferência de barreira). */
  const conferirResultado = useCallback(async (): Promise<void> => {
    const pendente = resultadoPendenteRef.current;
    if (!pendente) throw new Error('Resultado indisponível');
    if (pendente.paciente_id.toLowerCase() !== pacienteId.toLowerCase())
      throw new Error('Outro paciente');
    if (pendente.resultado === 'confirmada') {
      verificarIdentidade();
      const paciente = await apiAtual.current.consultarPaciente(pacienteId);
      mostrarContatos(paciente);
      const contato = paciente.contatos.find(
        (item) => item.id.toLowerCase() === pendente.contato_id?.toLowerCase(),
      );
      if (
        !contato ||
        !(await confirmar({
          titulo: `Este contato foi adicionado antes — ${contato.tipo === 'email' ? 'e-mail' : 'telefone'}: ${contato.valor}. Confere?`,
          detalhe:
            'Confirmar encerra a conferência e libera novos contatos. Cancelar mantém a tela conferindo.',
          acao: 'Confere, pode seguir',
          cancelar: 'Não confere',
        }))
      )
        throw new Error('Conferência necessária');
      contatoConfirmadoRef.current = true;
    }
  }, [pacienteId, verificarIdentidade, mostrarContatos]);

  const reconciliar = useCallback(async (): Promise<void> => {
    definirBloqueada(true);
    definirRecuperarOcupado(true);
    definirStatus('Conferindo os contatos…');
    try {
      if (!etapaRef.current) {
        const estado = await ciclo.consultar();
        resultadoPendenteRef.current = estado.resultado_pendente;
        etapaRef.current = estado.resultado_pendente ? 'reconhecer' : 'encerrar';
        if (
          estado.reserva &&
          !(await confirmar({
            titulo: 'Encerrar a tentativa em andamento?',
            detalhe:
              'A tentativa pode estar aberta em outra aba. Encerrá-la afeta todas as abas desta pessoa.',
            acao: 'Encerrar a tentativa',
            cancelar: 'Deixar como está',
          }))
        ) {
          etapaRef.current = null;
          throw new Error('Encerramento não confirmado');
        }
      }
      if (etapaRef.current === 'reconhecer') {
        await conferirResultado();
        await ciclo.reconhecer();
        resultadoPendenteRef.current = null;
      } else {
        await ciclo.encerrar();
      }
      etapaRef.current = null;
      const atualizado = await ciclo.consultar();
      if (atualizado.resultado_pendente) {
        resultadoPendenteRef.current = atualizado.resultado_pendente;
        etapaRef.current = 'reconhecer';
        await conferirResultado();
        await ciclo.reconhecer();
        resultadoPendenteRef.current = null;
        etapaRef.current = null;
        await ciclo.consultar();
      }
      if (!contatosAtualizadosRef.current) {
        verificarIdentidade();
        mostrarContatos(await apiAtual.current.consultarPaciente(pacienteId));
      }
      ciclo.liberar();
      flushSync(() => {
        definirBloqueada(false);
        definirRecuperarVisivel(false);
        definirStatus(
          contatoConfirmadoRef.current
            ? 'O contato enviado antes foi adicionado. Confira a lista antes de adicionar outro.'
            : 'Tudo conferido. Você já pode adicionar um contato.',
        );
      });
      contatoConfirmadoRef.current = false;
    } catch (erro) {
      try {
        verificarIdentidade();
      } catch (identidadeErro) {
        avisarPerda.current(identidadeErro);
        return;
      }
      if (exigeNovoAcesso(erro)) {
        flushSync(() => definirListaConteudo({ tipo: 'limpo' }));
        avisarPerda.current(erro);
      }
      flushSync(() => {
        if (!contatosAtualizadosRef.current)
          definirListaConteudo({ tipo: 'erro', texto: 'Não foi possível carregar os contatos.' });
        definirRecuperarVisivel(true);
        definirStatus(
          'Não foi possível concluir a conferência. Se o envio foi de outro paciente, abra o cadastro dele antes de continuar.',
        );
      });
    } finally {
      definirRecuperarOcupado(false);
    }
  }, [ciclo, conferirResultado, verificarIdentidade, mostrarContatos, pacienteId]);

  const reconciliarRef = useRef(reconciliar);
  reconciliarRef.current = reconciliar;
  useEffect(() => {
    void reconciliarRef.current();
  }, []);

  function enviarContato(formulario: HTMLFormElement) {
    if (bloqueada) return;
    const entrada = novoContatoSchema.safeParse({
      tipo: tipoContato,
      valor: valorRef.current?.value ?? '',
    });
    if (!entrada.success) {
      definirStatus('Informe um telefone ou e-mail válido.');
      valorRef.current?.focus();
      return;
    }
    definirBloqueada(true);
    contatosAtualizadosRef.current = false;
    definirListaConteudo({ tipo: 'atualizando' });
    avisarPendente.current(true);
    definirStatus('Adicionando contato…');
    void ciclo.criar(pacienteId, entrada.data).then(
      (paciente) => {
        mostrarContatos(paciente);
        if (valorRef.current) valorRef.current.value = '';
        avisarPendente.current(false);
        void reconciliar();
      },
      (erro: unknown) => {
        try {
          verificarIdentidade();
        } catch (identidadeErro) {
          avisarPerda.current(identidadeErro);
          return;
        }
        if (exigeNovoAcesso(erro)) {
          flushSync(() => definirListaConteudo({ tipo: 'limpo' }));
          avisarPerda.current(erro);
          return;
        }
        flushSync(() => {
          definirStatus(mensagemFalha(erro));
          definirRecuperarVisivel(true);
        });
      },
    );
  }

  return (
    <div className="grid min-w-0 gap-6">
      <Superficie titulo="Contatos cadastrados">
        {listaConteudo.tipo === 'carregando' ? (
          <Esqueleto ocupado />
        ) : listaConteudo.tipo === 'limpo' ? null : listaConteudo.tipo === 'atualizando' ? (
          <p className="m-0 text-(length:--texto-1) text-texto-suave">Atualizando contatos…</p>
        ) : listaConteudo.tipo === 'erro' ? (
          <p className="m-0 text-(length:--texto-1) text-texto-suave">{listaConteudo.texto}</p>
        ) : listaConteudo.tipo === 'vazio' ? (
          <EstadoVazio titulo="Nenhum contato cadastrado." />
        ) : (
          <ul className="m-0 grid min-w-0 gap-2 list-none p-0">
            {listaConteudo.contatos.map((contato) => (
              <li key={contato.id} className="min-w-0 text-(length:--texto-2)">
                {`${contato.tipo === 'email' ? 'E-mail' : 'Telefone'}: ${contato.valor}`}
              </li>
            ))}
          </ul>
        )}
      </Superficie>

      <Superficie titulo="Novo contato">
        <Formulario aoEnviar={enviarContato} noValidate className="grid min-w-0 gap-4">
          <fieldset disabled={bloqueada} className="m-0 grid min-w-0 gap-4 border-0 p-0">
            <legend className="px-0 font-serifada text-(length:--texto-3) font-semibold leading-[1.2]">
              Novo contato
            </legend>
            <SelecaoAprimorada
              id="contato-tipo"
              rotulo="Tipo de contato"
              value={tipoContato}
              onChange={(evento) => {
                definirTipoContato(evento.currentTarget.value as 'telefone' | 'email');
                avisarPendente.current(true);
              }}
            >
              <option value="telefone">Telefone</option>
              <option value="email">E-mail</option>
            </SelecaoAprimorada>
            <EnvelopeCampo
              id="contato-valor"
              rotulo={tipoContato === 'email' ? 'E-mail' : 'Telefone'}
            >
              <input
                ref={valorRef}
                id="contato-valor"
                name="valor"
                type={tipoContato === 'email' ? 'email' : 'tel'}
                maxLength={tipoContato === 'email' ? 254 : 32}
                required
                autoComplete="off"
                className={classeControle}
                onInput={() => avisarPendente.current(true)}
              />
            </EnvelopeCampo>
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <Botao peso="principal" tipo="submit" disabled={bloqueada}>
              Adicionar contato
            </Botao>
            {recuperarVisivel ? (
              <Botao
                peso="secundario"
                disabled={recuperarOcupado}
                aria-busy={recuperarOcupado || undefined}
                aoAtivar={() => void reconciliar()}
              >
                Conferir novamente
              </Botao>
            ) : null}
          </div>
          {/* biome-ignore lint/a11y/useSemanticElements: `role="status"` é o gancho que as provas e os leitores de tela procuram. */}
          <p
            role="status"
            aria-live="polite"
            className="m-0 max-w-[68ch] text-(length:--texto-1) text-texto-suave empty:hidden"
          >
            {status}
          </p>
        </Formulario>
      </Superficie>
    </div>
  );
}
