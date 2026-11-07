// Assinaturas HMAC-SHA256 (Web Crypto, sem dependência): token do download grátis, cookie de sessão,
// hash com chave para telefone/IP/código e comparação em tempo constante.
const enc = new TextEncoder();
const dec = new TextDecoder();

// ---- base64url
export function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function deB64url(texto) {
  const s = String(texto).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// ---- HMAC
const chaves = new Map();
async function chave(segredo) {
  if (!segredo) throw new Error('segredo ausente');
  if (!chaves.has(segredo)) chaves.set(segredo, crypto.subtle.importKey('raw', enc.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']));
  return chaves.get(segredo);
}
export async function hmac(texto, segredo) {
  return new Uint8Array(await crypto.subtle.sign('HMAC', await chave(segredo), enc.encode(texto)));
}
/** HMAC em base64url (curto o bastante para chave de KV e cookie). */
export const assinar = async (texto, segredo) => b64url(await hmac(texto, segredo));

/** Hash com chave, para guardar telefone, IP e código sem deixar o valor puro (espaço pequeno = SHA puro se quebra). */
export const hashComChave = async (escopo, valor, segredo) => (await assinar(`${escopo}:${valor}`, segredo)).slice(0, 32);

/** Compara dois textos em tempo constante: compara os SHA-256 dos dois, então o tamanho não vaza. */
export async function iguais(a, b) {
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(String(a ?? ''))), crypto.subtle.digest('SHA-256', enc.encode(String(b ?? '')))]);
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let d = 0;
  for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i];
  return d === 0 && typeof a === 'string' && typeof b === 'string';
}

// ---- token do download grátis: <leadId>.<expira>.<assinatura de skill+lead+expira>
export const VALIDADE_GRATIS_MS = 10 * 60 * 1000;

export async function tokenGratis(skill, leadId, segredo, agora = Date.now()) {
  const exp = agora + VALIDADE_GRATIS_MS;
  return `${leadId}.${exp}.${await assinar(`gratis:${skill}:${leadId}:${exp}`, segredo)}`;
}

/** → { ok:true, leadId } | { ok:false, motivo:'invalido'|'vencido' } */
export async function conferirTokenGratis(token, skill, segredo, agora = Date.now()) {
  const partes = String(token || '').split('.');
  if (partes.length !== 3) return { ok: false, motivo: 'invalido' };
  const [leadId, expTxt, sig] = partes;
  const exp = Number(expTxt);
  if (!/^[a-z0-9-]{8,64}$/i.test(leadId) || !Number.isSafeInteger(exp)) return { ok: false, motivo: 'invalido' };
  const certa = await assinar(`gratis:${skill}:${leadId}:${exp}`, segredo);
  if (!(await iguais(certa, sig))) return { ok: false, motivo: 'invalido' };
  if (agora > exp) return { ok: false, motivo: 'vencido' };
  return { ok: true, leadId };
}

// ---- cookie de sessão: base64url(json{email,exp}).assinatura
export const COOKIE_SESSAO = 'faisca_sessao';
export const VALIDADE_SESSAO_S = 30 * 24 * 60 * 60;

export async function criarSessao(email, segredo, agora = Date.now()) {
  const corpo = b64url(enc.encode(JSON.stringify({ email, exp: agora + VALIDADE_SESSAO_S * 1000 })));
  return `${corpo}.${await assinar(`sessao:${corpo}`, segredo)}`;
}

/** → { email } se o cookie é íntegro e está no prazo; senão null. */
export async function lerSessao(valor, segredo, agora = Date.now()) {
  const [corpo, sig, sobra] = String(valor || '').split('.');
  if (!corpo || !sig || sobra !== undefined) return null;
  if (!(await iguais(await assinar(`sessao:${corpo}`, segredo), sig))) return null;
  try {
    const d = JSON.parse(dec.decode(deB64url(corpo)));
    if (typeof d.email !== 'string' || !Number.isFinite(d.exp) || agora > d.exp) return null;
    return { email: d.email };
  } catch {
    return null;
  }
}

export const cookieSessao = (valor) => `${COOKIE_SESSAO}=${valor}; HttpOnly; Secure; SameSite=Lax; Path=/skills; Max-Age=${VALIDADE_SESSAO_S}`;
export const cookieApagado = () => `${COOKIE_SESSAO}=; HttpOnly; Secure; SameSite=Lax; Path=/skills; Max-Age=0`;

/** Hash do código ligado ao e-mail: o mesmo código num e-mail diferente não confere. */
export const hashCodigo = (email, codigo, segredo) => assinar(`otp:${email}:${codigo}`, segredo);

// ---- código de 6 dígitos sem viés (rejeita a sobra do Uint32 que deixaria uns dígitos mais prováveis)
export function codigoSeisDigitos() {
  const teto = Math.floor(0x100000000 / 1_000_000) * 1_000_000;
  const n = new Uint32Array(1);
  do crypto.getRandomValues(n); while (n[0] >= teto);
  return String(n[0] % 1_000_000).padStart(6, '0');
}
