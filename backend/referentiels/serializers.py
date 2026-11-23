from rest_framework import serializers

from controles.models import Mission, NonConformite

from .models import (
    CritereControle,
    ElementInventaire,
    ModeleGrille,
    ParametreScore,
    Partenaire,
    Site,
    TypeSite,
)


class PartenaireSerializer(serializers.ModelSerializer):
    # Calculé par PartenaireViewSet (annotation) : absent des réponses de création / modification
    nombre_sites = serializers.IntegerField(read_only=True)

    class Meta:
        model = Partenaire
        fields = "__all__"


class TypeSiteSerializer(serializers.ModelSerializer):
    # Calculés par TypeSiteViewSet (annotations) : absents des réponses de création / modification
    nombre_sites = serializers.IntegerField(read_only=True)
    nombre_modeles = serializers.IntegerField(read_only=True)

    class Meta:
        model = TypeSite
        fields = "__all__"


class ElementInventaireSerializer(serializers.ModelSerializer):
    class Meta:
        model = ElementInventaire
        fields = "__all__"
        read_only_fields = ["date_ajout"]


class SiteSerializer(serializers.ModelSerializer):
    # Pour l'affichage : le nom du type, le nom du partenaire et l'inventaire du site
    type_site_libelle = serializers.CharField(source="type_site.libelle", read_only=True)
    partenaire_nom = serializers.CharField(
        source="partenaire.nom", read_only=True, allow_null=True
    )
    elements = ElementInventaireSerializer(many=True, read_only=True)

    # Calculés par SiteViewSet (annotations) : présents dans la liste et la fiche,
    # absents des réponses de création / modification
    nombre_controles = serializers.IntegerField(read_only=True)
    non_conformites_ouvertes = serializers.IntegerField(read_only=True)
    dernier_controle = serializers.DateTimeField(read_only=True, allow_null=True)

    class Meta:
        model = Site
        fields = [
            "id",
            "nom",
            "localisation",
            "latitude",
            "longitude",
            "est_actif",
            "type_site",
            "type_site_libelle",
            "partenaire",
            "partenaire_nom",
            "nombre_controles",
            "non_conformites_ouvertes",
            "dernier_controle",
            "elements",
        ]

    def validate_type_site(self, valeur):
        # Un type désactivé n'est plus proposé : un site peut seulement garder celui qu'il a déjà
        changement = self.instance is None or self.instance.type_site_id != valeur.id
        if changement and not valeur.est_actif:
            raise serializers.ValidationError(
                "Ce type de site est désactivé : choisissez un type actif."
            )
        return valeur


class CritereControleSerializer(serializers.ModelSerializer):
    class Meta:
        model = CritereControle
        fields = "__all__"

    def validate_type_reponse(self, valeur):
        # Changer le type d'un critère déjà répondu fausserait les contrôles passés
        if (
            self.instance
            and self.instance.type_reponse != valeur
            and self.instance.reponses.exists()
        ):
            raise serializers.ValidationError(
                "Le type de réponse ne peut plus changer : ce critère a déjà reçu des réponses."
            )
        return valeur


class ModeleGrilleSerializer(serializers.ModelSerializer):
    type_site_libelle = serializers.CharField(source="type_site.libelle", read_only=True)
    criteres = CritereControleSerializer(many=True, read_only=True)
    # Calculé par ModeleGrilleViewSet (annotation) : absent des réponses de création / modification
    nombre_missions = serializers.IntegerField(read_only=True)

    class Meta:
        model = ModeleGrille
        fields = [
            "id",
            "nom",
            "description",
            "est_actif",
            "type_site",
            "type_site_libelle",
            "nombre_missions",
            "criteres",
        ]

    def validate_type_site(self, valeur):
        changement = self.instance is None or self.instance.type_site_id != valeur.id

        # Un type désactivé n'est plus proposé : un modèle peut seulement garder celui qu'il a déjà
        if changement and not valeur.est_actif:
            raise serializers.ValidationError(
                "Ce type de site est désactivé : choisissez un type actif."
            )

        # Un modèle déjà utilisé par des missions garde son type de site
        if changement and self.instance and self.instance.missions.exists():
            raise serializers.ValidationError(
                "Ce modèle est utilisé par des missions : son type de site ne peut plus changer."
            )
        return valeur


class ParametreScoreSerializer(serializers.ModelSerializer):
    class Meta:
        model = ParametreScore
        fields = "__all__"
        read_only_fields = ["date_modification"]


class MissionHistoriqueSerializer(serializers.ModelSerializer):
    """Une mission dans l'historique d'un site (fiche du site)."""

    controleur_nom = serializers.SerializerMethodField()
    statut_libelle = serializers.CharField(source="get_statut_display", read_only=True)
    rapport_statut = serializers.SerializerMethodField()
    rapport_statut_libelle = serializers.SerializerMethodField()
    score_conformite = serializers.SerializerMethodField()

    class Meta:
        model = Mission
        fields = [
            "id",
            "date_prevue",
            "statut",
            "statut_libelle",
            "date_fin_reelle",
            "controleur_nom",
            "rapport_statut",
            "rapport_statut_libelle",
            "score_conformite",
        ]

    def get_controleur_nom(self, mission):
        c = mission.controleur
        nom = f"{c.first_name} {c.last_name}".strip()
        return nom or c.username

    # Une mission a 0..1 rapport : getattr renvoie None quand il n'existe pas encore
    def get_rapport_statut(self, mission):
        rapport = getattr(mission, "rapport", None)
        return rapport.statut if rapport else None

    def get_rapport_statut_libelle(self, mission):
        rapport = getattr(mission, "rapport", None)
        return rapport.get_statut_display() if rapport else None

    def get_score_conformite(self, mission):
        rapport = getattr(mission, "rapport", None)
        return rapport.score_conformite if rapport else None


class NonConformiteHistoriqueSerializer(serializers.ModelSerializer):
    """Une non-conformité dans la fiche d'un site."""

    gravite_libelle = serializers.CharField(source="get_gravite_display", read_only=True)
    statut_libelle = serializers.CharField(source="get_statut_display", read_only=True)

    class Meta:
        model = NonConformite
        fields = [
            "id",
            "description",
            "gravite",
            "gravite_libelle",
            "statut",
            "statut_libelle",
            "date_detection",
            "date_limite_correction",
            "date_correction",
            "date_verification",
        ]