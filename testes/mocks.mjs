// KV e R2 falsos, em memória, com a mesma interface dos bindings da Cloudflare, e ajudantes de pedido.
export const SITE = 'https://alexandreh.com';
export const SEGREDO = 'segredo-de-teste';
export const HOOK = 'segredo-do-webhook';

export class KVFalso {
  constructor() { this.m = new Map(); }
  _vivo(k) {
    const e = this.m.get(k);
    if (!e) return null;
    if (e.exp && Date.now() >= e.exp) { this.m.delete(k); return null; }
    return e;
  }
  async get(k, tipo) {
    const e = this._vivo(k);
    if (!e) return null;
    const t = typeof tipo === 'string' ? tipo : tipo?.type;
    return t === 'json' ? JSON.parse(e.v) : e.v;
  }
  async put(k, v, op = {}) {
    if (typeof v !== 'string') throw new Error('KVFalso: guarde texto');
    if (op.expirationTtl != null && op.expirationTtl < 60) throw new Error(`KV real recusa expirationTtl < 60 (veio ${op.expirationTtl})`);
    const exp = op.expirationTtl ? Date.now() + op.expirationTtl * 1000 : op.expiration ? op.expiration * 1000 : 0;
    if (op.metadata !== undefined && new TextEncoder().encode(JSON.stringify(op.metadata)).length > 1024) throw new Error('KVFalso: metadata acima de 1024 bytes (o KV real recusa)');
    this.m.set(k, { v, exp, ttl: op.expirationTtl, metadata: op.metadata ?? null });
  }
  async delete(k) { this.m.delete(k); }
  async list({ prefix = '' } = {}) {
    const keys = [...this.m.keys()].filter((k) => k.startsWith(prefix) && this._vivo(k)).map((name) => ({ name, metadata: this.m.get(name).metadata }));
    return { keys, list_complete: true };
  }
  chaves(prefixo = '') { return [...this.m.keys()].filter((k) => k.startsWith(prefixo) && this._vivo(k)); }
  ttlDe(k) { return this.m.get(k)?.ttl; }
  metadataDe(k) { return this.m.get(k)?.metadata; }
}

export class R2Falso {
  constructor() { this.m = new Map(); }
  async put(k, bytes) { this.m.set(k, new Uint8Array(bytes)); }
  async get(k) {
    const b = this.m.get(k);
    if (!b) return null;
    return { body: new Response(b).body, size: b.length, httpEtag: '"teste"' };
  }
}

export function ambiente(extra = {}) {
  return { FAISCA: new KVFalso(), ZIPS: new R2Falso(), SESSAO_SEGREDO: SEGREDO, WEBHOOK_NUVPAG_SEGREDO: HOOK, TURNSTILE_SECRET: 'turnstile-secreto', EMAIL_REMETENTE: 'Faísca <oi@alexandreh.com>', ...extra };
}

/** POST JSON vindo do próprio site (Origin certo), com IP escolhido. */
export function post(caminho, corpo, { origem = SITE, ip = '200.1.2.3', cabecalhos = {} } = {}) {
  const h = { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...cabecalhos };
  if (origem) h.origin = origem;
  return new Request(SITE + caminho, { method: 'POST', headers: h, body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) });
}

export const get = (caminho, cookie) => new Request(SITE + caminho, { headers: cookie ? { cookie } : {} });

/** Pega o valor "nome=valor" do Set-Cookie para mandar de volta. */
export const cookieDe = (resp) => (resp.headers.get('set-cookie') || '').split(';')[0];

/** Executa fn com o relógio adiantado em `ms`. */
export async function comRelogio(ms, fn) {
  const real = Date.now;
  Date.now = () => real() + ms;
  try { return await fn(); } finally { Date.now = real; }
}

/** Troca o fetch global; devolve a lista de chamadas feitas. */
export function fetchFalso(resposta) {
  const chamadas = [];
  globalThis.fetch = async (url, op = {}) => { chamadas.push({ url: String(url), op }); return typeof resposta === 'function' ? resposta(url, op) : resposta.clone(); };
  return chamadas;
}
