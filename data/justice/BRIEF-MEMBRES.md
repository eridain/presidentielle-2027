# Brief — Appartenance actuelle des personnes condamnées (Vote réel)

But : pour chaque personne condamnée listée dans `data/justice/<partiId>.json`, établir **son lien actuel (au 18/10/2026) avec le parti**, afin que le site distingue les membres toujours présents des anciens membres (exclus, partis d'eux-mêmes, décédés). L'utilisateur veut qu'une personne évincée du parti à cause de sa condamnation pèse moins que des condamnés toujours membres.

## Statuts possibles (`statutMembre`)
- `membre` : toujours membre / élu sous l'étiquette (préciser si responsabilité actuelle)
- `suspendu` : suspendu du parti ou du groupe, mais pas exclu (date + motif)
- `exclu` : exclu par le parti (date + motif)
- `depart` : a quitté le parti de lui-même (date + motif si connu ; préciser s'il a rejoint un autre parti)
- `retire` : s'est retiré de la vie politique sans quitter formellement le parti (préciser)
- `decede` : décédé (date) — indiquer aussi s'il était encore membre au décès ou exclu avant
- `personne_morale` : le parti lui-même

## Lien avec la condamnation (`lienAvecCondamnation`)
Pour `suspendu`/`exclu`/`depart` : `oui` (la sanction/le départ est explicitement motivé par l'affaire ou la condamnation), `non` (autre motif), `inconnu`. Le parti a-t-il réagi à la condamnation (soutien public, sanction, silence) ? → `reactionParti` (1 phrase factuelle, sourcée, ou null).

## Sortie : `data/justice/membres/<partiId>.json`
```json
{
  "partiId": "lfi",
  "personnes": [
    {
      "personne": "exactement la chaîne du champ `personne` du fichier justice",
      "statutMembre": "membre|suspendu|exclu|depart|retire|decede|personne_morale",
      "depuis": "AAAA-MM-JJ ou AAAA-MM ou AAAA ou null",
      "detail": "1 phrase factuelle (ex. « exclu du FN en août 2015 après ses propos sur les chambres à gaz ; décédé en 2025 »)",
      "lienAvecCondamnation": "oui|non|inconnu|null",
      "reactionParti": "1 phrase ou null",
      "sources": [{"titre": "...", "url": "...", "citation": "verbatim ≤ 40 mots", "date": "AAAA-MM-JJ"}]
    }
  ],
  "alertes": []
}
```

## Règles
- Chaque statut autre que `membre` d'un parlementaire en exercice élu sous l'étiquette doit être sourcé (URL ouverte + citation verbatim). Pour `membre`, une source récente (≤ 12 mois) montrant l'appartenance suffit (site du parti, Assemblée/Sénat/PE, presse).
- Attention aux nuances : apparenté ≠ membre ; groupe parlementaire ≠ parti ; suspension ≠ exclusion ; un ancien premier secrétaire toujours adhérent = `membre`.
- Ne JAMAIS deviner. Si incertain : `statutMembre` le plus prudent avec `alertes`.
- JSON valide (`python3 -m json.tool`), français. N'écris que tes fichiers `data/justice/membres/<partiId>.json`. Outils : web_search, web_extract (si web_extract échoue : `curl -sL` ou `https://r.jina.ai/<url>`).
