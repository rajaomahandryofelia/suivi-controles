from django.contrib import admin

from .models import Alerte, Notification, ScoreRisque


@admin.register(ScoreRisque)
class ScoreRisqueAdmin(admin.ModelAdmin):
    list_display = ("site", "valeur", "niveau", "date_calcul")
    list_filter = ("niveau", "site")


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("destinataire", "message", "date_envoi", "est_lue", "envoye_par_email")
    list_filter = ("est_lue", "envoye_par_email")


@admin.register(Alerte)
class AlerteAdmin(admin.ModelAdmin):
    list_display = ("type_alerte", "niveau", "site", "destinataire", "date_envoi")
    list_filter = ("niveau", "type_alerte")