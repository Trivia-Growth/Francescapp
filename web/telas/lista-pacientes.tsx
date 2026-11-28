import { useMemo, useState } from 'react';
import type { FiltrosCarteira, PacienteLista } from '../../packages/contracts/src/cadastro.js';
import { rotulosSituacao, type ResponsavelOpcao } from '../acompanhamento-caso.js';
import { correspondeBuscaPacienteLocal } from '../busca-pacientes-local.js';
import { Botao } from '../componentes/ui/botao.js';
import { EnvelopeCampo, classeControle, descritores } from '../componentes/ui/campo.js';
import { EstadoErro } from '../componentes/ui/estado-erro.js';
import { EstadoVazio } from '../componentes/ui/estado-vazio.js';
import { juntar } from '../componentes/ui/juntar.js';
import { type Coluna, Lista } from '../componentes/ui/lista.js';
import { MarcaEstado } from '../componentes/ui/marca-estado.js';
import { Superficie } from '../componentes/ui/superficie.js';
import { type AoFiltrar, BarraFiltrosCarteira, SinalCarteira } from '../filtros-carteira.js';
import { IndicadoresCarteiraLocal } from '../indicadores-carteira-local.js';

/* A carteira como LISTA (VIS-016), que é a queixa literal do solicitante em 24/11/2026:
 * *"não existe visão de lista de pacientes, lista de profissionais"*.
 *
 * O que muda em relação ao que existe: as mesmas colunas em todas as linhas, sob um
 * cabeçalho que diz o que cada uma é. Antes cada pessoa era um bloco que empilhava nome,
 * preferência, situação e sinal em alturas diferentes conforme o que estivesse
 * preenchido, e comparar duas pessoas exigia reler as duas inteiras.
 *
 * A coluna de situação só existe para quem o servidor autoriza a lê-la — ela simplesmente
 * não vem no registro para os demais perfis. Esconder coluna é conveniência de leitura; a
 * recusa continua no banco. */

export const ROTULO_BUSCA = 'Buscar paciente por nome ou nome preferido';

function rotuloSituacao(paciente: PacienteLista): string | null {
  if (paciente.situacao === undefined) return null;
  return paciente.situacao === null
    ? 'Situação a completar'
    : `Situação: ${rotulosSituacao[paciente.situacao]}`;
}

function colunasDa(pacientes: readonly PacienteLista[]): ReadonlyArray<Coluna<PacienteLista>> {
  const temSituacao = pacientes.some((paciente) => paciente.situacao !== undefined);
  const temSinal = pacientes.some((paciente) => paciente.sinal !== undefined);
  const colunas: Coluna<PacienteLista>[] = [{ titulo: 'Nome', celula: (p) => p.nome }];
  if (temSituacao)
    colunas.push({
      titulo: 'Situação do caso',
      celula: (p) =>
        p.situacao === undefined ? null : (
          <MarcaEstado tom={p.situacao === null ? 'contorno' : 'padrao'}>
            {p.situacao === null ? 'A completar' : rotulosSituacao[p.situacao]}
          </MarcaEstado>
        ),
    });
  colunas.push({
    titulo: 'Nome preferido',
    secundaria: true,
    // Vazio aqui é ausência de dado, não um nome em branco: a frase diz isso por extenso
    // em vez de deixar a célula muda (VIS-014).
    celula: (p) => p.nome_preferencia ?? 'Preferência não informada',
  });
  if (temSinal)
    colunas.push({
      // FR-028: sinal OPERACIONAL, com motivo visível. Nunca uma classificação clínica —
      // o aviso viaja junto do selo, inclusive para quem ouve a tela.
      titulo: 'Sinal operacional',
      secundaria: true,
      celula: (p) => (p.sinal ? <SinalCarteira sinal={p.sinal} /> : null),
    });
  return colunas;
}

export type PropsListaPacientes = {
  pacientes: readonly PacienteLista[];
  /** Consulta em curso: a moldura permanece e só a lista indica carga (VIS-014). */
  carregando?: boolean;
  /** Falha da consulta, em linguagem de quem usa. */
  erro?: string;
  aoTentarNovamente?: () => void;
  /** Quem vê o recorte por responsável e situação; a recusa real continua no servidor. */
  administrador: boolean;
  responsaveis?: readonly ResponsavelOpcao[];
  filtros?: FiltrosCarteira;
  aoFiltrar: AoFiltrar;
  aoAbrir: (paciente: PacienteLista) => void;
  /** Uma linha que não pôde ser apresentada degrada sozinha; isto só registra o caso. */
  aoFalharLinha?: (erro: unknown) => void;
};

export function TelaListaPacientes({
  pacientes,
  carregando = false,
  erro,
  aoTentarNovamente,
  administrador,
  responsaveis,
  filtros,
  aoFiltrar,
  aoAbrir,
  aoFalharLinha,
}: PropsListaPacientes) {
  const [busca, definirBusca] = useState('');
  const visiveis = useMemo(
    () =>
      busca.trim() === ''
        ? pacientes
        : pacientes.filter((paciente) =>
            correspondeBuscaPacienteLocal(
              {
                name: paciente.nome,
                ...(paciente.nome_preferencia ? { preferredName: paciente.nome_preferencia } : {}),
              },
              busca,
            ),
          ),
    [pacientes, busca],
  );
  const colunas = useMemo(() => colunasDa(pacientes), [pacientes]);

  return (
    <Superficie
      titulo="Pessoas em acompanhamento"
      descricao="A busca por nome vale dentro desta página; os filtros recortam a carteira inteira."
    >
      <div className="grid gap-4">
        <BarraFiltrosCarteira
          administrador={administrador}
          {...(responsaveis ? { responsaveis } : {})}
          {...(filtros ? { inicial: filtros } : {})}
          aoFiltrar={aoFiltrar}
        />
        {pacientes.length > 0 ? (
          <>
            <EnvelopeCampo id="busca-carteira" rotulo={ROTULO_BUSCA} className="mb-0">
              <input
                id="busca-carteira"
                type="search"
                value={busca}
                onChange={(evento) => definirBusca(evento.target.value)}
                aria-describedby={descritores('busca-carteira')}
                className={juntar(classeControle)}
              />
            </EnvelopeCampo>
            <IndicadoresCarteiraLocal
              pacientes={pacientes.map((paciente) => ({
                ...(paciente.situacao ? { situacao: paciente.situacao } : {}),
              }))}
            />
          </>
        ) : null}
        {erro === undefined ? null : (
          <EstadoErro
            titulo="Não foi possível consultar a carteira"
            texto={erro}
            acao={
              aoTentarNovamente ? (
                <Botao peso="secundario" marca="tentar-carteira" aoAtivar={aoTentarNovamente}>
                  Tentar novamente
                </Botao>
              ) : undefined
            }
          />
        )}
        {visiveis.length === 0 && !carregando && erro === undefined ? (
          <EstadoVazio
            titulo={
              pacientes.length === 0 ? 'Nenhuma pessoa nesta página' : 'Nenhuma correspondência'
            }
            texto={
              pacientes.length === 0
                ? 'Nenhuma pessoa foi disponibilizada para seu acesso nesta consulta. Confira os filtros ou avance de página.'
                : 'Nenhuma pessoa desta página corresponde ao que você digitou. Limpe a busca para ver todas.'
            }
            {...(pacientes.length === 0
              ? {}
              : {
                  acao: (
                    <Botao peso="secundario" marca="limpar-busca" aoAtivar={() => definirBusca('')}>
                      Limpar busca
                    </Botao>
                  ),
                })}
          />
        ) : (
          <Lista
            itens={visiveis}
            colunas={colunas}
            chave={(paciente) => paciente.id}
            rotulo="Pessoas em acompanhamento"
            carregando={carregando}
            aoAbrir={aoAbrir}
            rotuloDaLinha={(paciente) => {
              const situacao = rotuloSituacao(paciente);
              return situacao
                ? `Abrir ficha de ${paciente.nome}. ${situacao}.`
                : `Abrir ficha de ${paciente.nome}`;
            }}
            {...(aoFalharLinha ? { aoFalharLinha } : {})}
          />
        )}
      </div>
    </Superficie>
  );
}
