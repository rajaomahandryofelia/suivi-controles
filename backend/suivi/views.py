from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from comptes.permissions import est_directeur
from controles.models import Mission, NonConformite, Rapport
from controles.serializers import MissionSerializer
from referentiels.models import Site

from .models import Alerte, Notification


def compter_missions(missions):
    return {
        "planifiees": missions.filter(statut=Mission.Statut.PLANIFIEE).count(),
        "en_cours": missions.filter(statut=Mission.Statut.EN_COURS).count(),
        "cloturees": missions.filter(statut=Mission.Statut.CLOTUREE).count(),
    }


class TableauDeBordView(APIView):
    """Les chiffres de la page d'accueil, selon le rôle."""

    def get(self, request):
        if est_directeur(request.user):
            return Response(self.vue_directeur())
        return Response(self.vue_controleur(request))

    def vue_directeur(self):
        aujourdhui = timezone.localdate()

        # Le dernier score de chaque site actif
        niveaux = {"FAIBLE": 0, "MOYEN": 0, "ELEVE": 0, "CRITIQUE": 0, "SANS_SCORE": 0}
        sites_scores = []
        for site in Site.objects.filter(est_actif=True).prefetch_related("scores"):
            dernier = site.scores.first()
            if dernier is None:
                niveaux["SANS_SCORE"] += 1
                continue
            niveaux[dernier.niveau] += 1
            sites_scores.append(
                {
                    "id": site.id,
                    "nom": site.nom,
                    "valeur": dernier.valeur,
                    "niveau": dernier.niveau,
                }
            )
        sites_scores.sort(key=lambda s: s["valeur"], reverse=True)

        a_traiter = NonConformite.objects.exclude(statut=NonConformite.Statut.VERIFIEE)

        return {
            "role": "DIRECTEUR",
            "missions": compter_missions(Mission.objects.all()),
            "rapports_en_attente": Rapport.objects.filter(
                statut=Rapport.Statut.GENERE
            ).count(),
            "non_conformites": {
                "a_traiter": a_traiter.count(),
                "en_retard": a_traiter.filter(
                    statut=NonConformite.Statut.OUVERTE,
                    date_limite_correction__lt=aujourdhui,
                ).count(),
            },
            "sites_par_niveau": niveaux,
            "sites_a_risque": sites_scores[:5],
            "alertes_non_lues": Alerte.objects.filter(
                destinataire=self.request.user, est_lue=False
            ).count(),
        }

    def vue_controleur(self, request):
        mes_missions = Mission.objects.filter(controleur=request.user)
        du_jour = mes_missions.filter(
            date_prevue=timezone.localdate()
        ).exclude(statut=Mission.Statut.CLOTUREE).select_related(
            "site", "controleur", "modele_grille"
        )
        return {
            "role": "CONTROLEUR",
            "missions": compter_missions(mes_missions),
            "missions_du_jour": MissionSerializer(du_jour, many=True).data,
            # Ce qui l'attend : des rapports rejetés à corriger, des défauts à vérifier sur place
            "rapports_a_corriger": Rapport.objects.filter(
                mission__controleur=request.user, statut=Rapport.Statut.REJETE
            ).count(),
            "non_conformites_a_verifier": NonConformite.objects.filter(
                statut=NonConformite.Statut.CORRIGEE,
                site__missions__controleur=request.user,
            )
            .distinct()
            .count(),
            "notifications_non_lues": Notification.objects.filter(
                destinataire=request.user, est_lue=False
            ).count(),
        }


# ---------------------------------------------------------------------------
# Notifications (la cloche du menu)
# ---------------------------------------------------------------------------

NOMBRE_AFFICHE = 50  # la cloche montre les 50 plus récentes


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "message", "date_envoi", "est_lue"]
        read_only_fields = fields


def _non_lues(utilisateur):
    return Notification.objects.filter(destinataire=utilisateur, est_lue=False).count()


class NotificationListeView(APIView):
    """Les notifications de la personne connectée, les plus récentes d'abord."""

    def get(self, request):
        notifications = Notification.objects.filter(destinataire=request.user).order_by(
            "-date_envoi", "-id"
        )[:NOMBRE_AFFICHE]
        return Response(
            {
                "non_lues": _non_lues(request.user),
                "notifications": NotificationSerializer(notifications, many=True).data,
            }
        )


class NotificationLueView(APIView):
    """Marquer une notification comme lue (uniquement la sienne)."""

    def post(self, request, pk):
        notification = get_object_or_404(
            Notification, pk=pk, destinataire=request.user
        )
        if not notification.est_lue:
            notification.est_lue = True
            notification.save(update_fields=["est_lue"])
        return Response({"non_lues": _non_lues(request.user)})


class ToutLireView(APIView):
    """Marquer toutes ses notifications comme lues."""

    def post(self, request):
        Notification.objects.filter(destinataire=request.user, est_lue=False).update(
            est_lue=True
        )
        return Response({"non_lues": 0})