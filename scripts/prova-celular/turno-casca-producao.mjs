import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';
import { responder } from '../../web/fixtures/despachante.ts';
import { pacientes, sessaoAdministrador } from '../../web/fixtures/sessao.ts';

/* Prova de navegador da execução do cuidado PELA CASCA REAL, com o build de produção.
 *
 * Existe por causa de um achado de 27/11/2026: `web/main.ts` instala
 * `aplicarControlesProprios` (`web/ui/controles.ts`) na ficha, e ele MOVE todo `<select>` e
 * campo de data — inclusive os renderizados pelo React — para dentro de um grupo criado à
 * mão. O jsdom das provas de unidade não tem esse observador, então a classe inteira de
 * defeito (React removendo um nó que já não está onde ele o pôs) é invisível lá. Aqui o
 * observador está ativo: o roteiro troca seleções, abre e fecha o editor, recarrega a gestão
 * e consulta relatórios, e falha em qualquer erro de página.
 *
 * O navegador usa um dublê HTTP; nada sai para a rede. Dados fictícios. As permissões reais
 * são do servidor e do banco — esta prova é de interface. */
const [caso] = pacientes.itens;
const familiar = '70000000-0000-4000-8000-000000000001';
const turnoId = '70000000-0000-4000-8000-000000000002';
const base = `/api/pacientes/${caso.id}/execucao-turno`;
const vazia = { itens: [], proximo_cursor: null };

function execucao(caminho, metodo, consulta) {
  if (metodo === 'POST' && (caminho === '/reconciliar' || caminho === '/reconhecer'))
    return { epoca: 1, resultado_pendente: null };
  if (caminho === '/catalogo')
    return [
      {
        tipo: 'temperatura',
        unidade: '°C',
        ativo: true,
        observacao: false,
        referencia_informativa: null,
      },
    ];
  if (caminho === '') return vazia;
  if (caminho === '/medicacao/concessoes') return { ...vazia, pode_gerir: true };
  if (caminho === '/familiares')
    return {
      itens: [{ usuario_id: familiar, nome: 'Familiar fictício' }],
      proximo_cursor: null,
      pode_gerir: true,
    };
  if (caminho === '/fundamento') return null;
  if (caminho === '/relatorio') {
    const tipo = consulta.get('tipo') ?? 'diario';
    return {
      paciente_id: caso.id,
      tipo,
      inicio: consulta.get('inicio'),
      fim: consulta.get('fim'),
      consulta_id: turnoId,
      instante_corte: '2026-11-27T12:00:00.000Z',
      rotulos_atuais: true,
      // Só a consulta da coordenação (`caso`) traz um turno, para povoar o seletor.
      itens:
        tipo === 'caso'
          ? [
              {
                categoria: 'turno',
                id: turnoId,
                versao: 1,
                instante: '2026-11-27T10:00:00.000Z',
                dados: {
                  turno_id: turnoId,
                  paciente_id: caso.id,
                  profissional_usuario_id: familiar,
                  aberto_em: '2026-11-27T10:00:00.000Z',
                  encerrado_em: null,
                  situacao: 'aberto',
                  versao: 1,
                  parametros: {
                    duracao_padrao_minutos: 360,
                    tolerancia_atraso_minutos: 30,
                    tratamento_nao_encerrado: 'sinalizar_pendencia',
                  },
                  profissional_nome: 'Profissional fictício',
                },
              },
            ]
          : [],
      lacunas: [],
      proximo_cursor: null,
    };
  }
  return undefined;
}

const servidor = await preview({ root: 'web', preview: { host: '127.0.0.1', port: 0 } });
try {
  const endereco = servidor.httpServer.address();
  assert.ok(endereco && typeof endereco !== 'string');
  const origem = `http://127.0.0.1:${endereco.port}`;
  const navegador = await chromium.launch();
  try {
    const pagina = await navegador.newPage({ serviceWorkers: 'block' });
    pagina.setDefaultTimeout(8000);
    const erros = [];
    pagina.on('pageerror', (erro) => erros.push(String(erro)));
    pagina.on('console', (mensagem) => {
      if (
        mensagem.type() === 'error' &&
        /NotFoundError|removeChild|insertBefore/.test(mensagem.text())
      )
        erros.push(mensagem.text());
    });
    await pagina.addInitScript((id) => {
      sessionStorage.setItem('modo-acesso', 'tecnica');
      sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
      sessionStorage.setItem('sessao-tecnica', id);
    }, sessaoAdministrador.session_id);
    await pagina.route('**/*', (rota) => {
      const pedido = rota.request();
      const url = new URL(pedido.url());
      if (url.origin !== origem) return rota.abort();
      if (!url.pathname.startsWith('/api/')) return rota.continue();
      const responderDados = (dados) => rota.fulfill({ json: { dados, request_id: caso.id } });
      if (url.pathname === '/api/sessao') return responderDados(sessaoAdministrador);
      if (url.pathname === '/api/pacientes')
        return responderDados({ itens: [caso], proximo_cursor: null });
      if (url.pathname.startsWith(base)) {
        const resposta = execucao(
          url.pathname.slice(base.length),
          pedido.method(),
          url.searchParams,
        );
        if (resposta !== undefined) return responderDados(resposta);
      }
      const fixture = responder(url.href);
      return fixture
        ? rota.fulfill({ json: fixture })
        : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
    });

    /* Conferido depois de cada passo, e não só no fim: um erro de reconciliação do React
       derruba a ilha, e o passo seguinte falharia por "elemento não encontrado" — o motivo
       errado. Assim a prova falha pelo erro que ela existe para pegar. */
    const semErros = () => assert.deepEqual(erros, [], `Erros de página: ${erros.join(' | ')}`);
    const escolher = async (rotulo, opcao) => {
      await pagina.getByRole('combobox', { name: rotulo }).click();
      await pagina.getByRole('option', { name: opcao, exact: true }).click();
      await pagina.waitForTimeout(50);
      semErros();
    };

    await pagina.goto(`${origem}/#carteira`);
    await pagina.getByRole('button', { name: `Abrir ficha de ${caso.nome}` }).click();
    await pagina.getByText('Mais seções', { exact: true }).click();
    await pagina.getByText('Execução e relatórios', { exact: true }).click();
    await expect(pagina.getByText(/Catálogo consultado/)).toBeVisible();

    // O seletor da série é aprimorado pelo observador; trocar e consultar.
    await escolher(/^Tipo de registro/, 'Medicação prescrita');
    await pagina.getByRole('button', { name: 'Consultar série', exact: true }).click();
    await expect(pagina.getByText('Nenhum registro neste período.')).toBeVisible();

    // Abrir e descartar o editor: o React desmonta campos que o observador já mexeu.
    await pagina.getByRole('button', { name: 'Registrar medicação prescrita' }).click();
    await expect(pagina.locator('.turno-execucao__editor')).toBeVisible();
    await pagina.getByRole('button', { name: 'Descartar rascunho não enviado' }).click();
    await expect(pagina.locator('.turno-execucao__editor')).toHaveCount(0);

    // Relatórios: trocar o tipo revela e esconde o seletor de turno.
    await pagina.getByText('Relatórios e PDF', { exact: true }).click();
    await escolher(/^Relatório\s/, 'Relatório de um turno');
    await escolher(/^Relatório\s/, 'Consolidado diário');
    await pagina.getByRole('button', { name: 'Consultar relatório' }).click();
    await expect(pagina.getByText(/Corte dos registros:/)).toBeVisible();

    // Gestão: escolher o familiar troca a chave dos campos do fundamento; atualizar
    // redesenha o conteúdo inteiro.
    await pagina.getByText('Fundamento familiar, medicação e catálogo', { exact: true }).click();
    await expect(pagina.getByText('Permissões e configuração consultadas.')).toBeVisible();
    await escolher(/^Familiar com acesso ao caso/, 'Familiar fictício');
    await expect(pagina.getByText('Nenhum fundamento registrado.')).toBeVisible();
    await pagina.getByRole('button', { name: 'Atualizar gestão do turno' }).click();
    await expect(pagina.getByText('Permissões e configuração consultadas.')).toBeVisible();

    // Coordenação: turnos consultados povoam um seletor controlado.
    await pagina.getByText('Localização declarada — coordenação', { exact: true }).click();
    await pagina.getByRole('button', { name: 'Consultar turnos autorizados' }).click();
    await expect(pagina.getByText(/Turnos consultados/)).toBeVisible();
    await escolher(/^Turno autorizado/, /Aberto$/);

    assert.deepEqual(erros, [], `Erros de página: ${erros.join(' | ')}`);
    console.log('Execução do cuidado pela casca real passou com o observador de controles ativo.');
  } finally {
    await navegador.close();
  }
} finally {
  await servidor.close();
}
