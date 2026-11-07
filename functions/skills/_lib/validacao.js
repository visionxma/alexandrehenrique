// Validação dos dados do formulário (nome, celular, e-mail). Funções puras: fáceis de testar.

// DDDs em uso no Brasil (lista da Anatel, 67 códigos).
export const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

// Mínimo de letras no nome inteiro: 2 palavras × 3 letras ("≥3 letras cada, na soma").
const MIN_LETRAS_NOME = 6;

/** → { ok:true, nome } | { ok:false, msg } */
export function validarNome(bruto) {
  // tira espaço repetido e símbolo de fórmula no começo (=, +, -, @) para quem abrir a lista numa planilha
  const nome = String(bruto ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').replace(/^[=+\-@\t\r]+/, '').trim();
  const falha = { ok: false, msg: 'Escreva seu nome e sobrenome.' };
  if (nome.length > 80 || /\d/.test(nome)) return falha;
  // só letras, espaço, apóstrofo, hífen e ponto (D'Ávila, Ana-Clara, Jr.)
  if (!/^[\p{L}\p{M}' .-]+$/u.test(nome)) return falha;
  const palavras = nome.split(' ').filter((p) => /\p{L}/u.test(p));
  if (palavras.length < 2) return falha;
  const letras = nome.match(/\p{L}/gu) || [];
  if (letras.length < MIN_LETRAS_NOME) return falha;
  if (new Set(letras.map((l) => l.toLowerCase())).size < 3) return falha; // "aaa aaa", "ab ba ab"
  return { ok: true, nome };
}

// Assinante de 8 dígitos (depois do 9) que não é número de gente: repetido, sequência, par alternado.
function numeroFalso(oito) {
  if (/^(\d)\1+$/.test(oito)) return true; // 11111111
  if (/^(\d\d)\1+$/.test(oito)) return true; // 12121212
  if (/^(\d{4})\1$/.test(oito)) return true; // 12341234
  const d = [...oito].map(Number);
  const passo = (p) => d.every((x, i) => i === 0 || x === (d[i - 1] + p + 10) % 10);
  return passo(1) || passo(-1); // 12345678, 87654321 (com volta: 78901234)
}

/** Celular brasileiro → { ok:true, telefone:'+55DDD9XXXXXXXX' } | { ok:false, msg } */
export function validarTelefone(bruto) {
  let d = String(bruto ?? '').replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2); // +55
  if (d.length === 12 && d.startsWith('0')) d = d.slice(1); // 0 + DDD (discagem antiga)
  if (d.length === 10) return { ok: false, msg: 'Use um número de celular (com o 9 na frente).' }; // fixo
  if (d.length !== 11) return { ok: false, msg: 'Confira o celular com DDD.' };
  const ddd = Number(d.slice(0, 2));
  if (!DDDS.has(ddd)) return { ok: false, msg: 'Esse DDD não existe. Confira o número.' };
  const numero = d.slice(2);
  if (numero[0] !== '9') return { ok: false, msg: 'Use um número de celular (com o 9 na frente).' };
  if (numeroFalso(numero.slice(1)) || /^(\d)\1+$/.test(numero)) return { ok: false, msg: 'Confira o celular com DDD.' };
  return { ok: true, telefone: `+55${d}` };
}

/** E-mail em minúsculas, formato simples. → string ou null */
export function normalizarEmail(bruto) {
  const e = String(bruto ?? '').trim().toLowerCase();
  if (e.length < 6 || e.length > 254) return null;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(e)) return null;
  return e;
}

/** Máscara para log: nunca o dado inteiro. */
export const mascararEmail = (e) => String(e || '').replace(/^(.).*(@.).*$/, '$1***$2***');
export const mascararTelefone = (t) => String(t || '').replace(/^(\+55\d{2}).*(\d{2})$/, '$1*****$2');
