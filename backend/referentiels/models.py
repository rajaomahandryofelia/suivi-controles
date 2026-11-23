from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Partenaire(models.Model):
    nom = models.CharField(max_length=100)
    contact = models.CharField(max_length=100, blank=True)
    telephone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(max_length=100, blank=True)

    def __str__(self):
        return self.nom


class TypeSite(models.Model):
    libelle = models.CharField(max_length=50, unique=True)
    description = models.CharField(max_length=255, blank=True)
    # Un type inactif n'est plus proposé pour de nouveaux sites ou modèles de grille,
    # mais il garde son historique
    est_actif = models.BooleanField(default=True)

    class Meta:
        verbose_name = "type de site"
        verbose_name_plural = "types de site"

    def __str__(self):
        return self.libelle


class Site(models.Model):
    class Appartenance(models.TextChoices):
        MINISTERE = "MINISTERE", "Ministère"
        HORS_MINISTERE = "HORS_MINISTERE", "Hors ministère"

    nom = models.CharField(max_length=100)
    localisation = models.CharField(max_length=255)
    latitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        validators=[MinValueValidator(-90), MaxValueValidator(90)],
    )
    longitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        validators=[MinValueValidator(-180), MaxValueValidator(180)],
    )
    est_actif = models.BooleanField(default=True)

    # Site du ministère ou site extérieur (partenaire, privé, autre administration)
    appartenance = models.CharField(
        max_length=20,
        choices=Appartenance.choices,
        default=Appartenance.MINISTERE,
    )

    # Un type de site a 0..* sites ; un site a exactement 1 type
    type_site = models.ForeignKey(
        TypeSite, on_delete=models.PROTECT, related_name="sites"
    )
    # Un partenaire a 0..* sites ; un site a 0..1 partenaire
    partenaire = models.ForeignKey(
        Partenaire,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sites",
    )

    def __str__(self):
        return self.nom


class ElementInventaire(models.Model):
    # Composition : si le site disparaît, ses éléments disparaissent
    site = models.ForeignKey(
        Site, on_delete=models.CASCADE, related_name="elements"
    )
    type = models.CharField(max_length=50)
    description = models.CharField(max_length=255)
    date_ajout = models.DateField(auto_now_add=True)

    class Meta:
        verbose_name = "élément d'inventaire"
        verbose_name_plural = "éléments d'inventaire"

    def __str__(self):
        return f"{self.type} ({self.site})"


class ModeleGrille(models.Model):
    nom = models.CharField(max_length=100, unique=True)
    description = models.CharField(max_length=255, blank=True)
    est_actif = models.BooleanField(default=True)

    # Un type de site a 0..* modèles de grille
    type_site = models.ForeignKey(
        TypeSite, on_delete=models.PROTECT, related_name="modeles_grille"
    )

    class Meta:
        verbose_name = "modèle de grille"
        verbose_name_plural = "modèles de grille"

    def __str__(self):
        return self.nom


class CritereControle(models.Model):
    class TypeReponse(models.TextChoices):
        OUI_NON = "OUI_NON", "Conforme / non conforme"
        NOTE = "NOTE", "Note chiffrée"
        TEXTE = "TEXTE", "Observation libre"

    # Composition : un modèle contient 1..* critères
    modele = models.ForeignKey(
        ModeleGrille, on_delete=models.CASCADE, related_name="criteres"
    )
    libelle = models.CharField(max_length=255)
    type_reponse = models.CharField(max_length=10, choices=TypeReponse.choices)
    ponderation = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        validators=[MinValueValidator(0)],
    )
    est_obligatoire = models.BooleanField(default=True)
    ordre = models.PositiveIntegerField(validators=[MinValueValidator(1)])

    class Meta:
        ordering = ["modele", "ordre"]
        verbose_name = "critère de contrôle"
        verbose_name_plural = "critères de contrôle"

    def __str__(self):
        return f"{self.ordre}. {self.libelle}"


class ParametreScore(models.Model):
    cle = models.CharField(max_length=50, unique=True)
    libelle = models.CharField(max_length=100)
    valeur = models.DecimalField(max_digits=8, decimal_places=2)
    date_modification = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "paramètre du score"
        verbose_name_plural = "paramètres du score"

    def __str__(self):
        return f"{self.cle} = {self.valeur}"