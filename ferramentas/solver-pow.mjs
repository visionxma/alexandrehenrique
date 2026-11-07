// Resolve o desafio de prova de trabalho de /skills/api/desafio (para o smoke test e testes de navegador).
// Procura a menor `solucao` decimal (0, 1, 2…) tal que SHA-256(desafio + ":" + solucao) tenha `bits` zeros à esquerda.
//   import { solve } from './ferramentas/solver-pow.mjs';  solve(desafio, 18) → '123456'
//   node ferramentas/solver-pow.mjs <desafio> [bits]       → imprime a solução
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

function zeros(buf) {
  let n = 0;
  for (const b of buf) {
    if (b === 0) { n += 8; continue; }
    return n + Math.clz32(b) - 24;
  }
  return n;
}

export function solve(desafio, bits = 18, limite = 2 ** 28) {
  for (let i = 0; i < limite; i++) {
    const s = String(i);
    if (zeros(createHash('sha256').update(`${desafio}:${s}`).digest()) >= bits) return s;
  }
  throw new Error(`sem solução em ${limite} tentativas`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [desafio, bits = '18'] = process.argv.slice(2);
  if (!desafio) { console.error('uso: node ferramentas/solver-pow.mjs <desafio> [bits]'); process.exit(2); }
  console.log(solve(desafio, Number(bits)));
}
