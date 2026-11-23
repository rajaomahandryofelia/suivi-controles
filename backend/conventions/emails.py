import logging

from django.core.mail import EmailMessage
from django.utils import timezone

from .documents import ar, generer_facture_pdf, generer_recu_pdf, numero_recu

logger = logging.getLogger(__name__)


def message_controle(site):
    """Paragraphe ajouté à chaque e-mail : le site sera contrôlé plus tard.
    Aucune date n'est donnée : le contrôle peut avoir lieu sans préavis précis."""
    return (
        f"Nous vous informons que votre site « {site.nom} » fera l'objet d'un "
        "contrôle technique ultérieurement. Nos contrôleurs se présenteront sur "
        "le site munis de leur carte professionnelle et d'un ordre de mission."
    )


def _envoyer(destinataire, sujet, corps, nom_pdf, pdf):
    """Envoie l'e-mail avec le PDF en pièce jointe. Retourne True si c'est parti.
    Une erreur d'envoi ne doit jamais bloquer l'enregistrement : on la journalise."""
    try:
        message = EmailMessage(subject=sujet, body=corps, to=[destinataire])
        if pdf is not None:
            message.attach(nom_pdf, pdf, "application/pdf")
        message.send(fail_silently=False)
        return True
    except Exception:
        logger.exception("Échec d'envoi de l'e-mail à %s", destinataire)
        return False


def envoyer_facture(echeance):
    """Envoie la facture de l'échéance au partenaire. Retourne True / False."""
    convention = echeance.convention
    partenaire = convention.partenaire
    if not partenaire.email or not echeance.numero_facture:
        return False

    corps = (
        f"Bonjour {partenaire.contact or partenaire.nom},\n\n"
        f"Veuillez trouver ci-joint la facture N° {echeance.numero_facture} "
        f"relative à la convention {convention.reference} "
        f"(échéance du {echeance.date_echeance:%d/%m/%Y}).\n\n"
        f"{message_controle(convention.site)}\n\n"
        "Cordialement,\n"
        "ORTM — Direction du Partenariat et de la Coopération"
    )
    envoye = _envoyer(
        partenaire.email,
        f"Facture N° {echeance.numero_facture} - {convention.site.nom}",
        corps,
        f"facture-{echeance.numero_facture}.pdf",
        generer_facture_pdf(echeance),
    )
    if envoye:
        echeance.facture_envoyee_le = timezone.now()
        echeance.save(update_fields=["facture_envoyee_le"])
    return envoye


def envoyer_relance(echeance, type_relance):
    """Rappel ou relance de paiement. Retourne True si l'e-mail est parti.
    Les textes ci-dessous peuvent être adaptés à la formule de la DPC."""
    convention = echeance.convention
    partenaire = convention.partenaire
    if not partenaire.email:
        return False

    reste = ar(echeance.reste_a_payer)
    date = f"{echeance.date_echeance:%d/%m/%Y}"
    site = convention.site.nom

    if type_relance == "RAPPEL":
        sujet = f"Rappel : échéance du {date} - {site}"
        texte = (
            f"Nous vous rappelons que l'échéance du {date}, d'un montant de {reste}, "
            f"relative à la convention {convention.reference}, arrive à terme."
        )
    elif type_relance == "RETARD":
        sujet = f"Retard de paiement - {site}"
        texte = (
            f"À ce jour, nous n'avons pas reçu le paiement de l'échéance du {date} "
            f"(convention {convention.reference}). Le montant restant dû est de {reste}. "
            "Nous vous prions de bien vouloir régulariser votre situation."
        )
    else:
        sujet = f"Dernier rappel : retard de paiement - {site}"
        texte = (
            f"Malgré nos précédents rappels, l'échéance du {date} "
            f"(convention {convention.reference}) reste impayée, pour un montant de {reste}. "
            "Nous vous invitons à régulariser votre situation dans les meilleurs délais."
        )

    corps = (
        f"Bonjour {partenaire.contact or partenaire.nom},\n\n"
        f"{texte}\n\n"
        "Le paiement peut se faire en espèces ou par chèque (ordre de publicité), "
        "ou par virement (ordre de virement).\n\n"
        "Cordialement,\n"
        "ORTM — Direction du Partenariat et de la Coopération"
    )

    # La facture est jointe quand elle existe
    pdf = generer_facture_pdf(echeance) if echeance.numero_facture else None
    return _envoyer(
        partenaire.email,
        sujet,
        corps,
        f"facture-{echeance.numero_facture}.pdf",
        pdf,
    )


def envoyer_recu(paiement):
    """Envoie le reçu du paiement au partenaire. Retourne True / False."""
    echeance = paiement.echeance
    convention = echeance.convention
    partenaire = convention.partenaire
    if not partenaire.email:
        return False

    corps = (
        f"Bonjour {partenaire.contact or partenaire.nom},\n\n"
        f"Nous accusons réception de votre paiement de {ar(paiement.montant)} "
        f"({paiement.get_mode_display()}) du {paiement.date_paiement:%d/%m/%Y}, "
        f"au titre de la convention {convention.reference}. "
        "Veuillez trouver ci-joint votre reçu.\n\n"
        f"{message_controle(convention.site)}\n\n"
        "Cordialement,\n"
        "ORTM — Direction du Partenariat et de la Coopération"
    )
    envoye = _envoyer(
        partenaire.email,
        f"Reçu {numero_recu(paiement)} - {convention.site.nom}",
        corps,
        f"{numero_recu(paiement)}.pdf",
        generer_recu_pdf(paiement),
    )
    if envoye:
        paiement.recu_envoye_le = timezone.now()
        paiement.save(update_fields=["recu_envoye_le"])
    return envoye