#!/usr/bin/env bash
# Envia os zips pagos da Faísca para o bucket R2 "faisca-skills" (binding ZIPS de /skills/api/membros/zip).
# Pré-requisito: `wrangler login` feito NA CONTA CERTA (confira com `wrangler whoami`) e o bucket criado
# (`wrangler r2 bucket create faisca-skills`). Rodar a partir de qualquer pasta:
#   bash ferramentas/subir-zips-r2.sh [pasta-downloads]
# Chaves no bucket:
#   skills/<categoria>/<id>.zip   categorias/<slug>.zip   todas.zip  (← skills-visionx-todas.zip)
set -euo pipefail

ORIGEM="${1:-$HOME/Projetos/area-membros-skills/site/downloads}"
BUCKET="faisca-skills"
[ -d "$ORIGEM/skills" ] && [ -d "$ORIGEM/categorias" ] && [ -f "$ORIGEM/skills-visionx-todas.zip" ] || { echo "Pasta de downloads incompleta: $ORIGEM" >&2; exit 1; }

echo "Conta do wrangler:"; wrangler whoami
read -r -p "É a conta certa para o bucket $BUCKET? [s/N] " ok
[ "$ok" = "s" ] || { echo "Cancelado."; exit 1; }

enviar() { # $1 = arquivo local, $2 = chave no bucket
  wrangler r2 object put "$BUCKET/$2" --file "$1" --content-type application/zip --remote >/dev/null
  echo "ok  $2"
}

n=0
for arq in "$ORIGEM"/skills/*/*.zip; do
  cat="$(basename "$(dirname "$arq")")"; id="$(basename "$arq")"
  enviar "$arq" "skills/$cat/$id"; n=$((n + 1))
done
for arq in "$ORIGEM"/categorias/*.zip; do
  enviar "$arq" "categorias/$(basename "$arq")"; n=$((n + 1))
done
enviar "$ORIGEM/skills-visionx-todas.zip" "todas.zip"; n=$((n + 1))
echo "Pronto: $n arquivos em $BUCKET."
