def prochain_numero(prefixe, annee, valeurs_existantes, largeur):
    """Numéro suivant de la forme PREFIXE-ANNEE-0001 : plus grand numéro de
    l'année + 1 (donc pas de doublon, même après une suppression)."""
    debut = f"{prefixe}-{annee}-"
    maximum = 0
    for valeur in valeurs_existantes:
        if valeur and valeur.startswith(debut):
            suite = valeur[len(debut):]
            if suite.isdigit():
                maximum = max(maximum, int(suite))
    return f"{debut}{maximum + 1:0{largeur}d}"