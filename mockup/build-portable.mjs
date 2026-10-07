import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Empacota a apresentação existente; não acrescenta serviços ou dependências.
const source = path.dirname(fileURLToPath(import.meta.url));
const destination = path.resolve(source, '../output/mockup');
let html = await readFile(path.join(source, 'index.html'), 'utf8');
let css = await readFile(path.join(source, 'styles.css'), 'utf8');
const script = await readFile(path.join(source, 'app.js'), 'utf8');
for (const filename of ['raleway.ttf', 'cormorant-garamond.ttf']) {
  const font = await readFile(path.join(source, 'assets', filename));
  css = css.replace(`assets/${filename}`, `data:font/ttf;base64,${font.toString('base64')}`);
}
const licenses = await Promise.all(['OFL-Raleway.txt', 'OFL-Cormorant-Garamond.txt'].map(filename => readFile(path.join(source, 'assets', filename), 'utf8')));
html = html.replace('<link rel="stylesheet" href="styles.css">', `<style>${css}</style>`);
html = html.replace('  <script src="app.js" defer></script>\n', '');
html = html.replace('</body>', `<script>${script.replaceAll('</script', '<\\/script')}</script>\n</body>`);
html += '\n<!-- Font licenses\n' + licenses.join('\n\n') .replaceAll('-->', '-- >') + '\n-->\n';
await mkdir(destination, { recursive: true });
await writeFile(path.join(destination, 'francescapp-demo.html'), html);
process.stdout.write(`HTML portátil criado em ${destination}/francescapp-demo.html\n`);
