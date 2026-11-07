#!/usr/bin/env bash
# Smoke test do backend da Faísca contra um `wrangler pages dev` LOCAL já ligado (AMBIENTE=dev, segredos "teste").
# Percorre: desafio → lead (prova de trabalho, reuso, sem token) → grátis → webhook de compra → entrar → código → eu → zip → reembolso → eu 401.
# Pré-requisito: `todas.zip` no R2 local (wrangler r2 object put faisca-skills/todas.zip --local --persist-to <estado> --file x.zip). Uso: bash ferramentas/smoke-local.sh [url-base]
set -uo pipefail
B="${1:-http://127.0.0.1:8830}"
O=(-H "origin: $B" -H 'content-type: application/json')
EMAIL="smoke-$RANDOM@exemplo.com"
falhas=0
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
confere() { # $1 nome, $2 esperado, $3 obtido
  if [ "$2" = "$3" ]; then echo "ok    $1 ($3)"; else echo "FALHOU $1: esperado $2, veio $3"; falhas=$((falhas + 1)); fi
}
st() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

# 1. desafio (prova de trabalho) → lead + download grátis
AQUI="$(cd "$(dirname "$0")" && pwd)"
r=$(curl -s "$B/skills/api/desafio")
desafio=$(printf '%s' "$r" | sed -n 's/.*"desafio":"\([^"]*\)".*/\1/p')
bits=$(printf '%s' "$r" | sed -n 's/.*"bits":\([0-9]*\).*/\1/p')
confere 'desafio com 18 bits' 18 "$bits"
t0=$(date +%s)
solucao=$(node "$AQUI/solver-pow.mjs" "$desafio" "$bits")
echo "      (solver em node: solução $solucao em $(( $(date +%s) - t0 )) s)"
corpo_pow="\"desafio\":\"$desafio\",\"solucao\":\"$solucao\""
confere 'lead sem anti-robô' 400 "$(st "${O[@]}" -X POST "$B/skills/api/lead" -d '{"nome":"Maria da Silva","telefone":"(21) 98877-6655","skill":"humanizer","aceito":true,"hp":""}')"
confere 'lead com solução errada' 400 "$(st "${O[@]}" -X POST "$B/skills/api/lead" -d "{\"nome\":\"Maria da Silva\",\"telefone\":\"(21) 98877-6655\",\"skill\":\"humanizer\",\"aceito\":true,\"desafio\":\"$desafio\",\"solucao\":\"x\"}")"
r=$(curl -s "${O[@]}" -X POST "$B/skills/api/lead" -d "{\"nome\":\"Maria da Silva\",\"telefone\":\"(19) 99524-4237\",\"skill\":\"humanizer\",\"aceito\":true,\"hp\":\"\",$corpo_pow}")
url=$(printf '%s' "$r" | sed -n 's/.*"url":"\([^"]*\)".*/\1/p')
confere 'lead com desafio reaproveitado' 400 "$(st "${O[@]}" -X POST "$B/skills/api/lead" -d "{\"nome\":\"Maria da Silva\",\"telefone\":\"(31) 96655-4433\",\"skill\":\"humanizer\",\"aceito\":true,$corpo_pow}")"
confere 'lead com dev-ok (dev)' 200 "$(st "${O[@]}" -X POST "$B/skills/api/lead" -d '{"nome":"Maria da Silva","telefone":"(41) 95544-3322","skill":"brainstorming","turnstile":"dev-ok","aceito":true}')"
confere 'lead devolve url' 1 "$([ -n "$url" ] && echo 1 || echo 0)"
cab=$(curl -s -D - -o "$TMP/gratis.zip" "$B$url" | tr -d '\r')
confere 'grátis 200' 200 "$(printf '%s' "$cab" | awk 'NR==1{print $2}')"
confere 'grátis é zip' PK "$(head -c 2 "$TMP/gratis.zip")"; rm -f "$TMP/gratis.zip"
confere 'grátis com skill paga' 404 "$(st "$B/skills/api/gratis?s=frontend-design&t=x")"

# 2. webhook de compra
confere 'webhook segredo errado' 401 "$(st -X POST "$B/skills/api/nuvpag" -H 'content-type: application/json' -d "{\"secret\":\"errado\",\"event\":\"purchase_approved\",\"data\":{\"customer\":{\"email\":\"$EMAIL\"}}}")"
r=$(curl -s -X POST "$B/skills/api/nuvpag" -H 'content-type: application/json' -d "{\"secret\":\"teste\",\"event\":\"purchase_approved\",\"data\":{\"id\":\"tx1\",\"customer\":{\"name\":\"Smoke\",\"email\":\"$EMAIL\"},\"product\":{\"name\":\"Faísca\"}}}")
confere 'webhook compra' liberado "$(printf '%s' "$r" | sed -n 's/.*"acao":"\([a-z]*\)".*/\1/p')"

# 3. entrar → código → eu
r=$(curl -s "${O[@]}" -X POST "$B/skills/api/membros/entrar" -d "{\"email\":\"$EMAIL\"}")
cod=$(printf '%s' "$r" | sed -n 's/.*"codigoDev":"\([0-9]*\)".*/\1/p')
confere 'entrar devolve código em dev' 6 "${#cod}"
r=$(curl -s "${O[@]}" -X POST "$B/skills/api/membros/entrar" -d '{"email":"ninguem@exemplo.com"}')
confere 'e-mail não pago sem código' 0 "$(printf '%s' "$r" | grep -c codigoDev)"
cab=$(curl -s -D - -o /dev/null "${O[@]}" -X POST "$B/skills/api/membros/codigo" -d "{\"email\":\"$EMAIL\",\"codigo\":\"$cod\"}" | tr -d '\r')
confere 'código 200' 200 "$(printf '%s' "$cab" | awk 'NR==1{print $2}')"
cookie=$(printf '%s' "$cab" | sed -n 's/^[Ss]et-[Cc]ookie: \(faisca_sessao=[^;]*\).*/\1/p')
confere 'cookie HttpOnly/Secure/Lax/Path' 1 "$(printf '%s' "$cab" | grep -ic 'set-cookie: faisca_sessao=.*HttpOnly; Secure; SameSite=Lax; Path=/skills')"
confere 'eu com sessão' 200 "$(st -H "cookie: $cookie" "$B/skills/api/membros/eu")"
confere 'eu sem sessão' 401 "$(st "$B/skills/api/membros/eu")"

# 4. zip protegido
cab=$(curl -s -D - -o "$TMP/todas.zip" -H "cookie: $cookie" "$B/skills/api/membros/zip?todas=1" | tr -d '\r')
confere 'zip todas 200' 200 "$(printf '%s' "$cab" | awk 'NR==1{print $2}')"
confere 'zip é application/zip' 1 "$(printf '%s' "$cab" | grep -ic '^content-type: application/zip')"
confere 'zip attachment' 1 "$(printf '%s' "$cab" | grep -ic '^content-disposition: attachment')"
confere 'zip conteúdo' PK "$(head -c 2 "$TMP/todas.zip")"; rm -f "$TMP/todas.zip"
confere 'zip sem sessão' 401 "$(st "$B/skills/api/membros/zip?todas=1")"
confere 'zip id malicioso' 404 "$(st -H "cookie: $cookie" "$B/skills/api/membros/zip?s=..%2F..%2Ftodas")"

# 5. reembolso derruba a sessão
r=$(curl -s -X POST "$B/skills/api/nuvpag" -H 'x-webhook-secret: teste' -H 'content-type: application/json' -d "{\"event\":\"refunded\",\"data\":{\"customer\":{\"email\":\"$EMAIL\"}}}")
confere 'webhook reembolso' revogado "$(printf '%s' "$r" | sed -n 's/.*"acao":"\([a-z]*\)".*/\1/p')"
confere 'eu depois do reembolso' 401 "$(st -H "cookie: $cookie" "$B/skills/api/membros/eu")"
confere 'zip depois do reembolso' 401 "$(st -H "cookie: $cookie" "$B/skills/api/membros/zip?todas=1")"

echo "---"; [ "$falhas" -eq 0 ] && echo "smoke: tudo certo" || echo "smoke: $falhas falha(s)"
exit "$falhas"
