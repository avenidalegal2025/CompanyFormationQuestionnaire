#!/usr/bin/env python3
"""No Spanish may reach a filed SS-4 -- and no name may be translated.

SAIGON SWING LLC's SS-4 (filed 2026-09-02) read "RESTAURANTE" on the
principal-activity line. The questionnaire is Spanish, but translate_to_english
only translates when it *sniffs* Spanish (accented characters or a stopword
like "de"/"y"), and a single unaccented noun -- RESTAURANTE, CONSTRUCCION,
TRANSPORTE -- looks English to that sniff. Every path that carries free text the
customer typed must therefore pass force=True.

The opposite mistake is just as bad: forcing translation on a company name would
file "WHITE HOUSE LLC" for CASA BLANCA LLC. Both directions are asserted here.

    python3 scripts/test-ss4-translation.py

Runs offline: AWS Translate is replaced by a stub glossary, so this is a test of
our routing, not of Amazon's Spanish.
"""
import os
import sys
import types

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "lambda-functions"))

# The Lambda imports PyPDF2, reportlab and boto3 for drawing and uploading the
# PDF. This test never reaches any of that -- it stops at the field mapping --
# and those packages live in the deployment zip, not in CI. Stub whichever are
# missing so the test runs anywhere python does.
def _stub(name, **attrs):
    try:
        __import__(name)
        return
    except ImportError:
        pass
    mod = types.ModuleType(name)
    for k, v in attrs.items():
        setattr(mod, k, v)
    sys.modules[name] = mod


_stub("PyPDF2", PdfReader=object, PdfWriter=object)
_stub("reportlab")
_stub("reportlab.pdfgen", canvas=types.SimpleNamespace(Canvas=object))
_stub("boto3", client=lambda *a, **k: None)

import ss4_lambda_s3_complete as ss4  # noqa: E402

# Words the real AWS Translate would render; anything else comes back unchanged,
# so an assertion can only pass if the text actually reached the translator.
GLOSSARY = {
    "restaurante": "restaurant",
    "construccion": "construction",
    "venta de ropa": "clothing sales",
    "casa blanca llc": "white house llc",
    "casa blanca": "white house",
}

seen = []


class StubTranslate:
    def translate_text(self, Text, SourceLanguageCode, TargetLanguageCode):  # noqa: N803
        seen.append(Text)
        return {"TranslatedText": GLOSSARY.get(Text.strip().lower(), Text)}


ss4.translate_client = StubTranslate()

BASE = {
    "companyName": "Casa Blanca LLC",
    "companyNameBase": "Casa Blanca",
    "entityType": "LLC",
    "formationState": "Florida",
    "companyAddress": "123 Main St, Miami, FL 33101",
    "responsiblePartyName": "Maria Garcia",
    "responsiblePartySSN": "123-45-6789",
    "responsiblePartyAddress": "456 Ocean Dr, Miami, FL 33139",
    "responsiblePartyCity": "Miami",
    "responsiblePartyState": "FL",
    "responsiblePartyZip": "33139",
    "responsiblePartyCountry": "USA",
    "ownerCount": 1,
    "isLLC": "Yes",
    "llcMemberCount": 1,
    "dateBusinessStarted": "2024-01-15",
    "applicantPhone": "(305) 555-1234",
}

failures = []


def check(label, ok, detail=""):
    print(f"  {'OK ' if ok else '!! '} {label}" + ("" if ok or not detail else f" -- {detail}"))
    if not ok:
        failures.append(label)


def mapped(**over):
    data = dict(BASE)
    data.update(over)
    out = ss4.map_data_to_ss4_fields(data)
    return out


def main():
    print("SS-4 translation routing -- no Spanish on the form, no translated names\n")

    # 1. The exact SAIGON SWING shape: the classifier answered "other" and gave
    #    no specification, so the form falls back to the business purpose. One
    #    unaccented Spanish noun -- the sniff cannot see it.
    print('Classifier returns "other" with nothing specified:')
    for spanish, english in (("RESTAURANTE", "RESTAURANT"), ("CONSTRUCCION", "CONSTRUCTION")):
        out = mapped(businessPurpose=spanish, line16Category="other", line16OtherSpecify="")
        check(f'line 16 for "{spanish}" is English', out.get("16_other_specify") == english,
              f'got "{out.get("16_other_specify")}"')
        check(f'line 10 for "{spanish}" is English', spanish not in (out.get("10") or ""),
              f'got "{out.get("10")}"')

    # 2. An unrecognised category takes the other fallback branch, same source.
    print("\nUnrecognised category (the else branch):")
    out = mapped(businessPurpose="RESTAURANTE", line16Category="something_new", line16OtherSpecify="")
    check("line 16 is English", out.get("16_other_specify") == "RESTAURANT",
          f'got "{out.get("16_other_specify")}"')

    # 3. Multi-word Spanish with a stopword was always caught; it must stay caught.
    print("\nSpanish the sniff already caught:")
    out = mapped(businessPurpose="venta de ropa", line16Category="other", line16OtherSpecify="")
    check("line 16 translates a stopword phrase", out.get("16_other_specify") == "CLOTHING SALES",
          f'got "{out.get("16_other_specify")}"')

    # 4. Line 10 when the flow supplies its own summarised reason.
    print("\nSummarised reason on line 10:")
    out = mapped(businessPurpose="RESTAURANTE", summarizedBusinessPurpose="RESTAURANTE",
                 line16Category="accommodation")
    check("line 10 is English", "RESTAURANTE" not in (out.get("10") or ""), f'got "{out.get("10")}"')

    # 5. The guard in the other direction: names and addresses are identity, not
    #    Spanish to be corrected.
    print("\nNames and addresses are never translated:")
    out = mapped(businessPurpose="RESTAURANTE", line16Category="other", line16OtherSpecify="")
    check("company name kept verbatim", "CASA BLANCA" in (out.get("Line 1") or "").upper(),
          f'got "{out.get("Line 1")}"')
    check("no white house", "WHITE HOUSE" not in (out.get("Line 1") or "").upper())
    # Line 5a/5b is the company's own street address (line 4 is Avenida Legal's
    # mailing address). "Main St" must not come back as "Calle Principal", and
    # a Spanish street name must not come back as an English one.
    check("company street address kept verbatim", out.get("Line 5a") == "123 MAIN ST",
          f'got "{out.get("Line 5a")}"')
    out_es = mapped(companyAddress="Casa Blanca 45, Miami, FL 33101",
                    businessPurpose="RESTAURANTE", line16Category="other", line16OtherSpecify="")
    check("Spanish street address kept verbatim", "CASA BLANCA" in (out_es.get("Line 5a") or ""),
          f'got "{out_es.get("Line 5a")}"')

    print("\n" + (f"FAIL: {len(failures)} check(s) failed." if failures else "PASS"))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
