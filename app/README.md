# Vote réel — application web

Quiz statique (Vite + React + TypeScript) : l'électeur répond Oui / Non à ~33 questions votées au
Parlement (2017-2026) et compare ses réponses aux **votes réels** des 14 candidats à la présidentielle 2027.
Pour aller plus loin, le mode « Approfondir par catégorie » propose une vingtaine de questions par thème, avec un
classement propre à chaque catégorie (`#/approfondi`).
Aucun backend, aucun traceur, aucune ressource tierce à l'exécution ; réponses en `localStorage`,
partage du résultat par URL (`#/resultats?r=…`).

## Prérequis

Node.js 22 (≥ 22.12, exigé par Vitest 5 ; testé avec Node 22.19 et utilisé en CI) ou 24, et npm.

```bash
cd app
npm install
npx playwright install chromium   # uniquement pour les tests e2e / captures
```

## Commandes

| Commande | Rôle |
|---|---|
| `npm run data` | Fusionne `../data/build/votes.json`, `../data/research/*.json`, `../data/justice/*.json` (et `membres/`, `anciens/`) et `../data/candidats.json` → `src/generated/data.json`, et le mode approfondi (`../data/selection-approfondi.json` + `../data/build/votes-approfondi.json`) → `src/generated/approfondi/<catégorie>.json` ; valide et écrit le rapport `data-report.md` (non versionné : il contient aussi les points de relecture éditoriale non publiés sur le site). Code de sortie 1 en cas d'erreur bloquante (jamais pour le mode approfondi). `VOTE_REEL_JUSTICE_DIR=<dossier>` lit les fiches partis ailleurs (fixtures) ; `VOTE_REEL_APPROFONDI_DIR=<dossier>` lit `selection-approfondi.json` et `votes-approfondi.json` ailleurs (fixture : `pipeline/fixtures/approfondi`). |
| `npm run dev` | Serveur de développement (http://localhost:5173). Lancer `npm run data` avant si les données ont changé. |
| `npm run build` | `npm run data` + typecheck + build statique dans `dist/`. |
| `npm run preview` | Sert `dist/` localement. |
| `npm test` | Tests unitaires Vitest (pipeline de données, score, partage, mode rapide). |
| `npm run test:e2e` | Tests Playwright (desktop + mobile) sur le build servi dans un sous-dossier, avec audit axe (WCAG 2.1 AA). Lancer `npm run build` avant. Port 4173 ; `E2E_PORT=<port>` si ce port est déjà pris (Playwright réutiliserait sinon le serveur qui l'occupe). Les tests du mode approfondi sont ignorés sur un build sans `selection-approfondi.json` (et le test « mode absent » ne tourne que sur un tel build). |
| `npm run screenshots` | Régénère les captures de `screenshots/`. |
| `npm run lint` / `npm run typecheck` | ESLint (typescript-eslint strict, jsx-a11y, react-hooks) / `tsc -b`. |

## Données

- **Source de vérité des votes** : `data/build/votes.json` (open data AN, voir le README racine).
- **Recherche** : `data/research/<id>.json` (schéma dans `data/research/BRIEF.md`). Un fichier absent ou
  illisible n'empêche pas le build : la question est construite depuis `selection.json` / `votes.json`
  (positions AN + proxies) et le rapport la liste.
- **Version « En clair »** (facultative) : `data/research/simple/<id>.json` (schéma dans
  `data/research/BRIEF-SIMPLE.md`). Avec elle, la page Question affiche la question simplifiée en titre, la formulation
  officielle en plus petit, le bloc « En clair » (résumé, « Ceux qui disent Oui / Non », issue, mots à connaître) et le
  contexte détaillé replié (« Le texte en détail (sources) »). Sans elle (fichier absent, illisible ou incomplet),
  l'affichage d'origine est conservé ; `data-report.md` liste les questions sans fiche. « Oui » / « Non » se rapportent à
  la question simplifiée, jamais au « pour » / « contre » du scrutin.
- **Attribution des citations** (facultatif) : `data/research/attributions.json` (généré par
  `data/scripts/check_attributions.py`), clé `"<question>/<candidat>"` → `{ trouve, orateur, estLeCandidat }`. Le
  pipeline ajoute à chaque position un champ `attribution` (`duCandidat`, `porteur`, `orateur`, `groupe`,
  `verification`) : l'orateur relevé dans le compte rendu de séance fait foi ; à défaut, la recherche (« argument =
  explication de vote du groupe X (Nom) », « (Groupe X) … », « Position du Gouvernement : … »). Des propos qui ne sont
  pas ceux du candidat sont affichés « Argument de son groupe » avec « Propos de X (groupe Y), pas de Z. »
  (`pipeline/attribution.ts`). Le rapport liste toutes ces positions.
- **Proxies datés** : dans `data/candidats.json`, `proxyPeriodes` (liste de `{ "du": "AAAA-MM-JJ", "au": "AAAA-MM-JJ" }`,
  bornes incluses, l'une ou l'autre facultative) limite le proxy de groupe aux dates où le candidat appartenait au
  parti ; `proxyMotif` est la phrase affichée quand le proxy est écarté. Sans `proxyPeriodes`, le proxy vaut à toute
  date. Les proxies écartés sont listés dans `data-report.md`.
- **Partis, candidats et condamnations** (facultatif) : `data/justice/<partiId>.json` (schéma et règles éditoriales dans
  `data/justice/BRIEF.md`). Le rattachement candidat → parti(s) est dans `data/candidats.json` (champ `partis`, parti
  principal en premier, `rattachement` = phrase affichée pour un parti secondaire : Glucksmann → Place publique + PS,
  Bertrand → Nous France + LR). Lecture par `pipeline/justice.ts` :
  - présentation, direction, effectifs, biographies : lecture tolérante, tout élément sans source http(s) est écarté
    (les effectifs acceptent un texte citant plusieurs URL et la liste des députés par groupe de l'open data AN) ;
  - **condamnations : règle stricte**. Une entrée sans personne, catégorie, infraction ou juridiction valides, sans date
    de décision `AAAA`, `AAAA-MM` ou `AAAA-MM-JJ` calendaire valide (ou datée après la génération), de statut hors `definitive|appel_en_cours|pourvoi_en_cours|inconnu`,
    de nature hors `penale|financiere|civile`, ou sans au moins une source http(s) **avec citation** est **rejetée** :
    jamais affichée, listée dans `data-report.md` (« Erreurs : condamnations rejetées »), sans bloquer le build. Catégorie
    `candidat` : la personne doit être l'un des candidats rattachés au parti. Une date partielle est affichée « en 1998 »,
    « en mai 2015 » (« le 16 décembre 2025 » au jour près) et signalée en info dans `data-report.md` ;
  - **famille** de l'infraction (champ `famille`, d'après la qualification juridique) : `probite` (Probité : argent
    public, corruption, fraude), `violences`, `haine` (propos : haine, discrimination, négationnisme), `diffamation`
    (propos : diffamation, injure), `autres` — ordre de gravité affiché, choix éditorial (`FAMILLES`,
    `src/lib/justice.ts`). Absente ou invalide : entrée affichée quand même, classée `autres`, avertissement
    `justice-famille-absente` / `justice-famille-invalide` dans `data-report.md`. Une famille que la qualification ne
    semble pas justifier (mots-clés, `famillesEvoquees`) est signalée dans « Points à relire », jamais reclassée.
    `data-report.md` donne les compteurs par parti et par famille. Sur le site : synthèse par famille en tête de la
    section (candidat / parti / membres actuels, Probité mise en avant), liste regroupée par famille puis catégorie
    puis date, filtre par famille ; ligne de compteurs sur chaque carte « Partis & candidats » (option « Probité
    uniquement ») ;
  - **appartenance actuelle** (`data/justice/membres/<partiId>.json`, schéma : `data/justice/BRIEF-MEMBRES.md`,
    facultatif) : jointure par la **chaîne exacte** du champ `personne` ; `statutMembre` ∈ membre | suspendu | exclu |
    depart | retire | decede | personne_morale (| inconnu), `depuis`, `detail`, `lienAvecCondamnation`,
    `reactionParti`, `sources` (URL http(s) + citation). Fichier ou personne absents, statut invalide ou affirmé sans
    source valide → statut `inconnu` (avertissements `appartenance-*`) ; le parti lui-même (catégorie `parti`) absent du
    fichier → `personne_morale`. Entrée sans condamnation correspondante : `appartenance-orpheline` ;
  - **anciens membres** (`data/justice/anciens/<partiId>.json`, `data/justice/BRIEF-ANCIENS.md`, facultatif) : mêmes
    contrôles stricts que la fiche (rejet sans source ni citation, catégorie `ancien_membre` obligatoire, doublon d'une
    décision de la fiche rejeté), chacune avec son bloc `appartenance` ; jamais rattachées à la page d'un candidat ;
  - **niveaux** (`niveau`, `src/lib/justice.ts`) : niveau 1 = la personne candidate (toujours), membres, suspendus,
    parti (personne morale) — **seuls comptés** (synthèse, cartes, option Probité) ; niveau 2 = exclus, partis,
    retirés (« Retrait — adhésion non confirmée »), décédés, statut inconnu, et toutes les entrées de `anciens/` —
    section « Passif : anciens membres condamnés (non comptés dans les totaux) » sous la liste, style atténué, par
    famille puis par personne (ligne de contexte, détail, réaction du parti, source dépliable), ligne discrète dans la
    synthèse, « (+N anciens) » sur les cartes. `data-report.md` : tableau par parti niveau 1 / niveau 2 par famille,
    statuts d'appartenance, personnes au statut inconnu ;
  - fiche absente ou illisible : page « recherche en cours » (jamais « aucune condamnation ») ; fiche lue avec une liste
    vide : « Aucune condamnation trouvée dans les sources consultées pour le périmètre retenu. » ;
  - date « sources consultées le… » : champ `dateConsultation` du fichier s'il existe ; sinon la date relevée dans
    `data/justice-dates.json` (partiId → AAAA-MM-JJ, à tenir à jour quand une fiche est revérifiée : une date trop
    ancienne reste exacte, une date trop récente ne l'est pas) ; sinon la date du dernier commit de la fiche (hors clone
    superficiel), ou de sa modification ;
  - messages quand rien n'est affiché : « Aucune condamnation trouvée… » seulement si la liste du fichier est vide ;
    « Aucune condamnation retenue… » si la liste n'est pas vide (autres catégories, entrées rejetées) ; « Recherche en
    cours » si la fiche ou sa liste manque ;
  - `perimetre.methode`, `perimetre.limites` et `alertes` ne sont pas publiés : ils figurent dans `data-report.md`
    (« Points à relire avant publication »), avec les entrées affichées qui évoquent une relaxe ou une procédure en
    cours, les citations de plus de 40 mots et les condamnations sourcées par Wikipédia seule.
  - Adresse de rectification affichée sous l'avertissement : `contactRectification` dans `src/config.ts` (vide → pas
    de ligne « Demande de rectification »).
- **Mode « Approfondir par catégorie »** (facultatif) : `data/selection-approfondi.json` (questions par catégorie,
  10 libellés exacts dans `src/lib/categories.ts`) et `data/build/votes-approfondi.json`
  (`python3 data/scripts/extract_votes.py --approfondi`). Lecture par `pipeline/approfondi.ts`, **jamais bloquante** et
  sans effet sur le parcours principal (bilan séparé dans `data-report.md`, section « Mode approfondi ») :
  - fichier absent ou illisible : pas de mode approfondi (aucune option sur l'accueil) ;
  - entrée invalide (schéma, scrutin, portée, catégorie inconnue, doublon), vote absent de `votes-approfondi.json` ou
    scrutin différent : entrée écartée et listée ; catégorie à la casse ou aux accents près : acceptée (info) ;
  - question `existant: true` (même identifiant que `selection.json`) : la question du parcours principal est reprise
    **telle quelle** (même objet, même recherche) ; un identifiant principal non marqué est traité de même (avertissement) ;
  - nouvelle question : construite par la même fonction que le parcours principal (`buildQuestion`), avec ses
    `data/research/<id>.json` et `simple/<id>.json` s'ils existent ; sans recherche, elle reste affichable (votes AN +
    proxies, titre = formulation de la sélection) et figure dans « Nouvelles questions sans recherche » ;
  - `sens` : `pour=oui`, `contre=oui` (Oui = contre, par exemple un amendement de suppression) ou
    `motion_censure=non` ; portée `motion_censure` = règles de la motion de censure ;
  - contrôles signalés : portée déclarée contredite par l'intitulé officiel (« l'amendement… », « l'article 3… » ; le vote
    sur l'« article unique » vaut vote sur l'ensemble), date ou résultat (`adopté 463/74/20`) différents de l'open data ;
  - une catégorie n'est proposée qu'à partir de 10 questions retenues (objectif 20, signalé en dessous) ;
  - sortie : l'index des catégories (identifiants, portée, question existante ou non) dans `data.json` ; les nouvelles
    questions de chaque catégorie dans `src/generated/approfondi/<catégorie>.json`, chargé seulement quand la catégorie
    est ouverte (un fichier par catégorie, nom à empreinte) — le parcours principal ne télécharge rien de plus.
  - Côté site : réponses du mode approfondi en `localStorage` (`vote-reel:approfondi:v1`, par catégorie) ; une question
    reprise du parcours principal garde une seule réponse (celle du parcours principal) ; lien de partage
    `#/approfondi/<catégorie>/resultats?r=…&k=…` (`k` = empreinte des questions couvertes : un lien devenu faux après un
    réordonnancement est signalé « périmé » au lieu d'être relu de travers ; ajouter des questions en fin de catégorie
    ne casse pas les liens). Les liens `#/resultats?r=…` du parcours principal sont inchangés.
- Règles de résolution, poids du score et cas particuliers (motion de censure, absences, proxies) :
  `pipeline/resolve.ts`, `src/lib/weights.ts` et la page Méthodologie du site.
- Après chaque mise à jour des fichiers de recherche : `npm run data` puis `npm run build`.

## Déploiement

`npm run build` produit un site 100 % statique dans `dist/`, avec des chemins **relatifs** (`base: './'`)
et un routage par fragment (`#/question/…`, `#/resultats?r=…`) : il fonctionne à la racine d'un domaine
comme dans un sous-dossier, **sans règle de réécriture** côté serveur (le fragment n'est jamais envoyé au
serveur, toutes les vues sont servies par `index.html`).

Le build lit `../data` (`npm run build` lance d'abord `npm run data`) : l'hébergeur doit disposer de tout
le dépôt, pas seulement de `app/`. La politique de sécurité du contenu (CSP) est injectée dans
`dist/index.html` et interdit toute ressource externe.

Informations éditoriales (`src/config.ts`) : éditeur `eridain`, contact et demandes de rectification
`aerdannq@gmail.com`, hébergeur GitHub Pages (GitHub, Inc.). Elles sont affichées sur la page Mentions et sous
l'avertissement de la section « Partis & candidats ». Un champ vide n'est jamais affiché ; si aucun ne l'était, la page
Mentions indiquerait seulement « Site à usage personnel. ».

### Tout hébergeur statique

Copier le contenu de `dist/` (Apache, Nginx, S3, OVH…). Recommandé : `Cache-Control: no-cache` sur
`index.html`, cache long et immuable sur `assets/` (noms de fichiers à empreinte). Voir `nginx.conf`.

### GitHub Pages

Adresse du site (après la première publication) : **https://eridain.github.io/presidentielle-2027/** (le sous-dossier
ne pose pas de problème).
Le workflow [`.github/workflows/pages.yml`](../.github/workflows/pages.yml) s'exécute à chaque push sur `main` et à la
demande (*Actions → GitHub Pages → Run workflow*) : `npm ci`, `npm run data`, lint, typecheck, tests unitaires,
`npm run build`, puis publication de `app/dist` (`configure-pages`, `upload-pages-artifact`, `deploy-pages`). Prérequis
unique : *Settings → Pages → Build and deployment → Source* = **GitHub Actions**.

`data/raw/` n'est pas nécessaire au build (seuls `selection.json`, `candidats.json`, `build/votes.json`,
`research/`, `justice/`, `justice-dates.json`, `raw/COLLECTED_AT` et, s'ils existent, `selection-approfondi.json` et
`build/votes-approfondi.json` sont lus).

### Netlify

Répertoire de base `app`, commande `npm run build`, répertoire publié `app/dist` (Netlify clone tout le
dépôt, `../data` est donc disponible). Équivalent en fichier `netlify.toml` à la racine du dépôt :

```toml
[build]
  base = "app"
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "22"
```

Aucune règle `_redirects` n'est nécessaire (routage par fragment).

### Docker (nginx, linux/amd64)

`Dockerfile` construit le site puis le sert avec nginx (image `nginxinc/nginx-unprivileged`, utilisateur
non root, port **8080**). Le contexte de build est la **racine du dépôt** ; seuls les fichiers listés dans
`Dockerfile.dockerignore` y sont envoyés (pas `data/raw`, ni `node_modules`).

```bash
# depuis la racine du dépôt
docker build --platform linux/amd64 -f app/Dockerfile -t vote-reel .
docker run --rm -p 8080:8080 vote-reel    # → http://localhost:8080/
```

L'image finale est fixée en `linux/amd64` (y compris construite sur un Mac Apple Silicon : l'étape de
build tourne en natif, son résultat ne dépend pas de l'architecture). `nginx.conf` :

- renvoie `index.html` pour tout chemin inconnu (compatible routage par fragment), mais une vraie 404
  pour un fichier `assets/` absent ;
- cache : `no-cache` sur `index.html`, `max-age=31536000, immutable` sur `assets/` ;
- en-têtes : `frame-ancestors 'none'` (en complément de la CSP de `index.html`), `X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `Permissions-Policy` ; compression gzip ;
- un `HEALTHCHECK` interroge `http://127.0.0.1:8080/`.

Derrière un proxy inverse (TLS), publier le port 8080 du conteneur. Pour exposer le site dans un
sous-dossier (`/vote-reel/`), le proxy doit retirer le préfixe (nginx : `location /vote-reel/ { proxy_pass
http://vote-reel:8080/; }`, avec la barre finale) ; les chemins relatifs du build font le reste.

## Structure

```
app/
├── pipeline/          build des données (Node/TS, exécuté par tsx) + tests
│   ├── cli.ts         entrée `npm run data`
│   ├── build.ts       fusion + validation (pure, testée)
│   ├── resolve.ts     priorités de résolution des positions
│   ├── research.ts    lecture tolérante des fichiers de recherche
│   ├── justice.ts     fiches partis : rattachements, biographies, validation stricte des condamnations, appartenance, anciens membres
│   ├── approfondi.ts  mode « Approfondir par catégorie » : sélection, votes, catégories (tolérant, non bloquant)
│   ├── schemas.ts     schémas zod (entrées / sortie)
│   └── report.ts      rapport data-report.md
├── src/
│   ├── lib/           score (weights.ts, scoring.ts), mode rapide, partage, routage, stockage
│   ├── components/    révélation, carte candidat, badge de preuve…
│   ├── pages/         accueil, question, résultats, partis & candidats, page candidat, méthodologie, sources, mentions
│   │   └── approfondi/  choix de catégorie, catégorie, question, restitution (chargées à la demande)
│   └── generated/     data.json et approfondi/<catégorie>.json produits par `npm run data` (non versionnés)
├── e2e/               tests Playwright + serveur statique « sous-dossier »
├── screenshots/       captures mobile / desktop (`npm run screenshots`, non versionnées)
├── Dockerfile         image nginx linux/amd64 (contexte : racine du dépôt)
├── Dockerfile.dockerignore
└── nginx.conf         configuration nginx (routage par fragment, cache, en-têtes)
```
