from django.core.management.base import BaseCommand

from conventions.relances import executer_tout


class Command(BaseCommand):
    help = (
        "Envoie les rappels et relances de paiement aux partenaires, "
        "et traite les conventions qui expirent."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--simuler",
            action="store_true",
            help="Affiche ce qui serait fait, sans envoyer d'e-mail ni rien modifier.",
        )

    def handle(self, *args, **options):
        stats = executer_tout(simuler=options["simuler"])
        titre = "SIMULATION (rien n'a été envoyé)" if options["simuler"] else "Terminé"
        self.stdout.write(self.style.SUCCESS(titre))
        for cle, valeur in stats.items():
            if cle != "simulation":
                self.stdout.write(f"  {cle} : {valeur}")