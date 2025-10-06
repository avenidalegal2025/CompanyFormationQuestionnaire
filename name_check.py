
# wy_name_check.py
# Wyoming name availability checker based on the Secretary of State guidance.
# See functions: check_wyoming_name_availability, EntityRecord

from dataclasses import dataclass
from typing import List, Dict, Optional
from datetime import date
import re

GENERIC_WORDS = {
    "corp","corporation","inc","incorporated",
    "llc","limited","limited liability company","limited liability co","co","company","lc","ltd","ltd.","ltd",
    "limited partnership","lp","partnership",
    "statutory trust","trust","foundation",
    "l3c","dao","lao",
    "the","and","&",
}

PUNCTUATION_PATTERN = re.compile(r"[^\w\s]")

SING_PLUR_EQUIV = {
    "property":"properties",
    "child":"children",
    "holding":"holdings",
    "supernova":"supernovae",
    "maximum":"maxima",
    "goose":"geese",
    "cactus":"cacti",
    "spectrum":"spectra",
    "lumen":"lumina",
}

EDU_RESTRICTED = {
    "academy","academies","college","colleges","edu","educate","educates","education","educational",
    "institute","institutes","institution","institutions","school","schools","university","universities"
}
BANK_RESTRICTED = {
    "bank","banks","banker","bankers","banco","bancos","banca","banque","banques","banq","banqs",
    "banc","bancs","bancorp","bancorps","banquer","banquers","ptc","trust","trusts","trust company",
    "bancorporation","bancorporations","private trust company"
}

NUMBER_WORDS = {
    "zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen",
    "fourteen","fifteen","sixteen","seventeen","eighteen","nineteen","twenty"
}

ROMAN_NUMERAL_PATTERN = re.compile(r"\b[IVXLCDM]+\b", re.IGNORECASE)

def normalize_tokens(name: str):
    n = name.lower()
    n = PUNCTUATION_PATTERN.sub(" ", n)
    n = re.sub(r"\s+", " ", n).strip()
    tokens = n.split(" ")
    out = []
    for tok in tokens:
        if not tok:
            continue
        if tok in GENERIC_WORDS:
            continue
        canon = None
        for sing, plur in SING_PLUR_EQUIV.items():
            if tok == sing or tok == plur:
                canon = sing
                break
        if canon:
            out.append(canon); continue
        if tok.endswith("s") and len(tok) > 3 and tok not in NUMBER_WORDS:
            if not ROMAN_NUMERAL_PATTERN.fullmatch(tok):
                out.append(tok[:-1]); continue
        out.append(tok)
    return out

def comparable_signature(name: str) -> str:
    toks = [t for t in normalize_tokens(name) if t]
    return " ".join(toks)

def needs_special_approval(name: str):
    n = name.lower()
    words = set(re.findall(r"[a-z]+", n))
    lowered = " " + re.sub(r"\s+", " ", n) + " "
    edu = any(w in EDU_RESTRICTED for w in words)
    bank = any(w in BANK_RESTRICTED for w in words) or (" trust " in lowered)
    return {"education": edu, "banking": bank}

@dataclass
class EntityRecord:
    name: str
    status: str = "Active"
    inactive_date: Optional[date] = None

def is_name_currently_blocking(rec: EntityRecord, on_date: Optional[date] = None) -> bool:
    on_date = on_date or date.today()
    s = rec.status.lower()
    if "active" in s and "inactive" not in s:
        return True
    if "inactive - dissolved" in s:
        return False
    if "inactive - administratively dissolved" in s:
        if rec.inactive_date is None:
            return True
        return (on_date - rec.inactive_date).days < 2*365
    return True

def check_wyoming_name_availability(candidate: str, existing: List[EntityRecord], on_date: Optional[date] = None):
    sig = comparable_signature(candidate)
    flags = needs_special_approval(candidate)
    on_date = on_date or date.today()
    conflicts = []
    soft_conflicts = []
    for rec in existing:
        rec_sig = comparable_signature(rec.name)
        if rec_sig == sig:
            blocking = is_name_currently_blocking(rec, on_date)
            conflicts.append({
                "existing_name": rec.name,
                "status": rec.status,
                "blocking": blocking,
                "reason": "Not distinguishable after removing indicators, punctuation, case, and singular/plural equivalences."
            })
        else:
            base = re.sub(r"\b(\d+|" + "|".join(NUMBER_WORDS) + r"|[IVXLCDM]+)\b", "", sig, flags=re.IGNORECASE)
            base = re.sub(r"\s+", " ", base).strip()
            rec_base = re.sub(r"\b(\d+|" + "|".join(NUMBER_WORDS) + r"|[IVXLCDM]+)\b", "", comparable_signature(rec.name), flags=re.IGNORECASE)
            rec_base = re.sub(r"\s+", " ", rec_base).strip()
            if base == rec_base:
                soft_conflicts.append({
                    "existing_name": rec.name,
                    "status": rec.status,
                    "blocking": is_name_currently_blocking(rec, on_date),
                    "reason": "Only differs by numerals/roman numerals/number words (which are distinguishable)."
                })
    available_blocked_by = [c for c in conflicts if c["blocking"]]
    available = len(available_blocked_by) == 0
    suggestions = []
    if not available:
        suggestions += [candidate + " 2", candidate + " Holdings", candidate.replace(" ", "") + " Group", candidate + " III"]
    else:
        if soft_conflicts:
            suggestions.append(candidate + " Three")
    return {
        "candidate": candidate,
        "comparable_signature": sig,
        "needs_approval": flags,
        "available": available,
        "blocking_conflicts": conflicts,
        "nearby_conflicts": soft_conflicts,
        "suggestions": suggestions
    }
