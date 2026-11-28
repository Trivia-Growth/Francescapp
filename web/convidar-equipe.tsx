/* Área Administração › Convidar alguém, em página própria (fatia 7 do plano visual).
 *
 * Saiu de `concessao-equipe.tsx`, onde era a segunda metade da tela da Equipe: a conferência
 * de convite pendente e o formulário agora têm rota (`#administracao/convidar-equipe`) e a
 * Equipe voltou a ser só a lista. O protocolo de barreira de
 * `web/ciclo-concessao-equipe.ts` (reservar, confirmar, reconhecer) e os textos da
 * confirmação NÃO mudaram; quem concede continua sendo o servidor, e esconder a rota não é
 * autorizar.
 *
 * Validação: `web/telas/validacao-formulario.ts` — o schema do contrato
 * (`criarConcessaoEquipeSchema`) decide, o erro aparece por campo e o foco vai ao primeiro
 * inválido. O erro é anunciado UMA vez, pelo foco: este arquivo não o repete em região
 * viva. O payload enviado é o `data` do próprio schema, sem remontagem.
 */
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { criarConcessaoEquipeSchema } from '../packages/contracts/src/index.js';
import { descartarLeitura, RECURSO_EQUIPE } from './consultas.js';
import type { ClienteFFCM } from './api.js';
import { criarCicloConcessaoEquipe } from './ciclo-concessao-equipe.js';
import { AreaTexto } from './componentes/ui/area-texto.js';
import { Botao } from './componentes/ui/botao.js';
import { Campo } from './componentes/ui/campo.js';
import { SelecaoAprimorada } from './componentes/ui/selecao-aprimorada.js';
import { Superficie } from './componentes/ui/superficie.js';
import { confirmar } from './confirmacao.js';
import './estilos/tema.css';
import { useValidacaoFormulario } from './telas/validacao-formulario.js';

type ItemEquipe = Awaited<ReturnType<ClienteFFCM['listarProfissionais']>>['itens'][number];

/** As frases por campo. O schema decide se é inválido; aqui só se diz o que fazer. */
const mensagensConvite = {
  email: 'Informe um e-mail válido, com até 254 caracteres.',
  perfil: 'Escolha um perfil.',
  motivo: 'Explique o motivo do acesso, com até 500 caracteres.',
} as const;

/** O indicador de ação em curso que `iniciarAcao` acrescentava ao botão. A mensagem
 *  acessível continua no `role="status"` da tela; isto é só a pintura. */
function Indicador() {
  return <span className="loading-indicator" aria-hidden="true" />;
}

export function TelaConvidarEquipe({ api }: { api: ClienteFFCM }) {
  /* A tela nasce conferindo: o efeito abaixo dispara a conferência na montagem. Declarar o
     estado inicial como "já em curso" mantém a primeira pintura honesta (VIS-014). */
  const [status, definirStatus] = useState('Conferindo se há algum convite aguardando resposta…');
  /* Estado que decisões SÍNCRONAS leem no meio de um fluxo assíncrono — reentrância de
     clique, por exemplo — mora em ref e é espelhado para a renderização. */
  const ocupadaRef = useRef(false);
  const [ocupada, marcarOcupada] = useState(false);
  const definirOcupada = useCallback((valor: boolean) => {
    ocupadaRef.current = valor;
    marcarOcupada(valor);
  }, []);
  const liberadaRef = useRef(false);
  const [liberada, marcarLiberada] = useState(false);
  const definirLiberada = useCallback((valor: boolean) => {
    liberadaRef.current = valor;
    marcarLiberada(valor);
  }, []);
  const { validar, campo, erroGeral } = useValidacaoFormulario(
    criarConcessaoEquipeSchema,
    mensagensConvite,
  );

  /* Um controlador por montagem. O efeito o aborta ao desmontar, e o botão "Conferir
     novamente" reaproveita o mesmo sinal: uma conferência pedida à mão também precisa
     parar de perguntar quando a tela sai. */
  const controladorRef = useRef<AbortController | null>(null);
  controladorRef.current ??= new AbortController();

  const cicloRef = useRef<ReturnType<typeof criarCicloConcessaoEquipe> | null>(null);
  cicloRef.current ??= criarCicloConcessaoEquipe({
    identidadeAtual: () => api.identidadeAtual(),
    consultar: () => api.consultarBarreiraEquipe(),
    reservar: async (entrada) => (await api.reservarBarreiraEquipe(entrada)).estado,
    criar: async ({ entrada, chave, reserva_id, geracao_reserva }) => {
      try {
        return await api.criarConcessaoEquipe(entrada, chave, { reserva_id, geracao_reserva });
      } finally {
        // Concedido, recusado ou incerto: a lista da Equipe guardada pode ter envelhecido, e
        // a volta à Equipe não deve mostrá-la nem pelo instante da releitura.
        const identidade = api.identidadeAtual();
        if (identidade) descartarLeitura(identidade, ...RECURSO_EQUIPE);
      }
    },
    encerrar: async (entrada) => (await api.encerrarBarreiraEquipe(entrada)).estado,
    reconhecer: async (entrada) => (await api.reconhecerBarreiraEquipe(entrada)).estado,
  });
  const ciclo = cicloRef.current;

  const recuperar = useCallback(
    async (sinal: AbortSignal): Promise<void> => {
      if (ocupadaRef.current) return;
      definirOcupada(true);
      definirLiberada(false);
      definirStatus('Conferindo se há algum convite aguardando resposta…');
      try {
        let estado = await ciclo.consultar();
        if (!estado.resultado_pendente) {
          if (
            estado.reserva &&
            !(await confirmar(
              {
                titulo: 'Encerrar a operação em andamento?',
                detalhe:
                  'A operação pode estar aberta em outra aba. Encerrá-la afeta todas as abas desta pessoa.',
                acao: 'Encerrar a operação',
                cancelar: 'Deixar como está',
              },
              sinal,
            ))
          )
            throw new Error();
          await ciclo.encerrar();
          estado = await ciclo.consultar();
        }
        if (estado.resultado_pendente) {
          const resultado = estado.resultado_pendente;
          if (resultado.resultado === 'confirmada') {
            let cursor: string | undefined;
            const vistos = new Set<string>();
            let encontrada: ItemEquipe | undefined;
            do {
              const pagina = await api.listarProfissionais(cursor);
              encontrada = pagina.itens.find(
                (item) => item.id.toLowerCase() === resultado.concessao_id?.toLowerCase(),
              );
              cursor = pagina.proximo_cursor ?? undefined;
              if (cursor && vistos.has(cursor)) throw new Error();
              if (cursor) vistos.add(cursor);
            } while (!encontrada && cursor);
            if (
              !encontrada ||
              !(await confirmar(
                {
                  titulo: `O convite enviado antes para ${encontrada.email} está ${encontrada.estado}, como ${encontrada.perfil}. Confere?`,
                  detalhe:
                    'Confirmar encerra a conferência e libera novos convites. Cancelar mantém a tela conferindo.',
                  acao: 'Confere, pode seguir',
                  cancelar: 'Não confere',
                },
                sinal,
              ))
            )
              throw new Error();
          }
          await ciclo.reconhecer();
          estado = await ciclo.consultar();
        }
        ciclo.liberar();
        definirLiberada(true);
        definirStatus('Tudo conferido. Você já pode convidar alguém da equipe.');
      } catch {
        definirStatus('Não foi possível concluir a conferência. Tente de novo antes de continuar.');
      } finally {
        definirOcupada(false);
      }
    },
    [api, ciclo, definirOcupada, definirLiberada],
  );

  useEffect(() => {
    const controlador = controladorRef.current;
    if (!controlador) return;
    void recuperar(controlador.signal);
    return () => controlador.abort();
  }, [recuperar]);

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!liberadaRef.current || ocupadaRef.current) return;
    const formulario = evento.currentTarget;
    const dados = validar(formulario, { metodo: 'google_workspace' });
    if (!dados) {
      // Sem frase em região viva: o erro é anunciado pelo foco, uma vez.
      definirStatus('');
      return;
    }
    definirOcupada(true);
    definirLiberada(false);
    definirStatus('Enviando…');
    void ciclo
      .criar(dados)
      .then((resultado) => {
        formulario.reset();
        const estados = { pendente: 'Pendente', vinculada: 'Vinculada', revogada: 'Revogada' };
        const perfis = { profissional: 'Profissional', administrador: 'Administrador' };
        definirStatus(
          `Convite ${estados[resultado.estado].toLocaleLowerCase('pt-BR')} para ${perfis[resultado.perfil].toLocaleLowerCase('pt-BR')}. Confira antes de continuar.`,
        );
      })
      .catch(() => {
        definirStatus(
          'Não deu para saber se o convite foi registrado. Confira antes de continuar.',
        );
      })
      .finally(() => definirOcupada(false));
  }

  return (
    <Superficie
      titulo="Convidar alguém da equipe"
      descricao="O convite só é liberado depois que a conferência confirma que nada ficou pendente."
    >
      <form onSubmit={enviar} noValidate>
        <fieldset
          disabled={!liberada || ocupada}
          className="m-0 min-w-0 border-0 p-0 grid gap-4 max-w-[560px]"
        >
          <Campo
            id="equipe-email"
            name="email"
            rotulo="E-mail"
            tipo="email"
            marcaRotulo="obrigatório"
            required
            maxLength={254}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            {...campo('email')}
          />
          <SelecaoAprimorada
            id="equipe-perfil"
            name="perfil"
            rotulo="Perfil"
            defaultValue="profissional"
            {...campo('perfil')}
          >
            <option value="profissional">Profissional</option>
            <option value="administrador">Administrador</option>
          </SelecaoAprimorada>
          <AreaTexto
            id="equipe-motivo"
            name="motivo"
            rotulo="Motivo"
            marcaRotulo="obrigatório"
            required
            maxLength={500}
            {...campo('motivo')}
          />
          <div>
            <Botao peso="principal" tipo="submit" aria-busy={ocupada || undefined}>
              Pré-conceder acesso
              {ocupada ? <Indicador /> : null}
            </Botao>
          </div>
        </fieldset>
        <div className="mt-4 grid gap-2 justify-items-start">
          <Botao
            peso="secundario"
            disabled={ocupada}
            aria-busy={ocupada || undefined}
            aoAtivar={() => {
              const sinal = controladorRef.current?.signal;
              if (sinal) void recuperar(sinal);
            }}
          >
            Conferir novamente
            {ocupada ? <Indicador /> : null}
          </Botao>
          <output className="m-0 text-(length:--texto-1) text-texto-suave block" aria-live="polite">
            {status || erroGeral}
          </output>
        </div>
      </form>
    </Superficie>
  );
}

/** Preparação isolada: não montar até existir capacidade e recuperação entre sessões
 *  comprovadas. */
