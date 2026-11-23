from django.contrib import admin

from .models import (
    CritereControle,
    ElementInventaire,
    ModeleGrille,
    ParametreScore,
    Partenaire,
    Site,
    TypeSite,
)


@admin.register(Partenaire)
class PartenaireAdmin(admin.ModelAdmin):
    list_display = ("nom", "contact", "telephone", "email")
    search_fields = ("nom", "contact")


@admin.register(TypeSite)
class TypeSiteAdmin(admin.ModelAdmin):
    list_display = ("libelle", "description")


class ElementInventaireInline(admin.TabularInline):
    model = ElementInventaire
    extra = 1


@admin.register(Site)
class SiteAdmin(admin.ModelAdmin):
    list_display = ("nom", "type_site", "partenaire", "localisation", "est_actif")
    list_filter = ("type_site", "est_actif", "partenaire")
    search_fields = ("nom", "localisation")
    inlines = [ElementInventaireInline]


class CritereControleInline(admin.TabularInline):
    model = CritereControle
    extra = 1


@admin.register(ModeleGrille)
class ModeleGrilleAdmin(admin.ModelAdmin):
    list_display = ("nom", "type_site", "est_actif")
    list_filter = ("type_site", "est_actif")
    inlines = [CritereControleInline]


@admin.register(ParametreScore)
class ParametreScoreAdmin(admin.ModelAdmin):
    list_display = ("cle", "libelle", "valeur", "date_modification")