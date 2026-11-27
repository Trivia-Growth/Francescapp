import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';

const origem = new URL(process.env.FFCM_APP_ORIGIN);
assert.equal(origem.hostname, '127.0.0.1');
assert.equal(new URL(process.env.FFCM_SUPABASE_URL).hostname, '127.0.0.1');
assert.equal(process.env.FFCM_VAULT_DB_HOST, 'localhost.');
const app = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false } });
const rotas = [];
for (const arquivo of [
  'auth',
  'pacientes',
  'concessoes-equipe',
  'vinculos-profissionais',
  'barreira-acesso',
  'acesso-paciente',
  'anamnese',
  'plano',
  'pendencias',
  'tarefas-cuidado',
  'avisos',
  'financeiro',
]) {
  const modulo = await app.ssrLoadModule(`/netlify/functions/${arquivo}.ts`);
  for (const caminho of [modulo.config.path].flat())
    rotas.push({
      caminho: new RegExp(`^${caminho.replace(/:\w+/g, '[^/]+').replaceAll('*', '.*')}$`),
      atender: modulo.default,
    });
}
const proxy = {
  name: 'proxy-local',
  configurePreviewServer(servidor) {
    servidor.middlewares.use(async (req, res, proximo) => {
      const url = new URL(req.url, origem);
      if (!url.pathname.startsWith('/api/')) return proximo();
      const rota = rotas.find(({ caminho }) => caminho.test(url.pathname));
      if (!rota) {
        res.writeHead(404);
        res.end();
        return;
      }
      try {
        const resposta = await rota.atender(
          new Request(url, {
            method: req.method,
            headers: req.headers,
            ...(['GET', 'HEAD'].includes(req.method)
              ? {}
              : { body: Readable.toWeb(req), duplex: 'half' }),
          }),
        );
        for (const [chave, valor] of resposta.headers) {
          if (chave !== 'set-cookie') res.setHeader(chave, valor);
        }
        res.setHeader('Set-Cookie', resposta.headers.getSetCookie());
        res.statusCode = resposta.status;
        if (resposta.body) await pipeline(Readable.fromWeb(resposta.body), res);
        else res.end();
      } catch (erro) {
        console.error('Falha no adaptador local:', erro.name);
        res.destroy();
      }
    });
  },
};
const servidor = await preview({
  root: 'web',
  plugins: [proxy],
  preview: { host: origem.hostname, port: Number(origem.port), strictPort: true },
});

try {
  const navegador = await chromium.launch();
  try {
    async function abrirSessao(perfil) {
      const pagina = await navegador.newPage({ serviceWorkers: 'block' });
      pagina.setDefaultTimeout(8000);
      if (process.env.PROVA_DEBUG === 'true')
        pagina.on('response', (r) => {
          const caminho = new URL(r.url()).pathname;
          if (caminho.startsWith('/api/'))
            console.log(perfil, r.request().method(), caminho, r.status());
        });
      await pagina.route('**/*', (rota) =>
        new URL(rota.request().url()).origin === origem.origin ? rota.continue() : rota.abort(),
      );
      await pagina.goto(origem.href);
      const status = await pagina.evaluate(
        async ({ perfil, senha }) => {
          const fluxo = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))
            .replaceAll('+', '-')
            .replaceAll('/', '_')
            .replaceAll('=', '');
          const resposta = await fetch('/api/auth/interno', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-fluxo': fluxo },
            body: JSON.stringify({ email: `${perfil}@exemplo.test`, senha }),
          });
          if (resposta.ok) {
            const { dados } = await resposta.json();
            sessionStorage.setItem('modo-acesso', 'interno');
            sessionStorage.setItem('fluxo-interno', fluxo);
            sessionStorage.setItem('sessao-interno', dados.session_id);
          }
          return resposta.status;
        },
        { perfil, senha: process.env.PROVA_SENHA_FICTICIA },
      );
      assert.equal(status, 200, `Login interno de ${perfil}`);
      return pagina;
    }

    const admin = await abrirSessao('administrador');
    const profissional = await abrirSessao('profissional');
    const caso = '40000000-0000-4000-8000-00000000f001';
    const outroCaso = '40000000-0000-4000-8000-00000000f002';
    const statusAnamnese = (id) =>
      profissional.evaluate(async (paciente) => {
        const resposta = await fetch(`/api/pacientes/${paciente}/anamnese`, {
          headers: {
            'x-fluxo': sessionStorage.getItem('fluxo-interno'),
            'x-sessao': sessionStorage.getItem('sessao-interno'),
          },
        });
        return resposta.status;
      }, id);
    const abrirFicha = (pagina) =>
      pagina.getByRole('button', { name: 'Abrir ficha de Caso Fictício A' }).click();
    async function conferirNegacao(id) {
      await profissional.goto(
        `${origem.origin}/?prova=${crypto.randomUUID()}#paciente/${id}/visao`,
      );
      await expect(profissional.getByText(/Não foi possível reabrir a ficha/)).toBeVisible();
      await expect(profissional.locator('#ficha-view')).toBeHidden();
    }
    await conferirNegacao(caso);
    await admin.goto(`${origem.origin}/?prova=admin#carteira`);
    await abrirFicha(admin);
    await expect(
      admin.locator('[data-bloco="anamnese"]').getByText('Este bloco não foi carregado.'),
    ).toBeVisible();
    await expect(admin.locator('#ficha-title')).toHaveText('Caso Fictício A');
    await admin.getByText('Mais seções', { exact: true }).click();
    await admin.getByText('Equipe com acesso', { exact: true }).click();
    const liberado = admin.getByText('Tudo conferido. Você já pode conceder acesso.');
    const tentativaAnterior = admin.getByRole('button', { name: 'Encerrar a tentativa' });
    await expect(liberado.or(tentativaAnterior)).toBeVisible();
    if (await tentativaAnterior.isVisible()) await tentativaAnterior.click();
    await expect(liberado).toBeVisible();
    await admin.getByRole('combobox', { name: /^Profissional/ }).click();
    await admin.getByRole('option', { name: 'profissional@exemplo.test' }).click();
    await admin.getByLabel('Motivo da concessão').fill('Acompanhamento fictício.');
    await admin.getByRole('button', { name: 'Conceder acesso' }).click();
    await expect(admin.getByRole('button', { name: /Selecionar para revogação/ })).toBeVisible();
    await profissional.goto(`${origem.origin}/?prova=profissional#carteira`);
    await abrirFicha(profissional);
    await expect(profissional.locator('#ficha-title')).toHaveText('Caso Fictício A');
    assert.equal(await statusAnamnese(caso), 200);
    await conferirNegacao(outroCaso);
    assert.equal(await statusAnamnese(outroCaso), 403);
    await profissional.goto(`${origem.origin}/?prova=ficha-aberta#carteira`);
    await abrirFicha(profissional);
    await profissional.getByRole('tab', { name: 'Pendências' }).click();
    await admin.getByRole('button', { name: 'Conferir novamente' }).click();
    await tentativaAnterior.click();
    const conferir = admin.getByRole('dialog', { name: /Concessão anterior/ });
    await conferir.getByRole('button', { name: 'Confere, pode seguir' }).click();
    await expect(liberado).toBeVisible();
    await admin.getByRole('button', { name: /Selecionar para revogação/ }).click();
    await admin.locator('#revogacao-motivo').fill('Acompanhamento fictício encerrado.');
    await admin.getByRole('button', { name: 'Revogar acesso', exact: true }).click();
    await admin.getByRole('dialog').getByRole('button', { name: 'Revogar acesso' }).click();
    await expect(admin.getByText('Revogado', { exact: true })).toBeVisible();
    await expect(profissional.locator('#ficha-title')).toHaveText('Caso Fictício A');
    await profissional.getByRole('tab', { name: 'Visão do caso' }).click();
    await expect(profissional.locator('#ficha-view')).toBeHidden();
    await conferirNegacao(caso);
    assert.equal(await statusAnamnese(caso), 403);
    await admin.getByRole('button', { name: 'Conferir novamente' }).click();
    await tentativaAnterior.click();
    await admin
      .getByRole('dialog', { name: /Revogação anterior/ })
      .getByRole('button', { name: 'Confere, pode seguir' })
      .click();
    await expect(liberado).toBeVisible();
    // Segura a resposta real de Anamnese até a sessão ser encerrada pelo handler real.
    // Exercita o intervalo entre a primeira autorização e a confirmação da exceção.
    const outrasLeituras = Promise.all(
      ['plano', 'pendencias'].map((secao) =>
        admin.waitForResponse(
          (resposta) =>
            new URL(resposta.url()).pathname === `/api/pacientes/${caso}/${secao}` &&
            resposta.status() === 200,
        ),
      ),
    );
    const sessaoRecusada = admin.waitForResponse(
      (resposta) => new URL(resposta.url()).pathname === '/api/sessao' && resposta.status() === 401,
    );
    await admin.route(
      `**/api/pacientes/${caso}/anamnese`,
      async (rota) => {
        const resposta = await rota.fetch();
        assert.equal(resposta.status(), 403);
        await outrasLeituras;
        const cabecalhos = await rota.request().allHeaders();
        const saida = await admin.request.post(`${origem.origin}/api/sessao/sair`, {
          data: {},
          headers: {
            origin: origem.origin,
            'x-sessao': cabecalhos['x-sessao'],
            'x-fluxo': cabecalhos['x-fluxo'],
          },
        });
        assert.equal(saida.status(), 200);
        await rota.fulfill({ response: resposta });
      },
      { times: 1 },
    );
    await admin.getByRole('tab', { name: 'Visão do caso' }).click();
    await sessaoRecusada;
    await expect(admin.locator('#login-view')).toBeVisible();
    await expect(admin.locator('#ficha-view')).toBeHidden();
    console.log('Jornada integrada de vínculo passou com dois atores fictícios.');
  } finally {
    await navegador.close();
  }
} finally {
  await servidor.close();
  await app.close();
}
