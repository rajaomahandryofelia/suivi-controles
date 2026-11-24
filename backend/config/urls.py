from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("comptes.urls")),
    path("api/referentiels/", include("referentiels.urls")),
    path("api/controles/", include("controles.urls")),
    path("api/suivi/", include("suivi.urls")),
    path("api/conventions/", include("conventions.urls")),
    path("api/incidents/", include("incidents.urls")),
]

# En développement, servir les fichiers envoyés (photos, rapports PDF)
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)