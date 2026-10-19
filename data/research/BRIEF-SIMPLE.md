# Brief « En clair » — version pédagogique de chaque question

Projet : quiz web « Vote réel » (présidentielle 2027). Chaque question correspond à un texte voté au Parlement. Le fichier `data/research/<id>.json` contient déjà un `contexte` technique, des `argumentsPour` / `argumentsContre`, des `alertes`. L'utilisateur trouve ce contexte hermétique : il veut comprendre l'enjeu en 20 secondes, sans jargon.

## À produire : `data/research/simple/<id>.json`

```json
{
  "id": "<id>",
  "questionSimple": "La question en langage courant, ≤ 20 mots, réponse Oui/Non, MÊME SENS que la question d'origine (Oui doit toujours signifier la même chose)",
  "enBref": "2-3 phrases très simples : ce que le texte change concrètement dans la vie des gens / du pays. Pas de numéro d'article, pas de sigle non expliqué.",
  "pourquoiPour": "1-2 phrases : la logique de ceux qui ont voté pour, formulée comme eux la défendent (l'argument le plus fort, pas une caricature).",
  "pourquoiContre": "1-2 phrases : la logique de ceux qui ont voté contre, idem.",
  "ceQuiSestPasse": "1 phrase : issue réelle (adopté/rejeté, censure partielle du Conseil constitutionnel, appliqué ou non, abrogé…).",
  "lexique": [{"terme": "49.3", "definition": "≤ 20 mots"}]
}
```

## Règles

- Niveau de langue : un lycéen doit comprendre. Phrases courtes (≤ 25 mots), vocabulaire courant ; si un terme technique est indispensable (CMP, 49.3, néonicotinoïde, IFI, rétention administrative…), l'expliquer dans `lexique` (0 à 3 entrées).
- **Neutralité stricte** : `pourquoiPour` et `pourquoiContre` de longueur comparable (écart ≤ 30 %), même ton, aucun adjectif évaluatif, pas de « certains disent ». Chaque camp présenté sous son meilleur jour.
- **Fidélité** : ne t'appuie QUE sur le contenu du fichier de recherche (contexte, arguments, alertes). N'ajoute aucun fait nouveau. Si une formulation simple risque d'être inexacte, reste plus précis plutôt que faux. Respecte les nuances signalées dans `alertes` (ex. texte censuré, vote sur une déclaration non contraignante, motion de censure).
- `questionSimple` : garde exactement la même polarité que `question` (+ `ouiSignifie`) du fichier source.
- JSON valide (`python3 -m json.tool`), français, UTF-8. Ne modifie aucun autre fichier.
