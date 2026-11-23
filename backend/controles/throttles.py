from rest_framework.throttling import AnonRateThrottle


class VerificationRateThrottle(AnonRateThrottle):
    """Limite les vérifications publiques par adresse IP (anti-énumération des numéros)."""

    scope = "verification"
    rate = "20/min"