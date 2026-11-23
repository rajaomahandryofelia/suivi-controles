from django.contrib import admin

from .models import (
    Mission,
    NonConformite,
    OrdreMission,
    OrdreRoute,
    Photo,
    Rapport,
    ReponseCritere,
    Tournee,
)


class ReponseCritereInline(admin.TabularInline):
    model = ReponseCritere
    extra = 0


@admin.register(Tournee)
class TourneeAdmin(admin.ModelAdmin):
    list_display = (
        "date", "controleur", "statut", "distance_estimee_km", "duree_estimee_min",
    )
    list_filter = ("statut", "controleur")


@admin.register(OrdreMission)
class OrdreMissionAdmin(admin.ModelAdmin):
    list_display = ("numero", "tournee", "date_emission", "delivre_par")
    search_fields = ("numero",)


@admin.register(OrdreRoute)
class OrdreRouteAdmin(admin.ModelAdmin):
    list_display = ("numero", "tournee", "depart", "destination", "transport", "date_emission")
    search_fields = ("numero", "depart", "destination")


@admin.register(Mission)
class MissionAdmin(admin.ModelAdmin):
    list_display = ("id", "site", "controleur", "date_prevue", "statut", "tournee")
    list_filter = ("statut", "controleur", "site")
    date_hierarchy = "date_prevue"
    inlines = [ReponseCritereInline]


@admin.register(ReponseCritere)
class ReponseCritereAdmin(admin.ModelAdmin):
    list_display = ("mission", "critere", "valeur", "est_conforme")
    list_filter = ("est_conforme",)


@admin.register(Photo)
class PhotoAdmin(admin.ModelAdmin):
    list_display = ("id", "date_capture", "reponse", "element_inventaire")


@admin.register(Rapport)
class RapportAdmin(admin.ModelAdmin):
    list_display = ("mission", "score_conformite", "statut", "directeur", "date_generation")
    list_filter = ("statut",)


@admin.register(NonConformite)
class NonConformiteAdmin(admin.ModelAdmin):
    list_display = ("site", "gravite", "statut", "date_detection", "date_limite_correction")
    list_filter = ("gravite", "statut", "site")