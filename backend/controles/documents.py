from io import BytesIO

import qrcode
from django.conf import settings
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader, simpleSplit
from reportlab.pdfgen import canvas

DEVISE = "Fitiavana - Tanindrazana - Fandrosoana"


def _qr(url):
    image = qrcode.make(url)
    tampon = BytesIO()
    image.save(tampon, format="PNG")
    tampon.seek(0)
    return ImageReader(tampon)


def generer_pdf_officiel(titre, numero, lignes, paragraphes, url_verification, signataire):
    """Un document officiel A4 : en-tête, titre, champs, texte, signature, QR code.

    lignes : liste de (libellé, valeur) ; paragraphes : liste de textes libres.
    """
    ministere = getattr(settings, "NOM_INSTITUTION", "Ministère")
    tampon = BytesIO()
    c = canvas.Canvas(tampon, pagesize=A4)
    largeur, hauteur = A4
    marge = 2 * cm
    y = hauteur - 2 * cm

    # En-tête officiel
    c.setFont("Helvetica-Bold", 12)
    c.drawCentredString(largeur / 2, y, "REPUBLIQUE DE MADAGASCAR")
    y -= 0.6 * cm
    c.setFont("Helvetica-Oblique", 9)
    c.drawCentredString(largeur / 2, y, DEVISE)
    y -= 0.9 * cm
    c.setFont("Helvetica-Bold", 10)
    c.drawCentredString(largeur / 2, y, ministere.upper())
    y -= 0.4 * cm
    c.line(marge, y, largeur - marge, y)

    # Titre et numéro
    y -= 1.4 * cm
    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(largeur / 2, y, titre.upper())
    y -= 0.8 * cm
    c.setFont("Helvetica", 11)
    c.drawCentredString(largeur / 2, y, f"N° {numero}")
    y -= 1.5 * cm

    # Champs
    for libelle, valeur in lignes:
        c.setFont("Helvetica-Bold", 10)
        c.drawString(marge, y, f"{libelle} :")
        c.setFont("Helvetica", 10)
        morceaux = simpleSplit(str(valeur), "Helvetica", 10, largeur - 2 * marge - 5 * cm)
        for morceau in morceaux:
            c.drawString(marge + 5 * cm, y, morceau)
            y -= 0.55 * cm
        y -= 0.15 * cm

    # Texte libre
    y -= 0.5 * cm
    c.setFont("Helvetica", 10)
    for paragraphe in paragraphes:
        for ligne in simpleSplit(paragraphe, "Helvetica", 10, largeur - 2 * marge):
            c.drawString(marge, y, ligne)
            y -= 0.5 * cm
        y -= 0.3 * cm

    # Signature (à gauche) et QR code (à droite)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(marge, 7 * cm, "Le Directeur")
    c.setFont("Helvetica", 10)
    c.drawString(marge, 6.4 * cm, signataire)
    c.line(marge, 4.2 * cm, marge + 6 * cm, 4.2 * cm)
    c.setFont("Helvetica-Oblique", 8)
    c.drawString(marge, 3.8 * cm, "Signature et cachet")

    c.drawImage(_qr(url_verification), largeur - marge - 4 * cm, 3.5 * cm, 4 * cm, 4 * cm)
    c.setFont("Helvetica", 7)
    c.drawCentredString(largeur - marge - 2 * cm, 3.1 * cm, "Scanner pour vérifier l'authenticité")

    c.showPage()
    c.save()
    return tampon.getvalue()