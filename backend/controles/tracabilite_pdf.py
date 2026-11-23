"""PDF du journal de traçabilité : un tableau A4 paysage, une ligne par visite de site.

Ce fichier ne dépend pas de Django : il reçoit des textes déjà prêts."""

from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

VERT = colors.HexColor("#2E7D4F")
GRIS = colors.HexColor("#B9C7BE")
FOND = colors.HexColor("#F3F8F4")

# En-têtes et largeurs (en points) : 730 au total, la page paysage en offre 774
COLONNES = [
    ("Date", 58),
    ("Contrôleur", 80),
    ("Site", 105),
    ("Début", 125),
    ("Fin", 125),
    ("Durée", 42),
    ("Contrôle", 120),
    ("Statut", 75),
]
CLES = ["date", "controleur", "site", "debut", "fin", "duree", "controle", "statut"]


def construire_pdf(lignes, synthese, institution, periode, qui, genere_le, genere_par):
    """lignes : liste de dictionnaires de textes (clés de CLES, balises <br/> permises).
    synthese : texte d'une ligne. Renvoie les octets du PDF."""
    tampon = BytesIO()
    doc = SimpleDocTemplate(
        tampon,
        pagesize=landscape(A4),
        leftMargin=1.2 * cm,
        rightMargin=1.2 * cm,
        topMargin=1.4 * cm,
        bottomMargin=1.6 * cm,
        title="Journal de traçabilité des contrôles",
    )

    styles = getSampleStyleSheet()
    cellule = ParagraphStyle(
        "cellule", parent=styles["BodyText"], fontName="Helvetica", fontSize=7.5, leading=9.6
    )
    entete = ParagraphStyle(
        "entete", parent=cellule, fontName="Helvetica-Bold", textColor=colors.white
    )
    titre = ParagraphStyle(
        "titre", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=15, spaceAfter=2
    )
    institution_style = ParagraphStyle(
        "institution",
        parent=cellule,
        fontName="Helvetica-Bold",
        fontSize=8.5,
        alignment=1,
        spaceAfter=4,
    )
    info = ParagraphStyle("info", parent=cellule, fontSize=9, leading=12)

    elements = [
        Paragraph(institution.upper(), institution_style),
        Paragraph("Journal de traçabilité des contrôles", titre),
        Paragraph(f"<b>Contrôleur :</b> {qui} &nbsp;&nbsp; <b>Période :</b> {periode}", info),
        Paragraph(synthese, info),
        Spacer(1, 0.3 * cm),
    ]

    if not lignes:
        elements.append(Paragraph("Aucun contrôle démarré sur cette période.", info))
    else:
        donnees = [[Paragraph(nom, entete) for nom, _ in COLONNES]]
        for ligne in lignes:
            donnees.append([Paragraph(ligne.get(cle, ""), cellule) for cle in CLES])

        tableau = Table(
            donnees,
            colWidths=[largeur for _, largeur in COLONNES],
            repeatRows=1,
        )
        tableau.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), VERT),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("GRID", (0, 0), (-1, -1), 0.4, GRIS),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, FOND]),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                    ("LEFTPADDING", (0, 0), (-1, -1), 3),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                ]
            )
        )
        elements.append(tableau)

    def pied(canvas, document):
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(colors.HexColor("#555555"))
        largeur, _ = landscape(A4)
        canvas.drawString(1.2 * cm, 0.8 * cm, f"Généré le {genere_le} par {genere_par}")
        canvas.drawRightString(largeur - 1.2 * cm, 0.8 * cm, f"Page {document.page}")
        canvas.restoreState()

    doc.build(elements, onFirstPage=pied, onLaterPages=pied)
    return tampon.getvalue()