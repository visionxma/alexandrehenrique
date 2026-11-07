// Respostas JSON em pt-BR, cookies e pequenos ajudantes de pedido, comuns a todas as rotas de /skills/api.

const CABECALHOS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };

/** Resposta JSON. `extra` aceita cabeçalhos a mais (ex.: Set-Cookie). */
export function json(obj, status = 200, extra = {}) {
  const h = new Headers(CABECALHOS);
  for (const [k, v] of Object.entries(extra)) h.append(k, v);
  return new Response(JSON.stringify(obj), { status, headers: h });
}

/** Erro padrão: { ok:false, msg, ...campos } */
export const erro = (msg, status, campos = {}) => json({ ok: false, msg, ...campos }, status);

export const MSG = {
  invalido: 'Pedido inválido.',
  indisponivel: 'Serviço indisponível agora. Tente em instantes.',
  muitos: 'Muitas tentativas. Espere um pouco e tente de novo.',
  semSessao: 'Entre com o seu e-mail para continuar.',
};

/** Lê o corpo como JSON; devolve null se não for JSON válido de objeto. */
export async function lerJson(request) {
  try {
    const b = await request.json();
    return b && typeof b === 'object' && !Array.isArray(b) ? b : null;
  } catch {
    return null;
  }
}

/** POST do navegador: exige Origin igual ao host do próprio site (barra outro site e script sem Origin). */
export function mesmaOrigem(request) {
  const origem = request.headers.get('origin');
  if (!origem) return false;
  try {
    return new URL(origem).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

/** IP do visitante (a Cloudflare preenche cf-connecting-ip). */
export const ipDe = (request) => request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0].trim() || '0.0.0.0';

/** Lê um cookie pelo nome. */
export function lerCookie(request, nome) {
  const bruto = request.headers.get('cookie') || '';
  for (const parte of bruto.split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nome) return parte.slice(i + 1).trim();
  }
  return null;
}

/** Ambiente de desenvolvimento: SÓ quando AMBIENTE é exatamente "dev". Ausente ou "prod" nunca libera atalho. */
export const emDev = (env) => env?.AMBIENTE === 'dev';
