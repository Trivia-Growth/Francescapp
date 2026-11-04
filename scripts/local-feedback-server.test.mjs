import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { test } from 'node:test';
import { createLocalFeedbackServer, defaultFeedbackDirectory } from './local-feedback-server.mjs';

test('sessão local, proteção de origem e persistência de pacientes fictícios', async () => {
  const fromWorkspace = relative(process.cwd(), defaultFeedbackDirectory);
  assert.ok(fromWorkspace.startsWith('..') || isAbsolute(fromWorkspace));
  const directory = await mkdtemp(join(tmpdir(), 'feedback-test-'));
  let server;
  const start = async () => {
    server = createLocalFeedbackServer({ password: 'senha-ficticia-segura', directory });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  };
  const close = () =>
    new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  const request = (path, options = {}) =>
    new Promise((resolve, reject) => {
      const req = httpRequest(
        {
          hostname: '127.0.0.1',
          port: server.address().port,
          path: `/api/local-feedback${path}`,
          method: options.method || 'GET',
          headers: { host: 'localhost:5173', ...options.headers },
        },
        (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () =>
            resolve({
              status: res.statusCode,
              headers: new Headers(res.headers),
              json: async () => JSON.parse(Buffer.concat(chunks).toString()),
            }),
          );
        },
      );
      req.on('error', reject);
      req.end(options.body);
    });
  try {
    await start();
    assert.equal((await request('/patients')).status, 401);
    assert.equal(
      (
        await request('/login', {
          method: 'POST',
          headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
          body: '{}',
        })
      ).status,
      403,
    );
    const headers = { origin: 'http://localhost:5173', 'content-type': 'application/json' };
    assert.equal(
      (
        await request('/login', {
          method: 'POST',
          headers,
          body: JSON.stringify({ password: 'incorreta' }),
        })
      ).status,
      401,
    );
    const login = await request('/login', {
      method: 'POST',
      headers,
      body: JSON.stringify({ password: 'senha-ficticia-segura' }),
    });
    assert.match(login.headers.get('set-cookie'), /Path=\/api\/local-feedback(?:;|$)/);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const { csrfToken } = await login.json();
    assert.equal(
      (
        await request('/patients', {
          method: 'POST',
          headers: { ...headers, cookie },
          body: JSON.stringify({ name: 'Pessoa fictícia' }),
        })
      ).status,
      403,
    );
    const auth = { ...headers, cookie, 'x-csrf-token': csrfToken };
    assert.equal(
      (
        await request('/patients', {
          method: 'POST',
          headers: auth,
          body: JSON.stringify({ name: ' ' }),
        })
      ).status,
      400,
    );
    const created = await request('/patients', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ name: 'Pessoa fictícia', preferredName: 'Pessoa' }),
    });
    assert.equal(created.status, 201);
    const patient = (await created.json()).patient;
    assert.equal(patient.preferredName, 'Pessoa');
    const editPath = `/patients/${patient.id}`;
    const edit = {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({ name: 'Pessoa editada', preferredName: '', revision: 0 }),
    };
    assert.equal(
      (await request(editPath, { ...edit, headers: { ...headers, cookie } })).status,
      403,
    );
    assert.equal(
      (
        await request(editPath, {
          ...edit,
          body: JSON.stringify({ name: ' ', preferredName: '', revision: 0 }),
        })
      ).status,
      400,
    );
    const edits = await Promise.all([request(editPath, edit), request(editPath, edit)]);
    assert.deepEqual(edits.map((response) => response.status).sort(), [200, 409]);
    const previewPath = `/patients/${patient.id}/preview`;
    const anamnese = { estado: 'informado', valor: 'Fictício', fonte: 'Teste', data: '2026-11-04' };
    const save = {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({ type: 'anamnese', value: anamnese, revision: 0 }),
    };
    assert.equal((await request(previewPath)).status, 401);
    assert.equal((await request(previewPath, save)).status, 200);
    assert.equal((await request(previewPath, save)).status, 409);
    const tarefa = {
      descricao: 'Exemplo',
      responsavel: 'Pessoa fictícia',
      prazo: '2026-12-01',
      prioridade: 'Alta',
      estado: 'pendente',
      acaoOuJustificativa: '',
    };
    assert.equal(
      (
        await request(previewPath, {
          method: 'PUT',
          headers: auth,
          body: JSON.stringify({ type: 'tarefas', value: [tarefa], revision: 1 }),
        })
      ).status,
      200,
    );
    const objetivo = {
      descricao: 'Objetivo fictício',
      area: 'Rotina',
      responsavel: 'Equipe fictícia',
      situacaoInicial: 'Exemplo',
      observacaoProgresso: 'Relato',
      dataRevisao: '2026-12-01',
      estado: 'proposto',
    };
    const salvarObjetivo = (value, revision) =>
      request(previewPath, {
        method: 'PUT',
        headers: auth,
        body: JSON.stringify({ type: 'objetivos', value, revision }),
      });
    assert.equal(
      (await salvarObjetivo([{ ...objetivo, dataRevisao: '2026-02-30' }], 2)).status,
      400,
    );
    assert.equal(
      (await salvarObjetivo([{ ...objetivo, historico: [{ objetivo, motivo: '' }] }], 2)).status,
      400,
    );
    assert.equal((await salvarObjetivo([objetivo], 2)).status, 200);
    assert.equal((await salvarObjetivo([objetivo], 2)).status, 409);
    const relato = {
      dataAcontecimento: '2026-11-04',
      descricao: 'Relato fictício',
      categoria: '',
      contexto: '',
      acaoTomada: '',
      solicitacaoRetorno: false,
    };
    const salvarRelato = (value, revision) =>
      request(previewPath, {
        method: 'PUT',
        headers: auth,
        body: JSON.stringify({ type: 'relatos', value, revision }),
      });
    assert.equal((await salvarRelato([{ ...relato, descricao: ' ' }], 3)).status, 400);
    assert.equal((await salvarRelato([relato], 3)).status, 200);
    assert.equal((await salvarRelato([relato], 3)).status, 409);
    const operationId = '11234567-1234-4234-8234-123456789abc';
    const salvarOperacao = () =>
      request(previewPath, {
        method: 'PUT',
        headers: auth,
        body: JSON.stringify({ type: 'relatos', value: [relato], revision: 4, operationId }),
      });
    assert.equal((await salvarOperacao()).status, 200);
    assert.equal((await salvarOperacao()).status, 200);
    const reconciliada = await (await request(previewPath, { headers: { cookie } })).json();
    assert.deepEqual(reconciliada.relatos, [relato, relato]);
    assert.deepEqual(reconciliada.operacoesRelato, [operationId]);
    assert.equal(
      (
        await request(previewPath, {
          method: 'PUT',
          headers: auth,
          body: JSON.stringify({
            type: 'relatos',
            value: [{ ...relato, descricao: 'Outro' }],
            revision: 4,
            operationId,
          }),
        })
      ).status,
      409,
    );
    assert.equal((await salvarRelato([], reconciliada.revision)).status, 409);
    const cancelada = '21234567-1234-4234-8234-123456789abc';
    const reconciliar = (id) =>
      request(previewPath, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ operationId: id }),
      });
    assert.equal((await reconciliar(operationId)).status, 200);
    const cancelamento = await (await reconciliar(cancelada)).json();
    assert.ok(cancelamento.operacoesRelatoCanceladas.includes(cancelada));
    assert.equal((await reconciliar(cancelada)).status, 200);
    assert.equal(
      (
        await request(previewPath, {
          method: 'PUT',
          headers: auth,
          body: JSON.stringify({
            type: 'relatos',
            value: [relato],
            revision: cancelamento.revision,
            operationId: cancelada,
          }),
        })
      ).status,
      409,
    );
    const depois = await (await request(previewPath, { headers: { cookie } })).json();
    assert.deepEqual(depois.relatos, [relato, relato]);
    const concorrente = '31234567-1234-4234-8234-123456789abc';
    const [salvaConcorrente, reconciliacaoConcorrente] = await Promise.all([
      request(previewPath, {
        method: 'PUT',
        headers: auth,
        body: JSON.stringify({
          type: 'relatos',
          value: [relato],
          revision: depois.revision,
          operationId: concorrente,
        }),
      }),
      reconciliar(concorrente),
    ]);
    assert.equal(reconciliacaoConcorrente.status, 200);
    const final = await (await request(previewPath, { headers: { cookie } })).json();
    const foiSalvo = final.operacoesRelato.includes(concorrente);
    assert.equal(salvaConcorrente.status, foiSalvo ? 200 : 409);
    assert.equal(final.operacoesRelatoCanceladas.includes(concorrente), !foiSalvo);
    assert.equal(final.relatos.length, foiSalvo ? 3 : 2);
    const relatosEsperados = final.relatos;
    const objetivoRevisado = {
      ...objetivo,
      descricao: 'Objetivo revisado',
      historico: [{ objetivo, motivo: 'Nova observação' }],
    };
    assert.equal((await salvarObjetivo([objetivoRevisado], final.revision)).status, 200);
    const compromisso = {
      descricao: 'Encontro fictício',
      profissional: 'Equipe fictícia',
      data: '2026-12-01',
      hora: '10:00',
      duracao: 60,
      local: 'Online',
      participantes: 'Pessoa fictícia',
      estado: 'agendado',
    };
    const salvarAgenda = (value, revision) =>
      request(previewPath, {
        method: 'PUT',
        headers: auth,
        body: JSON.stringify({ type: 'agenda', value, revision }),
      });
    assert.equal(
      (await salvarAgenda([{ ...compromisso, data: '2026-02-30' }], final.revision + 1)).status,
      400,
    );
    assert.equal((await salvarAgenda([compromisso], final.revision + 1)).status, 200);
    assert.equal((await salvarAgenda([compromisso], final.revision + 1)).status, 409);
    const cancelado = { ...compromisso, estado: 'cancelado' };
    assert.equal((await salvarAgenda([cancelado], final.revision + 2)).status, 200);

    assert.equal(
      (await request(previewPath, { ...save, headers: { ...headers, cookie } })).status,
      403,
    );
    assert.equal(JSON.parse(await readFile(join(directory, 'patients.json'), 'utf8')).length, 1);
    const logout = await request('/logout', { method: 'POST', headers: auth, body: '{}' });
    assert.equal(logout.status, 204);
    assert.match(logout.headers.get('set-cookie'), /Path=\/api\/local-feedback(?:;|$)/);
    assert.equal((await request('/patients', { headers: { cookie } })).status, 401);
    await close();
    await start();
    const nextLogin = await request('/login', {
      method: 'POST',
      headers,
      body: JSON.stringify({ password: 'senha-ficticia-segura' }),
    });
    const nextCookie = nextLogin.headers.get('set-cookie').split(';')[0];
    assert.equal(
      (await (await request('/patients', { headers: { cookie: nextCookie } })).json()).patients[0]
        .name,
      'Pessoa editada',
    );
    assert.deepEqual(
      (await (await request(previewPath, { headers: { cookie: nextCookie } })).json()).anamnese,
      anamnese,
    );
    assert.deepEqual(
      (await (await request(previewPath, { headers: { cookie: nextCookie } })).json()).tarefas,
      [tarefa],
    );
    assert.deepEqual(
      (await (await request(previewPath, { headers: { cookie: nextCookie } })).json()).objetivos,
      [objetivoRevisado],
    );
    assert.deepEqual(
      (await (await request(previewPath, { headers: { cookie: nextCookie } })).json()).relatos,
      relatosEsperados,
    );
    assert.deepEqual(
      (await (await request(previewPath, { headers: { cookie: nextCookie } })).json()).agenda,
      [cancelado],
    );
    await close();
    const invalidDirectory = join(directory, 'arquivo');
    await writeFile(invalidDirectory, 'não é diretório');
    server = createLocalFeedbackServer({
      password: 'senha-ficticia-segura',
      directory: invalidDirectory,
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const failureLogin = await request('/login', {
      method: 'POST',
      headers,
      body: JSON.stringify({ password: 'senha-ficticia-segura' }),
    });
    const failureCookie = failureLogin.headers.get('set-cookie').split(';')[0];
    const failureToken = (await failureLogin.json()).csrfToken;
    const failure = await request('/patients', {
      method: 'POST',
      headers: { ...headers, cookie: failureCookie, 'x-csrf-token': failureToken },
      body: JSON.stringify({ name: 'Pessoa fictícia' }),
    });
    assert.equal(failure.status, 500);
  } finally {
    if (server?.listening) await close();
    await rm(directory, { recursive: true, force: true });
  }
});
