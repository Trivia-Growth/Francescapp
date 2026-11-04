import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { createLocalFeedbackServer, defaultFeedbackDirectory } from './local-feedback-server.mjs';

if (!stdin.isTTY || !stdout.isTTY) {
  console.error('Inicie em um terminal interativo para informar a senha sem exibi-la.');
  process.exitCode = 1;
} else {
  const input = createInterface({ input: stdin, output: stdout, terminal: true });
  stdout.write('Senha local (mínimo 12 caracteres; não será exibida): ');
  input._writeToOutput = () => {};
  input.question('', (password) => {
    input.close();
    stdout.write('\n');
    let server;
    try {
      server = createLocalFeedbackServer({ password, directory: defaultFeedbackDirectory });
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    server.on('error', (error) => {
      console.error(
        error.code === 'EADDRINUSE'
          ? 'Porta 4174 ocupada. Encerre o serviço que a utiliza e tente novamente.'
          : `Falha ao iniciar serviço local: ${error.message}`,
      );
      process.exitCode = 1;
    });
    server.listen(4174, '127.0.0.1', () => {
      const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
      const config = fileURLToPath(new URL('./local-feedback-vite.config.mjs', import.meta.url));
      const web = fileURLToPath(new URL('../web', import.meta.url));
      const child = spawn(process.execPath, [vite, web, '--config', config], {
        stdio: ['ignore', 'pipe', 'inherit'],
      });
      let announced = false;
      child.stdout.on('data', (chunk) => {
        stdout.write(chunk);
        if (!announced && chunk.toString().includes('Local:')) {
          announced = true;
          console.log(
            'Abra http://localhost:5173/demonstracao.html. Use somente dados fictícios; este ambiente confia nos usuários e programas deste computador.',
          );
        }
      });
      let stopping = false;
      const stop = (code) => {
        if (stopping) return;
        stopping = true;
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
        server.close(() => {
          process.exitCode = code;
        });
      };
      child.on('error', () => {
        console.error('Não foi possível iniciar a interface local.');
        stop(1);
      });
      child.on('exit', (code) => {
        if (!stopping) {
          console.error('Interface local encerrada. Verifique se a porta 5173 está livre.');
          stop(code || 1);
        }
      });
      process.once('SIGINT', () => stop(0));
      process.once('SIGTERM', () => stop(0));
    });
  });
}
