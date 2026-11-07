// Embute no código as 5 skills grátis da Faísca (zip em base64) e o mapa do catálogo (id → categoria).
// Gera dois arquivos — não edite nenhum à mão, rode de novo este roteiro:
//   functions/skills/_lib/gratis.js    → GRATIS = { <id>: { arquivo, base64 } }
//   functions/skills/_lib/catalogo.js  → SKILLS = { <id>: <categoria> }, CATEGORIAS = [<slug>...]
// Origem: ~/Projetos/area-membros-skills/site (dados/catalogo.json e downloads/skills/<categoria>/<id>.zip).
// Uso: node ferramentas/embutir-gratis.mjs [pasta-do-site-da-area-de-membros]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const GRATIS = ['systematic-debugging', 'brainstorming', 'humanizer', 'code-review', 'ui-ux-pro-max'];
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

// ---- os 5 zips grátis, embutidos (não ficam como arquivo público do site)
let total = 0;
const linhas = GRATIS.map((id) => {
  const cat = skills[id];
  if (!cat) throw new Error(`skill grátis fora do catálogo: ${id}`);
  const bin = fs.readFileSync(path.join(origem, 'downloads/skills', cat, `${id}.zip`));
  if (bin[0] !== 0x50 || bin[1] !== 0x4b) throw new Error(`não é zip: ${id}`);
  const b64 = bin.toString('base64');
  total += b64.length;
  return `  ${JSON.stringify(id)}: { arquivo: ${JSON.stringify(`${id}.zip`)}, base64: '${b64}' },`;
});
fs.writeFileSync(
  path.join(raiz, 'functions/skills/_lib/gratis.js'),
  `// GERADO por ferramentas/embutir-gratis.mjs a partir dos zips da área de membros. Não edite à mão.\n` +
    `export const GRATIS = {\n${linhas.join('\n')}\n};\n`,
);
console.log(`catalogo.js: ${Object.keys(skills).length} skills, ${categorias.length} categorias`);
console.log(`gratis.js: ${GRATIS.length} zips, ${Math.round(total / 1024)} KB em base64`);
