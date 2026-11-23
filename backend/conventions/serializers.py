from django.utils import timezone
from rest_framework import serializers

from .models import Convention, Echeance, JournalConvention, Paiement, Relance


class JournalSerializer(serializers.ModelSerializer):
    action_libelle = serializers.CharField(source="get_action_display", read_only=True)
    auteur_nom = serializers.SerializerMethodField()

    class Meta:
        model = JournalConvention
        fields = [
            "id",
            "convention",
            "reference_convention",
            "action",
            "action_libelle",
            "detail",
            "auteur",
            "auteur_nom",
            "date",
        ]
        read_only_fields = fields

    def get_auteur_nom(self, ligne):
        # Pas d'auteur = action faite par le système
        return ligne.auteur.get_full_name() if ligne.auteur else "Système"


class RelanceSerializer(serializers.ModelSerializer):
    type_libelle = serializers.CharField(source="get_type_display", read_only=True)

    class Meta:
        model = Relance
        fields = ["id", "type", "type_libelle", "date_envoi", "email_envoye"]
        read_only_fields = fields


TAILLE_MAX_JUSTIFICATIF = 5 * 1024 * 1024  # 5 Mo
EXTENSIONS_JUSTIFICATIF = (".pdf", ".jpg", ".jpeg", ".png")


def valider_justificatif(fichier):
    """Le justificatif est un PDF ou une image, de 5 Mo au plus."""
    if not fichier.name.lower().endswith(EXTENSIONS_JUSTIFICATIF):
        raise serializers.ValidationError(
            "Format non accepté : envoyez un PDF ou une image (JPG, PNG)."
        )
    if fichier.size > TAILLE_MAX_JUSTIFICATIF:
        raise serializers.ValidationError("Le fichier dépasse 5 Mo.")
    return fichier


class JustificatifSerializer(serializers.Serializer):
    """Le fichier envoyé pour joindre ou remplacer la pièce justificative."""

    justificatif = serializers.FileField()

    def validate_justificatif(self, fichier):
        return valider_justificatif(fichier)


class AnnulationSerializer(serializers.Serializer):
    """Le motif, obligatoire, pour annuler un paiement."""

    motif = serializers.CharField(min_length=5, max_length=255)

    def validate_motif(self, motif):
        motif = motif.strip()
        if len(motif) < 5:
            raise serializers.ValidationError("Indiquez le motif de l'annulation (5 caractères au moins).")
        return motif


class PaiementSerializer(serializers.ModelSerializer):
    enregistre_par_nom = serializers.CharField(
        source="enregistre_par.get_full_name", read_only=True, default=""
    )
    annule_par_nom = serializers.CharField(
        source="annule_par.get_full_name", read_only=True, default=""
    )
    mode_libelle = serializers.CharField(source="get_mode_display", read_only=True)

    class Meta:
        model = Paiement
        fields = [
            "id",
            "echeance",
            "numero_recu",
            "date_paiement",
            "montant",
            "mode",
            "mode_libelle",
            "reference",
            "banque",
            "date_valeur",
            "nom_payeur",
            "observation",
            "enregistre_par",
            "enregistre_par_nom",
            "date_enregistrement",
            "recu_envoye_le",
            "justificatif",
            "est_annule",
            "date_annulation",
            "annule_par",
            "annule_par_nom",
            "motif_annulation",
        ]
        read_only_fields = [
            "id",
            "numero_recu",
            "enregistre_par",
            "date_enregistrement",
            "recu_envoye_le",
            "est_annule",
            "date_annulation",
            "annule_par",
            "motif_annulation",
        ]

    def validate_justificatif(self, fichier):
        return valider_justificatif(fichier) if fichier else fichier

    def validate(self, donnees):
        echeance = donnees["echeance"]
        convention = echeance.convention
        erreurs = {}

        # Le partenaire ne paie que selon une convention envoyée puis active
        if convention.statut in (
            Convention.Statut.BROUILLON,
            Convention.Statut.ENVOYEE,
        ):
            raise serializers.ValidationError(
                {"echeance": "Cette convention n'est pas encore active."}
            )

        # ---- Dates ----
        date_paiement = donnees["date_paiement"]
        if date_paiement > timezone.localdate():
            erreurs["date_paiement"] = "La date du paiement ne peut pas être dans le futur."
        elif convention.date_signature and date_paiement < convention.date_signature:
            erreurs["date_paiement"] = (
                "La date du paiement ne peut pas précéder la signature de la convention "
                f"({convention.date_signature:%d/%m/%Y})."
            )

        # ---- Selon le mode ----
        mode = donnees["mode"]
        reference = (donnees.get("reference") or "").strip()
        banque = (donnees.get("banque") or "").strip()
        if mode in (Paiement.Mode.CHEQUE, Paiement.Mode.VIREMENT):
            if not reference:
                erreurs["reference"] = (
                    "Indiquez le numéro du chèque."
                    if mode == Paiement.Mode.CHEQUE
                    else "Indiquez le numéro de l'ordre de virement."
                )
            if not banque:
                erreurs["banque"] = "Indiquez la banque."
        if mode != Paiement.Mode.VIREMENT:
            # La date de valeur n'a de sens que pour un virement
            donnees["date_valeur"] = None
        if mode == Paiement.Mode.ESPECES:
            donnees["banque"] = ""

        # ---- Montant ----
        reste = echeance.reste_a_payer
        if donnees["montant"] > reste:
            erreurs["montant"] = f"Le reste à payer est de {reste:,.0f} Ar.".replace(",", " ")

        # ---- Doublon : même référence et même montant pour la même échéance ----
        if reference and "reference" not in erreurs:
            doublon = Paiement.objects.filter(
                echeance=echeance,
                reference__iexact=reference,
                montant=donnees["montant"],
                est_annule=False,
            ).exists()
            if doublon:
                erreurs["reference"] = (
                    "Un paiement avec cette référence et ce montant existe déjà pour cette échéance."
                )

        if erreurs:
            raise serializers.ValidationError(erreurs)
        return donnees


class EcheanceSerializer(serializers.ModelSerializer):
    statut_libelle = serializers.CharField(source="get_statut_display", read_only=True)
    montant_paye = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    reste_a_payer = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    paiements = PaiementSerializer(many=True, read_only=True)
    relances = RelanceSerializer(many=True, read_only=True)

    class Meta:
        model = Echeance
        fields = [
            "id",
            "convention",
            "date_echeance",
            "montant_du",
            "statut",
            "statut_libelle",
            "numero_facture",
            "date_facture",
            "facture_envoyee_le",
            "montant_paye",
            "reste_a_payer",
            "paiements",
            "relances",
        ]
        read_only_fields = ["id", "statut", "facture_envoyee_le"]

    def validate(self, donnees):
        # On ne descend pas le montant dû sous ce qui a déjà été payé
        montant = donnees.get("montant_du")
        if self.instance is not None and montant is not None:
            deja_paye = self.instance.montant_paye
            if montant < deja_paye:
                texte = f"{int(deja_paye):,}".replace(",", " ")
                raise serializers.ValidationError(
                    {
                        "montant_du": (
                            f"{texte} Ar ont déjà été payés : le montant dû ne peut pas "
                            "être inférieur."
                        )
                    }
                )
        return donnees


class ConventionSerializer(serializers.ModelSerializer):
    partenaire_nom = serializers.CharField(source="partenaire.nom", read_only=True)
    site_nom = serializers.CharField(source="site.nom", read_only=True)
    statut_libelle = serializers.CharField(source="get_statut_display", read_only=True)
    periodicite_libelle = serializers.CharField(
        source="get_periodicite_display", read_only=True
    )
    total_du = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    total_paye = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True
    )
    arrieres = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = Convention
        fields = [
            "id",
            "reference",
            "statut",
            "statut_libelle",
            "montant_periodique",
            "periodicite",
            "periodicite_libelle",
            "date_debut",
            "date_fin",
            "date_signature",
            "fichier_pdf",
            "partenaire",
            "partenaire_nom",
            "site",
            "site_nom",
            "cree_par",
            "date_creation",
            "total_du",
            "total_paye",
            "arrieres",
        ]
        # Le statut change seulement par l'action « changer-statut »
        read_only_fields = ["id", "reference", "statut", "cree_par", "date_creation"]

    def validate(self, donnees):
        instance = self.instance
        partenaire = donnees.get("partenaire", getattr(instance, "partenaire", None))
        site = donnees.get("site", getattr(instance, "site", None))
        debut = donnees.get("date_debut", getattr(instance, "date_debut", None))
        fin = donnees.get("date_fin", getattr(instance, "date_fin", None))

        if site and partenaire and site.partenaire_id != partenaire.id:
            raise serializers.ValidationError(
                {"site": "Ce site n'appartient pas à ce partenaire."}
            )
        if debut and fin and fin < debut:
            raise serializers.ValidationError(
                {"date_fin": "La date de fin doit être après la date de début."}
            )
        return donnees