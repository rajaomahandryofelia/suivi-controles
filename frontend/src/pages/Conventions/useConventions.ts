import { useCallback, useEffect, useMemo, useState } from "react";
import client from "../../api/client";
import { extraireListe } from "./apiOutils";
import { ouvrirPdf } from "./ouvrirPdf";
import type {
  Convention,
  OptionPartenaire,
  OptionSite,
  StatutConvention,
} from "./typesConventions";

/**
 * Données de la page Conventions : chargement, filtres, recherche,
 * total des arriérés et ouverture de l'état de paiement (PDF).
 */
export function useConventions() {
  const [conventions, setConventions] = useState<Convention[]>([]);
  const [partenaires, setPartenaires] = useState<OptionPartenaire[]>([]);
  const [sites, setSites] = useState<OptionSite[]>([]);
  const [optionsIndisponibles, setOptionsIndisponibles] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [filtre, setFiltre] = useState<StatutConvention | "TOUTES">("TOUTES");
  const [recherche, setRecherche] = useState("");
  const [pdfEnCours, setPdfEnCours] = useState<number | null>(null);

  // (Re)charge la liste : aussi appelée après chaque création, modification ou suppression
  const charger = useCallback(async () => {
    try {
      const reponse = await client.get("/conventions/conventions/");
      setConventions(extraireListe<Convention>(reponse.data));
      setErreur("");
    } catch {
      setErreur("Impossible de charger les conventions.");
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  // Partenaires et sites : nécessaires au formulaire de création et de modification
  useEffect(() => {
    Promise.all([
      client.get("/referentiels/partenaires/"),
      client.get("/referentiels/sites/"),
    ])
      .then(([p, s]) => {
        setPartenaires(extraireListe<OptionPartenaire>(p.data));
        setSites(extraireListe<OptionSite>(s.data));
      })
      .catch(() => setOptionsIndisponibles(true));
  }, []);

  // Total de tous les arriérés, quel que soit le filtre choisi
  const totalArrieres = useMemo(
    () => conventions.reduce((somme, c) => somme + (Number(c.arrieres) || 0), 0),
    [conventions]
  );

  const nombrePour = (valeur: StatutConvention | "TOUTES") =>
    valeur === "TOUTES" ? conventions.length : conventions.filter((c) => c.statut === valeur).length;

  const affichees = useMemo(() => {
    const mot = recherche.trim().toLowerCase();
    return conventions.filter((c) => {
      if (filtre !== "TOUTES" && c.statut !== filtre) return false;
      if (!mot) return true;
      return [c.reference, c.partenaire_nom, c.site_nom].some((texte) =>
        texte.toLowerCase().includes(mot)
      );
    });
  }, [conventions, filtre, recherche]);

  // Ouvre l'état de paiement (PDF) dans un nouvel onglet
  async function ouvrirEtat(convention: Convention) {
    setErreur("");
    setPdfEnCours(convention.id);
    const probleme = await ouvrirPdf(`/conventions/conventions/${convention.id}/etat-paiement/`);
    if (probleme) setErreur(probleme);
    setPdfEnCours(null);
  }

  return {
    conventions,
    partenaires,
    sites,
    optionsIndisponibles,
    chargement,
    erreur,
    filtre,
    setFiltre,
    recherche,
    setRecherche,
    pdfEnCours,
    totalArrieres,
    nombrePour,
    affichees,
    charger,
    ouvrirEtat,
  };
}