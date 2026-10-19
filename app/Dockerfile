# syntax=docker/dockerfile:1
# check=skip=FromPlatformFlagConstDisallowed
#
# « Vote réel » : site statique servi par nginx, image linux/amd64.
# Le build lit ../data : le contexte est la RACINE du dépôt (fichiers admis : app/Dockerfile.dockerignore).
#
#   docker build --platform linux/amd64 -f app/Dockerfile -t vote-reel .
#   docker run --rm -p 8080:8080 vote-reel        →  http://localhost:8080/

# 1. Build : sur l'architecture de la machine (le résultat — HTML, CSS, JS, JSON — ne dépend pas
#    de l'architecture), donc sans émulation sur un Mac Apple Silicon.
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS build
WORKDIR /src/app
COPY app/package.json app/package-lock.json ./
RUN npm ci --no-audit --no-fund
# selection*.json / votes*.json : les fichiers du mode approfondi (selection-approfondi.json, votes-approfondi.json)
# sont facultatifs ; le motif reste valide sans eux (selection.json et votes.json existent toujours).
COPY data/selection*.json data/candidats.json data/justice-dates.json /src/data/
COPY data/build/votes*.json /src/data/build/
COPY data/research/ /src/data/research/
COPY data/justice/ /src/data/justice/
COPY data/raw/COLLECTED_AT /src/data/raw/
COPY app/ ./
# npm run build = npm run data (fusion + validation) + tsc -b + vite build → dist/
RUN npm run build

# 2. Image finale : nginx (utilisateur non root, port 8080) et les fichiers statiques, rien d'autre.
FROM --platform=linux/amd64 nginxinc/nginx-unprivileged:stable-alpine
COPY app/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
