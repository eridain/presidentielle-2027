# Brief — Condamnations des ANCIENS membres (passif des partis) — Vote réel

Complément de `data/justice/BRIEF.md` (lis-le : mêmes règles de preuve, de statut judiciaire, d'exclusions, même schéma de condamnation, champ `famille` ∈ probite|violences|haine|diffamation|autres).

## Périmètre « anciens membres »
Personnes qui **ne sont plus membres** du parti au 18/10/2026 (exclues, parties d'elles-mêmes, décédées) ET qui ont été, sous l'étiquette du parti ou de son prédécesseur direct (FN→RN, UMP→LR, LREM→Renaissance, EELV/Verts→Les Écologistes, Front de gauche→LFI pour les membres du Parti de gauche…) :
1. dirigeant national (président, secrétaire général, trésorier, vice-président, porte-parole) à n'importe quelle époque ;
2. parlementaire (député, sénateur, eurodéputé) ou ministre **depuis 2012**.
Ex. connus à vérifier : Stéphane Ravier (Reconquête), Joël Guerriau (Horizons), Nicolas Bay / Bruno Gollnisch / Wallerand de Saint-Just et autres condamnés de l'affaire des assistants (RN), Jérôme Cahuzac (PS), Claude Guéant, Patrick Balkany, Serge Dassault, Jean Tiberi (UMP/LR), Thomas Thévenoud (PS), etc. — vérifier chacun, ne rien retenir sans source.

N'inclure PAS les personnes déjà présentes dans `data/justice/<partiId>.json` (elles sont traitées ailleurs).

## Sortie : `data/justice/anciens/<partiId>.json`
```json
{
  "partiId": "lr",
  "condamnations": [ { ...même schéma que BRIEF.md..., "categorie": "ancien_membre", "famille": "...",
     "appartenance": {"statutMembre": "exclu|depart|decede", "depuis": "AAAA[-MM[-JJ]]", "detail": "1 phrase (rôle passé + départ)", "lienAvecCondamnation": "oui|non|inconnu", "reactionParti": "1 phrase ou null", "sources": [{"titre": "...", "url": "...", "citation": "verbatim ≤ 40 mots"}]} } ],
  "perimetre": {"personnesVerifiees": 0, "methode": "...", "limites": "..."},
  "alertes": []
}
```
`dateDecision` : AAAA-MM-JJ, ou AAAA-MM / AAAA si le jour est inconnu. Citations verbatim ≤ 40 mots, URL ouvertes par toi. Si `web_extract` échoue : `curl -sL` ou `https://r.jina.ai/<url>`. Prudence maximale : mieux vaut incomplet et exact. JSON valide (`python3 -m json.tool`). N'écris que tes fichiers.
