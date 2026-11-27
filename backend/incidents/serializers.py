from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from referentiels.models import Site

from .models import Incident, PieceJointeIncident, ids_incidents_recurrents

# Taille maximale d'une pièce jointe : 10 Mo
TAILLE_MAX_PIECE = 10 * 1024 * 1024


def nom_complet(utilisateur):
    if utilisateur is None:
        return None
    return utilisateur.get_full_name().strip() or utilisateur.username


def pas_dans_le_futur(valeur):
    # Petite marge de 5 minutes pour les écarts d'horloge du téléphone
    if valeur > timezone.now() + timedelta(minutes=5):
        raise serializers.ValidationError("La date ne peut pas être dans le futur.")
    return valeur


class PieceJointeIncidentSerializer(serializers.ModelSerializer):
    """Une preuve jointe à un incident (lecture et envoi)."""

    ajoutee_par_nom = serializers.SerializerMethodField()

    class Meta:
        model = PieceJointeIncident
        fields = ["id", "fichier", "legende", "date_ajout", "ajoutee_par_nom"]
        read_only_fields = ["id", "date_ajout", "ajoutee_par_nom"]

    def get_ajoutee_par_nom(self, piece):
        return nom_complet(piece.ajoutee_par)

    def validate_fichier(self, fichier):
        if fichier.size > TAILLE_MAX_PIECE:
            raise serializers.ValidationError("Le fichier dépasse 10 Mo.")
        return fichier


class IncidentSerializer(serializers.ModelSerializer):
    """Un incident, avec les libellés et les calculs utiles à l'interface.

    Le statut, la date de rétablissement et les auteurs ne se saisissent pas ici :
    ils sont gérés par la vue (déclaration) et par l'action « rétablir ».
    """

    site_nom = serializers.CharField(source="site.nom", read_only=True)
    site_service = serializers.CharField(source="site.service", read_only=True)
    site_service_libelle = serializers.CharField(
        source="site.get_service_display", read_only=True
    )
    element_description = serializers.SerializerMethodField()
    service_libelle = serializers.CharField(source="get_service_display", read_only=True)
    type_libelle = serializers.CharField(source="get_type_display", read_only=True)
    gravite_libelle = serializers.CharField(source="get_gravite_display", read_only=True)
    statut_libelle = serializers.CharField(source="get_statut_display", read_only=True)
    declare_par_nom = serializers.SerializerMethodField()
    retabli_par_nom = serializers.SerializerMethodField()
    duree_minutes = serializers.IntegerField(read_only=True)
    est_recurrent = serializers.SerializerMethodField()
    pieces_jointes = PieceJointeIncidentSerializer(many=True, read_only=True)

    class Meta:
        model = Incident
        fields = [
            "id",
            "site",
            "site_nom",
            "site_service",
            "site_service_libelle",
            "element",
            "element_description",
            "mission",
            "service",
            "service_libelle",
            "type",
            "type_libelle",
            "gravite",
            "gravite_libelle",
            "statut",
            "statut_libelle",
            "date_debut",
            "date_retablissement",
            "duree_minutes",
            "cause_supposee",
            "observations",
            "declare_par",
            "declare_par_nom",
            "retabli_par",
            "retabli_par_nom",
            "est_recurrent",
            "pieces_jointes",
        ]
        read_only_fields = [
            "id",
            "statut",
            "date_retablissement",
            "declare_par",
            "retabli_par",
        ]

    def get_element_description(self, incident):
        if incident.element is None:
            return None
        return f"{incident.element.type} - {incident.element.description}"

    def get_declare_par_nom(self, incident):
        return nom_complet(incident.declare_par)

    def get_retabli_par_nom(self, incident):
        return nom_complet(incident.retabli_par)

    def get_est_recurrent(self, incident):
        # Calculé une seule fois par requête, puis gardé dans le contexte
        ids = self.context.get("ids_recurrents")
        if ids is None:
            ids = ids_incidents_recurrents()
            self.context["ids_recurrents"] = ids
        return incident.id in ids

    def validate_date_debut(self, valeur):
        return pas_dans_le_futur(valeur)

    def validate(self, donnees):
        instance = self.instance
        site = donnees.get("site", getattr(instance, "site", None))
        element = donnees.get("element", getattr(instance, "element", None))
        mission = donnees.get("mission", getattr(instance, "mission", None))

        # Un site « Radio » ne diffuse pas de télévision, et inversement
        service = donnees.get("service", getattr(instance, "service", None))
        if site.service != Site.Service.RADIO_TELEVISION and service != site.service:
            raise serializers.ValidationError(
                {
                    "service": (
                        f"Ce site diffuse seulement : {site.get_service_display().lower()}."
                    )
                }
            )

        if element is not None and element.site_id != site.id:
            raise serializers.ValidationError(
                {"element": "Cet équipement n'appartient pas au site choisi."}
            )
        if mission is not None and mission.site_id != site.id:
            raise serializers.ValidationError(
                {"mission": "Cette mission ne concerne pas le site choisi."}
            )

        # En modification : le début ne peut pas dépasser le rétablissement
        debut = donnees.get("date_debut")
        if (
            debut is not None
            and instance is not None
            and instance.date_retablissement is not None
            and debut > instance.date_retablissement
        ):
            raise serializers.ValidationError(
                {"date_debut": "Le début doit précéder le rétablissement."}
            )
        return donnees


class RetablissementSerializer(serializers.Serializer):
    """Les données de l'action « rétablir » : la date est facultative (par défaut,
    maintenant) et les observations remplacent celles de l'incident si elles sont
    envoyées."""

    date_retablissement = serializers.DateTimeField(required=False)
    observations = serializers.CharField(required=False, allow_blank=True)

    def validate_date_retablissement(self, valeur):
        return pas_dans_le_futur(valeur)

    def validate(self, donnees):
        incident = self.context["incident"]
        fin = donnees.get("date_retablissement")
        if fin is not None and fin < incident.date_debut:
            raise serializers.ValidationError(
                {"date_retablissement": "Le rétablissement doit suivre le début."}
            )
        return donnees