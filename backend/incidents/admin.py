from django.contrib import admin

from .models import Incident, PieceJointeIncident


class PieceJointeInline(admin.TabularInline):
    model = PieceJointeIncident
    extra = 0


@admin.register(Incident)
class IncidentAdmin(admin.ModelAdmin):
    list_display = ("id", "site", "type", "service", "gravite", "statut", "date_debut")
    list_filter = ("statut", "gravite", "service", "type")
    search_fields = ("site__nom", "cause_supposee", "observations")
    inlines = [PieceJointeInline]