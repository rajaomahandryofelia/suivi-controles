from django.core.management.base import BaseCommand

from suivi.echeances import recalculer_scores_du_jour, signaler_non_conformites_en_retard


class Command(BaseCommand):
    help = (
        "Tâche quotidienne : alerte les Directeurs des non-conformités en retard "
        "et recalcule les scores de risque des sites."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--simuler",
            action="store_true",
            help="Affiche ce qui serait fait, sans rien enregistrer.",
        )

    def handle(self, *args, **options):
        simuler = options["simuler"]
        prefixe = "[simulation] " if simuler else ""

        alertes = signaler_non_conformites_en_retard(simuler=simuler)
        scores = recalculer_scores_du_jour(simuler=simuler)

        self.stdout.write(
            self.style.SUCCESS(
                f"{prefixe}{alertes} alerte(s) de retard, {scores} score(s) recalculé(s)."
            )
        )