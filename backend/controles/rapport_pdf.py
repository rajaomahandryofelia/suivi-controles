"""Mise en page du rapport PDF d'une mission de contrôle.

Ce fichier ne connaît pas Django : il reçoit un dictionnaire de données déjà
préparées (textes, dates formatées, octets des photos) et renvoie les octets
du PDF. La préparation des données se fait dans `services.py`.

Clés attendues dans le dictionnaire `donnees` :
    numero, site_nom, localisation, type_site, partenaire, controleur,
    date_prevue, debut, position_debut, fin, position_fin, duree,
    score (nombre), nb_conformes, nb_criteres, genere_le, logo (Path ou None)
    reponses       : liste de {ordre, libelle, valeur, conforme, commentaire}
    non_conformites: liste de {critere, constat, gravite, date_limite}
    inventaire     : liste de {type, description}
    photos         : liste de {contenu (octets), legende, contexte, date}
"""

from io import BytesIO
from xml.sax.saxutils import escape

from PIL import Image as PILImage
from PIL import ImageOps
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    HRFlowable,
    Image,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

# Charte de l'application (drapeau malgache : blanc, rouge, vert)
VERT = colors.HexColor("#007A3D")
ROUGE = colors.HexColor("#ED1C24")
GRIS = colors.HexColor("#343434")
GRIS_CLAIR = colors.HexColor("#E5E7EB")
FOND_LIGNE = colors.HexColor("#F7F8FA")
ORANGE = colors.HexColor("#D97706")

# Niveaux du score de conformité (en %)
SEUIL_SATISFAISANT = 80
SEUIL_PARTIEL = 50

LARGEUR_UTILE = 17 * cm  # A4 (21 cm) moins deux marges de 2 cm


# --------------------------------------------------------------------------
# Petits outils
# --------------------------------------------------------------------------

def _t(valeur):
    """Texte sûr pour un Paragraph : échappe < > & et remplace le vide par un tiret."""
    if valeur is None or str(valeur).strip() == "":
        return "-"
    return escape(str(valeur))


def _couleur_hex(couleur):
    return "#" + couleur.hexval()[2:]


def _niveau_score(score):
    """(libellé, couleur) selon le pourcentage de conformité."""
    if score >= SEUIL_SATISFAISANT:
        return "Conformité satisfaisante", VERT
    if score >= SEUIL_PARTIEL:
        return "Conformité partielle", ORANGE
    return "Conformité insuffisante", ROUGE


def _styles():
    def style(nom, **options):
        options.setdefault("fontName", "Helvetica")
        options.setdefault("textColor", GRIS)
        return ParagraphStyle(nom, **options)

    return {
        "normal": style("normal", fontSize=9.5, leading=13),
        "cellule": style("cellule", fontSize=8.5, leading=11),
        "entete": style(
            "entete", fontSize=8.5, leading=11, fontName="Helvetica-Bold",
            textColor=colors.white,
        ),
        "label": style("label", fontSize=9, leading=12, fontName="Helvetica-Bold"),
        "titre": style(
            "titre", fontSize=17, leading=21, fontName="Helvetica-Bold",
            alignment=TA_CENTER,
        ),
        "sous_titre": style("sous_titre", fontSize=10.5, leading=14, alignment=TA_CENTER),
        "section": style(
            "section", fontSize=12, leading=16, fontName="Helvetica-Bold",
            textColor=VERT, spaceBefore=16, spaceAfter=2, keepWithNext=1,
        ),
        "legende": style("legende", fontSize=8, leading=10),
        "vide": style("vide", fontSize=9.5, leading=13, fontName="Helvetica-Oblique"),
        "signature": style("signature", fontSize=9, leading=12, alignment=TA_CENTER),
    }


def _section(titre, st):
    """Titre de section, toujours collé au contenu qui suit (jamais seul en bas de page)."""
    filet = HRFlowable(width="100%", thickness=0.8, color=GRIS_CLAIR, spaceAfter=6)
    filet.keepWithNext = True
    return [Paragraph(_t(titre), st["section"]), filet]


def _tableau(lignes, largeurs, style_extra=None):
    """Tableau standard : en-tête vert, lignes alternées, fines bordures grises."""
    tableau = Table(lignes, colWidths=largeurs, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), VERT),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, FOND_LIGNE]),
        ("GRID", (0, 0), (-1, -1), 0.5, GRIS_CLAIR),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]
    if style_extra:
        style.extend(style_extra)
    tableau.setStyle(TableStyle(style))
    return tableau


# --------------------------------------------------------------------------
# Photos
# --------------------------------------------------------------------------

def _image_reduite(contenu, largeur_max, hauteur_max):
    """Photo redressée (EXIF), réduite et recompressée pour garder un PDF léger.

    Renvoie None si le fichier n'est pas une image lisible."""
    try:
        image = PILImage.open(BytesIO(contenu))
        image = ImageOps.exif_transpose(image).convert("RGB")
        image.thumbnail((1200, 1200))
        largeur, hauteur = image.size
        tampon = BytesIO()
        image.save(tampon, format="JPEG", quality=80)
        tampon.seek(0)
    except Exception:  # fichier absent, corrompu ou format inconnu
        return None

    ratio = min(largeur_max / largeur, hauteur_max / hauteur)
    return Image(tampon, width=largeur * ratio, height=hauteur * ratio)


def _cellule_photo(photo, st):
    if photo.get("legende"):
        legende = (
            f"<b>{_t(photo['legende'])}</b><br/>"
            f"{_t(photo.get('contexte'))} - {_t(photo.get('date'))}"
        )
    else:
        legende = f"<b>{_t(photo.get('contexte'))}</b><br/>{_t(photo.get('date'))}"
    image = None
    if photo.get("contenu"):
        image = _image_reduite(photo["contenu"], 7.8 * cm, 5.8 * cm)
    if image is None:
        image = Paragraph("Image illisible ou introuvable.", st["vide"])
    return [image, Spacer(1, 3), Paragraph(legende, st["legende"])]


def _grille_photos(photos, st):
    cellules = [_cellule_photo(p, st) for p in photos]
    if len(cellules) % 2:
        cellules.append("")
    lignes = [cellules[i:i + 2] for i in range(0, len(cellules), 2)]
    grille = Table(lignes, colWidths=[LARGEUR_UTILE / 2] * 2)
    grille.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BOX", (0, 0), (-1, -1), 0.5, GRIS_CLAIR),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, GRIS_CLAIR),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return grille


# --------------------------------------------------------------------------
# Blocs du rapport
# --------------------------------------------------------------------------

def _bloc_identification(d, st):
    lignes = [
        ("Site", f"{_t(d['site_nom'])} ({_t(d['localisation'])})"),
        ("Type de site", _t(d["type_site"])),
        ("Partenaire", _t(d["partenaire"])),
        ("Contrôleur", _t(d["controleur"])),
        ("Date prévue", _t(d["date_prevue"])),
        ("Début de la mission", f"{_t(d['debut'])}<br/>Position GPS : {_t(d['position_debut'])}"),
        ("Fin de la mission", f"{_t(d['fin'])}<br/>Position GPS : {_t(d['position_fin'])}"),
        ("Durée", _t(d["duree"])),
    ]
    donnees = [
        [Paragraph(libelle, st["label"]), Paragraph(valeur, st["normal"])]
        for libelle, valeur in lignes
    ]
    tableau = Table(donnees, colWidths=[4 * cm, LARGEUR_UTILE - 4 * cm])
    tableau.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), FOND_LIGNE),
                ("GRID", (0, 0), (-1, -1), 0.5, GRIS_CLAIR),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return tableau


def _bloc_score(d, st):
    score = float(d["score"])
    libelle, couleur = _niveau_score(score)
    valeur = f"{score:.2f}".replace(".", ",") + " %"
    gros = ParagraphStyle(
        "score", fontName="Helvetica-Bold", fontSize=24, leading=28,
        textColor=couleur, alignment=TA_CENTER,
    )
    detail = (
        f"<font color='{_couleur_hex(couleur)}'><b>{_t(libelle)}</b></font><br/>"
        f"{d['nb_conformes']} critère(s) conforme(s) sur {d['nb_criteres']} évalué(s)<br/>"
        f"{len(d['non_conformites'])} non-conformité(s) constatée(s)"
    )
    tableau = Table(
        [[Paragraph(valeur, gros), Paragraph(detail, st["normal"])]],
        colWidths=[5 * cm, LARGEUR_UTILE - 5 * cm],
    )
    tableau.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 1, couleur),
                ("LINEAFTER", (0, 0), (0, 0), 0.5, GRIS_CLAIR),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ("LEFTPADDING", (1, 0), (1, 0), 12),
            ]
        )
    )
    return tableau


def _bloc_grille(d, st):
    if not d["reponses"]:
        return [Paragraph("Aucune réponse enregistrée.", st["vide"])]
    lignes = [
        [Paragraph(t, st["entete"]) for t in ("N°", "Critère", "Réponse", "Résultat", "Commentaire")]
    ]
    for r in d["reponses"]:
        if r["conforme"]:
            resultat = f"<font color='{_couleur_hex(VERT)}'><b>Conforme</b></font>"
        else:
            resultat = f"<font color='{_couleur_hex(ROUGE)}'><b>Non conforme</b></font>"
        lignes.append(
            [
                Paragraph(_t(r["ordre"]), st["cellule"]),
                Paragraph(_t(r["libelle"]), st["cellule"]),
                Paragraph(_t(r["valeur"]), st["cellule"]),
                Paragraph(resultat, st["cellule"]),
                Paragraph(_t(r["commentaire"]), st["cellule"]),
            ]
        )
    largeurs = [1 * cm, 5.6 * cm, 2.4 * cm, 2.4 * cm, 5.6 * cm]
    return [_tableau(lignes, largeurs)]


def _bloc_non_conformites(d, st):
    if not d["non_conformites"]:
        return [Paragraph("Aucune non-conformité constatée lors de cette mission.", st["vide"])]
    lignes = [
        [Paragraph(t, st["entete"]) for t in ("Critère", "Constat", "Gravité", "Date limite")]
    ]
    for nc in d["non_conformites"]:
        lignes.append(
            [
                Paragraph(_t(nc["critere"]), st["cellule"]),
                Paragraph(_t(nc["constat"]), st["cellule"]),
                Paragraph(_t(nc["gravite"]), st["cellule"]),
                Paragraph(_t(nc["date_limite"]), st["cellule"]),
            ]
        )
    largeurs = [5 * cm, 6.4 * cm, 2.8 * cm, 2.8 * cm]
    return [_tableau(lignes, largeurs)]


def _bloc_inventaire(d, st):
    if not d["inventaire"]:
        return [Paragraph("Aucun équipement enregistré dans l'inventaire de ce site.", st["vide"])]
    lignes = [[Paragraph(t, st["entete"]) for t in ("Type", "Description")]]
    for e in d["inventaire"]:
        lignes.append(
            [Paragraph(_t(e["type"]), st["cellule"]), Paragraph(_t(e["description"]), st["cellule"])]
        )
    return [_tableau(lignes, [5 * cm, 12 * cm])]


def _bloc_signatures(d, st):
    cellules = [
        [
            Paragraph("<b>Le contrôleur</b>", st["signature"]),
            Paragraph("<b>Visa du Directeur</b>", st["signature"]),
        ],
        [
            Paragraph(f"{_t(d['controleur'])}<br/>{_t(d['fin'])}", st["signature"]),
            Paragraph("Date et signature", st["signature"]),
        ],
        ["", ""],
    ]
    tableau = Table(
        cellules,
        colWidths=[LARGEUR_UTILE / 2] * 2,
        rowHeights=[None, None, 2.4 * cm],
    )
    tableau.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.5, GRIS_CLAIR),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, GRIS_CLAIR),
                ("BACKGROUND", (0, 0), (-1, 0), FOND_LIGNE),
                ("TOPPADDING", (0, 0), (-1, 1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, 1), 5),
            ]
        )
    )
    return tableau


# --------------------------------------------------------------------------
# En-tête et pied de page (dessinés sur chaque page)
# --------------------------------------------------------------------------

def _decorer_page(canvas, doc, d):
    largeur, hauteur = A4
    canvas.saveState()

    # Bandeau rouge et vert en haut de page
    canvas.setFillColor(ROUGE)
    canvas.rect(0, hauteur - 0.3 * cm, largeur / 3, 0.3 * cm, stroke=0, fill=1)
    canvas.setFillColor(VERT)
    canvas.rect(largeur / 3, hauteur - 0.3 * cm, largeur * 2 / 3, 0.3 * cm, stroke=0, fill=1)

    # En-tête officiel
    canvas.setFillColor(GRIS)
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawString(2 * cm, hauteur - 1.2 * cm, "Ministère de la Communication et de la Culture")
    canvas.drawString(2 * cm, hauteur - 1.65 * cm, "ORTM")
    canvas.setFont("Helvetica", 8.5)
    canvas.drawString(
        2 * cm, hauteur - 2.1 * cm, "Direction du Partenariat et de la Coopération (DPC)"
    )
    if d.get("logo"):
        try:
            canvas.drawImage(
                str(d["logo"]), largeur - 3.8 * cm, hauteur - 2.5 * cm,
                width=1.8 * cm, height=1.8 * cm,
                preserveAspectRatio=True, mask="auto",
            )
        except Exception:
            pass  # un logo illisible ne doit jamais empêcher de générer le rapport
    canvas.setStrokeColor(GRIS_CLAIR)
    canvas.setLineWidth(0.8)
    canvas.line(2 * cm, hauteur - 2.65 * cm, largeur - 2 * cm, hauteur - 2.65 * cm)

    # Pied de page
    canvas.line(2 * cm, 1.6 * cm, largeur - 2 * cm, 1.6 * cm)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(
        2 * cm, 1.1 * cm,
        f"Mission n° {d['numero']} - {d['site_nom']} - généré le {d['genere_le']}",
    )
    canvas.drawRightString(largeur - 2 * cm, 1.1 * cm, f"Page {doc.page}")

    canvas.restoreState()


# --------------------------------------------------------------------------
# Point d'entrée
# --------------------------------------------------------------------------

def construire_pdf(d):
    """Construit le rapport et renvoie les octets du PDF."""
    st = _styles()

    histoire = [
        Paragraph("RAPPORT DE MISSION DE CONTRÔLE", st["titre"]),
        Spacer(1, 4),
        Paragraph(
            f"Mission n° {_t(d['numero'])} - {_t(d['site_nom'])}", st["sous_titre"]
        ),
        Spacer(1, 14),
        _bloc_identification(d, st),
        Spacer(1, 12),
        _bloc_score(d, st),
    ]

    histoire += _section("1. Grille de contrôle", st)
    histoire += _bloc_grille(d, st)

    histoire += _section("2. Non-conformités constatées", st)
    histoire += _bloc_non_conformites(d, st)

    histoire += _section("3. Inventaire du site", st)
    histoire += _bloc_inventaire(d, st)

    histoire += _section("4. Photos", st)
    if d["photos"]:
        histoire.append(_grille_photos(d["photos"], st))
    else:
        histoire.append(Paragraph("Aucune photo jointe à cette mission.", st["vide"]))

    histoire.append(Spacer(1, 22))
    histoire.append(KeepTogether([_bloc_signatures(d, st)]))

    tampon = BytesIO()
    document = SimpleDocTemplate(
        tampon,
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=3.3 * cm,
        bottomMargin=2.2 * cm,
        title=f"Rapport de mission n° {d['numero']}",
        author="DPC - ORTM",
    )
    decorer = lambda canvas, doc: _decorer_page(canvas, doc, d)  # noqa: E731
    document.build(histoire, onFirstPage=decorer, onLaterPages=decorer)
    return tampon.getvalue()