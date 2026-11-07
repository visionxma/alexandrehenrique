// Embute no código as 5 skills grátis da Faísca (zip em base64) e o mapa do catálogo (id → categoria).
// Gera dois arquivos — não edite nenhum à mão, rode de novo este roteiro:
//   functions/skills/_lib/gratis.js    → GRATIS = { <id>: { arquivo, base64 }, todas: { ... } }
//   functions/skills/_lib/catalogo.js  → SKILLS = { <id>: <categoria> }, CATEGORIAS = [<slug>...]
// A chave "todas" é um zip único com as 5: pasta raiz faisca-5-skills-gratis/ com as 5 pastas de skill,
// NOTICES.md (só as linhas das 5) e LEIA-ME.md. Montado aqui mesmo, sem dependência (DEFLATE do node:zlib).
// Origem: ~/Projetos/area-membros-skills/site (dados/catalogo.json, dados/NOTICES.md e downloads/skills/<categoria>/<id>.zip).
// Uso: node ferramentas/embutir-gratis.mjs [pasta-do-site-da-area-de-membros]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

const GRATIS = ['systematic-debugging', 'brainstorming', 'humanizer', 'code-review', 'ui-ux-pro-max'];
const RAIZ_TODAS = 'faisca-5-skills-gratis';
const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const origem = process.argv[2] || path.join(os.homedir(), 'Projetos/area-membros-skills/site');
const catalogo = JSON.parse(fs.readFileSync(path.join(origem, 'dados/catalogo.json'), 'utf8'));
const seguro = /^[a-z0-9-]+$/;

// ---- mapa do catálogo: serve para achar a categoria de uma skill e barrar caminho malicioso
const skills = {};
for (const s of catalogo.skills) {
  if (!seguro.test(s.id) || !seguro.test(s.categoria)) throw new Error(`id ou categoria fora do padrão: ${s.id} / ${s.categoria}`);
  if (skills[s.id]) throw new Error(`id repetido no catálogo: ${s.id}`);
  skills[s.id] = s.categoria;
}
const categorias = catalogo.categorias.map((c) => c.slug);
for (const c of categorias) if (!seguro.test(c)) throw new Error(`categoria fora do padrão: ${c}`);
fs.writeFileSync(
  path.join(raiz, 'functions/skills/_lib/catalogo.js'),
  `// GERADO por ferramentas/embutir-gratis.mjs a partir de dados/catalogo.json da área de membros. Não edite à mão.\n` +
    `export const SKILLS = ${JSON.stringify(skills)};\n` +
    `export const CATEGORIAS = ${JSON.stringify(categorias)};\n`,
);

// ---- escritor de zip mínimo (DEFLATE ou STORE, nomes em UTF-8, data fixa para o zip sair igual a cada geração)
const DATA_DOS = ((2026 - 1980) << 9) | (11 << 5) | 7; // 07/11/2026
const HORA_DOS = 0;
function montarZip(entradas) {
  const locais = [];
  const centrais = [];
  let deslocamento = 0;
  for (const e of entradas) {
    const nome = Buffer.from(e.nome, 'utf8');
    const pasta = e.nome.endsWith('/');
    const dados = pasta ? Buffer.alloc(0) : e.dados;
    const crc = pasta ? 0 : zlib.crc32(dados);
    const comprimido = pasta ? dados : zlib.deflateRawSync(dados, { level: 9 });
    const metodo = !pasta && comprimido.length < dados.length ? 8 : 0;
    const corpo = metodo === 8 ? comprimido : dados;
    const modo = pasta ? 0o40755 : e.modo & 0o111 ? 0o100755 : 0o100644;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // versão necessária
    local.writeUInt16LE(0x0800, 6); // bit 11: nome em UTF-8
    local.writeUInt16LE(metodo, 8);
    local.writeUInt16LE(HORA_DOS, 10);
    local.writeUInt16LE(DATA_DOS, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(corpo.length, 18);
    local.writeUInt32LE(dados.length, 22);
    local.writeUInt16LE(nome.length, 26);
    local.writeUInt16LE(0, 28);
    locais.push(local, nome, corpo);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4); // feito em Unix, versão 2.0
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(metodo, 10);
    central.writeUInt16LE(HORA_DOS, 12);
    central.writeUInt16LE(DATA_DOS, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(corpo.length, 20);
    central.writeUInt32LE(dados.length, 24);
    central.writeUInt16LE(nome.length, 28);
    // extra, comentário, disco, atributos internos = 0
    central.writeUInt32LE(((modo << 16) | (pasta ? 0x10 : 0)) >>> 0, 38);
    central.writeUInt32LE(deslocamento, 42);
    centrais.push(central, nome);

    deslocamento += 30 + nome.length + corpo.length;
  }
  const tamCentral = centrais.reduce((s, b) => s + b.length, 0);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(entradas.length, 8);
  fim.writeUInt16LE(entradas.length, 10);
  fim.writeUInt32LE(tamCentral, 12);
  fim.writeUInt32LE(deslocamento, 16);
  return Buffer.concat([...locais, ...centrais, fim]);
}

function listarArquivos(dir, base = dir) {
  const saida = [];
  for (const d of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (d.name === '.DS_Store' || d.name === '__MACOSX') continue;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) saida.push({ rel: path.relative(base, p) + '/' }, ...listarArquivos(p, base));
    else if (d.isFile()) saida.push({ rel: path.relative(base, p), p });
  }
  return saida;
}

const LEIA_ME = `# Faísca — 5 skills grátis para o Claude Code

Este pacote traz 5 skills: ${GRATIS.map((s) => `\`${s}\``).join(', ')}.

## Como instalar

1. Descompacte este zip.
2. Copie as 5 pastas de dentro de \`${RAIZ_TODAS}/\` (não a pasta \`${RAIZ_TODAS}\` em si) para a pasta de skills do Claude Code:
   - **Mac e Linux:** \`~/.claude/skills/\`
   - **Windows:** \`%USERPROFILE%\\.claude\\skills\\\`
   Se a pasta \`skills\` não existir, crie.
3. Reinicie o Claude Code. As skills aparecem sozinhas e são usadas quando o pedido combina com elas.

## Licenças

Cada skill pertence ao seu autor. Mantenha o arquivo \`LICENSE\` (e \`NOTICE\`, quando houver) dentro da pasta de cada skill.
Autoria e licença de cada uma estão em \`NOTICES.md\`.
`;

// NOTICES.md só com o que vale para as 5: introdução, cabeçalho da tabela, as 5 linhas e a seção de alterações.
function noticesDas5() {
  const linhas = fs.readFileSync(path.join(origem, 'dados/NOTICES.md'), 'utf8').split('\n');
  const inicioTabela = linhas.findIndex((l) => l.startsWith('|'));
  const alteracoes = linhas.findIndex((l) => l.startsWith('## Alterações'));
  const linhasDas5 = linhas.filter((l) => GRATIS.some((id) => l.startsWith('|') && l.includes(`| \`${id}\` |`)));
  if (inicioTabela < 0 || linhasDas5.length !== GRATIS.length) return linhas.join('\n'); // formato mudou: vai o arquivo inteiro
  const fimIntro = linhas.slice(0, inicioTabela);
  const resto = alteracoes >= 0 ? ['', ...linhas.slice(alteracoes)] : [];
  return [...fimIntro, linhas[inicioTabela], linhas[inicioTabela + 1], ...linhasDas5, ...resto].join('\n');
}

// ---- os 5 zips grátis, embutidos (não ficam como arquivo público do site), e o zip "todas"
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'faisca-gratis-'));
let total = 0;
const linhas = [];
const entradasTodas = [{ nome: `${RAIZ_TODAS}/` }];
try {
  for (const id of GRATIS) {
    const cat = skills[id];
    if (!cat) throw new Error(`skill grátis fora do catálogo: ${id}`);
    const arq = path.join(origem, 'downloads/skills', cat, `${id}.zip`);
    const bin = fs.readFileSync(arq);
    if (bin[0] !== 0x50 || bin[1] !== 0x4b) throw new Error(`não é zip: ${id}`);
    const b64 = bin.toString('base64');
    total += b64.length;
    linhas.push(`  ${JSON.stringify(id)}: { arquivo: ${JSON.stringify(`${id}.zip`)}, base64: '${b64}' },`);

    // conteúdo do zip individual; ele já vem com a pasta <id>/ na raiz, então não se repete a pasta
    const destino = path.join(tmp, id);
    execFileSync('unzip', ['-q', '-o', arq, '-d', destino]);
    if (!fs.existsSync(path.join(destino, id, 'SKILL.md'))) throw new Error(`zip de ${id} sem ${id}/SKILL.md na raiz`);
    for (const f of listarArquivos(destino)) {
      const nome = `${RAIZ_TODAS}/${f.rel.split(path.sep).join('/')}`;
      entradasTodas.push(f.p ? { nome, dados: fs.readFileSync(f.p), modo: fs.statSync(f.p).mode } : { nome });
    }
  }
  entradasTodas.push({ nome: `${RAIZ_TODAS}/LEIA-ME.md`, dados: Buffer.from(LEIA_ME, 'utf8'), modo: 0o644 });
  entradasTodas.push({ nome: `${RAIZ_TODAS}/NOTICES.md`, dados: Buffer.from(noticesDas5(), 'utf8'), modo: 0o644 });
  const todas = montarZip(entradasTodas);
  const saidaTodas = path.join(tmp, `${RAIZ_TODAS}.zip`);
  fs.writeFileSync(saidaTodas, todas);
  execFileSync('unzip', ['-tq', saidaTodas]); // confere a integridade (CRC) antes de embutir
  const b64 = todas.toString('base64');
  total += b64.length;
  linhas.push(`  todas: { arquivo: ${JSON.stringify(`${RAIZ_TODAS}.zip`)}, base64: '${b64}' },`);
  console.log(`todas: ${entradasTodas.length} entradas, ${Math.round(todas.length / 1024)} KB de zip`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

fs.writeFileSync(
  path.join(raiz, 'functions/skills/_lib/gratis.js'),
  `// GERADO por ferramentas/embutir-gratis.mjs a partir dos zips da área de membros. Não edite à mão.\n` +
    `// Chaves: as 5 skills grátis e "todas" (as 5 num zip só, com LEIA-ME.md e NOTICES.md).\n` +
    `export const GRATIS = {\n${linhas.join('\n')}\n};\n`,
);
console.log(`catalogo.js: ${Object.keys(skills).length} skills, ${categorias.length} categorias`);
console.log(`gratis.js: ${linhas.length} zips, ${Math.round(total / 1024)} KB em base64`);
