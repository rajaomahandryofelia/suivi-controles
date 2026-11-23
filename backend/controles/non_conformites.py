import logging
import time as horloge

from django.db import transaction
from django.utils import timezone
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from comptes.models import Utilisateur
from comptes.permissions import est_directeur
from suivi.models import Notification
from suivi.notifications import notifier, notifier_non_conformite_corrigee

from .models import EvenementNonConformite, Mission, NonConformite
from .regles_non_conformites import enregistrer_evenement

journal = logging.getLogger(__name__)

# L'alerte de retard est déclenchée par les requêtes du Directeur, au plus une fois par minute
INTERVALLE_ALERTES_SECONDES = 60
_derniere_alerte = 0.0


def alerter_non_conformites_en_retard():
    """Prévient une seule fois chaque Directeur quand une non-conformité ouverte
    dépasse son délai de correction. Ne lève jamais d'erreur.

    Le message contient la date limite : si la non-conformité est rouverte avec un
    nouveau délai, une nouvelle alerte partira quand ce nouveau délai sera dépassé."""
    global _derniere_alerte

    maintenant = horloge.monotonic()
    if maintenant - _derniere_alerte < INTERVALLE_ALERTES_SECONDES:
        return
    _derniere_alerte = maintenant

    try:
        en_retard = list(
            NonConformite.objects.filter(
                statut=NonConformite.Statut.OUVERTE,
                date_limite_correction__lt=timezone.localdate(),
            ).select_related("site")
        )
        if not en_retard:
            return

        directeurs = list(
            Utilisateur.objects.filter(role=Utilisateur.Role.DIRECTEUR, is_active=True)
        )
        for nc in en_retard:
            # Commence par « Non-conformité » : la cloche ouvre alors la bonne page
            message = (
                f"Non-conformité en retard sur « {nc.site.nom} » : {nc.description[:100]}. "
                f"Le délai de correction était fixé au {nc.date_limite_correction:%d/%m/%Y}."
            )
            for directeur in directeurs:
                deja_prevenu = Notification.objects.filter(
                    destinataire=directeur, message=message
                ).exists()
                if not deja_prevenu:
                    notifier(directeur, message)
    except Exception:
        journal.exception("Alerte des non-conformités en retard impossible")


class EvenementSerializer(serializers.ModelSerializer):
    """Une ligne de l'historique : constat, relance, correction, vérification, réouverture."""

    type_libelle = serializers.CharField(source="get_type_display", read_only=True)
    moyen_libelle = serializers.CharField(source="get_moyen_display", read_only=True)
    auteur_nom = serializers.SerializerMethodField()

    class Meta:
        model = EvenementNonConformite
        fields = [
            "id",
            "type",
            "type_libelle",
            "date",
            "auteur_nom",
            "moyen",
            "moyen_libelle",
            "commentaire",
        ]
        read_only_fields = fields

    def get_auteur_nom(self, evenement):
        auteur = evenement.auteur
        if auteur is None:
            return None
        return auteur.get_full_name() or auteur.get_username()


class NonConformiteSerializer(serializers.ModelSerializer):
    site_nom = serializers.CharField(source="site.nom", read_only=True)
    site_localisation = serializers.CharField(source="site.localisation", read_only=True)
    # Le Directeur doit pouvoir joindre le partenaire du site pour qu'il répare
    partenaire_nom = serializers.CharField(
        source="site.partenaire.nom", read_only=True, allow_null=True
    )
    partenaire_contact = serializers.CharField(
        source="site.partenaire.contact", read_only=True, allow_null=True
    )
    partenaire_telephone = serializers.CharField(
        source="site.partenaire.telephone", read_only=True, allow_null=True
    )
    partenaire_email = serializers.CharField(
        source="site.partenaire.email", read_only=True, allow_null=True
    )
    mission = serializers.IntegerField(source="reponse.mission_id", read_only=True)
    critere_libelle = serializers.CharField(source="reponse.critere.libelle", read_only=True)
    gravite_libelle = serializers.CharField(source="get_gravite_display", read_only=True)
    statut_libelle = serializers.CharField(source="get_statut_display", read_only=True)
    detecte_par = serializers.SerializerMethodField()
    en_retard = serializers.SerializerMethodField()
    jours_de_retard = serializers.SerializerMethodField()
    # La vérification se fait sur place : quand le site sera-t-il revu, et par qui ?
    prochain_controle = serializers.SerializerMethodField()
    prochain_controleur = serializers.SerializerMethodField()
    # Les preuves : photos prises au constat et rapport PDF de la mission qui l'a constatée
    photos = serializers.SerializerMethodField()
    rapport_pdf = serializers.SerializerMethodField()
    # Le parcours : relances, correction, vérification, réouvertures
    historique = serializers.SerializerMethodField()
    nb_relances = serializers.SerializerMethodField()
    derniere_relance = serializers.SerializerMethodField()

    class Meta:
        model = NonConformite
        fields = [
            "id",
            "site",
            "site_nom",
            "site_localisation",
            "partenaire_nom",
            "partenaire_contact",
            "partenaire_telephone",
            "partenaire_email",
            "mission",
            "critere_libelle",
            "description",
            "gravite",
            "gravite_libelle",
            "statut",
            "statut_libelle",
            "detecte_par",
            "date_detection",
            "date_limite_correction",
            "date_correction",
            "date_verification",
            "nombre_reouvertures",
            "en_retard",
            "jours_de_retard",
            "prochain_controle",
            "prochain_controleur",
            "photos",
            "rapport_pdf",
            "historique",
            "nb_relances",
            "derniere_relance",
        ]
        read_only_fields = fields

    def get_detecte_par(self, nc):
        c = nc.reponse.mission.controleur
        return c.get_full_name() or c.get_username()

    def _jours_de_retard(self, nc):
        # En retard : pas encore corrigée et le délai est dépassé
        if nc.statut != NonConformite.Statut.OUVERTE:
            return 0
        return max((timezone.localdate() - nc.date_limite_correction).days, 0)

    def get_en_retard(self, nc):
        return self._jours_de_retard(nc) > 0

    def get_jours_de_retard(self, nc):
        return self._jours_de_retard(nc)

    def _url(self, fichier):
        request = self.context.get("request")
        url = fichier.url
        return request.build_absolute_uri(url) if request else url

    def get_photos(self, nc):
        return [
            {
                "id": photo.id,
                "url": self._url(photo.fichier),
                "legende": photo.legende,
                "date_capture": photo.date_capture.isoformat(),
            }
            for photo in nc.reponse.photos.all()
        ]

    def get_rapport_pdf(self, nc):
        mission = nc.reponse.mission
        rapport = getattr(mission, "rapport", None)
        if rapport is None or not rapport.fichier_pdf:
            return None
        # Comme pour la liste des rapports : un contrôleur n'ouvre que ses propres rapports
        request = self.context.get("request")
        if request is not None and not (
            est_directeur(request.user) or mission.controleur_id == request.user.id
        ):
            return None
        return self._url(rapport.fichier_pdf)

    def _prochain(self, nc):
        return self.context.get("prochains", {}).get(nc.site_id)

    def get_prochain_controle(self, nc):
        prochain = self._prochain(nc)
        return prochain[0].isoformat() if prochain else None

    def get_prochain_controleur(self, nc):
        prochain = self._prochain(nc)
        return prochain[1] if prochain else None

    def _evenements(self, nc):
        # Déjà chargés par prefetch_related dans la vue : pas de requête en plus
        return list(nc.evenements.all())

    def get_historique(self, nc):
        return EvenementSerializer(self._evenements(nc), many=True).data

    def get_nb_relances(self, nc):
        return sum(
            1 for e in self._evenements(nc) if e.type == EvenementNonConformite.Type.RELANCEE
        )

    def get_derniere_relance(self, nc):
        dates = [
            e.date
            for e in self._evenements(nc)
            if e.type == EvenementNonConformite.Type.RELANCEE
        ]
        return max(dates).isoformat() if dates else None


class RelanceSerializer(serializers.Serializer):
    """Ce que le Directeur note quand il relance le partenaire."""

    moyen = serializers.ChoiceField(choices=EvenementNonConformite.Moyen.choices)
    commentaire = serializers.CharField(max_length=500, required=False, allow_blank=True)


class NonConformiteViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """Suivi des non-conformités.

    - Le Directeur voit toutes les non-conformités, note ses relances auprès du
      partenaire et marque « corrigée » celles que le partenaire a réparées.
    - Un contrôleur voit celles des sites où il a une mission, en lecture seule :
      il les vérifie lors de son contrôle suivant (la vérification s'applique
      quand le Directeur valide le rapport de ce contrôle).
    """

    # Requis par le routeur pour nommer les routes ; la vraie requête est dans get_queryset()
    queryset = NonConformite.objects.all()
    serializer_class = NonConformiteSerializer

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        # Un délai dépassé prévient le Directeur (une seule fois par non-conformité)
        if est_directeur(request.user):
            alerter_non_conformites_en_retard()

    def get_queryset(self):
        non_conformites = (
            NonConformite.objects.select_related(
                "site__partenaire",
                "reponse__critere",
                "reponse__mission__controleur",
                "reponse__mission__rapport",
            )
            .prefetch_related("reponse__photos", "evenements__auteur")
            .order_by("date_limite_correction", "id")
        )

        user = self.request.user
        if not est_directeur(user):
            non_conformites = non_conformites.filter(
                site__missions__controleur=user
            ).distinct()

        # Filtres facultatifs : ?statut=OUVERTE  ?site=3  ?en_retard=1
        parametres = self.request.query_params
        if parametres.get("statut"):
            non_conformites = non_conformites.filter(statut=parametres["statut"])
        if parametres.get("site", "").isdigit():
            non_conformites = non_conformites.filter(site_id=int(parametres["site"]))
        if parametres.get("en_retard") == "1":
            non_conformites = non_conformites.filter(
                statut=NonConformite.Statut.OUVERTE,
                date_limite_correction__lt=timezone.localdate(),
            )
        return non_conformites

    def get_serializer_context(self):
        """Pour chaque site : la prochaine mission prévue ou en cours.

        Le Directeur voit celle de n'importe quel contrôleur ; un contrôleur ne voit
        que ses propres missions (c'est lui qui vérifiera sur place)."""
        contexte = super().get_serializer_context()
        missions = Mission.objects.filter(
            statut__in=[Mission.Statut.PLANIFIEE, Mission.Statut.EN_COURS]
        ).select_related("controleur")
        if not est_directeur(self.request.user):
            missions = missions.filter(controleur=self.request.user)

        prochains = {}
        for mission in missions.order_by("date_prevue", "heure_prevue", "id"):
            if mission.site_id not in prochains:
                c = mission.controleur
                prochains[mission.site_id] = (
                    mission.date_prevue,
                    c.get_full_name() or c.get_username(),
                )
        contexte["prochains"] = prochains
        return contexte

    @action(detail=True, methods=["post"])
    def relancer(self, request, pk=None):
        """Le Directeur a contacté le partenaire : on garde la trace du moyen utilisé
        et de ce qui a été répondu."""
        if not est_directeur(request.user):
            raise PermissionDenied("Seul le Directeur peut relancer un partenaire.")

        nc = self.get_object()
        if nc.statut != NonConformite.Statut.OUVERTE:
            return Response(
                {"detail": "Seule une non-conformité ouverte peut donner lieu à une relance."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        donnees = RelanceSerializer(data=request.data)
        donnees.is_valid(raise_exception=True)

        enregistrer_evenement(
            nc,
            EvenementNonConformite.Type.RELANCEE,
            auteur=request.user,
            commentaire=donnees.validated_data.get("commentaire", "").strip(),
            moyen=donnees.validated_data["moyen"],
        )
        # On relit la non-conformité pour renvoyer l'historique à jour
        return Response(self.get_serializer(self.get_object()).data)

    @action(detail=True, methods=["post"])
    def corriger(self, request, pk=None):
        """Le partenaire a réparé : le Directeur marque la non-conformité « corrigée »."""
        if not est_directeur(request.user):
            raise PermissionDenied("Seul le Directeur peut marquer une non-conformité corrigée.")

        nc = self.get_object()
        if nc.statut != NonConformite.Statut.OUVERTE:
            return Response(
                {"detail": "Seule une non-conformité ouverte peut être marquée corrigée."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            nc.statut = NonConformite.Statut.CORRIGEE
            nc.date_correction = timezone.localdate()
            nc.save(update_fields=["statut", "date_correction"])
            enregistrer_evenement(
                nc,
                EvenementNonConformite.Type.CORRIGEE,
                auteur=request.user,
                commentaire="Le partenaire annonce avoir réparé. À vérifier sur place.",
            )

        notifier_non_conformite_corrigee(nc)
        return Response(self.get_serializer(self.get_object()).data)