from django.contrib import admin

from .models import Convention, Echeance, JournalConvention, Paiement, Relance


class EcheanceInline(admin.TabularInline):
    model = Echeance
    extra = 0
    fields = ("date_echeance", "montant_du", "numero_facture", "date_facture", "statut")
    readonly_fields = ("statut",)


class PaiementInline(admin.TabularInline):
    model = Paiement
    extra = 0
    fields = (
        "date_paiement",
        "montant",
        "mode",
        "reference",
        "justificatif",
        "enregistre_par",
    )


@admin.register(Convention)
class ConventionAdmin(admin.ModelAdmin):
    list_display = (
        "reference",
        "partenaire",
        "site",
        "statut",
        "montant_periodique",
        "periodicite",
        "date_debut",
        "date_fin",
    )
    list_filter = ("statut", "periodicite")
    search_fields = ("reference", "partenaire__nom", "site__nom")
    # Le numéro est généré automatiquement à l'enregistrement
    readonly_fields = ("reference",)
    inlines = [EcheanceInline]


@admin.register(Echeance)
class EcheanceAdmin(admin.ModelAdmin):
    list_display = (
        "convention",
        "date_echeance",
        "montant_du",
        "statut",
        "numero_facture",
    )
    list_filter = ("statut",)
    search_fields = ("convention__reference", "numero_facture")
    readonly_fields = ("statut",)
    inlines = [PaiementInline]


@admin.register(Paiement)
class PaiementAdmin(admin.ModelAdmin):
    list_display = ("echeance", "date_paiement", "montant", "mode", "enregistre_par")
    list_filter = ("mode",)


@admin.register(Relance)
class RelanceAdmin(admin.ModelAdmin):
    list_display = ("echeance", "type", "date_envoi", "email_envoye")
    list_filter = ("type", "email_envoye")
    # L'historique des relances ne se modifie pas à la main
    readonly_fields = ("echeance", "type", "date_envoi", "email_envoye")


@admin.register(JournalConvention)
class JournalConventionAdmin(admin.ModelAdmin):
    list_display = ("date", "reference_convention", "action", "auteur", "detail")
    list_filter = ("action",)
    search_fields = ("reference_convention", "detail", "auteur__username")
    readonly_fields = (
        "convention",
        "reference_convention",
        "action",
        "detail",
        "auteur",
        "date",
    )

    # L'historique est une trace : on ne l'ajoute, ne le modifie ni ne le supprime à la main
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False