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
    assert.equal((await created.json()).patient.preferredName, 'Pessoa');
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
      'Pessoa fictícia',
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
