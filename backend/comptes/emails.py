from django.conf import settings
from django.core.mail import send_mail


def envoyer_email_compte_active(utilisateur):
    """Prévient le contrôleur que son compte a été accepté."""
    if not utilisateur.email:
        return False

    nom = utilisateur.get_full_name() or utilisateur.username
    sujet = "Votre compte a été accepté"
    message = (
        f"Bonjour {nom},\n\n"
        "Bonne nouvelle : le Directeur a accepté votre demande d'inscription.\n"
        "Vous pouvez maintenant accéder à la plateforme de suivi des contrôles.\n\n"
        f"Lien de connexion : {settings.URL_APPLICATION}/connexion\n"
        f"Nom d'utilisateur : {utilisateur.username}\n\n"
        "Cordialement,\n"
        "La Direction"
    )
    try:
        send_mail(sujet, message, settings.DEFAULT_FROM_EMAIL, [utilisateur.email])
        return True
    except Exception:
        # Si l'envoi échoue, le compte reste quand même activé
        return False