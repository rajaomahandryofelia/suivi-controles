from django.conf import settings
from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models


class Utilisateur(AbstractUser):
    """Utilisateur du système (classe abstraite du domaine).

    Django fournit déjà : username (le login), password (haché),
    first_name, last_name, email, is_active, date_joined.
    """

    class Role(models.TextChoices):
        DIRECTEUR = "DIRECTEUR", "Directeur"
        CONTROLEUR = "CONTROLEUR", "Contrôleur"

    role = models.CharField(max_length=20, choices=Role.choices)
    telephone = models.CharField(max_length=20, blank=True)
    # Attribut propre au contrôleur (vide pour un directeur)
    matricule = models.CharField(max_length=20, unique=True, null=True, blank=True)

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.get_role_display()})"


class DirecteurManager(UserManager):
    def get_queryset(self):
        return super().get_queryset().filter(role=Utilisateur.Role.DIRECTEUR)


class ControleurManager(UserManager):
    def get_queryset(self):
        return super().get_queryset().filter(role=Utilisateur.Role.CONTROLEUR)


class Directeur(Utilisateur):
    objects = DirecteurManager()

    class Meta:
        proxy = True

    def save(self, *args, **kwargs):
        self.role = Utilisateur.Role.DIRECTEUR
        super().save(*args, **kwargs)


class Controleur(Utilisateur):
    objects = ControleurManager()

    class Meta:
        proxy = True

    def save(self, *args, **kwargs):
        self.role = Utilisateur.Role.CONTROLEUR
        super().save(*args, **kwargs)


class CarteProfessionnelle(models.Model):
    """Carte professionnelle d'un contrôleur : exigée pour valider une tournée
    et pour démarrer une mission."""

    controleur = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="carte_professionnelle",
    )
    numero = models.CharField(max_length=30, unique=True)
    date_delivrance = models.DateField()
    date_expiration = models.DateField()

    class Meta:
        verbose_name = "carte professionnelle"
        verbose_name_plural = "cartes professionnelles"

    def est_valide_le(self, jour):
        return self.date_delivrance <= jour <= self.date_expiration

    def __str__(self):
        return f"{self.numero} ({self.controleur})"