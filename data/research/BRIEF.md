# Brief recherche — « Vote réel » (quiz présidentielle 2027)

Projet : application web où l'utilisateur répond Oui/Non à de grandes questions votées au Parlement français (2016-2026), puis voit comment chaque candidat à la présidentielle 2027 a RÉELLEMENT voté et pourquoi. Principe : les actes, pas les promesses. Neutralité politique stricte. Tout doit être sourcé.

Fichiers :
- `data/research/tasks.json` : une entrée par question (scrutin, date, résultat, ventilation par groupe, votes nominatifs des candidats déjà extraits de l'open data AN, candidats SANS vote nominatif, appartenance au gouvernement à la date).
- `data/candidats.json` : ids des candidats.
- Les votes nominatifs AN de `tasks.json` sont CERTAINS (open data officielle) : ne pas les re-rechercher ni les contredire. Si une source contredit, le signaler dans `alertes`.

Candidats (id) : melenchon, roussel, ruffin, tondelier, batho, glucksmann, attal, philippe, retailleau, bertrand, lisnard, lepen, zemmour, dupontaignan.
Repères : Mélenchon député 2017-2022 ; Roussel député 2017-2024 ; Dupont-Aignan député jusqu'en 2024 ; Philippe Premier ministre mai 2017-juillet 2020 ; Attal au gouvernement 2018-sept. 2024 (Premier ministre janv.-sept. 2024), député depuis 2024 ; Retailleau sénateur LR (président du groupe LR au Sénat 2014-2024), ministre de l'Intérieur sept. 2024-oct. 2025 ; Glucksmann eurodéputé depuis 2019 ; Bertrand président de région Hauts-de-France ; Lisnard maire de Cannes (LR jusqu'en 2026, Nouvelle Énergie) ; Tondelier secrétaire nationale EELV/Les Écologistes depuis déc. 2022 ; Zemmour, président de Reconquête (2021), eurodéputée Sarah Knafo.

## Pour chaque question qui t'est attribuée, produire `data/research/<id>.json`

```json
{
  "id": "<id>",
  "titre": "titre court neutre (≤ 8 mots)",
  "question": "question Oui/Non neutre, vérifiée contre le contenu réel du texte (corrige la questionProposee si inexacte)",
  "ouiSignifie": "pour" ,            // quelle position au scrutin correspond à « Oui » (\"pour\" en général ; \"contre\" si la question est formulée à l'inverse ; pour une motion de censure contre une réforme : voter la censure = Non à la réforme)
  "contexte": "3-4 phrases factuelles et neutres : ce que contient le texte, contexte, issue (promulgation, censure du Conseil constitutionnel éventuelle…).",
  "contexteSources": [{"titre": "...", "url": "https://..."}],
  "urlScrutin": "URL officielle de la page du scrutin (AN, ou Congrès/Sénat)",
  "urlDossier": "URL du dossier législatif (AN ou Légifrance de la loi promulguée)",
  "argumentsPour": [ {"auteur": "Nom (groupe/parti)", "resume": "argument paraphrasé ≤ 35 mots", "citation": "extrait VERBATIM ≤ 35 mots copié de la source", "url": "https://...", "date": "AAAA-MM-JJ"} ],
  "argumentsContre": [ ... même format ... ],
  "argumentsAbstention": [ ... si pertinent ... ],
  "candidats": {
    "<candidatId>": {
      "position": "pour|contre|abstention|inconnu",
      "type": "vote_an|vote_senat|vote_congres|vote_pe|gouvernement|declaration|groupe",
      "detail": "1 phrase : ce qui fonde la position (ex. « Vote nominatif au Sénat, scrutin n°… » ; « Premier ministre qui a porté le texte » ; « Déclaration sur France Inter »)",
      "argument": "ses propres raisons, paraphrasées ≤ 35 mots (ou null)",
      "citation": "ses mots VERBATIM ≤ 35 mots (ou null)",
      "url": "https://... (source primaire de préférence)",
      "date": "AAAA-MM-JJ"
    }
  },
  "alertes": ["toute incertitude, contradiction, ou limite"]
}
```

## Règles

1. **Arguments** (`argumentsPour/Contre`) : 2 à 4 par camp, idéalement tirés des explications de vote des groupes dans le compte rendu officiel de la séance (assemblee-nationale.fr/dyn/<leg>/comptes-rendus/…) ou du dossier ; à défaut presse de référence (Le Monde, LCP, Public Sénat, vie-publique.fr, AFP via presse). Couvrir les principaux camps (gauche, centre/majorité, droite, RN).
2. **Candidats** : renseigner une entrée pour CHAQUE candidat de la liste (14).
   - Pour ceux qui ont un vote nominatif AN dans `votesNominatifsCandidats` : `type: "vote_an"`, position = celle fournie, et cherche SES propres arguments (intervention en séance, tweet, interview, explication de vote de son groupe s'il l'a portée). Si rien de personnel n'est trouvé : `argument` = explication de son groupe, en le disant dans `detail`.
   - Pour `candidatsSansVoteNominatif` : chercher dans l'ordre (a) un vote nominatif au Sénat (Retailleau — pages senat.fr/scrutin-public/… listent les votes par sénateur), au Congrès, ou au Parlement européen (Glucksmann, Philippot… via howtheyvote.eu ou europarl) sur le MÊME sujet ; (b) son rôle au gouvernement qui a porté/défendu le texte (`gouvernement`) — ministre ou Premier ministre au moment du vote = position du gouvernement, sauf désaccord public documenté ; (c) une déclaration publique datée et sourcée (`declaration`) ; (d) sinon `position: "inconnu"`, `type: "groupe"` et `detail` = vote majoritaire du groupe parlementaire de son parti (indiqué dans `tasks.json`) — c'est un PROXY, à dire explicitement.
   - « absent » dans les données = député(e) à cette date mais n'a pas pris part au vote : chercher une déclaration ; sinon `position: "inconnu"`, `detail: "Député(e), n'a pas pris part au vote"`.
   - Pour les motions de censure, seuls les votes « pour » sont enregistrés : un député absent de la liste n'a pas voté la censure.
3. **Vérifiabilité** : chaque `url` doit avoir été ouverte par toi (web_extract ou navigateur) et la `citation` doit figurer mot pour mot dans la page. Jamais d'URL ou de citation de mémoire. Si tu ne peux pas vérifier : `citation: null` et explique dans `alertes`.
4. Neutralité : mêmes exigences pour tous les camps ; pas d'adjectifs évaluatifs ; pas de jugement.
5. Écrire le JSON valide (vérifie avec `python3 -m json.tool <fichier>`), en français, UTF-8.
6. Ne modifie AUCUN autre fichier du projet.
