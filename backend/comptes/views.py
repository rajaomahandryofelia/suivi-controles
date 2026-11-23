from django.contrib.auth import authenticate
from django.db.models import Count, Q
from rest_framework import generics, status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from controles.models import Mission

from .emails import envoyer_email_compte_active
from .models import CarteProfessionnelle, Utilisateur
from .permissions import est_directeur
from .serializers import (
    CarteProfessionnelleSerializer,
    ConnexionSerializer,
    ControleurSerializer,
    InscriptionSerializer,
    UtilisateurSerializer,
)


class ConnexionView(APIView):
    """S'authentifier : identifiants -> jeton + informations de l'utilisateur."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = ConnexionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        username = serializer.validated_data["username"]
        password = serializer.validated_data["password"]

        utilisateur = authenticate(username=username, password=password)

        if utilisateur is None:
            # Bon mot de passe mais compte pas encore activé : on le dit clairement
            candidat = Utilisateur.objects.filter(username=username).first()
            if candidat and not candidat.is_active and candidat.check_password(password):
                return Response(
                    {"detail": "Votre compte est en attente de validation par le Directeur."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            return Response(
                {"detail": "Identifiants incorrects."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        token, _ = Token.objects.get_or_create(user=utilisateur)
        return Response(
            {"token": token.key, "utilisateur": UtilisateurSerializer(utilisateur).data}
        )


class InscriptionView(generics.CreateAPIView):
    """Demande de compte contrôleur (compte inactif jusqu'à validation)."""

    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = InscriptionSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            {"detail": "Demande envoyée. Le Directeur doit activer votre compte."},
            status=status.HTTP_201_CREATED,
        )


class DeconnexionView(APIView):
    """Se déconnecter : le jeton est supprimé."""

    def post(self, request):
        request.user.auth_token.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MoiView(APIView):
    """Renvoie l'utilisateur connecté (utile au chargement de la page)."""

    def get(self, request):
        return Response(UtilisateurSerializer(request.user).data)


class ControleurListView(generics.ListAPIView):
    """Liste des contrôleurs actifs, avec le nombre de missions qu'ils ont effectuées
    et leur carte professionnelle.

    Une mission est « effectuée » quand elle est clôturée. Pour ne compter que celles
    dont le rapport est validé par le Directeur, remplacer le filtre par :
        Q(missions__rapport__statut="VALIDE")
    """

    serializer_class = ControleurSerializer

    def get_queryset(self):
        return (
            Utilisateur.objects.filter(role=Utilisateur.Role.CONTROLEUR, is_active=True)
            .select_related("carte_professionnelle")
            .annotate(
                nombre_missions=Count(
                    "missions",
                    filter=Q(missions__statut=Mission.Statut.CLOTUREE),
                )
            )
            .order_by("last_name", "first_name")
        )


class CarteControleurView(APIView):
    """Le Directeur enregistre ou renouvelle la carte professionnelle d'un contrôleur."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not est_directeur(request.user):
            return Response({"detail": "Réservé au Directeur."}, status=status.HTTP_403_FORBIDDEN)
        try:
            controleur = Utilisateur.objects.get(
                pk=pk, role=Utilisateur.Role.CONTROLEUR, is_active=True
            )
        except Utilisateur.DoesNotExist:
            return Response({"detail": "Contrôleur introuvable."}, status=status.HTTP_404_NOT_FOUND)

        existante = CarteProfessionnelle.objects.filter(controleur=controleur).first()
        serializer = CarteProfessionnelleSerializer(existante, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(controleur=controleur)
        return Response(serializer.data)


class DemandesInscriptionView(APIView):
    """Liste des comptes contrôleurs en attente (Directeur uniquement)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not est_directeur(request.user):
            return Response({"detail": "Réservé au Directeur."}, status=status.HTTP_403_FORBIDDEN)
        demandes = Utilisateur.objects.filter(
            role=Utilisateur.Role.CONTROLEUR, is_active=False
        ).order_by("-date_joined")
        return Response(UtilisateurSerializer(demandes, many=True).data)


class AccepterDemandeView(APIView):
    """Le Directeur accepte : le compte est activé et un e-mail part au contrôleur."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not est_directeur(request.user):
            return Response({"detail": "Réservé au Directeur."}, status=status.HTTP_403_FORBIDDEN)
        try:
            utilisateur = Utilisateur.objects.get(
                pk=pk, role=Utilisateur.Role.CONTROLEUR, is_active=False
            )
        except Utilisateur.DoesNotExist:
            return Response({"detail": "Demande introuvable."}, status=status.HTTP_404_NOT_FOUND)

        utilisateur.is_active = True
        utilisateur.save(update_fields=["is_active"])
        email_envoye = envoyer_email_compte_active(utilisateur)
        return Response({
            "detail": "Compte accepté.",
            "email_envoye": email_envoye,
        })


class RefuserDemandeView(APIView):
    """Le Directeur refuse : la demande est supprimée."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not est_directeur(request.user):
            return Response({"detail": "Réservé au Directeur."}, status=status.HTTP_403_FORBIDDEN)
        try:
            utilisateur = Utilisateur.objects.get(
                pk=pk, role=Utilisateur.Role.CONTROLEUR, is_active=False
            )
        except Utilisateur.DoesNotExist:
            return Response({"detail": "Demande introuvable."}, status=status.HTTP_404_NOT_FOUND)

        utilisateur.delete()
        return Response({"detail": "Demande refusée et supprimée."})