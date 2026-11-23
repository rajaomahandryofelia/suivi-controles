from decimal import Decimal
from io import BytesIO
from xml.sax.saxutils import escape

from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

VERT = colors.HexColor("#1b7a3d")


def ar(montant):
    """1000000 -> « 1 000 000 Ar »."""
    return f"{int(montant):,}".replace(",", " ") + " Ar"


def _construire_pdf(titre, numero, lignes, paragraphes):
    tampon = BytesIO()
    doc = SimpleDocTemplate(
        tampon,
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )
    styles = getSampleStyleSheet()
    style_titre = ParagraphStyle(
        "titre", parent=styles["Title"], textColor=VERT, fontSize=20
    )

    elements = [
        Paragraph("ORTM — Direction du Partenariat et de la Coopération", styles["Heading3"]),
        Spacer(1, 0.5 * cm),
        Paragraph(escape(f"{titre} N° {numero}"), style_titre),
        Spacer(1, 0.6 * cm),
    ]

    tableau = Table(
        [
            [
                Paragraph(f"<b>{escape(cle)}</b>", styles["Normal"]),
                Paragraph(escape(str(valeur)), styles["Normal"]),
            ]
            for cle, valeur in lignes
        ],
        colWidths=[5.5 * cm, 11 * cm],
    )
    tableau.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#eef6f0")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    elements.append(tableau)

    for texte in paragraphes:
        elements.append(Spacer(1, 0.6 * cm))
        elements.append(Paragraph(escape(texte), styles["Normal"]))

    doc.build(elements)
    return tampon.getvalue()


def generer_facture_pdf(echeance):
    convention = echeance.convention
    lignes = [
        ("Date de la facture", f"{echeance.date_facture:%d/%m/%Y}" if echeance.date_facture else "—"),
        ("Partenaire", convention.partenaire.nom),
        ("Site", convention.site.nom),
        ("Convention", convention.reference),
        ("Échéance", f"{echeance.date_echeance:%d/%m/%Y}"),
        ("Montant à payer", ar(echeance.montant_du)),
        ("Déjà payé", ar(echeance.montant_paye)),
        ("Reste à payer", ar(echeance.reste_a_payer)),
    ]
    paragraphes = [
        "Merci de régler ce montant selon les termes de la convention "
        "(espèces ou chèque par ordre de publicité, ou virement)."
    ]
    return _construire_pdf("Facture", echeance.numero_facture, lignes, paragraphes)


def numero_recu(paiement):
    return f"REC-{paiement.date_paiement.year}-{paiement.pk:04d}"


def generer_recu_pdf(paiement):
    echeance = paiement.echeance
    convention = echeance.convention
    lignes = [
        ("Date du paiement", f"{paiement.date_paiement:%d/%m/%Y}"),
        ("Partenaire", convention.partenaire.nom),
        ("Site", convention.site.nom),
        ("Convention", convention.reference),
        ("Échéance réglée", f"{echeance.date_echeance:%d/%m/%Y}"),
        ("Montant reçu", ar(paiement.montant)),
        ("Mode de paiement", paiement.get_mode_display()),
        ("N° de l'ordre ou du chèque", paiement.reference or "—"),
        ("Reste à payer sur l'échéance", ar(echeance.reste_a_payer)),
    ]
    paragraphes = ["Nous accusons réception de votre paiement. Merci."]
    return _construire_pdf("Reçu de paiement", numero_recu(paiement), lignes, paragraphes)


# ---------------------------------------------------------------------------
# État de paiement d'un partenaire (équivalent d'un onglet du tableau Excel)
# ---------------------------------------------------------------------------

MOIS = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
]
ANNEES_PAR_TABLEAU = 7


def _libelle_paiement(paiement):
    """Texte d'une case payée, comme dans le tableau de la DPC."""
    reference = f" {paiement.reference}" if paiement.reference else ""
    if paiement.mode == "VIREMENT":
        return f"Payé par OV{reference}"
    if paiement.mode == "CHEQUE":
        return f"Chq OP{reference}"
    return f"OP{reference}"


def _cellule(echeance, aujourdhui):
    """(texte, état, reste à payer) d'une échéance pour une case du tableau."""
    paiements = list(echeance.paiements.all())
    paye = sum((p.montant for p in paiements), Decimal("0"))
    reste = max(echeance.montant_du - paye, Decimal("0"))

    if paiements and reste == 0:
        dernier = max(paiements, key=lambda p: p.date_paiement)
        return _libelle_paiement(dernier), "paye", reste
    if paye > 0:
        return f"Partiel {ar(paye)}", "partiel", reste
    if echeance.date_echeance <= aujourdhui:
        return "NP", "np", reste
    return "", "avenir", Decimal("0")


def generer_etat_paiement_pdf(convention):
    """État de paiement d'une convention : mois en lignes, années en colonnes,
    avec les impayés par année et le total."""
    aujourdhui = timezone.localdate()
    partenaire = convention.partenaire
    echeances = list(
        convention.echeances.prefetch_related("paiements").order_by("date_echeance")
    )

    cases = {}  # (année, mois) -> [(texte, état)]
    impayes = {}  # année -> montant
    for echeance in echeances:
        texte, etat, reste = _cellule(echeance, aujourdhui)
        cle = (echeance.date_echeance.year, echeance.date_echeance.month)
        cases.setdefault(cle, []).append((texte, etat))
        if etat in ("np", "partiel"):
            annee = echeance.date_echeance.year
            impayes[annee] = impayes.get(annee, Decimal("0")) + reste
    total_impayes = sum(impayes.values(), Decimal("0"))
    annees = sorted({annee for annee, _ in cases})

    tampon = BytesIO()
    doc = SimpleDocTemplate(
        tampon,
        pagesize=landscape(A4),
        leftMargin=1.5 * cm,
        rightMargin=1.5 * cm,
        topMargin=1.5 * cm,
        bottomMargin=1.5 * cm,
    )
    styles = getSampleStyleSheet()
    style_titre = ParagraphStyle(
        "titre_etat", parent=styles["Heading2"], textColor=VERT, spaceAfter=4
    )
    style_petit = ParagraphStyle("petit", parent=styles["Normal"], fontSize=9)
    style_case = ParagraphStyle("case", parent=styles["Normal"], fontSize=7, leading=8)

    contact = " — ".join(x for x in (partenaire.contact, partenaire.telephone) if x) or "—"
    elements = [
        Paragraph(
            escape(
                f"ÉTAT DE PAIEMENT — LOCATION SITE TECHNIQUE {convention.site.nom} "
                f"— {partenaire.nom}".upper()
            ),
            style_titre,
        ),
        Paragraph(
            escape(
                f"Convention {convention.reference} · Montant : {ar(convention.montant_periodique)} "
                f"({convention.get_periodicite_display().lower()}) · Contact : {contact}"
            ),
            style_petit,
        ),
        Paragraph(
            "OP : Ordre de publicité (paiement par espèces ou chèque) · "
            "OV : Ordre de virement · NP : Non payé",
            style_petit,
        ),
        Spacer(1, 0.5 * cm),
    ]

    if not annees:
        elements.append(Paragraph("Aucune échéance n'a encore été générée.", styles["Normal"]))
    else:
        styles_etat = {
            "np": ParagraphStyle(
                "np", parent=style_case, textColor=colors.HexColor("#b3261e"),
                fontName="Helvetica-Bold",
            ),
            "partiel": ParagraphStyle(
                "partiel", parent=style_case, textColor=colors.HexColor("#b26a00")
            ),
            "avenir": ParagraphStyle(
                "avenir", parent=style_case, textColor=colors.HexColor("#9e9e9e")
            ),
        }
        for debut in range(0, len(annees), ANNEES_PAR_TABLEAU):
            groupe = annees[debut : debut + ANNEES_PAR_TABLEAU]
            donnees = [["Mois"] + [str(a) for a in groupe]]
            for mois in range(1, 13):
                ligne = [MOIS[mois - 1]]
                for annee in groupe:
                    morceaux = cases.get((annee, mois), [])
                    texte = " / ".join(t for t, _ in morceaux if t)
                    etats = {e for _, e in morceaux}
                    # La couleur du texte suit l'état le plus préoccupant de la case
                    if "np" in etats:
                        style_texte = styles_etat["np"]
                    elif "partiel" in etats:
                        style_texte = styles_etat["partiel"]
                    elif "avenir" in etats:
                        style_texte = styles_etat["avenir"]
                    else:
                        style_texte = style_case
                    ligne.append(Paragraph(escape(texte), style_texte))
                donnees.append(ligne)
            donnees.append(
                ["Impayés/an"]
                + [ar(impayes[a]) if impayes.get(a) else "-" for a in groupe]
            )

            tableau = Table(
                donnees, colWidths=[2.4 * cm] + [3.4 * cm] * len(groupe), repeatRows=1
            )
            style = [
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#1a3a5c")),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#d32f2f")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 7),
                ("ALIGN", (1, 0), (-1, 0), "RIGHT"),
                ("BACKGROUND", (0, 13), (-1, 13), colors.HexColor("#eef6f0")),
                ("FONTNAME", (0, 13), (-1, 13), "Helvetica-Bold"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
            # Fond rosé pour les cases non payées
            for colonne, annee in enumerate(groupe, start=1):
                for mois in range(1, 13):
                    if any(e == "np" for _, e in cases.get((annee, mois), [])):
                        style.append(
                            ("BACKGROUND", (colonne, mois), (colonne, mois),
                             colors.HexColor("#fdecea"))
                        )
            tableau.setStyle(TableStyle(style))
            elements.append(tableau)
            elements.append(Spacer(1, 0.5 * cm))

    elements.append(
        Paragraph(
            f"<b>MONTANT TOTAL DES IMPAYÉS = {ar(total_impayes)}</b>", styles["Normal"]
        )
    )
    elements.append(Paragraph(f"À la date du {aujourdhui:%d/%m/%Y}", styles["Normal"]))

    doc.build(elements)
    return tampon.getvalue()
# ============================================================================
# documents.py : TROIS fonctions à remplacer (le reste du fichier ne change pas)
#
#   - numero_recu(paiement)
#   - generer_recu_pdf(paiement)
#   - _cellule(echeance, aujourdhui)
# ============================================================================


def numero_recu(paiement):
    """Le numéro enregistré (REC-2026-0001) ; pour un ancien paiement sans numéro,
    l'ancien format est conservé."""
    return paiement.numero_recu or f"REC-{paiement.date_paiement.year}-{paiement.pk:04d}"


def generer_recu_pdf(paiement):
    echeance = paiement.echeance
    convention = echeance.convention
    lignes = [
        ("Date du paiement", f"{paiement.date_paiement:%d/%m/%Y}"),
        ("Partenaire", convention.partenaire.nom),
        ("Site", convention.site.nom),
        ("Convention", convention.reference),
        ("Échéance réglée", f"{echeance.date_echeance:%d/%m/%Y}"),
        ("Montant reçu", ar(paiement.montant)),
        ("Mode de paiement", paiement.get_mode_display()),
        ("N° de l'ordre ou du chèque", paiement.reference or "—"),
    ]
    # Détails selon le mode, seulement s'ils sont renseignés
    if paiement.banque:
        lignes.append(("Banque", paiement.banque))
    if paiement.date_valeur:
        lignes.append(("Date de valeur", f"{paiement.date_valeur:%d/%m/%Y}"))
    if paiement.nom_payeur:
        lignes.append(("Payé par", paiement.nom_payeur))
    if paiement.observation:
        lignes.append(("Observation", paiement.observation))
    lignes.append(("Reste à payer sur l'échéance", ar(echeance.reste_a_payer)))

    if paiement.est_annule:
        date = f"{paiement.date_annulation:%d/%m/%Y}" if paiement.date_annulation else ""
        lignes.append(("ANNULÉ", f"Le {date}. Motif : {paiement.motif_annulation}"))
        paragraphes = ["Ce reçu est annulé : il n'a plus de valeur."]
    else:
        paragraphes = ["Nous accusons réception de votre paiement. Merci."]
    return _construire_pdf("Reçu de paiement", numero_recu(paiement), lignes, paragraphes)


def _cellule(echeance, aujourdhui):
    """(texte, état, reste à payer) d'une échéance pour une case du tableau.
    Les paiements annulés sont ignorés."""
    paiements = [p for p in echeance.paiements.all() if not p.est_annule]
    paye = sum((p.montant for p in paiements), Decimal("0"))
    reste = max(echeance.montant_du - paye, Decimal("0"))

    if paiements and reste == 0:
        dernier = max(paiements, key=lambda p: p.date_paiement)
        return _libelle_paiement(dernier), "paye", reste
    if paye > 0:
        return f"Partiel {ar(paye)}", "partiel", reste
    if echeance.date_echeance <= aujourdhui:
        return "NP", "np", reste
    return "", "avenir", Decimal("0")