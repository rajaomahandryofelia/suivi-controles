from collections import defaultdict
from datetime import timedelta

from django.conf import settings
from django.core.validators import FileExtensionValidator
from django.db import models
from django.db.models import F, Q
from django.utils import timezone

from controles.models import Mission
from referentiels.models import ElementInventaire, Site

# Deux incidents du même type sur le même site, séparés par au plus ce nombre
# de jours, sont considérés comme « récurrents »
FENETRE_RECURRENCE_JOURS = 30


class Incident(models.Model):
    class Service(models.TextChoices):
        RADIO = "RADIO", "Radio"
        TELEVISION = "TELEVISION", "Télévision"
        RADIO_TELEVISION = "RADIO_TELEVISION", "Radio et télévision"

    class Type(models.TextChoices):
        INTERRUPTION = "INTERRUPTION", "Interruption de diffusion"
        PANNE_EMETTEUR = "PANNE_EMETTEUR", "Panne d'émetteur"
        COUPURE_ELECTRIQUE = "COUPURE_ELECTRIQUE", "Coupure électrique"
        DEFAILLANCE_GROUPE = "DEFAILLANCE_GROUPE", "Défaillance du groupe électrogène"
        PROBLEME_ANTENNE = "PROBLEME_ANTENNE", "Problème d'antenne"
        AUTRE = "AUTRE", "Autre"

    class Gravite(models.TextChoices):
        MINEURE = "MINEURE", "Mineure"
        MAJEURE = "MAJEURE", "Majeure"
        CRITIQUE = "CRITIQUE", "Critique"

    class Statut(models.TextChoices):
        EN_COURS = "EN_COURS", "En cours"
        RETABLI = "RETABLI", "Rétabli"

    # Un site a 0..* incidents
    site = models.ForeignKey(Site, on_delete=models.PROTECT, related_name="incidents")
    # Équipement concerné (émetteur, groupe électrogène, antenne...) : facultatif
    element = models.ForeignKey(
        ElementInventaire,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="incidents",
    )
    # Mission pendant laquelle l'incident a été constaté : facultatif
    mission = models.ForeignKey(
        Mission,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="incidents",
    )

    service = models.CharField(max_length=20, choices=Service.choices)
    type = models.CharField(max_length=25, choices=Type.choices)
    gravite = models.CharField(max_length=10, choices=Gravite.choices)
    statut = models.CharField(
        max_length=10, choices=Statut.choices, default=Statut.EN_COURS
    )

    date_debut = models.DateTimeField(default=timezone.now)
    # Vide tant que l'incident est en cours
    date_retablissement = models.DateTimeField(null=True, blank=True)

    cause_supposee = models.CharField(max_length=500, blank=True)
    observations = models.TextField(blank=True)

    declare_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="incidents_declares",
    )
    retabli_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="incidents_retablis",
    )

    class Meta:
        ordering = ["-date_debut", "-id"]
        indexes = [models.Index(fields=["site", "type", "date_debut"])]
        constraints = [
            # Le rétablissement ne peut pas précéder le début
            models.CheckConstraint(
                condition=Q(date_retablissement__isnull=True)
                | Q(date_retablissement__gte=F("date_debut")),
                name="incident_retablissement_apres_debut",
            ),
            # « Rétabli » si et seulement si une date de rétablissement existe
            models.CheckConstraint(
                condition=Q(statut="RETABLI", date_retablissement__isnull=False)
                | Q(statut="EN_COURS", date_retablissement__isnull=True),
                name="incident_statut_coherent",
            ),
        ]

    def __str__(self):
        return f"{self.get_type_display()} - {self.site} ({self.get_statut_display()})"

    @property
    def duree_minutes(self):
        """Durée de l'incident en minutes (jusqu'à maintenant s'il est en cours)."""
        fin = self.date_retablissement or timezone.now()
        return max(0, int((fin - self.date_debut).total_seconds() // 60))


class PieceJointeIncident(models.Model):
    """Une preuve jointe à un incident : photo, capture d'écran ou PDF."""

    # Composition : si l'incident disparaît, ses pièces disparaissent
    incident = models.ForeignKey(
        Incident, on_delete=models.CASCADE, related_name="pieces_jointes"
    )
    fichier = models.FileField(
        upload_to="incidents/%Y/%m/",
        validators=[
            FileExtensionValidator(["jpg", "jpeg", "png", "webp", "pdf"])
        ],
    )
    legende = models.CharField(max_length=255, blank=True)
    date_ajout = models.DateTimeField(auto_now_add=True)
    ajoutee_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pieces_incidents",
    )

    class Meta:
        verbose_name = "pièce jointe d'incident"
        verbose_name_plural = "pièces jointes d'incident"
        ordering = ["date_ajout", "id"]

    def __str__(self):
        return f"Pièce {self.pk} - incident {self.incident_id}"


def ids_incidents_recurrents():
    """Renvoie l'ensemble des identifiants des incidents récurrents.

    Un incident est récurrent s'il existe un autre incident du même type sur le
    même site, survenu à moins de FENETRE_RECURRENCE_JOURS jours d'écart.
    """
    fenetre = timedelta(days=FENETRE_RECURRENCE_JOURS)
    groupes = defaultdict(list)
    lignes = Incident.objects.order_by("date_debut").values_list(
        "id", "site_id", "type", "date_debut"
    )
    for id_incident, id_site, type_incident, debut in lignes:
        groupes[(id_site, type_incident)].append((id_incident, debut))

    recurrents = set()
    for incidents in groupes.values():
        # Les incidents sont triés par date : il suffit de comparer les voisins
        for i in range(1, len(incidents)):
            if incidents[i][1] - incidents[i - 1][1] <= fenetre:
                recurrents.add(incidents[i][0])
                recurrents.add(incidents[i - 1][0])
    return recurrents