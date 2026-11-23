from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator, MinValueValidator
from django.db import models
from django.db.models import Sum
from django.utils import timezone

from referentiels.models import Partenaire, Site


class Convention(models.Model):
    class Statut(models.TextChoices):
        BROUILLON = "BROUILLON", "Brouillon"
        ENVOYEE = "ENVOYEE", "Envoyée au partenaire"
        ACTIVE = "ACTIVE", "Active"
        SUSPENDUE = "SUSPENDUE", "Suspendue"
        EXPIREE = "EXPIREE", "Expirée"

    class Periodicite(models.TextChoices):
        MENSUELLE = "MENSUELLE", "Mensuelle"
        TRIMESTRIELLE = "TRIMESTRIELLE", "Trimestrielle"
        ANNUELLE = "ANNUELLE", "Annuelle"

    # Numéro officiel généré automatiquement : CONV-2026-001
    reference = models.CharField(max_length=30, unique=True, blank=True)
    statut = models.CharField(
        max_length=10, choices=Statut.choices, default=Statut.BROUILLON
    )
    # Ce que le partenaire DOIT payer, et à quel rythme
    montant_periodique = models.DecimalField(
        max_digits=12, decimal_places=2, validators=[MinValueValidator(0)]
    )
    periodicite = models.CharField(
        max_length=15, choices=Periodicite.choices, default=Periodicite.MENSUELLE
    )
    date_debut = models.DateField()
    date_fin = models.DateField(null=True, blank=True)
    date_signature = models.DateField(null=True, blank=True)
    fichier_pdf = models.FileField(
        upload_to="conventions/%Y/%m/", null=True, blank=True
    )

    # Un partenaire a 0..* conventions ; un site peut en avoir plusieurs au fil du temps
    partenaire = models.ForeignKey(
        Partenaire, on_delete=models.PROTECT, related_name="conventions"
    )
    site = models.ForeignKey(
        Site, on_delete=models.PROTECT, related_name="conventions"
    )
    cree_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="conventions_creees",
    )
    date_creation = models.DateTimeField(auto_now_add=True)
    # Date à laquelle le Directeur a été prévenu que la convention approche de sa fin
    alerte_expiration_le = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["-date_debut"]

    def save(self, *args, **kwargs):
        if not self.reference:
            from .numerotation import prochain_numero

            annee = timezone.localdate().year
            existantes = Convention.objects.filter(
                reference__startswith=f"CONV-{annee}-"
            ).values_list("reference", flat=True)
            self.reference = prochain_numero("CONV", annee, existantes, 3)
        super().save(*args, **kwargs)

    def clean(self):
        if self.date_fin and self.date_fin < self.date_debut:
            raise ValidationError(
                {"date_fin": "La date de fin doit être après la date de début."}
            )
        if self.statut == self.Statut.ACTIVE and not self.date_signature:
            raise ValidationError(
                {"date_signature": "Une convention active doit avoir une date de signature."}
            )

    @property
    def est_active(self):
        return self.statut == self.Statut.ACTIVE

    @property
    def total_du(self):
        return self.echeances.aggregate(t=Sum("montant_du"))["t"] or Decimal("0")

    @property
    def total_paye(self):
        # Un paiement annulé ne compte plus dans les totaux
        return (
            Paiement.objects.filter(echeance__convention=self, est_annule=False).aggregate(
                t=Sum("montant")
            )["t"]
            or Decimal("0")
        )

    @property
    def arrieres(self):
        """Total des montants échus et non encore payés."""
        total = Decimal("0")
        aujourdhui = timezone.localdate()
        for e in self.echeances.filter(date_echeance__lte=aujourdhui):
            total += e.reste_a_payer
        return total

    def __str__(self):
        return f"{self.reference} - {self.partenaire} ({self.get_statut_display()})"


class Echeance(models.Model):
    class Statut(models.TextChoices):
        NON_PAYE = "NON_PAYE", "Non payé"
        PARTIEL = "PARTIEL", "Partiel"
        PAYE = "PAYE", "Payé"

    # Composition : si la convention disparaît, ses échéances disparaissent
    convention = models.ForeignKey(
        Convention, on_delete=models.CASCADE, related_name="echeances"
    )
    date_echeance = models.DateField()
    montant_du = models.DecimalField(
        max_digits=12, decimal_places=2, validators=[MinValueValidator(0)]
    )
    statut = models.CharField(
        max_length=10, choices=Statut.choices, default=Statut.NON_PAYE
    )

    # Facture liée à l'échéance
    numero_facture = models.CharField(max_length=30, blank=True)
    date_facture = models.DateField(null=True, blank=True)
    # Renseignée quand la facture a bien été envoyée par e-mail au partenaire
    facture_envoyee_le = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "échéance"
        verbose_name_plural = "échéances"
        ordering = ["convention", "date_echeance"]

    @property
    def montant_paye(self):
        # Les paiements annulés sont ignorés
        return (
            self.paiements.filter(est_annule=False).aggregate(t=Sum("montant"))["t"]
            or Decimal("0")
        )

    @property
    def reste_a_payer(self):
        return max(self.montant_du - self.montant_paye, Decimal("0"))

    def recalculer_statut(self):
        paye = self.montant_paye
        if paye <= 0:
            nouveau = self.Statut.NON_PAYE
        elif paye < self.montant_du:
            nouveau = self.Statut.PARTIEL
        else:
            nouveau = self.Statut.PAYE
        if nouveau != self.statut:
            self.statut = nouveau
            self.save(update_fields=["statut"])

    def __str__(self):
        return f"{self.convention.reference} - {self.date_echeance} ({self.get_statut_display()})"


class Paiement(models.Model):
    class Mode(models.TextChoices):
        # Comme dans le tableau de la DPC : OP (espèces ou chèque) et OV (virement)
        ESPECES = "ESPECES", "Espèces (OP)"
        CHEQUE = "CHEQUE", "Chèque (OP)"
        VIREMENT = "VIREMENT", "Virement (OV)"

    # Composition : si l'échéance disparaît, ses paiements disparaissent
    echeance = models.ForeignKey(
        Echeance, on_delete=models.CASCADE, related_name="paiements"
    )
    # Numéro de reçu automatique : REC-2026-0001 (vide pour les anciens paiements)
    numero_recu = models.CharField(
        max_length=30, unique=True, null=True, blank=True, editable=False
    )
    date_paiement = models.DateField()
    montant = models.DecimalField(
        max_digits=12, decimal_places=2, validators=[MinValueValidator(1)]
    )
    # Le mode de paiement est obligatoire pour chaque paiement
    mode = models.CharField(
        max_length=15, choices=Mode.choices, verbose_name="mode de paiement"
    )
    # N° de l'ordre de publicité, du chèque ou de l'ordre de virement (ex. OP N°04/17)
    reference = models.CharField(
        max_length=50, blank=True, verbose_name="N° de l'ordre ou du chèque"
    )
    # Détails selon le mode : banque (chèque, virement), date de valeur (virement)
    banque = models.CharField(max_length=100, blank=True)
    date_valeur = models.DateField(null=True, blank=True)
    # Personne qui a remis le paiement, si ce n'est pas le contact habituel
    nom_payeur = models.CharField(max_length=100, blank=True)
    observation = models.CharField(max_length=255, blank=True)

    enregistre_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="paiements_enregistres",
    )
    date_enregistrement = models.DateTimeField(auto_now_add=True)
    # Renseignée quand le reçu a bien été envoyé par e-mail au partenaire
    recu_envoye_le = models.DateTimeField(null=True, blank=True)
    # Pièce justificative : copie scannée ou photo du chèque ou de l'ordre de virement
    justificatif = models.FileField(
        upload_to="justificatifs/%Y/%m/",
        null=True,
        blank=True,
        validators=[FileExtensionValidator(["pdf", "jpg", "jpeg", "png"])],
        verbose_name="pièce justificative",
    )

    # Un paiement ne se supprime pas : on l'annule, avec un motif, et la ligne reste visible
    est_annule = models.BooleanField(default=False)
    date_annulation = models.DateTimeField(null=True, blank=True)
    annule_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="paiements_annules",
    )
    motif_annulation = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-date_paiement", "-id"]

    def save(self, *args, **kwargs):
        if not self.numero_recu:
            from .numerotation import prochain_numero

            annee = timezone.localdate().year
            existantes = Paiement.objects.filter(
                numero_recu__startswith=f"REC-{annee}-"
            ).values_list("numero_recu", flat=True)
            self.numero_recu = prochain_numero("REC", annee, existantes, 4)
        super().save(*args, **kwargs)
        self.echeance.recalculer_statut()

    def delete(self, *args, **kwargs):
        echeance = self.echeance
        fichier = self.justificatif
        super().delete(*args, **kwargs)
        # Le fichier ne reste pas orphelin sur le disque
        if fichier:
            fichier.delete(save=False)
        echeance.recalculer_statut()

    def __str__(self):
        return f"{self.montant} Ar - {self.echeance}"


class Relance(models.Model):
    """Trace d'un rappel ou d'une relance envoyé(e) au partenaire pour une échéance.
    Une seule relance de chaque type par échéance : cela évite d'envoyer deux fois
    le même e-mail."""

    class Type(models.TextChoices):
        RAPPEL = "RAPPEL", "Rappel avant échéance"
        RETARD = "RETARD", "Relance de retard"
        RETARD_FINAL = "RETARD_FINAL", "Dernier rappel"

    # Composition : si l'échéance disparaît, son historique de relances disparaît
    echeance = models.ForeignKey(
        Echeance, on_delete=models.CASCADE, related_name="relances"
    )
    type = models.CharField(max_length=15, choices=Type.choices)
    date_envoi = models.DateTimeField(auto_now_add=True)
    # Faux si le partenaire n'a pas d'adresse e-mail ou si l'envoi a échoué
    email_envoye = models.BooleanField(default=False)

    class Meta:
        ordering = ["-date_envoi"]
        constraints = [
            models.UniqueConstraint(
                fields=["echeance", "type"], name="relance_unique_par_type"
            )
        ]

    def __str__(self):
        return f"{self.get_type_display()} - {self.echeance}"


class JournalConvention(models.Model):
    """Historique des actions sur les conventions : qui a fait quoi, et quand.
    Une ligne n'est jamais modifiée. Elle survit à la suppression de la convention
    (la référence est recopiée) et à celle de l'utilisateur."""

    class Action(models.TextChoices):
        CREEE = "CREEE", "Convention créée"
        MODIFIEE = "MODIFIEE", "Convention modifiée"
        STATUT = "STATUT", "Changement de statut"
        SUPPRIMEE = "SUPPRIMEE", "Convention supprimée"
        ECHEANCES = "ECHEANCES", "Échéances générées"
        FACTUREE = "FACTUREE", "Facture émise"
        PAIEMENT = "PAIEMENT", "Paiement enregistré"
        PAIEMENT_ANNULE = "PAIEMENT_ANNULE", "Paiement annulé"
        PAIEMENT_SUPPRIME = "PAIEMENT_SUPPRIME", "Paiement supprimé"
        JUSTIFICATIF = "JUSTIFICATIF", "Pièce justificative"

    convention = models.ForeignKey(
        Convention,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="journal",
    )
    # Recopiée pour rester lisible même si la convention est supprimée
    reference_convention = models.CharField(max_length=30)
    action = models.CharField(max_length=20, choices=Action.choices)
    detail = models.CharField(max_length=500, blank=True)
    # Vide quand c'est le système qui agit (ex. expiration automatique)
    auteur = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="actions_conventions",
    )
    date = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "ligne d'historique"
        verbose_name_plural = "historique des conventions"
        ordering = ["-date", "-id"]

    def __str__(self):
        return f"{self.reference_convention} - {self.get_action_display()}"