from decimal import Decimal

from django.http import HttpResponse
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from comptes.permissions import DirecteurOuLectureSeule, est_directeur

from .documents import (
    ar,
    generer_etat_paiement_pdf,
    generer_facture_pdf,
    generer_recu_pdf,
    numero_recu,
)
from .emails import envoyer_facture, envoyer_recu
from .journal import journaliser
from .models import Convention, Echeance, JournalConvention, Paiement
from .relances import executer_si_necessaire, executer_tout
from .serializers import (
    AnnulationSerializer,
    ConventionSerializer,
    EcheanceSerializer,
    JournalSerializer,
    JustificatifSerializer,
    PaiementSerializer,
)
from .services import generer_echeances, numero_facture_suivant

Action = JournalConvention.Action

# Changements de statut autorisés
TRANSITIONS = {
    Convention.Statut.BROUILLON: [Convention.Statut.ENVOYEE],
    Convention.Statut.ENVOYEE: [Convention.Statut.ACTIVE],
    Convention.Statut.ACTIVE: [Convention.Statut.SUSPENDUE, Convention.Statut.EXPIREE],
    Convention.Statut.SUSPENDUE: [Convention.Statut.ACTIVE, Convention.Statut.EXPIREE],
    Convention.Statut.EXPIREE: [],
}

# Champs d'une convention dont la modification est inscrite dans l'historique
CHAMPS_SUIVIS = {
    "montant_periodique": "montant",
    "periodicite": "périodicité",
    "date_debut": "date de début",
    "date_fin": "date de fin",
    "date_signature": "date de signature",
    "partenaire_id": "partenaire",
    "site_id": "site",
}


def _reponse_pdf(contenu, nom_fichier):
    """Un PDF affiché directement dans le navigateur."""
    reponse = HttpResponse(contenu, content_type="application/pdf")
    reponse["Content-Disposition"] = f'inline; filename="{nom_fichier}"'
    return reponse


def _exiger_directeur(request):
    if not est_directeur(request.user):
        raise PermissionDenied("L'historique est réservé au Directeur.")


class ConventionViewSet(viewsets.ModelViewSet):
    """Conventions avec les partenaires.

    Tout utilisateur connecté consulte (le contrôleur voit l'état des paiements) ;
    seul le Directeur crée et modifie."""

    serializer_class = ConventionSerializer
    permission_classes = [DirecteurOuLectureSeule]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        # Relances et expirations du jour (seulement si RELANCES_AUTOMATIQUES = True)
        executer_si_necessaire()

    def get_queryset(self):
        conventions = Convention.objects.select_related("partenaire", "site")
        # Filtres facultatifs : ?statut=ACTIVE&partenaire=1&site=2
        for champ in ("statut", "partenaire", "site"):
            valeur = self.request.query_params.get(champ)
            if valeur:
                conventions = conventions.filter(**{champ: valeur})
        return conventions

    def perform_create(self, serializer):
        convention = serializer.save(cree_par=self.request.user)
        journaliser(
            convention,
            Action.CREEE,
            self.request.user,
            f"Pour {convention.partenaire.nom}, site {convention.site.nom}",
        )

    def perform_update(self, serializer):
        avant = {c: getattr(serializer.instance, c) for c in CHAMPS_SUIVIS}
        convention = serializer.save()
        modifies = [
            libelle
            for champ, libelle in CHAMPS_SUIVIS.items()
            if avant[champ] != getattr(convention, champ)
        ]
        if modifies:
            journaliser(
                convention,
                Action.MODIFIEE,
                self.request.user,
                "Modifié : " + ", ".join(modifies),
            )

    def destroy(self, request, *args, **kwargs):
        convention = self.get_object()
        if convention.statut != Convention.Statut.BROUILLON:
            raise ValidationError(
                {"detail": "Seule une convention en brouillon peut être supprimée."}
            )
        reference = convention.reference
        detail = f"Pour {convention.partenaire.nom}, site {convention.site.nom}"
        reponse = super().destroy(request, *args, **kwargs)
        # La convention n'existe plus : la ligne garde seulement sa référence
        journaliser(None, Action.SUPPRIMEE, request.user, detail, reference=reference)
        return reponse

    @action(detail=True, methods=["post"], url_path="changer-statut")
    def changer_statut(self, request, pk=None):
        convention = self.get_object()
        nouveau = request.data.get("statut")

        if nouveau not in TRANSITIONS[convention.statut]:
            raise ValidationError(
                {
                    "detail": (
                        f"Impossible de passer de « {convention.get_statut_display()} » "
                        f"à « {nouveau} »."
                    )
                }
            )
        if nouveau == Convention.Statut.ACTIVE and not convention.date_signature:
            raise ValidationError(
                {"detail": "Renseignez la date de signature avant d'activer la convention."}
            )

        ancien_libelle = convention.get_statut_display()
        convention.statut = nouveau
        convention.save(update_fields=["statut"])
        journaliser(
            convention,
            Action.STATUT,
            request.user,
            f"De « {ancien_libelle} » à « {convention.get_statut_display()} »",
        )
        return Response(self.get_serializer(convention).data)

    @action(detail=True, methods=["post"], url_path="generer-echeances")
    def generer_echeances(self, request, pk=None):
        convention = self.get_object()
        try:
            nombre = generer_echeances(convention)
        except ValueError as erreur:
            raise ValidationError({"detail": str(erreur)})
        if nombre:
            journaliser(
                convention,
                Action.ECHEANCES,
                request.user,
                f"{nombre} échéance(s) créée(s)",
            )
        return Response(
            {"creees": nombre}, status=status.HTTP_201_CREATED if nombre else status.HTTP_200_OK
        )

    @action(detail=True, methods=["get"])
    def historique(self, request, pk=None):
        """Historique des actions de cette convention (Directeur)."""
        _exiger_directeur(request)
        convention = self.get_object()
        lignes = convention.journal.select_related("auteur")
        return Response(JournalSerializer(lignes, many=True).data)

    @action(detail=False, methods=["get"])
    def journal(self, request):
        """Historique de toutes les conventions, les plus récentes d'abord (Directeur).
        Filtres facultatifs : ?action=STATUT&auteur=3 ; 200 lignes au plus."""
        _exiger_directeur(request)
        lignes = JournalConvention.objects.select_related("auteur")
        for champ in ("action", "auteur"):
            valeur = request.query_params.get(champ)
            if valeur:
                lignes = lignes.filter(**{champ: valeur})
        return Response(JournalSerializer(lignes[:200], many=True).data)

    @action(detail=False, methods=["post"], url_path="executer-relances")
    def executer_relances(self, request):
        """Lance les relances et les expirations maintenant (Directeur).
        Avec ?simuler=1, montre seulement ce qui serait fait."""
        simuler = request.query_params.get("simuler") in ("1", "true", "oui")
        return Response(executer_tout(simuler=simuler))

    @action(detail=True, methods=["get"], url_path="etat-paiement")
    def etat_paiement(self, request, pk=None):
        """État de paiement de la convention en PDF (comme un onglet du tableau Excel)."""
        convention = self.get_object()
        pdf = generer_etat_paiement_pdf(convention)
        reponse = HttpResponse(pdf, content_type="application/pdf")
        reponse["Content-Disposition"] = (
            f'inline; filename="etat-paiement-{convention.reference}.pdf"'
        )
        return reponse

    @action(detail=False, methods=["get"])
    def resume(self, request):
        """Équivalent du tableau Excel : par convention, le dû, le payé et les arriérés."""
        conventions = self.get_queryset().exclude(
            statut__in=[Convention.Statut.BROUILLON, Convention.Statut.ENVOYEE]
        )
        lignes = []
        total_arrieres = Decimal("0")
        for convention in conventions:
            arrieres = convention.arrieres
            total_arrieres += arrieres
            lignes.append(
                {
                    "convention": convention.id,
                    "reference": convention.reference,
                    "partenaire": convention.partenaire.nom,
                    "site": convention.site.nom,
                    "statut": convention.statut,
                    "total_du": convention.total_du,
                    "total_paye": convention.total_paye,
                    "arrieres": arrieres,
                }
            )
        return Response({"lignes": lignes, "total_arrieres": total_arrieres})


class EcheanceViewSet(viewsets.ModelViewSet):
    """Échéances d'une convention (et leur facture)."""

    serializer_class = EcheanceSerializer
    permission_classes = [DirecteurOuLectureSeule]

    def get_queryset(self):
        echeances = Echeance.objects.select_related("convention").prefetch_related(
            "paiements", "relances"
        )
        # Filtres facultatifs : ?convention=1&statut=NON_PAYE
        for champ in ("convention", "statut"):
            valeur = self.request.query_params.get(champ)
            if valeur:
                echeances = echeances.filter(**{champ: valeur})
        return echeances

    # La facture part automatiquement par e-mail dès qu'un numéro de facture est saisi
    def perform_create(self, serializer):
        echeance = serializer.save()
        if not echeance.numero_facture:
            journaliser(
                echeance.convention,
                Action.MODIFIEE,
                self.request.user,
                f"Échéance du {echeance.date_echeance:%d/%m/%Y} ajoutée "
                f"({ar(echeance.montant_du)})",
            )
        if echeance.numero_facture:
            journaliser(
                echeance.convention,
                Action.FACTUREE,
                self.request.user,
                f"Facture {echeance.numero_facture} saisie pour l'échéance du "
                f"{echeance.date_echeance:%d/%m/%Y}",
            )
            envoyer_facture(echeance)

    def perform_update(self, serializer):
        ancien_numero = serializer.instance.numero_facture
        ancien_montant = serializer.instance.montant_du
        ancienne_date = serializer.instance.date_echeance
        echeance = serializer.save()
        # Le montant dû a pu changer : le statut (payé, partiel…) est recalculé
        echeance.recalculer_statut()
        if echeance.montant_du != ancien_montant or echeance.date_echeance != ancienne_date:
            journaliser(
                echeance.convention,
                Action.MODIFIEE,
                self.request.user,
                f"Échéance du {ancienne_date:%d/%m/%Y} modifiée : "
                f"{echeance.date_echeance:%d/%m/%Y}, {ar(echeance.montant_du)}",
            )
        if echeance.numero_facture and echeance.numero_facture != ancien_numero:
            journaliser(
                echeance.convention,
                Action.FACTUREE,
                self.request.user,
                f"Facture {echeance.numero_facture} saisie pour l'échéance du "
                f"{echeance.date_echeance:%d/%m/%Y}",
            )
            envoyer_facture(echeance)

    def perform_destroy(self, instance):
        # Une échéance qui a des paiements (même annulés) ne se supprime pas :
        # on perdrait leur trace
        if instance.paiements.exists():
            raise ValidationError(
                {
                    "detail": (
                        "Cette échéance a des paiements (même annulés) : "
                        "elle ne peut pas être supprimée."
                    )
                }
            )
        convention = instance.convention
        detail = f"Échéance du {instance.date_echeance:%d/%m/%Y} supprimée"
        instance.delete()
        journaliser(convention, Action.MODIFIEE, self.request.user, detail)

    @action(detail=True, methods=["get"], url_path="facture-pdf")
    def facture_pdf(self, request, pk=None):
        """La facture de l'échéance en PDF."""
        echeance = self.get_object()
        if not echeance.numero_facture:
            raise ValidationError({"detail": "Cette échéance n'a pas encore de facture."})
        return _reponse_pdf(
            generer_facture_pdf(echeance), f"facture-{echeance.numero_facture}.pdf"
        )

    @action(detail=True, methods=["post"])
    def facturer(self, request, pk=None):
        """Émettre la facture : numéro FAC-AAAA-NNNN et date générés automatiquement,
        puis envoi par e-mail au partenaire."""
        echeance = self.get_object()
        if echeance.numero_facture:
            raise ValidationError(
                {"detail": f"Cette échéance est déjà facturée (N° {echeance.numero_facture})."}
            )
        if echeance.convention.statut in (
            Convention.Statut.BROUILLON,
            Convention.Statut.ENVOYEE,
        ):
            raise ValidationError({"detail": "Cette convention n'est pas encore active."})

        echeance.numero_facture = numero_facture_suivant()
        echeance.date_facture = timezone.localdate()
        echeance.save(update_fields=["numero_facture", "date_facture"])
        journaliser(
            echeance.convention,
            Action.FACTUREE,
            request.user,
            f"Facture {echeance.numero_facture} émise pour l'échéance du "
            f"{echeance.date_echeance:%d/%m/%Y}",
        )

        envoyer_facture(echeance)
        echeance.refresh_from_db()
        return Response(self.get_serializer(echeance).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="envoyer-facture")
    def envoyer_facture(self, request, pk=None):
        """Envoyer (ou renvoyer) la facture au partenaire."""
        echeance = self.get_object()
        if not echeance.numero_facture:
            raise ValidationError({"detail": "Cette échéance n'a pas encore de numéro de facture."})
        if not echeance.convention.partenaire.email:
            raise ValidationError({"detail": "Le partenaire n'a pas d'adresse e-mail enregistrée."})
        if not envoyer_facture(echeance):
            raise ValidationError({"detail": "L'e-mail n'a pas pu être envoyé. Réessayez plus tard."})
        echeance.refresh_from_db()
        return Response(self.get_serializer(echeance).data)


class PaiementViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """Paiements : on les enregistre, ou on les annule avec un motif.

    Un paiement n'est jamais supprimé ni modifié : une erreur se corrige en annulant
    le paiement (la ligne reste visible, barrée) puis en ressaisissant le bon."""

    serializer_class = PaiementSerializer
    permission_classes = [DirecteurOuLectureSeule]
    # JSON pour un paiement seul, multipart quand un fichier est joint
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        paiements = Paiement.objects.select_related(
            "echeance__convention", "enregistre_par", "annule_par"
        )
        echeance = self.request.query_params.get("echeance")
        if echeance:
            paiements = paiements.filter(echeance=echeance)
        return paiements

    # Le reçu part automatiquement par e-mail dès que le paiement est enregistré
    def perform_create(self, serializer):
        paiement = serializer.save(enregistre_par=self.request.user)
        journaliser(
            paiement.echeance.convention,
            Action.PAIEMENT,
            self.request.user,
            f"Reçu {paiement.numero_recu} : {ar(paiement.montant)} "
            f"({paiement.get_mode_display()}) pour l'échéance du "
            f"{paiement.echeance.date_echeance:%d/%m/%Y}",
        )
        envoyer_recu(paiement)

    @action(detail=True, methods=["post"])
    def annuler(self, request, pk=None):
        """Annuler un paiement. Le motif est obligatoire ; la ligne reste visible
        et n'entre plus dans les totaux (payé, reste à payer, arriérés)."""
        paiement = self.get_object()
        if paiement.est_annule:
            raise ValidationError({"detail": "Ce paiement est déjà annulé."})

        donnees = AnnulationSerializer(data=request.data)
        donnees.is_valid(raise_exception=True)
        motif = donnees.validated_data["motif"]

        paiement.est_annule = True
        paiement.date_annulation = timezone.now()
        paiement.annule_par = request.user
        paiement.motif_annulation = motif
        paiement.save()  # recalcule aussi le statut de l'échéance

        journaliser(
            paiement.echeance.convention,
            Action.PAIEMENT_ANNULE,
            request.user,
            f"Reçu {paiement.numero_recu or paiement.pk} de {ar(paiement.montant)} "
            f"annulé. Motif : {motif}",
        )
        return Response(self.get_serializer(paiement).data)

    @action(detail=True, methods=["get"], url_path="recu-pdf")
    def recu_pdf(self, request, pk=None):
        """Le reçu du paiement en PDF (marqué « ANNULÉ » si le paiement l'est)."""
        paiement = self.get_object()
        return _reponse_pdf(generer_recu_pdf(paiement), f"{numero_recu(paiement)}.pdf")

    @action(
        detail=True,
        methods=["post", "delete"],
        parser_classes=[MultiPartParser, FormParser],
    )
    def justificatif(self, request, pk=None):
        """POST : joindre (ou remplacer) la copie du chèque ou de l'ordre de virement.
        DELETE : retirer la pièce jointe."""
        paiement = self.get_object()
        if paiement.est_annule:
            raise ValidationError(
                {"detail": "Ce paiement est annulé : sa pièce ne peut plus changer."}
            )

        if request.method == "DELETE":
            if not paiement.justificatif:
                raise ValidationError({"detail": "Ce paiement n'a pas de pièce jointe."})
            paiement.justificatif.delete(save=True)
            journaliser(
                paiement.echeance.convention,
                Action.JUSTIFICATIF,
                request.user,
                f"Pièce retirée du paiement de {ar(paiement.montant)} "
                f"du {paiement.date_paiement:%d/%m/%Y}",
            )
            return Response(self.get_serializer(paiement).data)

        donnees = JustificatifSerializer(data=request.data)
        donnees.is_valid(raise_exception=True)

        # Un nouveau fichier remplace l'ancien, qui ne reste pas sur le disque
        if paiement.justificatif:
            paiement.justificatif.delete(save=False)
        paiement.justificatif = donnees.validated_data["justificatif"]
        paiement.save(update_fields=["justificatif"])
        journaliser(
            paiement.echeance.convention,
            Action.JUSTIFICATIF,
            request.user,
            f"Pièce jointe au paiement de {ar(paiement.montant)} "
            f"du {paiement.date_paiement:%d/%m/%Y}",
        )
        return Response(self.get_serializer(paiement).data)

    @action(detail=True, methods=["post"], url_path="envoyer-recu")
    def envoyer_recu(self, request, pk=None):
        """Envoyer (ou renvoyer) le reçu au partenaire."""
        paiement = self.get_object()
        if paiement.est_annule:
            raise ValidationError({"detail": "Ce paiement est annulé : aucun reçu à envoyer."})
        if not paiement.echeance.convention.partenaire.email:
            raise ValidationError({"detail": "Le partenaire n'a pas d'adresse e-mail enregistrée."})
        if not envoyer_recu(paiement):
            raise ValidationError({"detail": "L'e-mail n'a pas pu être envoyé. Réessayez plus tard."})
        paiement.refresh_from_db()
        return Response(self.get_serializer(paiement).data)