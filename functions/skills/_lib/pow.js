// Anti-robô por prova de trabalho (sem chave nem conta externa).
// O servidor entrega um desafio assinado; o navegador procura uma `solucao` tal que
// SHA-256(desafio + ":" + solucao) comece com `bits` zeros. Custa ~2^bits tentativas para quem resolve
// e UMA conta para o servidor conferir. O nonce só vale uma vez (o lead marca `pow:<nonce>` no KV).
import { assinar, b64url, deB64url, iguais } from './token.js';

export const BITS_POW = 18; // ~262 mil tentativas em média
export const VALIDADE_DESAFIO_MS = 120 * 1000;
export const TTL_NONCE_S = 600;

const enc = new TextEncoder();
const dec = new TextDecoder();

/** → { desafio, bits } */
export async function criarDesafio(segredo, agora = Date.now(), bits = BITS_POW) {
  const nonce = new Uint8Array(16);
  crypto.getRandomValues(nonce);
  const corpo = b64url(enc.encode(JSON.stringify({ n: b64url(nonce), exp: agora + VALIDADE_DESAFIO_MS })));
  return { desafio: `${corpo}.${await assinar(`pow:${corpo}`, segredo)}`, bits };
}

/** Quantos bits zero há no começo dos bytes. */
export function zerosAEsquerda(bytes) {
  let n = 0;
  for (const b of bytes) {
    if (b === 0) { n += 8; continue; }
    return n + Math.clz32(b) - 24;
  }
  return n;
}

/**
 * Confere assinatura, validade e trabalho. NÃO marca o nonce (isso é do chamador, no KV).
 * → { ok:true, nonce } | { ok:false, motivo:'invalido'|'vencido'|'solucao' }
 */
export async function conferirDesafio(desafio, solucao, segredo, agora = Date.now(), bits = BITS_POW) {
  if (typeof desafio !== 'string' || desafio.length > 300) return { ok: false, motivo: 'invalido' };
  const partes = desafio.split('.');
  if (partes.length !== 2) return { ok: false, motivo: 'invalido' };
  const [corpo, sig] = partes;
  if (!(await iguais(await assinar(`pow:${corpo}`, segredo), sig))) return { ok: false, motivo: 'invalido' };
  let d;
  try { d = JSON.parse(dec.decode(deB64url(corpo))); } catch { return { ok: false, motivo: 'invalido' }; }
  if (typeof d.n !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(d.n) || !Number.isFinite(d.exp)) return { ok: false, motivo: 'invalido' };
  if (agora > d.exp) return { ok: false, motivo: 'vencido' };
  if (typeof solucao !== 'string' && typeof solucao !== 'number') return { ok: false, motivo: 'solucao' };
  const s = String(solucao);
  if (!s || s.length > 64) return { ok: false, motivo: 'solucao' };
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(`${desafio}:${s}`)));
  if (zerosAEsquerda(h) < bits) return { ok: false, motivo: 'solucao' };
  return { ok: true, nonce: d.n };
}
