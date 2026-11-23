from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Utilisateur


@admin.register(Utilisateur)
class UtilisateurAdmin(UserAdmin):
    list_display = ("username", "first_name", "last_name", "role", "matricule", "is_active")
    list_filter = ("role", "is_active")
    fieldsets = UserAdmin.fieldsets + (
        ("Informations du système", {"fields": ("role", "telephone", "matricule")}),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ("Informations du système", {"fields": ("role", "telephone", "matricule")}),
    )
    from django.contrib import admin

from .models import CarteProfessionnelle


@admin.register(CarteProfessionnelle)
class CarteProfessionnelleAdmin(admin.ModelAdmin):
    list_display = ("numero", "controleur", "date_delivrance", "date_expiration")
    search_fields = ("numero", "controleur__username", "controleur__last_name")