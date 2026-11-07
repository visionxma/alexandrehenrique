// Medição de funil por etapa, no servidor: um contador por dia e por evento no KV.
//   m:<AAAA-MM-DD em America/Sao_Paulo>:<evento> → número em texto (TTL 120 dias)
// Sem dado pessoal: nem IP, nem e-mail, nem telefone entram aqui. O KV não é atômico, então em rajada
// simultânea o número pode ficar um pouco abaixo do real: serve para ver o funil, não para contabilidade.
import { ttl } from './kv.js';

/** Etapas que o navegador pode reportar em POST /skills/api/medir. */
export const EVENTOS_CLIENTE = ['visita', 'clique_painel', 'abre_baixar', 'clique_comprar'];
/** Lista fechada: o que o servidor aceita contar. `baixou_gratis`, `compra_aprovada` e `reembolso` só nascem no servidor. */
export const EVENTOS = ['visita', 'clique_painel', 'abre_baixar', 'baixou_gratis', 'clique_comprar', 'compra_aprovada', 'reembolso'];

export const TTL_METRICA_S = 120 * 24 * 60 * 60;
export const K_METRICA = (dia, evento) => `m:${dia}:${evento}`;

const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Dia civil de São Paulo, AAAA-MM-DD. */
export const diaSP = (agora = Date.now()) => fmtDia.format(new Date(agora));

/** Os últimos `n` dias (o mais antigo primeiro), terminando em hoje no calendário de São Paulo. */
export function ultimosDias(n, agora = Date.now()) {
  const [a, m, d] = diaSP(agora).split('-').map(Number);
  const base = Date.UTC(a, m - 1, d, 12); // meio-dia UTC: somar dias inteiros nunca cruza a virada
  return Array.from({ length: n }, (_, i) => new Date(base - (n - 1 - i) * 86400000).toISOString().slice(0, 10));
}

/**
 * Soma 1 ao contador do dia. Nunca lança: KV ausente, evento fora da lista ou falha do KV viram no-op.
 * @returns true se gravou, false se ignorou
 */
export async function contar(env, evento, agora = Date.now()) {
  try {
    if (!env?.FAISCA || !EVENTOS.includes(evento)) return false;
    const chave = K_METRICA(diaSP(agora), evento);
    const atual = Number(await env.FAISCA.get(chave)) || 0;
    await env.FAISCA.put(chave, String(atual + 1), { expirationTtl: ttl(TTL_METRICA_S) });
    return true;
  } catch {
    return false;
  }
}
