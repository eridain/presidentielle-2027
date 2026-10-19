"""Index de tous les scrutins AN (législatures 14 à 17) -> data/index/scrutins_index.csv
Source : https://data.assemblee-nationale.fr (Open data, scrutins JSON)."""
import csv, json, pathlib

RAW = pathlib.Path(__file__).resolve().parents[1] / "raw"
OUT = RAW.parent / "index"; OUT.mkdir(exist_ok=True)


def iter_scrutins():
    xiv = json.load(open(RAW / "scrutins_14/Scrutins_XIV.json"))
    for s in xiv["scrutins"]["scrutin"]:
        yield s
    for leg in (15, 16, 17):
        for f in sorted((RAW / f"scrutins_{leg}/json").glob("*.json")):
            yield json.load(open(f))["scrutin"]


rows = []
for s in iter_scrutins():
    d = s["syntheseVote"]["decompte"]
    obj = s.get("objet") or {}
    dl = (obj.get("dossierLegislatif") or {}) if isinstance(obj, dict) else {}
    rows.append({
        "uid": s["uid"], "leg": s["legislature"], "num": s["numero"], "date": s["dateScrutin"],
        "type": s["typeVote"]["codeTypeVote"], "sort": s["sort"]["code"],
        "pour": d.get("pour"), "contre": d.get("contre"), "abst": d.get("abstentions") or d.get("abstention"),
        "titre": (s.get("titre") or "").replace("\n", " "),
        "dossier": (dl.get("libelle") or "") if isinstance(dl, dict) else "",
        "dossierRef": (dl.get("dossierRef") or "") if isinstance(dl, dict) else "",
    })

rows.sort(key=lambda r: (r["date"], int(r["leg"]), int(r["num"])))
with open(OUT / "scrutins_index.csv", "w", newline="", encoding="utf-8") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
print(len(rows), "scrutins ;", rows[0]["date"], "->", rows[-1]["date"])
