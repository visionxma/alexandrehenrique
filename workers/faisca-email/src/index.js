// Recebe { para, assunto, texto, html } do Pages (service binding) e envia pelo Email Sending (domínio mail.alexandreh.com).
// Não tem rota pública; nunca registra o e-mail nem o conteúdo.
const REMETENTE = { email: 'acesso@mail.alexandreh.com', name: 'Faísca' };

export default {
  async fetch(req, env) {
    if (req.method !== 'POST') return new Response('método não permitido', { status: 405 });
    let b;
    try { b = await req.json(); } catch { return new Response('json inválido', { status: 400 }); }
    const { para, assunto, texto, html } = b || {};
    if (!/^[^@\s]{1,64}@[^@\s]+\.[^@\s]+$/.test(para || '') || para.length > 254 || !assunto || !texto) return new Response('dados inválidos', { status: 422 });
    try {
      const r = await env.EMAIL.send({ to: para, from: REMETENTE, subject: String(assunto).slice(0, 200), text: String(texto), html: html ? String(html) : undefined });
      return Response.json({ ok: true, id: r && r.messageId ? r.messageId : null });
    } catch (e) {
      return Response.json({ ok: false, erro: String((e && e.message) || e).slice(0, 160) }, { status: 502 });
    }
  },
};
