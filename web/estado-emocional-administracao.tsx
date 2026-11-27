import {
  gravarEstadoEmocionalSchema,
  type EstadoEmocional,
  type GravarEstadoEmocional,
} from '../packages/contracts/src/estado-emocional.ts';
import type { ServicoEstadoEmocional } from './servico-catalogo-administrado-http.ts';
import { Botao } from './componentes/ui/botao.js';
import { Campo } from './componentes/ui/campo.js';
import { EstadoVazio } from './componentes/ui/estado-vazio.js';
import { MarcaEstado } from './componentes/ui/marca-estado.js';
import { Superficie } from './componentes/ui/superficie.js';
import { Formulario, valorDe } from './telas/formulario.js';
import { MolduraTela } from './telas/moldura-tela.js';
import {
  Recuperacao,
  useCatalogoAdministrado,
  type LeituraRetida,
} from './telas/catalogo-administrado.js';
import { chaveDaSessao, clienteConsultas } from './consultas.js';

/** FR-076/FR-081. Catálogo de estado emocional observado na ficha de plantão. É vocabulário
 * de OBSERVAÇÃO: não há nota, escala, pontuação nem ordem de gravidade, e por isso o registro
 * correspondente também não tem número. Não concede, amplia nem restringe acesso nenhum.
 * Desativar um termo não reescreve ficha antiga, que guarda o rótulo da época. */
function Tela({
  servico,
  leitura,
  acessoPerdido,
}: {
  servico: ServicoEstadoEmocional;
  leitura: LeituraRetida<readonly EstadoEmocional[]>;
  acessoPerdido: (erro: unknown) => void;
}) {
  const catalogo = useCatalogoAdministrado<readonly EstadoEmocional[], GravarEstadoEmocional>(
    servico,
    acessoPerdido,
    {
      carregando: 'Carregando termos de estado emocional…',
      atualizado: 'Catálogo de termos atualizado.',
      salvando: 'Salvando termo…',
    },
    (entrada, termos) =>
      termos.some(
        (termo) =>
          termo.estado_id === entrada.estado_id &&
          termo.versao === entrada.versao_esperada + 1 &&
          termo.estado === entrada.estado &&
          termo.ativo === entrada.ativo,
      ),
    [],
    leitura,
  );
  if (catalogo.perdido) return null;

  const enviar = (entrada: unknown) => {
    if (catalogo.bloqueado) return;
    const dados = gravarEstadoEmocionalSchema.safeParse(entrada);
    if (!dados.success) {
      catalogo.avisar('Informe um termo com 1 a 80 caracteres.');
      return;
    }
    catalogo.enviar(dados.data);
  };

  return (
    <MolduraTela
      titulo="Estado emocional observado"
      explicacao="Termos que o profissional escolhe ao registrar o estado emocional observado na ficha de plantão, como tranquilo, agitado ou comunicativo. São palavras de observação: não existe nota, escala, pontuação nem ordem de gravidade, e o registro guardado não tem número. Desativar um termo não altera ficha já gravada."
      acao={
        // `aria-disabled`, não `disabled`: quem acionou continua com o foco no botão
        // enquanto a consulta corre, e o `Botao` ignora o clique repetido.
        <Botao aria-disabled={catalogo.ocupado} aoAtivar={catalogo.atualizar}>
          Atualizar catálogo de termos
        </Botao>
      }
      status={catalogo.status}
      ocupado={catalogo.ocupado}
      antes={
        <Recuperacao
          alvo={catalogo.tentativa ? `Termo: ${catalogo.tentativa.entrada.estado}` : null}
          podeRepetir={!catalogo.ocupado && catalogo.tentativa?.consultada === true}
          aoRepetir={catalogo.repetir}
        />
      }
    >
      {/* Nada de conteúdo antes da primeira leitura concluída: a região fica
          vazia de propósito e o esqueleto da folha desenha a forma do que vem,
          em vez de oferecer um formulário sobre dados que ainda não existem. */}
      {catalogo.geracao === 0 ? null : (
        <>
          <Superficie titulo="Novo termo" key={`novo-${String(catalogo.geracao)}`}>
            <FormularioTermo bloqueado={catalogo.bloqueado} aoEnviar={enviar} />
          </Superficie>
          <Superficie titulo="Termos do catálogo" plana>
            {catalogo.dados.length === 0 ? (
              // Catálogo vazio impede publicar a ficha quando o campo é preenchido: a submissão
              // é atômica e o banco recusa termo fora do catálogo, derrubando a ficha inteira.
              <EstadoVazio
                titulo="Nenhum termo no catálogo."
                texto="Enquanto estiver vazio, a ficha de plantão não aceita estado emocional. Crie o primeiro termo acima."
              />
            ) : (
              <ul className="m-0 grid list-none gap-2 p-0">
                {catalogo.dados.map((termo) => (
                  <li key={`${termo.estado_id}-${String(termo.versao)}`}>
                    <details className="rounded-cartao border border-borda bg-superficie px-5 py-4">
                      <summary className="flex min-h-controle-md cursor-pointer flex-wrap items-center gap-2 py-2 font-semibold">
                        <span>{termo.estado}</span>
                        <MarcaEstado tom={termo.ativo ? 'padrao' : 'contorno'}>
                          {termo.ativo ? 'ativo' : 'desativado'}
                        </MarcaEstado>
                        {termo.de_fabrica ? (
                          <MarcaEstado tom="suave">de fábrica</MarcaEstado>
                        ) : null}
                      </summary>
                      <div className="grid justify-items-start gap-2 pt-4">
                        <FormularioTermo
                          termo={termo}
                          bloqueado={catalogo.bloqueado}
                          aoEnviar={enviar}
                        />
                        <Botao
                          disabled={catalogo.bloqueado}
                          aoAtivar={() =>
                            enviar({
                              estado_id: termo.estado_id,
                              estado: termo.estado,
                              ativo: !termo.ativo,
                              versao_esperada: termo.versao,
                            })
                          }
                        >
                          {termo.ativo ? 'Desativar termo' : 'Reativar termo'}
                        </Botao>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </Superficie>
        </>
      )}
    </MolduraTela>
  );
}

function FormularioTermo({
  termo,
  bloqueado,
  aoEnviar,
}: {
  termo?: EstadoEmocional;
  bloqueado: boolean;
  aoEnviar: (entrada: unknown) => void;
}) {
  const identificador = `estado-emocional-${termo?.estado_id ?? 'novo'}`;
  return (
    <Formulario
      aoEnviar={(formulario) =>
        aoEnviar({
          estado_id: termo?.estado_id ?? crypto.randomUUID(),
          estado: valorDe(formulario, 'estado'),
          ativo: termo?.ativo ?? true,
          versao_esperada: termo?.versao ?? 0,
        })
      }
    >
      <fieldset disabled={bloqueado} className="m-0 grid justify-items-start gap-2 border-0 p-0">
        <legend className="sr-only">{termo ? `Renomear ${termo.estado}` : 'Novo termo'}</legend>
        <Campo
          id={identificador}
          rotulo="Termo observado"
          name="estado"
          defaultValue={termo?.estado ?? ''}
          required
          maxLength={80}
          classeEnvelope="mb-0 w-full max-w-[42ch]"
        />
        <Botao peso="principal" tipo="submit">
          {termo ? 'Salvar termo' : 'Criar termo'}
        </Botao>
      </fieldset>
    </Formulario>
  );
}

/** Piloto do cache de leituras (`web/consultas.ts`). A lista é vocabulário institucional,
 *  não dado de paciente: volta à tela mostra o que já foi lido, sem novo GET, enquanto a
 *  leitura estiver guardada (`gcTime` padrão, 5 min desde a última). Atualizar, salvar e
 *  repetir releem sempre; consultas simultâneas da mesma chave viram um GET só. */
export function criarTelaEstadoEmocional(
  servico: ServicoEstadoEmocional,
  acessoPerdido: (erro: unknown) => void,
) {
  const queryKey = chaveDaSessao(servico.identidade, 'admin', 'estado-emocional');
  const comCache: ServicoEstadoEmocional = {
    ...servico,
    consultar: () =>
      clienteConsultas.fetchQuery({ queryKey, queryFn: () => servico.consultar(), staleTime: 0 }),
  };
  const leitura: LeituraRetida<readonly EstadoEmocional[]> = {
    retida: () => clienteConsultas.getQueryData<EstadoEmocional[]>(queryKey),
    descartar: () => clienteConsultas.removeQueries({ queryKey, exact: true }),
  };
  return <Tela servico={comCache} leitura={leitura} acessoPerdido={acessoPerdido} />;
}
