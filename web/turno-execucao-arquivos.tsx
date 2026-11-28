/** Fotos privadas de uma ocorrência do turno, em React (VIS-018).
 *
 *  O protocolo não mudou: o envio guarda `anexo_id` e chave de idempotência numa
 *  `tentativa`; resultado incerto mantém a tentativa, que só pode ser repetida IGUAL depois
 *  de consultar todas as páginas de fotos sem encontrá-la; achar a foto na consulta dá a
 *  tentativa por confirmada. Perda de acesso esvazia a superfície e avisa quem a hospeda.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  TAMANHO_MAXIMO_ANEXO_TURNO,
  type RegistroExecucaoPublico,
} from '../packages/contracts/src/turno-execucao-http.ts';
import { resultadoIncerto } from './api.ts';
import { Botao } from './componentes/ui/botao.js';
import './estilos/tema.css';
import { Formulario, valorDe } from './telas/formulario.js';
import type { ServicoTurnoExecucao } from './servico-turno-execucao-http.ts';
import {
  EstadoTurno,
  SelecaoTurno,
  usarEntregaArquivoTurno,
  usarProtocoloTurno,
} from './turno-execucao-campos.js';

type AnexoTurnoPublico = Awaited<ReturnType<ServicoTurnoExecucao['anexos']>>['itens'][number];
type Tentativa = {
  entrada: Parameters<ServicoTurnoExecucao['enviarAnexo']>[0];
  chave: string;
  consultada: boolean;
};
type OpcoesAnexos = {
  podeAnexar: boolean;
  acessoPerdido(erro: unknown): void;
  alteracaoPendente?(valor: boolean): void;
};

const TIPOS_IMAGEM = ['image/jpeg', 'image/png', 'image/webp'] as const;
const AUDIENCIAS = [
  { valor: 'equipe', rotulo: 'Equipe' },
  { valor: 'equipe_e_familia', rotulo: 'Equipe e família com fundamento vigente' },
] as const;

function base64Arquivo(bytes: Uint8Array) {
  let texto = '';
  for (let inicio = 0; inicio < bytes.length; inicio += 8192)
    texto += String.fromCharCode(...bytes.subarray(inicio, inicio + 8192));
  return btoa(texto);
}

export function AnexosOcorrencia({
  registro,
  servico,
  podeAnexar,
  acessoPerdido,
  alteracaoPendente,
}: OpcoesAnexos & { registro: RegistroExecucaoPublico; servico: ServicoTurnoExecucao }) {
  const { viva, ocupadaRef, ocupada, definirOcupada, perdida, falha, status, definirStatus } =
    usarProtocoloTurno('Consulte as fotos desta ocorrência.', acessoPerdido);
  const entrega = usarEntregaArquivoTurno();
  const [fotos, definirFotos] = useState<AnexoTurnoPublico[] | null>(null);
  const [cursor, definirCursor] = useState<string | null>(null);
  const [baixando, definirBaixando] = useState<string | null>(null);
  const tentativaRef = useRef<Tentativa | null>(null);
  const [tentativa, espelharTentativa] = useState<Tentativa | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const pendente = useRef(alteracaoPendente);
  pendente.current = alteracaoPendente;

  const definirTentativa = useCallback((valor: Tentativa | null) => {
    tentativaRef.current = valor;
    espelharTentativa(valor ? { ...valor } : null);
  }, []);

  const carregar = useCallback(
    async (pagina?: string) => {
      if (!viva() || ocupadaRef.current) return;
      definirOcupada(true);
      definirStatus('Consultando fotos…');
      try {
        const resposta = await servico.anexos({
          ocorrencia_id: registro.registro_id,
          ...(pagina ? { cursor_id: pagina } : {}),
        });
        if (!viva()) return;
        definirFotos((atuais) =>
          pagina ? [...(atuais ?? []), ...resposta.itens] : resposta.itens,
        );
        definirCursor(resposta.proximo_cursor);
        const atual = tentativaRef.current;
        if (atual) {
          if (resposta.itens.some((item) => item.anexo_id === atual.entrada.anexo_id)) {
            definirTentativa(null);
            pendente.current?.(false);
          } else if (resposta.proximo_cursor === null)
            definirTentativa({ ...atual, consultada: true });
        }
        definirStatus(
          tentativaRef.current
            ? 'Envio ainda sem confirmação. Após consultar todas as páginas, repita exatamente o mesmo envio.'
            : 'Consulta de fotos concluída.',
        );
      } catch (erro) {
        falha(erro);
      } finally {
        definirOcupada(false);
      }
    },
    [
      viva,
      ocupadaRef,
      definirOcupada,
      definirStatus,
      servico,
      registro.registro_id,
      falha,
      definirTentativa,
    ],
  );

  const enviar = useCallback(async () => {
    const atual = tentativaRef.current;
    if (!viva() || ocupadaRef.current || !atual) return;
    definirOcupada(true);
    definirTentativa({ ...atual, consultada: false });
    definirStatus('Enviando foto privada…');
    try {
      await servico.enviarAnexo(atual.entrada, atual.chave);
      if (!viva()) return;
      definirTentativa(null);
      if (arquivoRef.current) arquivoRef.current.value = '';
      pendente.current?.(false);
      definirOcupada(false);
      await carregar();
    } catch (erro) {
      if (!resultadoIncerto(erro)) definirTentativa(null);
      falha(erro);
    } finally {
      definirOcupada(false);
    }
  }, [viva, ocupadaRef, definirOcupada, definirTentativa, definirStatus, servico, carregar, falha]);

  function baixar(anexoId: string) {
    if (ocupadaRef.current) return;
    definirOcupada(true);
    definirBaixando(anexoId);
    void servico
      .baixarAnexo(anexoId)
      .then((arquivo) => {
        if (viva()) entrega.entregar(arquivo);
      })
      .catch(falha)
      .finally(() => {
        definirOcupada(false);
        if (viva()) definirBaixando(null);
      });
  }

  function aoEnviar(formulario: HTMLFormElement) {
    if (ocupadaRef.current || tentativaRef.current) return;
    const selecionado = arquivoRef.current?.files?.[0];
    const audiencia = valorDe(formulario, 'audiencia');
    if (
      !selecionado ||
      selecionado.size <= 0 ||
      selecionado.size > TAMANHO_MAXIMO_ANEXO_TURNO ||
      !(TIPOS_IMAGEM as readonly string[]).includes(selecionado.type) ||
      !AUDIENCIAS.some((item) => item.valor === audiencia)
    ) {
      definirStatus('Escolha uma imagem válida de até 3 MiB e confirme a audiência.');
      return;
    }
    definirOcupada(true);
    void selecionado
      .arrayBuffer()
      .then((buffer) => {
        if (!viva()) return;
        definirTentativa({
          entrada: {
            anexo_id: crypto.randomUUID(),
            ocorrencia_id: registro.registro_id,
            ocorrencia_versao: registro.versao,
            mime_type: selecionado.type as (typeof TIPOS_IMAGEM)[number],
            tamanho_bytes: selecionado.size,
            audiencia: audiencia as (typeof AUDIENCIAS)[number]['valor'],
            arquivo_base64: base64Arquivo(new Uint8Array(buffer)),
          },
          chave: crypto.randomUUID(),
          consultada: false,
        });
        definirOcupada(false);
        return enviar();
      })
      .catch((erro: unknown) => {
        definirOcupada(false);
        falha(erro);
      });
  }

  // A tentativa não sobrevive à superfície: desmontar descarta a intenção, como antes.
  useEffect(
    () => () => {
      tentativaRef.current = null;
    },
    [],
  );

  if (perdida) return null;

  return (
    <section className="grid min-w-0 gap-3">
      <h4 className="m-0 font-serifada text-(length:--texto-3) font-semibold leading-[1.2]">
        Fotos da ocorrência
      </h4>
      <p className="m-0 max-w-[68ch] text-(length:--texto-2) text-texto-suave">
        Classificação: foto da ocorrência. Repositório privado temporário do Supabase; acesso
        reautorizado a cada download.
      </p>
      <EstadoTurno>{status}</EstadoTurno>
      <div className="grid min-w-0 gap-2">
        {fotos !== null && fotos.length === 0 ? (
          <p className="m-0">Nenhuma foto cadastrada nesta ocorrência.</p>
        ) : null}
        {(fotos ?? []).map((anexo) => (
          <p key={anexo.anexo_id} className="m-0 flex min-w-0 flex-wrap items-center gap-3">
            <span>
              {`Foto ${anexo.mime_type} · ${Math.ceil(anexo.tamanho_bytes / 1024)} KiB · ${anexo.audiencia === 'equipe' ? 'Equipe' : 'Equipe e família'}`}
            </span>
            <Botao disabled={baixando === anexo.anexo_id} aoAtivar={() => baixar(anexo.anexo_id)}>
              Baixar foto
            </Botao>
          </p>
        ))}
        {cursor ? (
          <div>
            <Botao aoAtivar={() => void carregar(cursor)}>Próxima página de fotos</Botao>
          </div>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-wrap gap-3">
        <Botao disabled={ocupada} aoAtivar={() => void carregar()}>
          Consultar fotos
        </Botao>
        <Botao
          hidden={tentativa === null}
          disabled={ocupada || !tentativa?.consultada}
          aoAtivar={() => {
            if (tentativaRef.current?.consultada) void enviar();
          }}
        >
          Repetir o mesmo envio de foto
        </Botao>
      </div>
      {podeAnexar ? (
        <Formulario
          className="grid min-w-0 gap-3"
          aoEnviar={aoEnviar}
          onInput={() => pendente.current?.(true)}
        >
          <fieldset
            disabled={ocupada || tentativa !== null}
            className="m-0 grid min-w-0 gap-2 rounded-cartao border border-borda p-4"
          >
            <legend className="px-1 text-(length:--texto-2) font-semibold">
              Foto privada da ocorrência
            </legend>
            <label className="grid min-w-0 gap-2 text-(length:--texto-2) font-semibold">
              Arquivo de imagem (JPEG, PNG ou WebP, até 3 MiB)
              <input
                ref={arquivoRef}
                type="file"
                name="arquivo"
                accept={TIPOS_IMAGEM.join(',')}
                required
                className="min-w-0 font-normal"
              />
            </label>
            <SelecaoTurno
              rotulo="Audiência confirmada para a foto"
              nome="audiencia"
              opcoes={AUDIENCIAS}
            />
            <div className="flex min-w-0 flex-wrap gap-3">
              <Botao tipo="submit" peso="principal">
                Enviar foto privada
              </Botao>
            </div>
          </fieldset>
        </Formulario>
      ) : null}
    </section>
  );
}
