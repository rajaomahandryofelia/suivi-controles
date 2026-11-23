from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q

from referentiels.models import CritereControle, ElementInventaire, ModeleGrille, Site


class Tournee(models.Model):
    class Statut(models.TextChoices):
        PROPOSEE = "PROPOSEE", "Proposée"
        VALIDEE = "VALIDEE", "Validée"

    date = models.DateField()
    statut = models.CharField(
        max_length=10, choices=Statut.choices, default=Statut.PROPOSEE
    )
    # Calculés par le système (optimisation de la tournée)
    distance_estimee_km = models.DecimalField(
        max_digits=7, decimal_places=2, default=0, validators=[MinValueValidator(0)]
    )
    duree_estimee_min = models.PositiveIntegerField(default=0)

    # Un contrôleur a 0..* tournées
    controleur = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="tournees",
        limit_choices_to={"role": "CONTROLEUR"},
    )

    class Meta:
        verbose_name = "tournée"
        verbose_name_plural = "tournées"
        ordering = ["-date"]

    def __str__(self):
        return f"Tournée du {self.date} ({self.controleur})"


class Mission(models.Model):
    class Statut(models.TextChoices):
        PLANIFIEE = "PLANIFIEE", "Planifiée"
        EN_COURS = "EN_COURS", "En cours"
        CLOTUREE = "CLOTUREE", "Clôturée"

    # Créneau prévu : début (date + heure) et fin (date + heure)
    date_prevue = models.DateField()
    heure_prevue = models.TimeField(null=True, blank=True)
    date_fin_prevue = models.DateField(null=True, blank=True)
    heure_fin_prevue = models.TimeField(null=True, blank=True)

    statut = models.CharField(
        max_length=15, choices=Statut.choices, default=Statut.PLANIFIEE
    )

    # Renseignés au démarrage
    date_debut_reelle = models.DateTimeField(null=True, blank=True)
    latitude_debut = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True,
        validators=[MinValueValidator(-90), MaxValueValidator(90)],
    )
    longitude_debut = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True,
        validators=[MinValueValidator(-180), MaxValueValidator(180)],
    )

    # Renseignés à la clôture
    date_fin_reelle = models.DateTimeField(null=True, blank=True)
    latitude_fin = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True,
        validators=[MinValueValidator(-90), MaxValueValidator(90)],
    )
    longitude_fin = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True,
        validators=[MinValueValidator(-180), MaxValueValidator(180)],
    )

    # Rang dans la tournée (seulement si la mission est dans une tournée)
    ordre_dans_tournee = models.PositiveIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1)]
    )

    # Liens du diagramme
    directeur = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="missions_creees",
        limit_choices_to={"role": "DIRECTEUR"},
    )
    controleur = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="missions",
        limit_choices_to={"role": "CONTROLEUR"},
    )
    site = models.ForeignKey(Site, on_delete=models.PROTECT, related_name="missions")
    modele_grille = models.ForeignKey(
        ModeleGrille, on_delete=models.PROTECT, related_name="missions"
    )
    # Agrégation : une tournée regroupe 1..* missions, une mission est dans 0..1 tournée
    tournee = models.ForeignKey(
        Tournee,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="missions",
    )

    # Dérogation du Directeur : mission créée alors que le partenaire du site
    # n'a pas de convention active (le motif est alors obligatoire)
    derogation_convention = models.BooleanField(default=False)
    motif_derogation = models.CharField(max_length=500, blank=True)

    class Meta:
        ordering = ["-date_prevue", "-heure_prevue"]

    def __str__(self):
        return f"Mission {self.pk} - {self.site} ({self.date_prevue})"


class PointTrajet(models.Model):
    """Une position du contrôleur relevée pendant une mission : la suite de ces
    points forme le trajet. Les points ne sont enregistrés que pendant que la
    mission est « en cours »."""

    # Composition : si la mission disparaît, son trajet disparaît
    mission = models.ForeignKey(
        Mission, on_delete=models.CASCADE, related_name="points_trajet"
    )
    latitude = models.DecimalField(
        max_digits=9, decimal_places=6,
        validators=[MinValueValidator(-90), MaxValueValidator(90)],
    )
    longitude = models.DecimalField(
        max_digits=9, decimal_places=6,
        validators=[MinValueValidator(-180), MaxValueValidator(180)],
    )
    # Marge d'erreur annoncée par le GPS du téléphone, en mètres
    precision_m = models.PositiveIntegerField(null=True, blank=True)
    # Heure du relevé, donnée par le téléphone
    releve_le = models.DateTimeField()
    # Heure de réception, enregistrée par le serveur (le téléphone ne peut pas la truquer)
    recu_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "point du trajet"
        verbose_name_plural = "points du trajet"
        ordering = ["releve_le", "id"]
        constraints = [
            # Un seul point par instant et par mission : un envoi réessayé ne crée pas de doublon
            models.UniqueConstraint(
                fields=["mission", "releve_le"], name="point_trajet_unique_par_instant"
            )
        ]

    def __str__(self):
        return f"Mission {self.mission_id} - {self.releve_le:%d/%m/%Y %H:%M:%S}"


class ReponseCritere(models.Model):
    # Composition : si la mission disparaît, ses réponses disparaissent
    mission = models.ForeignKey(
        Mission, on_delete=models.CASCADE, related_name="reponses"
    )
    critere = models.ForeignKey(
        CritereControle, on_delete=models.PROTECT, related_name="reponses"
    )
    valeur = models.CharField(max_length=255)
    est_conforme = models.BooleanField()
    commentaire = models.CharField(max_length=500, blank=True)

    class Meta:
        verbose_name = "réponse à un critère"
        verbose_name_plural = "réponses aux critères"
        constraints = [
            # Une seule réponse par critère et par mission
            models.UniqueConstraint(
                fields=["mission", "critere"], name="reponse_unique_par_critere"
            )
        ]

    def __str__(self):
        return f"Mission {self.mission_id} - {self.critere}"


class Photo(models.Model):
    fichier = models.ImageField(upload_to="photos/%Y/%m/")
    # Heure enregistrée par le serveur au moment de l'envoi (le téléphone ne peut pas la truquer)
    date_capture = models.DateTimeField()
    legende = models.CharField(max_length=255, blank=True)
    # Position GPS du contrôleur au moment de la photo (preuve qu'il était sur le site)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    # Une photo se rattache à une réponse OU à un élément d'inventaire
    reponse = models.ForeignKey(
        ReponseCritere,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="photos",
    )
    element_inventaire = models.ForeignKey(
        ElementInventaire,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="photos",
    )

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(reponse__isnull=False, element_inventaire__isnull=True)
                    | Q(reponse__isnull=True, element_inventaire__isnull=False)
                ),
                name="photo_reponse_ou_element",
            )
        ]

    def __str__(self):
        return f"Photo {self.pk} ({self.date_capture:%d/%m/%Y})"


class Rapport(models.Model):
    class Statut(models.TextChoices):
        GENERE = "GENERE", "Généré"
        VALIDE = "VALIDE", "Validé"
        REJETE = "REJETE", "Rejeté"

    # Une mission a 0..1 rapport
    mission = models.OneToOneField(
        Mission, on_delete=models.CASCADE, related_name="rapport"
    )
    # Le directeur qui a traité le rapport (0..1)
    directeur = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="rapports_traites",
        limit_choices_to={"role": "DIRECTEUR"},
    )
    date_generation = models.DateTimeField(auto_now_add=True)
    fichier_pdf = models.FileField(upload_to="rapports/%Y/%m/")
    score_conformite = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    statut = models.CharField(
        max_length=10, choices=Statut.choices, default=Statut.GENERE
    )
    motif_rejet = models.CharField(max_length=500, blank=True)
    date_validation = models.DateField(null=True, blank=True)

    def clean(self):
        # Le motif est obligatoire seulement si le rapport est rejeté
        if self.statut == self.Statut.REJETE and not self.motif_rejet:
            raise ValidationError(
                {"motif_rejet": "Le motif est obligatoire pour rejeter un rapport."}
            )

    def __str__(self):
        return f"Rapport de la mission {self.mission_id} ({self.get_statut_display()})"


class NonConformite(models.Model):
    class Gravite(models.TextChoices):
        MINEURE = "MINEURE", "Mineure"
        MAJEURE = "MAJEURE", "Majeure"
        CRITIQUE = "CRITIQUE", "Critique"

    class Statut(models.TextChoices):
        OUVERTE = "OUVERTE", "Ouverte"
        CORRIGEE = "CORRIGEE", "Corrigée"
        VERIFIEE = "VERIFIEE", "Vérifiée"

    # Une réponse non conforme donne 0..1 non-conformité
    reponse = models.OneToOneField(
        ReponseCritere, on_delete=models.CASCADE, related_name="non_conformite"
    )
    site = models.ForeignKey(
        Site, on_delete=models.PROTECT, related_name="non_conformites"
    )
    # Le contrôleur qui a vérifié la correction (0..1)
    controleur = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="non_conformites_verifiees",
        limit_choices_to={"role": "CONTROLEUR"},
    )
    description = models.CharField(max_length=500)
    gravite = models.CharField(max_length=10, choices=Gravite.choices)
    statut = models.CharField(
        max_length=10, choices=Statut.choices, default=Statut.OUVERTE
    )
    date_detection = models.DateField(auto_now_add=True)
    date_limite_correction = models.DateField()
    date_correction = models.DateField(null=True, blank=True)
    date_verification = models.DateField(null=True, blank=True)
    # Combien de fois une correction déclarée a été refusée lors d'un contrôle (récidive)
    nombre_reouvertures = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = "non-conformité"
        verbose_name_plural = "non-conformités"
        ordering = ["date_limite_correction"]

    def __str__(self):
        return f"{self.get_gravite_display()} - {self.site} ({self.get_statut_display()})"


class EvenementNonConformite(models.Model):
    """Une ligne de l'historique d'une non-conformité : qui a fait quoi, et quand."""

    class Type(models.TextChoices):
        CONSTATEE = "CONSTATEE", "Constatée"
        RELANCEE = "RELANCEE", "Partenaire relancé"
        CORRIGEE = "CORRIGEE", "Correction déclarée"
        VERIFIEE = "VERIFIEE", "Vérifiée sur place"
        ROUVERTE = "ROUVERTE", "Rouverte"

    class Moyen(models.TextChoices):
        TELEPHONE = "TELEPHONE", "Téléphone"
        EMAIL = "EMAIL", "E-mail"
        COURRIER = "COURRIER", "Courrier"
        AUTRE = "AUTRE", "Autre"

    # Composition : si la non-conformité disparaît, son historique disparaît
    non_conformite = models.ForeignKey(
        NonConformite, on_delete=models.CASCADE, related_name="evenements"
    )
    type = models.CharField(max_length=10, choices=Type.choices)
    date = models.DateTimeField(auto_now_add=True)
    # Qui a agi (vide si l'auteur a été supprimé)
    auteur = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="evenements_non_conformites",
    )
    # Pour une relance : comment le partenaire a été contacté
    moyen = models.CharField(max_length=10, choices=Moyen.choices, blank=True)
    commentaire = models.CharField(max_length=500, blank=True)

    class Meta:
        verbose_name = "événement de non-conformité"
        verbose_name_plural = "événements de non-conformité"
        ordering = ["date", "id"]

    def __str__(self):
        return f"{self.get_type_display()} - non-conformité {self.non_conformite_id}"


class OrdreMission(models.Model):
    """Document officiel délivré par le Directeur : soit à la validation d'une
    tournée, soit pour une mission isolée (hors tournée). Exactement l'un des deux."""

    tournee = models.OneToOneField(
        Tournee,
        on_delete=models.CASCADE,
        related_name="ordre_mission",
        null=True,
        blank=True,
    )
    # Renseignée seulement pour une mission isolée (sans tournée)
    mission = models.OneToOneField(
        Mission,
        on_delete=models.CASCADE,
        related_name="ordre_mission",
        null=True,
        blank=True,
    )
    numero = models.CharField(max_length=20, unique=True)
    date_emission = models.DateField(auto_now_add=True)
    delivre_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ordres_mission_delivres",
    )

    class Meta:
        verbose_name = "ordre de mission"
        verbose_name_plural = "ordres de mission"
        constraints = [
            # Un ordre de mission se rattache à une tournée OU à une mission isolée
            models.CheckConstraint(
                condition=(
                    Q(tournee__isnull=False, mission__isnull=True)
                    | Q(tournee__isnull=True, mission__isnull=False)
                ),
                name="ordre_mission_tournee_ou_mission",
            )
        ]

    def __str__(self):
        return self.numero


class OrdreRoute(models.Model):
    """Autorisation de déplacement, obligatoire pour chaque tournée."""

    tournee = models.OneToOneField(
        Tournee, on_delete=models.CASCADE, related_name="ordre_route"
    )
    numero = models.CharField(max_length=20, unique=True)
    depart = models.CharField(max_length=255)
    destination = models.CharField(max_length=255)
    transport = models.CharField(max_length=100)
    date_emission = models.DateField(auto_now_add=True)

    class Meta:
        verbose_name = "ordre de route"
        verbose_name_plural = "ordres de route"

    def __str__(self):
        return self.numero