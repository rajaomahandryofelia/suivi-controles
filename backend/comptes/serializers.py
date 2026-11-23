from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import CarteProfessionnelle, Utilisateur


class UtilisateurSerializer(serializers.ModelSerializer):
    """Les informations d'un utilisateur renvoyées à l'interface."""

    class Meta:
        model = Utilisateur
        fields = [
            "id",
            "username",
            "first_name",
            "last_name",
            "email",
            "role",
            "telephone",
            "matricule",
            "date_joined",
        ]
        read_only_fields = fields


class CarteProfessionnelleSerializer(serializers.ModelSerializer):
    """La carte professionnelle d'un contrôleur (lecture et saisie)."""

    class Meta:
        model = CarteProfessionnelle
        fields = ["numero", "date_delivrance", "date_expiration"]

    def validate(self, donnees):
        if donnees["date_expiration"] <= donnees["date_delivrance"]:
            raise serializers.ValidationError(
                {"date_expiration": "L'expiration doit être après la délivrance."}
            )
        return donnees

    def validate_numero(self, valeur):
        valeur = valeur.strip()
        # Le numéro est unique, sauf pour la carte qu'on est en train de renouveler
        doublon = CarteProfessionnelle.objects.filter(numero=valeur)
        if self.instance is not None:
            doublon = doublon.exclude(pk=self.instance.pk)
        if doublon.exists():
            raise serializers.ValidationError("Ce numéro de carte est déjà utilisé.")
        return valeur


class ControleurSerializer(UtilisateurSerializer):
    """Un contrôleur de la liste, avec le nombre de missions qu'il a déjà effectuées
    et sa carte professionnelle.

    `nombre_missions` est calculé par la vue (annotation) : voir ControleurListView.
    """

    nombre_missions = serializers.IntegerField(read_only=True)
    carte_professionnelle = CarteProfessionnelleSerializer(read_only=True)

    class Meta(UtilisateurSerializer.Meta):
        fields = UtilisateurSerializer.Meta.fields + [
            "nombre_missions",
            "carte_professionnelle",
        ]
        read_only_fields = fields


class ConnexionSerializer(serializers.Serializer):
    """Les données attendues pour se connecter."""

    username = serializers.CharField()
    password = serializers.CharField(write_only=True)


class InscriptionSerializer(serializers.ModelSerializer):
    """Les données saisies par un contrôleur qui demande un compte."""

    password = serializers.CharField(write_only=True)

    class Meta:
        model = Utilisateur
        fields = [
            "username",
            "password",
            "first_name",
            "last_name",
            "email",
            "telephone",
            "matricule",
        ]
        extra_kwargs = {
            "first_name": {"required": True, "allow_blank": False},
            "last_name": {"required": True, "allow_blank": False},
            "email": {"required": True, "allow_blank": False},
            "matricule": {"required": True, "allow_null": False, "allow_blank": False},
        }

    def validate_password(self, valeur):
        try:
            validate_password(valeur)
        except DjangoValidationError as erreur:
            raise serializers.ValidationError(list(erreur.messages))
        return valeur

    def create(self, donnees):
        mot_de_passe = donnees.pop("password")
        # Toujours contrôleur, et inactif jusqu'à validation par le Directeur
        return Utilisateur.objects.create_user(
            **donnees,
            password=mot_de_passe,
            role=Utilisateur.Role.CONTROLEUR,
            is_active=False,
        )