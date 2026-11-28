/* Vitrine da camada de componente, para conferência visual e captura.
 *
 * Não entra no pacote de produção: `vite build web` tem `index.html` como única entrada,
 * então este arquivo só existe no servidor de desenvolvimento. É andaime de revisão, e sai
 * junto com o resto do andaime na Fase 7. */
import { useEffect, useState } from 'react';
import { Aba, Abas, FaixaAbas, PainelAba } from './componentes/ui/abas';
import { AreaTexto } from './componentes/ui/area-texto';
import { Botao } from './componentes/ui/botao';
import { Campo } from './componentes/ui/campo';
import { Dialogo } from './componentes/ui/dialogo';
import { EstadoErro } from './componentes/ui/estado-erro';
import { EstadoVazio } from './componentes/ui/estado-vazio';
import { type Coluna, Lista, valor } from './componentes/ui/lista';
import { MarcaEstado } from './componentes/ui/marca-estado';
import { SelecaoSimples } from './componentes/ui/selecao-simples';
import { Superficie } from './componentes/ui/superficie';
import { createRoot } from 'react-dom/client';
import { Formulario } from './telas/formulario';

type Pessoa = {
  id: string;
  nome: string;
  situacao: string;
  responsavel: string;
  pendencias: number | null;
};

const pessoas: Pessoa[] = [
  {
    id: '1',
    nome: 'Ana Fictícia Moreira',
    situacao: 'Em acompanhamento',
    responsavel: 'Edilaine',
    pendencias: 2,
  },
  {
    id: '2',
    nome: 'Bruno Fictício Salles',
    situacao: 'Em acompanhamento',
    responsavel: 'Case manager 2',
    pendencias: 0,
  },
  {
    id: '3',
    nome: 'Clara Fictícia Tavares',
    situacao: 'Em pausa',
    responsavel: 'Edilaine',
    pendencias: null,
  },
];

const colunas: ReadonlyArray<Coluna<Pessoa>> = [
  { titulo: 'Nome', celula: (p) => p.nome },
  { titulo: 'Situação', celula: (p) => <MarcaEstado>{p.situacao}</MarcaEstado> },
  { titulo: 'Responsável', celula: (p) => p.responsavel, secundaria: true },
  { titulo: 'Pendências', celula: (p) => valor(p.pendencias), secundaria: true },
];

function Vitrine() {
  const [dialogoAberto, definirDialogo] = useState(false);
  const [longoAberto, definirLongo] = useState(false);
  const [salvando, definirSalvando] = useState(false);
  const [enviosAceitos, definirEnviosAceitos] = useState(0);

  useEffect(() => {
    if (!salvando) return;
    const espera = window.setTimeout(() => definirSalvando(false), 2000);
    return () => window.clearTimeout(espera);
  }, [salvando]);

  return (
    <main className="mx-auto grid max-w-[1100px] gap-6 p-5">
      <header>
        <h1 className="m-0 font-serifada text-(length:--texto-6) font-medium leading-[1.2]">
          Camada de componente
        </h1>
        <p className="mt-2 mb-0 max-w-[68ch] text-texto-suave">
          Tudo abaixo consome os tokens da Francescato. Nenhuma cor literal, nenhuma medida
          inventada.
        </p>
      </header>

      <Superficie
        titulo="Pessoas acompanhadas"
        descricao="Registro é linha, não cartão."
        acao={<Botao peso="principal">Novo paciente</Botao>}
      >
        <Lista
          itens={pessoas}
          colunas={colunas}
          chave={(p) => p.id}
          rotulo="Pessoas acompanhadas"
          aoAbrir={() => undefined}
          rotuloDaLinha={(p) => `Abrir ficha de ${p.nome}`}
        />
        <p className="mt-3 mb-0 text-(length:--texto-1) text-texto-suave">
          Bruno tem <strong>0</strong> pendências, conferido. Clara mostra <strong>—</strong>:
          ninguém sabe. São estados diferentes.
        </p>
      </Superficie>

      <Superficie titulo="Ações">
        <div className="flex flex-wrap items-center gap-3">
          <Botao peso="principal">Ação do assunto</Botao>
          <Botao peso="secundario">Alternativa</Botao>
          <Botao peso="discreto">Comando discreto</Botao>
          <Botao peso="principal" disabled>
            Indisponível
          </Botao>
          <Botao peso="perigo">Remover</Botao>
          <Botao peso="principal" salvando>
            Salvar
          </Botao>
          <Botao peso="secundario" aoAtivar={() => definirDialogo(true)}>
            Abrir diálogo
          </Botao>
          <Botao peso="secundario" aoAtivar={() => definirLongo(true)}>
            Diálogo longo
          </Botao>
        </div>
      </Superficie>

      <Superficie titulo="Marcas de estado">
        <div className="flex flex-wrap items-center gap-sistema-2">
          <MarcaEstado>Em acompanhamento</MarcaEstado>
          <MarcaEstado tom="contorno">Completar cadastro</MarcaEstado>
          <MarcaEstado tom="suave">3 pendências</MarcaEstado>
        </div>
      </Superficie>

      <Superficie titulo="Formulário" descricao="Alvo de toque de 46px; campo de 16px no celular.">
        <Formulario
          aria-label="Prévia de gravação"
          className="grid max-w-formulario gap-4"
          aoEnviar={() => {
            if (salvando) return;
            definirSalvando(true);
            definirEnviosAceitos((quantidade) => quantidade + 1);
          }}
        >
          <Campo
            id="demo-nome"
            rotulo="Nome completo"
            marcaRotulo="obrigatório"
            placeholder="Nome da pessoa"
          />
          <Campo
            id="demo-email"
            rotulo="E-mail"
            tipo="email"
            dica="Usado para o convite de acesso."
          />
          <SelecaoSimples id="demo-perfil" rotulo="Perfil">
            <option>Profissional</option>
            <option>Administrador</option>
          </SelecaoSimples>
          <AreaTexto
            id="demo-motivo"
            rotulo="Motivo"
            linhas={3}
            dica="Fica registrado na auditoria."
          />
          <Campo id="demo-telefone" rotulo="Telefone" erro="Informe um número com DDD." />
          <div className="flex flex-wrap items-center gap-sistema-2">
            <Botao
              peso="principal"
              tipo="submit"
              salvando={salvando}
              className="max-intermediaria:w-full"
            >
              Salvar
            </Botao>
            <output className="text-meta">
              {enviosAceitos > 0 ? `Envios aceitos: ${enviosAceitos}` : ''}
            </output>
          </div>
        </Formulario>
      </Superficie>

      <Superficie titulo="Abas" descricao="Trocar de aba não remonta a página.">
        <Abas defaultValue="anamnese">
          <FaixaAbas>
            <Aba value="anamnese">Anamnese</Aba>
            <Aba value="plano">Plano de cuidado</Aba>
            <Aba value="diario">Diário</Aba>
          </FaixaAbas>
          <PainelAba value="anamnese" className="pt-4">
            <p className="m-0 max-w-[68ch]">Conteúdo fictício da anamnese.</p>
          </PainelAba>
          <PainelAba value="plano" className="pt-4">
            <EstadoVazio
              titulo="Nenhum objetivo registrado"
              texto="Comece pelo que a família definiu como prioridade."
              acao={<Botao peso="principal">Adicionar objetivo</Botao>}
            />
          </PainelAba>
          <PainelAba value="diario" className="pt-4">
            <EstadoErro
              titulo="Não foi possível carregar o diário"
              texto="A consulta não respondeu a tempo."
              acao={<Botao peso="secundario">Tentar novamente</Botao>}
            />
          </PainelAba>
        </Abas>
      </Superficie>

      <Superficie titulo="Avisos">
        <div className="grid gap-3">
          <EstadoErro
            tom="informacao"
            titulo="Esta área não está liberada para o seu acesso"
            texto="Sua sessão continua ativa."
          />
          <EstadoErro
            tom="atencao"
            titulo="Confira antes de continuar"
            texto="O convite ficou pendente de resposta."
          />
          <EstadoErro
            titulo="Não foi possível gravar"
            texto="Nada foi perdido: tente de novo."
            acao={<Botao peso="secundario">Tentar novamente</Botao>}
          />
        </div>
      </Superficie>

      <Dialogo
        aberto={dialogoAberto}
        aoFechar={() => definirDialogo(false)}
        titulo="Encerrar a operação em andamento?"
        descricao="A operação pode estar aberta em outra aba. Encerrá-la afeta todas as abas desta pessoa."
        medida="decisao"
        acoes={[
          { rotulo: 'Deixar como está', peso: 'secundario', fecha: true, focoInicial: true },
          { rotulo: 'Encerrar a operação', peso: 'principal', fecha: true },
        ]}
      />

      <Dialogo
        aberto={longoAberto}
        aoFechar={() => definirLongo(false)}
        titulo="Formulário longo"
        descricao="O corpo rola; as ações continuam à vista."
        acoes={[
          { rotulo: 'Cancelar', peso: 'secundario', fecha: true },
          { rotulo: 'Gravar', peso: 'principal', fecha: true },
        ]}
      >
        <div className="grid gap-4">
          {Array.from({ length: 24 }, (_, indice) => (
            <Campo
              key={`campo-${String(indice)}`}
              id={`demo-longo-${String(indice)}`}
              rotulo={`Campo ${String(indice + 1)}`}
            />
          ))}
        </div>
      </Dialogo>
    </main>
  );
}

const raiz = document.getElementById('raiz');
if (raiz) createRoot(raiz).render(<Vitrine />);
