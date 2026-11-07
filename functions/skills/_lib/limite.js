// Limite de taxa simples no KV: contador por janela fixa (padrão 1 hora).
// O KV não é atômico: em rajada simultânea passa um pouco além do limite. Serve para frear robô, não é cofre.
import { ttl } from './kv.js';

/**
 * Conta mais um pedido e diz se ainda cabe.
 * @param kv       binding do KV
 * @param escopo   ex.: 'lead-ip', 'lead-tel', 'entrar-email'
 * @param chave    identificador JÁ em hash (nunca IP, telefone ou e-mail puro)
 * @returns { ok, restantes }
 */
export async function contar(kv, escopo, chave, limite = 5, janelaS = 3600, agora = Date.now()) {
  const janela = Math.floor(agora / (janelaS * 1000));
  const k = `lim:${escopo}:${chave}:${janela}`;
  const atual = Number(await kv.get(k)) || 0;
  if (atual >= limite) return { ok: false, restantes: 0 };
  await kv.put(k, String(atual + 1), { expirationTtl: ttl(janelaS + 60) });
  return { ok: true, restantes: limite - atual - 1 };
}
