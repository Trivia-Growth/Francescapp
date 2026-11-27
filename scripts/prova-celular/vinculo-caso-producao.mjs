import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';
import { responder } from '../../web/fixtures/despachante.ts';
import { CONCESSOES, pacientes, sessaoAdministrador } from '../../web/fixtures/sessao.ts';

// O navegador usa o pacote real e um dublê HTTP. As permissões reais são verificadas
// em supabase/tests/acesso_paciente_autorizacao_local.sql.
const [caso, outroCaso] = pacientes.itens;
const profissional = CONCESSOES[0];
const sessaoProfissional = {
  session_id: '20000000-0000-4000-8000-000000000002',
  usuario: { id: profissional.usuario_id, perfil: 'profissional', ativo: true, versao: 1 },
  capacidades: [],
};

const servidor = await preview({ root: 'web', preview: { host: '127.0.0.1', port: 0 } });
try {
  const endereco = servidor.httpServer.address();
  assert.ok(endereco && typeof endereco !== 'string');
  const origem = `http://127.0.0.1:${endereco.port}`;
  const navegador = await chromium.launch();
  try {
    let vinculo;
    const comandos = [];
    async function abrirSessao(sessao) {
      const pagina = await navegador.newPage({ serviceWorkers: 'block' });
      pagina.setDefaultTimeout(6000);
      const administrador = sessao === sessaoAdministrador;
      await pagina.addInitScript((id) => {
        sessionStorage.setItem('modo-acesso', 'tecnica');
        sessionStorage.setItem('fluxo-tecnico', 'AAAAAAAAAAAAAAAAAAAAAA');
        sessionStorage.setItem('sessao-tecnica', id);
      }, sessao.session_id);
      await pagina.route('**/*', (rota) => {
        const pedido = rota.request();
        const url = new URL(pedido.url());
        if (url.origin !== origem) return rota.abort();
        if (!url.pathname.startsWith('/api/')) return rota.continue();
        const responderDados = (dados) => rota.fulfill({ json: { dados, request_id: caso.id } });
        const negar = () =>
          rota.fulfill({
            status: 403,
            json: { erro: { codigo: 'sem_permissao' }, request_id: caso.id },
          });
        if (url.pathname === '/api/sessao') return responderDados(sessao);
        if (url.pathname === '/api/pacientes') {
          const itens = administrador
            ? [caso, outroCaso]
            : vinculo && !vinculo.revogado
              ? [caso]
              : [];
          return responderDados({ itens, proximo_cursor: null });
        }
        if (url.pathname === `/api/pacientes/${caso.id}/vinculos-profissionais`) {
          if (!administrador) return negar();
          return responderDados({ itens: vinculo ? [vinculo] : [], proximo_cursor: null });
        }
        const caminhoAcessos = `/api/pacientes/${caso.id}/acessos`;
        if (pedido.method() === 'POST' && url.pathname === caminhoAcessos) {
          if (!administrador) return negar();
          const { entrada } = pedido.postDataJSON();
          comandos.push({ acao: 'conceder', usuario: entrada.usuario_id });
          vinculo = {
            id: entrada.acesso_id,
            usuario_id: entrada.usuario_id,
            revogado: false,
            versao: 1,
          };
          return responderDados({ id: vinculo.id, versao: vinculo.versao });
        }
        if (
          pedido.method() === 'POST' &&
          vinculo &&
          url.pathname === `${caminhoAcessos}/${vinculo.id}/revogar`
        ) {
          if (!administrador) return negar();
          comandos.push({ acao: 'revogar', versao: pedido.postDataJSON().entrada.versao_esperada });
          vinculo = { ...vinculo, revogado: true, versao: 2 };
          return responderDados({ id: vinculo.id, versao: vinculo.versao });
        }
        const fixture = responder(url.href);
        return fixture
          ? rota.fulfill({ json: fixture })
          : rota.fulfill({ status: 404, json: { codigo: 'nao_encontrado' } });
      });
      return pagina;
    }

    const admin = await abrirSessao(sessaoAdministrador);
    const destinatario = await abrirSessao(sessaoProfissional);
    const abrirFicha = (pagina) =>
      pagina.locator('#patients-body').getByRole('button', { name: caso.nome }).click();
    const conferirNegacao = async (id) => {
      await destinatario.goto(`${origem}/#paciente/${id}/visao`);
      await destinatario.reload();
      await expect(destinatario.getByText(/Não foi possível reabrir a ficha/)).toBeVisible();
      await expect(destinatario.locator('#ficha-view')).toBeHidden();
    };

    await conferirNegacao(caso.id);
    await admin.goto(`${origem}/#carteira`);
    await abrirFicha(admin);
    await admin.getByText('Mais seções', { exact: true }).click();
    await admin.getByText('Equipe com acesso', { exact: true }).click();
    await admin.getByRole('combobox', { name: /^Profissional/ }).click();
    await admin.getByRole('option', { name: profissional.email }).click();
    await admin.getByLabel('Motivo da concessão').fill('Acompanhamento fictício.');
    await admin.getByRole('button', { name: 'Conceder acesso' }).click();
    await expect(admin.getByRole('button', { name: /Selecionar para revogação/ })).toBeVisible();

    await destinatario.goto(`${origem}/#carteira`);
    await destinatario.reload();
    await abrirFicha(destinatario);
    await expect(destinatario.locator('#ficha-title')).toHaveText(caso.nome);
    await expect(destinatario.getByText('Equipe com acesso', { exact: true })).toHaveCount(0);
    await conferirNegacao(outroCaso.id);

    await admin.getByRole('button', { name: 'Conferir novamente' }).click();
    await expect(admin.getByText('Tudo conferido. Você já pode conceder acesso.')).toBeVisible();
    await admin.getByRole('button', { name: /Selecionar para revogação/ }).click();
    await admin.locator('#revogacao-motivo').fill('Acompanhamento fictício encerrado.');
    await admin.getByRole('button', { name: 'Revogar acesso', exact: true }).click();
    await admin.getByRole('dialog').getByRole('button', { name: 'Revogar acesso' }).click();
    await expect(admin.getByText('Revogado', { exact: true })).toBeVisible();
    await conferirNegacao(caso.id);
    assert.deepEqual(comandos, [
      { acao: 'conceder', usuario: profissional.usuario_id },
      { acao: 'revogar', versao: 1 },
    ]);
    process.stdout.write(
      'Jornada de vínculo em produção local passou com dois atores fictícios.\n',
    );
  } finally {
    await navegador.close();
  }
} finally {
  await servidor.close();
}
