from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from referentiels.models import Site


class Niveau(models.TextChoices):
    """Niveaux de risque, partagés par le score et les alertes."""

    FAIBLE = "FAIBLE", "Faible"
    MOYEN = "MOYEN", "Moyen"
    ELEVE = "ELEVE", "Élevé"
    CRITIQUE = "CRITIQUE", "Critique"


class ScoreRisque(models.Model):
    # Composition : un site a 0..* scores (l'historique de ses calculs)
    site = models.ForeignKey(
        Site, on_delete=models.CASCADE, related_name="scores"
    )
    valeur = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    niveau = models.CharField(max_length=10, choices=Niveau.choices)
    date_calcul = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "score de risque"
        verbose_name_plural = "scores de risque"
        ordering = ["-date_calcul"]

    def __str__(self):
        return f"{self.site} : {self.valeur} ({self.get_niveau_display()})"


class Notification(models.Model):
    # Un utilisateur a 0..* notifications
    destinataire = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    message = models.CharField(max_length=500)
    date_envoi = models.DateTimeField(auto_now_add=True)
    est_lue = models.BooleanField(default=False)
    envoye_par_email = models.BooleanField(default=False)

    class Meta:
        ordering = ["-date_envoi"]

    def __str__(self):
        return f"Pour {self.destinataire} : {self.message[:40]}"


class Alerte(Notification):
    """Une alerte est une notification qui concerne un niveau de risque."""

    type_alerte = models.CharField(max_length=30)
    niveau = models.CharField(max_length=10, choices=Niveau.choices)
    # Un site a 0..* alertes ; une alerte concerne 0..1 site
    site = models.ForeignKey(
        Site,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="alertes",
    )

    def __str__(self):
        return f"Alerte {self.type_alerte} ({self.get_niveau_display()})"