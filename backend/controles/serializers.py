from datetime import datetime
from decimal import Decimal, InvalidOperation

from django.utils import timezone
from rest_framework import serializers

from comptes.models import Utilisateur
from conventions.services import convention_active_pour
from referentiels.models import CritereControle

from .models import Mission, Photo, ReponseCritere
from .ordres import ordre_mission_de


def verifier_creneau(date_debut, heure_debut, date_fin, heure_fin, verifier_passe=True):
    """Règles du créneau prévu : tout est renseigné, la fin suit le début,
    et le début n'est pas déjà passé."""
    erreurs = {}
    if heure_debut is None:
        erreurs["heure_prevue"] = "Indiquez l'heure de début."
    if date_fin is None:
        erreurs["date_fin_prevue"] = "Indiquez la date de fin."
    if heure_fin is None:
        erreurs["heure_fin_prevue"] = "Indiquez l'heure de fin."
    if erreurs:
        raise serializers.ValidationError(erreurs)

    if date_fin < date_debut:
        erreurs["date_fin_prevue"] = "La date de fin ne peut pas précéder la date de début."
    elif datetime.combine(date_fin, heure_fin) <= datetime.combine(date_debut, heure_debut):
        erreurs["heure_fin_prevue"] = "L'heure de fin doit être après l'heure de début."
    elif verifier_passe and date_debut == timezone.localdate():
        maintenant = timezone.localtime().time().replace(second=0, microsecond=0)
        if heure_debut < maintenant:
            erreurs["heure_prevue"] = "Cette heure de début est déjà passée."

    if erreurs:
        raise serializers.ValidationError(erreurs)


class MissionSerializer(serializers.ModelSerializer):
    """Une mission, telle qu'elle est affichée dans l'interface."""

    site_nom = serializers.CharField(source="site.nom", read_only=True)
    site_localisation = serializers.CharField(source="site.localisation", read_only=True)
    # Radio, Télévision ou Radio et télévision : le contrôleur sait tout de suite
    # quel service il va contrôler
    site_service = serializers.CharField(source="site.service", read_only=True)
    site_service_libelle = serializers.CharField(
        source="site.get_service_display", read_only=True
    )
    controleur_nom = serializers.CharField(
        source="controleur.get_full_name", read_only=True
    )
    modele_grille_nom = serializers.CharField(
        source="modele_grille.nom", read_only=True
    )
    statut_libelle = serializers.CharField(source="get_statut_display", read_only=True)

    # Pièces officielles : carte professionnelle, ordre de mission applicable
    carte_professionnelle = serializers.SerializerMethodField()
    ordre_mission = serializers.SerializerMethodField()
    peut_recevoir_ordre = serializers.SerializerMethodField()

    class Meta:
        model = Mission
        fields = [
            "id",
            "date_prevue",
            "heure_prevue",
            "date_fin_prevue",
            "heure_fin_prevue",
            "statut",
            "statut_libelle",
            "site",
            "site_nom",
            "site_localisation",
            "site_service",
            "site_service_libelle",
            "controleur",
            "controleur_nom",
            "directeur",
            "modele_grille",
            "modele_grille_nom",
            "tournee",
            "ordre_dans_tournee",
            "date_debut_reelle",
            "latitude_debut",
            "longitude_debut",
            "date_fin_reelle",
            "latitude_fin",
            "longitude_fin",
            "carte_professionnelle",
            "ordre_mission",
            "peut_recevoir_ordre",
            "derogation_convention",
            "motif_derogation",
        ]
        read_only_fields = fields

    def get_carte_professionnelle(self, mission):
        carte = getattr(mission.controleur, "carte_professionnelle", None)
        if carte is None:
            return None
        return {
            "numero": carte.numero,
            "date_expiration": carte.date_expiration,
            "valide": carte.est_valide_le(mission.date_prevue),
        }

    def get_ordre_mission(self, mission):
        ordre = ordre_mission_de(mission)
        if ordre is None:
            return None
        return {
            "numero": ordre.numero,
            "date_emission": ordre.date_emission,
            # vrai : ordre propre à la mission isolée ; faux : celui de sa tournée
            "propre": ordre.mission_id == mission.pk,
        }

    def get_peut_recevoir_ordre(self, mission):
        """Le Directeur peut délivrer un ordre propre : mission planifiée,
        hors tournée, sans ordre."""
        return (
            mission.statut == Mission.Statut.PLANIFIEE
            and mission.tournee_id is None
            and ordre_mission_de(mission) is None
        )


class MissionCreationSerializer(serializers.ModelSerializer):
    """Les données saisies par le Directeur pour créer une mission."""

    class Meta:
        model = Mission
        fields = [
            "site",
            "controleur",
            "modele_grille",
            "date_prevue",
            "heure_prevue",
            "date_fin_prevue",
            "heure_fin_prevue",
            "derogation_convention",
            "motif_derogation",
        ]

    def validate_date_prevue(self, valeur):
        if valeur < timezone.localdate():
            raise serializers.ValidationError("La date prévue ne peut pas être passée.")
        return valeur

    def validate(self, donnees):
        # Ton `verifierDonnees()` de la séquence « Créer une mission »
        site = donnees["site"]
        modele = donnees["modele_grille"]
        controleur = donnees["controleur"]

        if not site.est_actif:
            raise serializers.ValidationError({"site": "Ce site n'est plus suivi."})
        if not modele.est_actif:
            raise serializers.ValidationError(
                {"modele_grille": "Ce modèle de grille n'est plus utilisable."}
            )
        if modele.type_site_id != site.type_site_id:
            raise serializers.ValidationError(
                {"modele_grille": "Ce modèle ne correspond pas au type du site."}
            )
        if not modele.criteres.exists():
            raise serializers.ValidationError(
                {"modele_grille": "Ce modèle ne contient aucun critère."}
            )
        if controleur.role != Utilisateur.Role.CONTROLEUR or not controleur.is_active:
            raise serializers.ValidationError(
                {"controleur": "Ce contrôleur n'est pas disponible."}
            )

        # RG39 : un site rattaché à un partenaire exige une convention active,
        # sauf dérogation du Directeur (motif obligatoire)
        if site.partenaire_id and not convention_active_pour(site, donnees["date_prevue"]):
            if donnees.get("derogation_convention"):
                if not donnees.get("motif_derogation", "").strip():
                    raise serializers.ValidationError(
                        {"motif_derogation": "Indiquez le motif de la dérogation."}
                    )
            else:
                raise serializers.ValidationError(
                    {
                        "site": (
                            "Ce partenaire n'a pas de convention active pour ce site. "
                            "Le Directeur peut passer outre en indiquant un motif."
                        )
                    }
                )
        else:
            donnees["derogation_convention"] = False
            donnees["motif_derogation"] = ""

        verifier_creneau(
            donnees["date_prevue"],
            donnees.get("heure_prevue"),
            donnees.get("date_fin_prevue"),
            donnees.get("heure_fin_prevue"),
        )
        return donnees


class DemarrageSerializer(serializers.Serializer):
    """La position GPS du contrôleur au démarrage."""

    latitude = serializers.DecimalField(
        max_digits=9, decimal_places=6, min_value=-90, max_value=90
    )
    longitude = serializers.DecimalField(
        max_digits=9, decimal_places=6, min_value=-180, max_value=180
    )


class PhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Photo
        fields = ["id", "fichier", "date_capture", "legende", "latitude", "longitude", "reponse"]
        # L'heure est fixée par le serveur : le contrôleur ne peut pas l'envoyer
        read_only_fields = ["id", "reponse", "date_capture"]


class ReponseCritereSerializer(serializers.ModelSerializer):
    """Une réponse déjà enregistrée, avec ses photos."""

    critere_libelle = serializers.CharField(source="critere.libelle", read_only=True)
    photos = PhotoSerializer(many=True, read_only=True)

    class Meta:
        model = ReponseCritere
        fields = [
            "id",
            "critere",
            "critere_libelle",
            "valeur",
            "est_conforme",
            "commentaire",
            "photos",
        ]
        read_only_fields = fields


class ReponseSaisieSerializer(serializers.Serializer):
    """Une réponse saisie par le contrôleur pour un critère."""

    critere = serializers.PrimaryKeyRelatedField(queryset=CritereControle.objects.all())
    valeur = serializers.CharField(max_length=255)
    est_conforme = serializers.BooleanField()
    commentaire = serializers.CharField(max_length=500, required=False, allow_blank=True)

    def validate(self, donnees):
        # La valeur doit avoir la forme demandée par le critère
        critere = donnees["critere"]
        valeur = donnees["valeur"].strip()

        if critere.type_reponse == CritereControle.TypeReponse.OUI_NON:
            if valeur.upper() not in ("OUI", "NON"):
                raise serializers.ValidationError(
                    {"valeur": "Répondre OUI ou NON pour ce critère."}
                )
            donnees["valeur"] = valeur.upper()
        elif critere.type_reponse == CritereControle.TypeReponse.NOTE:
            try:
                Decimal(valeur.replace(",", "."))
            except InvalidOperation:
                raise serializers.ValidationError(
                    {"valeur": "Saisir une note chiffrée pour ce critère."}
                )
        return donnees


class GrilleSoumissionSerializer(serializers.Serializer):
    """L'ensemble des réponses envoyées en une fois."""

    reponses = ReponseSaisieSerializer(many=True, allow_empty=False)