// Acesso ao KV FAISCA: nomes das chaves num lugar só e leitura/escrita de JSON.
//   lead:<id>        → { nome, telefone, skill, quando, ipHash, ua }
//   tel:<hash>       → <id do lead>                 (dedupe pelo hash do telefone)
//   pago:<email>     → { nome, produto, transacao, quando }   (e-mail em minúsculas)
//   otp:<email>      → { hash, tentativas, exp }    (TTL 10 min)
//   hook:<ts>-<n>    → resumo do webhook            (TTL 30 dias)
//   lim:<escopo>:<hash>:<hora> → contador           (TTL ~1 hora)

export const K = {
  lead: (id) => `lead:${id}`,
  tel: (hash) => `tel:${hash}`,
  pago: (email) => `pago:${email}`,
  otp: (email) => `otp:${email}`,
  hook: (ts, n) => `hook:${ts}-${n}`,
};

// O KV real recusa expirationTtl abaixo de 60 s.
export const ttl = (segundos) => Math.max(60, Math.ceil(segundos));

export async function lerJSON(kv, chave) {
  const v = await kv.get(chave);
  if (v == null) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

export const gravarJSON = (kv, chave, valor, opcoes) => kv.put(chave, JSON.stringify(valor), opcoes);
