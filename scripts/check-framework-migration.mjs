import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = file => readFileSync(join(root, file), 'utf8')
const sourceDir = 'docs/legacy/spec-kit/specs/001-diario-cuidado'
const source = read(`${sourceDir}/spec.md`)
const context = read('docs/projeto/contexto-negocio.md')
const capabilities = readdirSync(join(root, 'openspec/specs'))
  .filter(name => existsSync(join(root, 'openspec/specs', name, 'spec.md')))
const current = capabilities.map(name => ({
  file: `openspec/specs/${name}/spec.md`,
  body: read(`openspec/specs/${name}/spec.md`),
}))
assert.equal(capabilities.length, 8, 'São oito capacidades na migração inicial')

const requirements = [...source.matchAll(/^\| (FR-\d+) \| (Inicial|Evolução) \| (.*) \|$/gm)]
const headings = current.flatMap(({ body }) => [...body.matchAll(/^### Requirement: (FR-\d+) /gm)].map(m => m[1]))
assert.equal(requirements.length, 54)
assert.equal(headings.length, 54)
assert.equal(new Set(headings).size, 54, 'Não duplicar requisitos entre capacidades')
for (const [, id, phase, text] of requirements) {
  const matches = current.filter(({ body }) => body.includes(`### Requirement: ${id} `))
  assert.equal(matches.length, 1, id)
  const block = matches[0].body.split(`### Requirement: ${id} `)[1].split('\n### Requirement: ')[0]
  assert.ok(block.includes(`**Fase de origem**: ${phase}.`), `Fase preservada: ${id}`)
  assert.ok(block.includes(text), `Condição integral preservada: ${id}`)
}

const storiesArea = source.split('## User Scenarios & Testing *(mandatory)*\n')[1].split('### Edge Cases\n')[0]
const stories = [...storiesArea.matchAll(/^### User Story (\d+) - ([\s\S]*?)(?=^### User Story |$(?![\s\S]))/gm)]
assert.equal(stories.length, 12)
for (const [, id, text] of stories) {
  const original = `### User Story ${id} - ${text}`.trim()
  assert.equal(current.filter(({ body }) => body.includes(original)).length, 1, `Jornada ${id} intacta e única`)
}
const criteria = source.split('\n').filter(line => /^\| SC-\d+ /.test(line))
assert.equal(criteria.length, 12)
for (const row of criteria) assert.ok(context.includes(row), 'Critério SC preservado')
const answers = source.split('\n').filter(line => line.startsWith('- Q:'))
assert.equal(answers.length, 5)
for (const answer of answers) assert.ok(context.includes(answer), 'Esclarecimento preservado')

assert.ok(!existsSync(join(root, '.specify')), 'Spec Kit não deve continuar ativo')
assert.ok(!readdirSync(join(root, '.agents/skills')).some(name => name.startsWith('speckit-')))

const revision = '757bedf'
const oldFiles = execFileSync('git', ['ls-tree', '-r', '--name-only', revision], { cwd: root, encoding: 'utf8' })
  .trim().split('\n').filter(file => file.startsWith('.specify/') || file.startsWith('specs/') || file.startsWith('.agents/skills/speckit-'))
for (const original of oldFiles) {
  const archived = original.startsWith('.specify/')
    ? original.replace('.specify/', 'docs/legacy/spec-kit/specify/')
    : original.startsWith('specs/')
      ? `docs/legacy/spec-kit/${original}`
      : original.replace('.agents/skills/', 'docs/legacy/spec-kit/skills/')
  const oldBytes = execFileSync('git', ['show', `${revision}:${original}`], { cwd: root })
  assert.deepEqual(readFileSync(join(root, archived)), oldBytes, `Arquivo histórico intacto: ${original}`)
}

const docs = ['README.md', 'PRODUCT.md', 'DESIGN.md',
  'docs/projeto/contexto-negocio.md', 'docs/projeto/fundacao.md', 'docs/projeto/referencia-atendimento.md',
  'docs/processo/migracao-openspec.md', 'docs/processo/rastreabilidade.md', 'docs/legacy/spec-kit/README.md',
  ...current.map(({ file }) => file)]
for (const file of docs) {
  for (const match of read(file).matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0]
    if (!target || /^(?:[a-z]+:|\/)/i.test(target)) continue
    assert.ok(existsSync(resolve(root, dirname(file), target)), `Link válido em ${file}: ${target}`)
  }
}
console.log(`Migração verificada: 8 capacidades, 54 requisitos, 12 jornadas, 12 critérios, 5 esclarecimentos, ${oldFiles.length} arquivos históricos intactos e links locais válidos.`)
