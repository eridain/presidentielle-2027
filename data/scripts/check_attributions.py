"""Vérifie l'auteur réel de chaque citation de candidat issue d'un compte rendu de séance AN/Sénat.
Télécharge la page, retrouve la citation, identifie le dernier orateur avant elle.
Sortie : data/research/attributions.json  {"<question>/<candidat>": {"orateur": "...", "estLeCandidat": bool, "trouve": bool}}"""
import json, glob, re, html, hashlib, pathlib, subprocess, unicodedata

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT / "build/pages"; CACHE.mkdir(parents=True, exist_ok=True)
CANDS = {c["id"]: c["nom"] for c in json.load(open(ROOT / "candidats.json"))}

def norm(s):
    s = unicodedata.normalize("NFKC", s).replace("\u2019", "'").replace("\u2011", "-").replace("\u2060", "")
    return re.sub(r"\s+", " ", s).strip()

def fold(s):
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")

def page(url):
    p = CACHE / (hashlib.sha1(url.encode()).hexdigest() + ".html")
    if not p.exists():
        subprocess.run(["curl", "-sL", "-A", "Mozilla/5.0", "--max-time", "60", url, "-o", str(p)], check=False)
    raw = p.read_text(encoding="utf-8", errors="ignore") if p.exists() else ""
    return norm(html.unescape(re.sub(r"<[^>]+>", " ", raw)))

SPEAKER = re.compile(r"(?:M\.|Mme) (?:[A-ZÉÈÀÂÎÔÛÇ][\w'\-éèêëïîôûüç]+ ?){1,4}")
out = {}
for f in sorted(glob.glob(str(ROOT / "research/*.json"))):
    if f.endswith(("tasks.json", "attributions.json")): continue
    d = json.load(open(f))
    for cid, e in d["candidats"].items():
        url, cit = e.get("url") or "", e.get("citation")
        if not cit or not re.search(r"(assemblee-nationale\.fr/dyn/\d+/comptes-rendus|senat\.fr/seances)", url):
            continue
        t = page(url); q = norm(cit)
        i = t.find(q[:80])
        key = f"{d['id']}/{cid}"
        if i < 0:
            out[key] = {"trouve": False, "orateur": None, "estLeCandidat": None}
            continue
        seg = t[max(0, i - 15000):i]
        # retirer les interjections entre parenthèses « (Mme X s'exclame.) »
        seg = re.sub(r"\([^()]{0,300}\)", " ", seg)
        if "Partager" in t:  # AN : chaque prise de parole est suivie du bouton « Partager »
            names = [m.group(1).strip() for m in re.finditer(r"((?:M\.|Mme) [^.()]{2,60}?) Partager", seg)]
        else:
            names = [m.group(0).strip() for m in SPEAKER.finditer(seg)]
        names = [n for n in names if not n.startswith(("M. le président", "Mme la présidente", "M. le ministre", "Mme la ministre"))]
        orateur = names[-1] if names else None
        nom = CANDS[cid].split()[-1]
        out[key] = {"trouve": True, "orateur": orateur, "estLeCandidat": bool(orateur and fold(nom) in fold(orateur))}

(ROOT / "research/attributions.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
bad = {k: v for k, v in out.items() if not v["estLeCandidat"]}
print(f"{len(out)} citations en séance vérifiées ; {len(bad)} non prononcées par le candidat ou non retrouvées :")
for k, v in bad.items(): print(" ", k, v)
