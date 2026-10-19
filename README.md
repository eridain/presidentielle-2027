# Vote réel — présidentielle 2027

Quiz web : l'utilisateur répond Oui/Non à ~33 grandes questions votées au Parlement (2016-2026) et compare ses choix aux **votes réels** des candidats à la présidentielle 2027, avec leurs arguments sourcés. Les actes, pas les promesses.

**Site : https://eridain.github.io/presidentielle-2027/** (publié par GitHub Actions depuis la branche `main`).

Site statique, sans backend, sans cookie ni mesure d'audience. Éditeur : eridain — contact et demandes de rectification : aerdannq@gmail.com.

## Installation et tests

Prérequis : Node.js 22 (≥ 22.12) ou 24, npm ; Python 3 seulement pour régénérer les votes depuis l'open data.

```bash
cd app
npm ci
npm run data        # fusionne et valide data/ → app/src/generated/ (+ rapport app/data-report.md)
npm run lint
npm run typecheck
npm test            # tests unitaires (Vitest)
npm run build       # site statique dans app/dist (chemins relatifs, routage par fragment #/…)

# tests de bout en bout (Playwright, desktop + mobile, build servi sous /presidentielle-2027/)
npx playwright install chromium
npx playwright test --project=desktop --project=mobile   # E2E_PORT=<port> si 4173 est déjà pris
```

`app/src/generated/`, `app/data-report.md`, `app/dist/` et les captures (`npm run screenshots`) sont régénérés et ne sont pas versionnés.

## Déploiement

`.github/workflows/pages.yml` : à chaque push sur `main` (ou lancement manuel), `npm ci`, `npm run data`, lint, typecheck, tests unitaires et build, puis publication de `app/dist` sur GitHub Pages. Dans les réglages du dépôt : *Settings → Pages → Source* = **GitHub Actions**. Autres hébergements (statique, Netlify, Docker/nginx) : voir [`app/README.md`](app/README.md).

## Données

- `data/raw/` : open data officielle de l'Assemblée nationale (scrutins législatures 14-17, acteurs/mandats/organes historiques), téléchargée le 2026-10-17 depuis https://data.assemblee-nationale.fr — non versionnée (≈ 500 Mo) : seules la date de collecte (`data/raw/COLLECTED_AT`) et les empreintes des archives (`data/raw/SHA256SUMS`) le sont. Elle n'est nécessaire que pour régénérer l'index et les votes (`data/scripts/`), pas pour construire le site.
- `data/index/scrutins_index.csv` : index des 18 754 scrutins (`scripts/build_index.py`).
- `data/selection.json` : questions retenues → scrutin de référence.
- `data/candidats.json` : candidats, identifiant AN (`PAxxxx`), groupes « proxy » et, le cas échéant, leurs périodes de validité (`proxyPeriodes`, `proxyMotif`).
- `data/build/votes.json` : résultat, ventilation par groupe, vote nominatif de chaque candidat, appartenance au gouvernement à la date (`scripts/extract_votes.py`).
- `data/selection-approfondi.json` (mode « Approfondir par catégorie », facultatif) : une vingtaine de questions par catégorie (10 catégories), chacune avec son scrutin, sa portée (`typeVote` : `ensemble`, `article`, `amendement`, `motion_censure`) et son sens ; les 33 questions de `selection.json` y figurent avec `existant: true` et sont reprises telles quelles.
- `data/build/votes-approfondi.json` : votes officiels des scrutins de `selection-approfondi.json`, même extraction que `votes.json` (`scripts/extract_votes.py --approfondi`) ; `votes.json` n'est jamais modifié par ce mode.
- `data/research/<id>.json` : contexte, arguments pour/contre, positions des candidats sans vote AN (Sénat, Congrès, Parlement européen, gouvernement, déclaration, ou proxy de groupe) — chaque élément avec URL et citation verbatim.
- `data/research/simple/<id>.json` : version « En clair » de chaque question (question simplifiée de même sens, résumé, arguments du Oui et du Non, issue, lexique) — schéma dans `data/research/BRIEF-SIMPLE.md`.
- `data/justice/<partiId>.json` : pour chaque parti des candidats, présentation, direction, effectifs, biographie du candidat et condamnations en justice dans un périmètre identique pour tous (candidat, parti, anciens dirigeants, direction, parlementaires), chacune avec sa source et une citation — schéma et règles dans `data/justice/BRIEF.md` ; le rattachement candidat → parti(s) est dans `data/candidats.json` (`partis`).
- `data/research/attributions.json` : pour chaque citation tirée d'un compte rendu de séance, orateur réel et indication « prononcée par le candidat ou non » (`scripts/check_attributions.py`).

## Hiérarchie des preuves (affichée dans l'app)

1. `vote_an` / `vote_congres` / `vote_senat` / `vote_pe` : vote nominatif officiel.
2. `gouvernement` : membre du gouvernement qui a porté le texte.
3. `declaration` : déclaration publique datée et sourcée.
4. `groupe` : vote majoritaire du groupe de son parti — **proxy**, pas un vote du candidat ; seulement aux dates où il appartenait à ce parti (`proxyPeriodes`).

## Reproduire

Télécharger dans `data/raw/` les archives listées dans `data/raw/SHA256SUMS` (https://data.assemblee-nationale.fr), vérifier les empreintes (`cd data/raw && shasum -a 256 -c SHA256SUMS`), les décompresser (un dossier par archive), puis lancer :

```bash
python3 data/scripts/build_index.py
python3 data/scripts/extract_votes.py               # selection.json → build/votes.json
python3 data/scripts/extract_votes.py --approfondi  # selection-approfondi.json → build/votes-approfondi.json
```

En mode `--approfondi`, un scrutin introuvable dans `data/raw` est signalé et ignoré (code de sortie 2) au lieu d'arrêter
l'extraction, et les écarts entre la sélection et l'open data (date, intitulé, résultat « adopté 463/74/20 ») sont listés
(« ATTENTION »). Options `--selection <fichier> --out <fichier>` pour une autre sélection (le script refuse d'écrire
`build/votes.json` à partir d'un autre fichier que `selection.json`).

`data/scripts/check_attributions.py` met en cache les comptes rendus de séance consultés dans `data/build/pages/` (non versionné).

## Application web

Le site statique (Vite + React + TypeScript) est dans `app/` : voir [`app/README.md`](app/README.md) (commandes, règles de données, méthodologie, structure).

```bash
docker build --platform linux/amd64 -f app/Dockerfile -t vote-reel .   # depuis la racine du dépôt
docker run --rm -p 8080:8080 vote-reel                                  # → http://localhost:8080/
```
