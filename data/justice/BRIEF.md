# Brief « Partis, candidats et condamnations » — site Vote réel (présidentielle 2027)

Section du site présentant, pour chaque candidat : son parti, une présentation neutre, et **la liste des condamnations en justice** du candidat, du parti (personne morale) et de ses membres dans le périmètre ci-dessous. Publication publique : l'exactitude juridique est impérative (risque de diffamation). Mieux vaut une liste incomplète et exacte qu'une liste complète et fausse.

Candidats (id → parti(s)) : melenchon → La France insoumise ; roussel → PCF ; ruffin → Debout ! ; tondelier → Les Écologistes ; batho → Génération écologie ; glucksmann → Place publique (+ PS, organisateur de la primaire qu'il a gagnée) ; attal → Renaissance ; philippe → Horizons ; retailleau → Les Républicains ; bertrand → Nous France (membre LR) ; lisnard → Nouvelle Énergie ; lepen → Rassemblement national ; zemmour → Reconquête ; dupontaignan → Debout la France.

Députés en exercice par groupe (open data AN) : `data/research/deputes_par_groupe_2026.json` (RN, LFI-NFP, SOC, EcoS, EPR, HOR, DR, GDR, …).

## Périmètre « membres du parti » (identique pour tous les partis)
1. le candidat ;
2. le parti en tant que personne morale (et ses prédécesseurs directs : FN→RN, UMP→LR, LREM→Renaissance, EELV→Les Écologistes…) ;
3. les présidents / premiers secrétaires / secrétaires nationaux successifs du parti (y compris prédécesseurs directs) ;
4. la direction nationale actuelle (président, vice-présidents, secrétaire général, trésorier, porte-parole) ;
5. les parlementaires actuels du parti : députés (liste fournie, groupe correspondant ; ne garder que les membres/apparentés du parti), sénateurs, députés européens.
Hors périmètre : élus locaux et militants (sauf s'ils sont aussi dans 1-5).

## Ce qui compte comme « condamnation »
- Décision pénale de culpabilité (tribunal correctionnel, cour d'appel, cour d'assises, Cour de cassation qui rejette un pourvoi, Cour de justice de la République), y compris diffamation/injure/provocation (droit de la presse), et condamnations de la Cour de discipline budgétaire et financière.
- **Statut obligatoire** : `definitive` | `appel_en_cours` | `pourvoi_en_cours` | `inconnu`. Une condamnation de 1re instance infirmée en appel (relaxe) ou annulée = EXCLUE (la mentionner seulement dans `alertes`).
- **Exclus** : mises en examen, gardes à vue, enquêtes, plaintes, procès en cours sans jugement, relaxes, non-lieux, condamnations amnistiées ou dont la réhabilitation est connue, décisions purement civiles/prud'homales/administratives (sauf condamnation civile pour diffamation clairement rapportée : `nature: "civile"`), sanctions disciplinaires internes.
- Pas de limite de date, mais indiquer la date exacte de la décision.

## Sources
Chaque condamnation : ≥ 1 source fiable OUVERTE par toi (presse nationale/régionale de référence, AFP, communiqué ou décision de juridiction, Légifrance/Judilibre, Wikipédia seulement si elle renvoie à une source secondaire que tu ouvres aussi), avec une citation VERBATIM ≤ 40 mots prouvant la condamnation et sa nature. Pas d'URL ni de citation de mémoire. Si deux sources divergent (peine, date, statut), le dire dans `alertes`.

Méthode suggérée : pour chaque personne du périmètre, recherche « <nom> condamné », « <nom> condamnation tribunal », pages Wikipédia (sections « Affaires judiciaires »), articles de synthèse (ex. « députés condamnés », « casier judiciaire des élus »), puis vérification à la source. Note les requêtes réalisées dans `perimetre.methode`.

## Fichier à produire : `data/justice/<partiId>.json`
```json
{
  "partiId": "rn",
  "nom": "Rassemblement national",
  "sigle": "RN",
  "predecesseurs": ["Front national (1972-2018)"],
  "fondation": "AAAA",
  "direction": [{"nom": "...", "fonction": "...", "url": "..."}],
  "presentation": "3 phrases neutres et factuelles : fondation, positionnement tel que décrit par une source de référence (citer), poids électoral/parlementaire actuel.",
  "presentationSources": [{"titre": "...", "url": "..."}],
  "effectifs": {"deputes": 0, "senateurs": 0, "eurodeputes": 0, "source": "url"},
  "candidats": [{"id": "lepen", "bio": "2-3 phrases neutres : parcours et mandats", "sources": [{"titre": "...", "url": "..."}]}],
  "condamnations": [
    {
      "personne": "Nom Prénom",
      "categorie": "candidat|parti|ancien_dirigeant|dirigeant|depute|senateur|eurodepute",
      "roleActuel": "ex. députée du Pas-de-Calais",
      "infraction": "qualification juridique exacte (ex. détournement de fonds publics)",
      "faits": "1 phrase factuelle, période des faits",
      "juridiction": "ex. cour d'appel de Paris",
      "dateDecision": "AAAA-MM-JJ (ou AAAA-MM / AAAA si le jour est inconnu)",
      "peine": "peine exacte prononcée",
      "statut": "definitive|appel_en_cours|pourvoi_en_cours|inconnu",
      "nature": "penale|financiere|civile",
      "famille": "probite|violences|haine|diffamation|autres",
      "lieeMandatPolitique": true,
      "sources": [{"titre": "...", "url": "...", "citation": "verbatim ≤ 40 mots", "date": "AAAA-MM-JJ"}]
    }
  ],
  "perimetre": {"personnesVerifiees": 0, "methode": "requêtes et sources consultées", "limites": "..."},
  "alertes": ["..."]
}
```

## Règles
- Neutralité : même effort de recherche pour tous les partis ; aucun adjectif ; pas de commentaire.
- Si aucune condamnation trouvée pour un parti : `condamnations: []` et l'indiquer — cela signifie « aucune trouvée dans les sources consultées », pas « aucune ».
- JSON valide (`python3 -m json.tool`), UTF-8, français. N'écris que tes fichiers `data/justice/<partiId>.json`.
