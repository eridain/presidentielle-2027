"""Extrait, pour chaque scrutin sélectionné, le résultat global, la ventilation par groupe
et le vote nominatif des candidats (+ appartenance au gouvernement à la date du vote).
Entrée : data/selection.json, data/raw/* (open data AN). Sortie : data/build/votes.json

Mode approfondi (questions par catégorie) : même logique, entrée et sortie séparées —
data/build/votes.json n'est jamais touché :
  python3 data/scripts/extract_votes.py --approfondi
  = --selection data/selection-approfondi.json --out data/build/votes-approfondi.json
Dans ce mode, un scrutin introuvable dans data/raw est signalé et ignoré (code de sortie 2), au lieu d'arrêter
l'extraction ; le champ « typeVote » de la sélection (ensemble | article | amendement | motion_censure) est conservé
sous « portee » (« typeVote » reste le libellé officiel de l'AN, comme dans votes.json)."""
import argparse, json, pathlib, re, sys

DATA = pathlib.Path(__file__).resolve().parents[1]
RAW = DATA / "raw"

parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
parser.add_argument("--approfondi", action="store_true",
                    help="sélection data/selection-approfondi.json → data/build/votes-approfondi.json")
parser.add_argument("--selection", type=pathlib.Path, help="fichier de sélection (défaut : data/selection.json)")
parser.add_argument("--out", type=pathlib.Path, help="fichier produit (défaut : data/build/votes.json)")
args = parser.parse_args()
SELECTION = args.selection or DATA / ("selection-approfondi.json" if args.approfondi else "selection.json")
OUTFILE = args.out or DATA / "build" / ("votes-approfondi.json" if args.approfondi else "votes.json")
if not args.approfondi and args.selection is None and args.out is None:
    OUTFILE.parent.mkdir(exist_ok=True)
elif OUTFILE.resolve() == (DATA / "build" / "votes.json").resolve() and SELECTION.resolve() != (DATA / "selection.json").resolve():
    sys.exit("Refus : data/build/votes.json ne peut être produit qu'à partir de data/selection.json.")

CANDS = json.load(open(DATA / "candidats.json"))
SEL = json.load(open(SELECTION))
# mode approfondi : demandé, ou sélection au format approfondi (entrées avec une « categorie »)
APPROFONDI = args.approfondi or any(isinstance(q, dict) and "categorie" in q for q in SEL)

organes = {}
def organe(ref):
    if ref not in organes:
        p = RAW / "acteurs_hist/json/organe" / f"{ref}.json"
        if p.exists():
            o = json.load(open(p))["organe"]
            organes[ref] = {"libelle": o.get("libelle"), "abrege": o.get("libelleAbrege") or o.get("libelleAbrev"), "type": o.get("codeType")}
        else:
            organes[ref] = {"libelle": ref, "abrege": ref, "type": None}
    return organes[ref]

def acteur(uid):
    return json.load(open(RAW / "acteurs_hist/json/acteur" / f"{uid}.json"))["acteur"]

def aslist(x):
    if x is None: return []
    return x if isinstance(x, list) else [x]

_leg14 = None
def load_scrutin(uid):
    global _leg14
    leg = uid.split("L")[1].split("V")[0]
    if leg == "14":
        if _leg14 is None:  # fichier unique de 200 Mo : lu une seule fois
            _leg14 = {s["uid"]: s for s in json.load(open(RAW / "scrutins_14/Scrutins_XIV.json"))["scrutins"]["scrutin"]}
        if uid in _leg14: return _leg14[uid]
        raise FileNotFoundError(f"scrutin {uid} absent de Scrutins_XIV.json")
    return json.load(open(RAW / f"scrutins_{leg}/json/{uid}.json"))["scrutin"]

POSKEYS = {"pours": "pour", "pour": "pour", "contres": "contre", "contre": "contre",
           "abstentions": "abstention", "abstention": "abstention", "nonVotants": "non-votant", "nonVotant": "non-votant"}

def mandats_of(a):
    return aslist((a.get("mandats") or {}).get("mandat"))

def in_range(m, date):
    d0 = m.get("dateDebut") or (m.get("mandature") or {}).get("datePriseFonction")
    d1 = m.get("dateFin")
    return (d0 is None or d0 <= date) and (d1 is None or date <= d1)

def gov_role(a, date):
    for m in mandats_of(a):
        if m.get("typeOrgane") == "GOUVERNEMENT" and in_range(m, date):
            q = m.get("infosQualite") or {}
            return q.get("libQualite") or "membre du Gouvernement"
    return None

def assembly_member(a, date):
    return any(m.get("typeOrgane") == "ASSEMBLEE" and in_range(m, date) for m in mandats_of(a))

def senate_member(a, date):
    return any(m.get("typeOrgane") in ("SENAT",) and in_range(m, date) for m in mandats_of(a))

cand_actors = {c["id"]: acteur(c["acteur"]) for c in CANDS if c.get("acteur")}

result = []
problemes = []
for q in SEL:
    if APPROFONDI:
        # sélection approfondie : entrées lues une à une, une entrée inexploitable n'arrête pas l'extraction
        if not isinstance(q, dict) or not isinstance(q.get("id"), str) or not isinstance(q.get("scrutin"), str):
            problemes.append(f"entrée ignorée (id ou scrutin manquant) : {json.dumps(q, ensure_ascii=False)[:120]}")
            continue
        try:
            s = load_scrutin(q["scrutin"])
        except (FileNotFoundError, IndexError, KeyError, ValueError) as e:
            problemes.append(f"{q['id']} : scrutin {q['scrutin']} introuvable dans data/raw ({e})")
            continue
    else:
        s = load_scrutin(q["scrutin"])
    date = s["dateScrutin"]
    d = s["syntheseVote"]["decompte"]
    nominal = {}  # acteurRef -> (position, groupe)
    groupes = []
    for g in aslist(s["ventilationVotes"]["organe"]["groupes"]["groupe"]):
        og = organe(g["organeRef"])
        v = g["vote"]
        dv = v.get("decompteVoix", {})
        cnt = {"pour": int(dv.get("pour") or 0), "contre": int(dv.get("contre") or 0),
               "abstention": int(dv.get("abstentions") or dv.get("abstention") or 0)}
        # Le champ positionMajoritaire de l'open data AN est souvent incohérent avec les décomptes
        # (ex. RN « pour » avec 12 pour / 106 contre) : on recalcule à partir des voix exprimées.
        top = max(cnt.values())
        winners = [k for k, n in cnt.items() if n == top]
        maj = None if top == 0 else (winners[0] if len(winners) == 1 else "partagé")
        groupes.append({"organe": g["organeRef"], "libelle": og["libelle"], "abrege": og["abrege"],
                        "membres": int(g.get("nombreMembresGroupe") or 0),
                        "majoritaire": maj, "majoritaireOpenDataAN": v.get("positionMajoritaire"),
                        **cnt, "nonVotants": int(dv.get("nonVotants") or 0)})
        for k, pos in POSKEYS.items():
            bloc = (v.get("decompteNominatif") or {}).get(k)
            if not bloc: continue
            for vt in aslist(bloc.get("votant")):
                nominal[vt["acteurRef"]] = {"position": pos, "groupe": og["abrege"] or og["libelle"],
                                             "parDelegation": vt.get("parDelegation") == "true"}
    cands = {}
    for cid, a in cand_actors.items():
        uid = a["uid"]["#text"]
        entry = {"gouvernement": gov_role(a, date)}
        if uid in nominal:
            entry.update(nominal[uid]); entry["source"] = "vote nominatif"
        elif assembly_member(a, date):
            entry.update({"position": "absent", "source": "député(e) à cette date, ne figure pas parmi les votants"})
        else:
            entry.update({"position": None, "source": "pas parlementaire votant dans ce scrutin"})
        cands[cid] = entry
    leg, num = s["legislature"], s["numero"]
    url = f"https://www.assemblee-nationale.fr/dyn/{leg}/scrutins/{num}" if q["scrutin"].startswith("VTAN") else None
    base = q
    if APPROFONDI:
        # champs de la sélection conservés ; « typeVote » de la sélection → « portee » (le libellé AN prend sa place)
        base = {k: v for k, v in q.items() if k not in ("typeVote", "date", "titreScrutin", "resultat", "justification")}
        base["portee"] = q.get("typeVote")
        # résultat de la sélection : « adopté » ou « adopté 463/74/20 » (pour / contre / abstentions)
        dd = s["syntheseVote"]["decompte"]
        decompte = f"{int(dd.get('pour') or 0)}/{int(dd.get('contre') or 0)}/{int(dd.get('abstentions') or dd.get('abstention') or 0)}"
        m = re.match(r"^\s*(adopté|rejeté)e?s?(?:\s+(\d+/\d+/\d+))?\s*$", str(q.get("resultat") or ""))
        resultat_ok = m is not None and m.group(1) == s["sort"]["code"] and (m.group(2) is None or m.group(2) == decompte)
        for champ, officiel, ok in (("date", date, q.get("date") in (None, "", date)),
                                    ("titreScrutin", s["titre"], q.get("titreScrutin") in (None, "", s["titre"])),
                                    ("resultat", f"{s['sort']['code']} {decompte}", q.get("resultat") in (None, "") or resultat_ok)):
            if not ok:
                problemes.append(f"{q['id']} : {champ} de la sélection « {q.get(champ)} » ≠ open data AN « {officiel} » (open data retenue)")
    result.append({**base, "date": date, "titreScrutin": s["titre"], "typeVote": s["typeVote"]["libelleTypeVote"],
                   "sort": s["sort"]["code"], "pour": int(d.get("pour") or 0), "contre": int(d.get("contre") or 0),
                   "abstention": int(d.get("abstentions") or d.get("abstention") or 0),
                   "dossier": ((s.get("objet") or {}).get("dossierLegislatif") or {}).get("libelle"),
                   "dossierRef": ((s.get("objet") or {}).get("dossierLegislatif") or {}).get("dossierRef"),
                   "urlScrutin": url, "groupes": groupes, "candidats": cands})

OUTFILE.parent.mkdir(parents=True, exist_ok=True)
OUTFILE.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"{len(result)} scrutins extraits -> {OUTFILE}")
for r in result:
    line = " ".join(f"{cid[:6]}={(e['position'] or '-')[:4]}{'*G' if e['gouvernement'] else ''}" for cid, e in r["candidats"].items())
    print(f"{r['id'][:22]:<22} {r['date']} {r['sort'][:3]} {r['pour']}-{r['contre']} | {line}")
for p in problemes:
    print(f"ATTENTION {p}")
if any("introuvable" in p or "ignorée" in p for p in problemes):
    sys.exit(2)
