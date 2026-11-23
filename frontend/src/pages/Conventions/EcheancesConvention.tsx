import { useCallback, useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import client from "../../api/client";
import { extraireListe, messageErreur } from "./apiOutils";
import { controlerFichier } from "./echeancesOutils";
import type { FormEcheance, FormPaiement } from "./echeancesOutils";
import FormulaireEcheance from "./FormulaireEcheance";
import FormulairePaiement from "./FormulairePaiement";
import LignePaiement from "./LignePaiement";
import { ouvrirPdf } from "./ouvrirPdf";
import RecapitulatifPaiement from "./RecapitulatifPaiement";
import SyntheseEcheances from "./SyntheseEcheances";
import { aujourdhuiIso, formaterAr, formaterDate, formaterDateHeure } from "./typesConventions";
import type { Convention, Echeance, Paiement } from "./typesConventions";

interface Props {
  convention: Convention;
  // Recharge la liste des conventions (les totaux et les arriérés changent)
  onActualiser: () => Promise<void>;
}

export default function EcheancesConvention({ convention, onActualiser }: Props) {
  // Le partenaire ne paie et n'est facturé que selon une convention envoyée puis active
  const conventionActive = convention.statut !== "BROUILLON" && convention.statut !== "ENVOYEE";

  const [echeances, setEcheances] = useState<Echeance[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [message, setMessage] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [ouverte, setOuverte] = useState<number | null>(null);
  const [formEcheance, setFormEcheance] = useState<FormEcheance | null>(null);
  const [formPaiement, setFormPaiement] = useState<FormPaiement | null>(null);
  // Étape de confirmation : récapitulatif avant d'enregistrer un paiement
  const [recapitulatif, setRecapitulatif] = useState(false);
  // Annulation d'un paiement : le motif est obligatoire
  const [annulation, setAnnulation] = useState<{ id: number; motif: string } | null>(null);
  // Suppression d'une échéance en attente de confirmation
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const recharger = useCallback(async () => {
    try {
      const reponse = await client.get("/conventions/echeances/", {
        params: { convention: convention.id },
      });
      setEcheances(extraireListe<Echeance>(reponse.data));
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setChargement(false);
    }
  }, [convention.id]);

  useEffect(() => {
    void recharger();
  }, [recharger]);

  // Exécute une action, puis recharge les échéances et la liste des conventions.
  // L'action retourne le message de réussite à afficher.
  async function executer(action: () => Promise<string>) {
    setErreur("");
    setMessage("");
    setOccupe(true);
    try {
      const texte = await action();
      await recharger();
      await onActualiser();
      setMessage(texte);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOccupe(false);
      setConfirmation(null);
    }
  }

  async function voirPdf(chemin: string) {
    setErreur("");
    const probleme = await ouvrirPdf(chemin);
    if (probleme) setErreur(probleme);
  }

  // ---- Échéances ----

  function ouvrirAjoutEcheance() {
    setErreur("");
    setMessage("");
    setFormEcheance({
      id: null,
      date_echeance: aujourdhuiIso(),
      montant_du: String(Math.round(Number(convention.montant_periodique))),
    });
  }

  function ouvrirModifEcheance(e: Echeance) {
    setErreur("");
    setMessage("");
    setFormEcheance({
      id: e.id,
      date_echeance: e.date_echeance,
      montant_du: String(Math.round(Number(e.montant_du))),
    });
  }

  function enregistrerEcheance(evenement: FormEvent) {
    evenement.preventDefault();
    if (!formEcheance) return;
    if (!formEcheance.date_echeance) {
      setErreur("Indiquez la date de l'échéance.");
      return;
    }
    if (!(Number(formEcheance.montant_du) > 0)) {
      setErreur("Indiquez un montant supérieur à 0.");
      return;
    }
    const f = formEcheance;
    void executer(async () => {
      if (f.id === null) {
        await client.post("/conventions/echeances/", {
          convention: convention.id,
          date_echeance: f.date_echeance,
          montant_du: f.montant_du,
        });
        setFormEcheance(null);
        return "Échéance ajoutée.";
      }
      await client.patch(`/conventions/echeances/${f.id}/`, {
        date_echeance: f.date_echeance,
        montant_du: f.montant_du,
      });
      setFormEcheance(null);
      return "Échéance modifiée.";
    });
  }

  function supprimerEcheance(e: Echeance) {
    void executer(async () => {
      await client.delete(`/conventions/echeances/${e.id}/`);
      setOuverte(null);
      return "Échéance supprimée.";
    });
  }

  // ---- Factures ----

  function facturer(e: Echeance) {
    void executer(async () => {
      const reponse = await client.post<Echeance>(`/conventions/echeances/${e.id}/facturer/`);
      const numero = reponse.data.numero_facture;
      return reponse.data.facture_envoyee_le
        ? `Facture ${numero} émise et envoyée par e-mail au partenaire.`
        : `Facture ${numero} émise. Elle n'a pas pu être envoyée par e-mail (adresse du partenaire manquante ?).`;
    });
  }

  function renvoyerFacture(e: Echeance) {
    void executer(async () => {
      await client.post(`/conventions/echeances/${e.id}/envoyer-facture/`);
      return "Facture renvoyée par e-mail.";
    });
  }

  // ---- Paiements ----

  function ouvrirFormPaiement(e: Echeance) {
    setErreur("");
    setMessage("");
    setRecapitulatif(false);
    setFormPaiement({
      echeance: e.id,
      date_paiement: aujourdhuiIso(),
      montant: String(Math.round(Number(e.reste_a_payer))),
      mode: "",
      reference: "",
      banque: "",
      date_valeur: "",
      nom_payeur: "",
      observation: "",
      fichier: null,
    });
  }

  function changerPaiement(champ: keyof FormPaiement, valeur: string) {
    setFormPaiement((precedent) => (precedent ? { ...precedent, [champ]: valeur } : precedent));
  }

  function choisirFichierPaiement(evenement: ChangeEvent<HTMLInputElement>) {
    const fichier = evenement.target.files?.[0] ?? null;
    if (fichier) {
      const faute = controlerFichier(fichier);
      if (faute) {
        setErreur(faute);
        evenement.target.value = "";
        return;
      }
    }
    setErreur("");
    setFormPaiement((precedent) => (precedent ? { ...precedent, fichier } : precedent));
  }

  // Les mêmes règles que le serveur : on prévient l'utilisateur avant l'envoi
  function verifierPaiement(f: FormPaiement, echeance: Echeance | undefined): string {
    if (!f.date_paiement) return "Indiquez la date du paiement.";
    if (f.date_paiement > aujourdhuiIso()) return "La date du paiement ne peut pas être dans le futur.";
    if (convention.date_signature && f.date_paiement < convention.date_signature) {
      return `La date du paiement ne peut pas précéder la signature de la convention (${formaterDate(convention.date_signature)}).`;
    }
    if (!f.mode) return "Choisissez le mode de paiement.";
    if (!(Number(f.montant) > 0)) return "Indiquez un montant supérieur à 0.";
    if (echeance && Number(f.montant) > Number(echeance.reste_a_payer)) {
      return `Le reste à payer est de ${formaterAr(echeance.reste_a_payer)}.`;
    }
    if (f.mode === "CHEQUE" || f.mode === "VIREMENT") {
      if (!f.reference.trim()) {
        return f.mode === "CHEQUE" ? "Indiquez le numéro du chèque." : "Indiquez le numéro de l'ordre de virement.";
      }
      if (!f.banque.trim()) return "Indiquez la banque.";
    }
    return "";
  }

  // 1re étape : on vérifie, puis on affiche le récapitulatif
  function validerPaiement(evenement: FormEvent) {
    evenement.preventDefault();
    if (!formPaiement) return;
    const echeance = echeances.find((x) => x.id === formPaiement.echeance);
    const faute = verifierPaiement(formPaiement, echeance);
    if (faute) {
      setErreur(faute);
      return;
    }
    setErreur("");
    setRecapitulatif(true);
  }

  // 2e étape : l'utilisateur a confirmé
  function enregistrerPaiement() {
    if (!formPaiement) return;
    const f = formPaiement;
    void executer(async () => {
      const donnees = new FormData();
      donnees.append("echeance", String(f.echeance));
      donnees.append("date_paiement", f.date_paiement);
      donnees.append("montant", f.montant);
      donnees.append("mode", f.mode);
      if (f.reference.trim()) donnees.append("reference", f.reference.trim());
      if (f.banque.trim() && f.mode !== "ESPECES") donnees.append("banque", f.banque.trim());
      if (f.date_valeur && f.mode === "VIREMENT") donnees.append("date_valeur", f.date_valeur);
      if (f.nom_payeur.trim()) donnees.append("nom_payeur", f.nom_payeur.trim());
      if (f.observation.trim()) donnees.append("observation", f.observation.trim());
      if (f.fichier) donnees.append("justificatif", f.fichier);

      try {
        const reponse = await client.post<Paiement>("/conventions/paiements/", donnees);
        setFormPaiement(null);
        setRecapitulatif(false);
        const numero = reponse.data.numero_recu ? ` Reçu ${reponse.data.numero_recu}.` : "";
        return reponse.data.recu_envoye_le
          ? `Paiement enregistré.${numero} Le reçu a été envoyé par e-mail au partenaire.`
          : `Paiement enregistré.${numero} Le reçu n'a pas pu être envoyé par e-mail (adresse du partenaire manquante ?).`;
      } catch (e) {
        // Le serveur a refusé : on revient au formulaire pour corriger
        setRecapitulatif(false);
        throw e;
      }
    });
  }

  function annulerPaiement(evenement: FormEvent) {
    evenement.preventDefault();
    if (!annulation) return;
    const motif = annulation.motif.trim();
    if (motif.length < 5) {
      setErreur("Indiquez le motif de l'annulation (5 caractères au moins).");
      return;
    }
    void executer(async () => {
      await client.post(`/conventions/paiements/${annulation.id}/annuler/`, { motif });
      setAnnulation(null);
      return "Paiement annulé. Il reste visible dans l'historique et n'entre plus dans les totaux.";
    });
  }

  function renvoyerRecu(p: Paiement) {
    void executer(async () => {
      await client.post(`/conventions/paiements/${p.id}/envoyer-recu/`);
      return "Reçu renvoyé par e-mail.";
    });
  }

  function joindrePiece(p: Paiement, evenement: ChangeEvent<HTMLInputElement>) {
    const fichier = evenement.target.files?.[0];
    evenement.target.value = "";
    if (!fichier) return;
    const faute = controlerFichier(fichier);
    if (faute) {
      setErreur(faute);
      return;
    }
    void executer(async () => {
      const donnees = new FormData();
      donnees.append("justificatif", fichier);
      await client.post(`/conventions/paiements/${p.id}/justificatif/`, donnees);
      return "Pièce jointe ajoutée.";
    });
  }

  function retirerPiece(p: Paiement) {
    void executer(async () => {
      await client.delete(`/conventions/paiements/${p.id}/justificatif/`);
      return "Pièce jointe retirée.";
    });
  }

  // ---- Affichage ----

  const formulaireEcheance = (titre: string) =>
    formEcheance && (
      <FormulaireEcheance
        titre={titre}
        valeur={formEcheance}
        occupe={occupe}
        onChange={setFormEcheance}
        onSubmit={enregistrerEcheance}
        onAnnuler={() => setFormEcheance(null)}
      />
    );

  return (
    <div className="ech">
      {erreur && (
        <p className="conv-erreur" role="alert">
          {erreur}
        </p>
      )}
      {message && <p className="conv-succes">{message}</p>}

      {!conventionActive && (
        <p className="ech-info">
          La convention doit être <strong>active</strong> pour émettre des factures et enregistrer
          des paiements.
        </p>
      )}

      <SyntheseEcheances convention={convention} />

      <div className="ech-barre">
        <h3>Échéances</h3>
        {/* Le bouton disparaît pendant la saisie d'une nouvelle échéance */}
        {formEcheance?.id !== null && (
          <button
            type="button"
            className="conv-bouton secondaire"
            onClick={ouvrirAjoutEcheance}
            disabled={occupe}
          >
            + Ajouter une échéance
          </button>
        )}
      </div>

      {formEcheance?.id === null && formulaireEcheance("Nouvelle échéance")}

      {chargement ? (
        <p className="conv-vide">Chargement…</p>
      ) : echeances.length === 0 ? (
        <p className="conv-vide">
          Aucune échéance. Utilisez « Générer les échéances » dans l'onglet Détails, ou ajoutez-en
          une à la main.
        </p>
      ) : (
        <ul className="ech-liste">
          {echeances.map((e) => {
            const estOuverte = ouverte === e.id;
            const reste = Number(e.reste_a_payer);
            const actifs = e.paiements.filter((p) => !p.est_annule);
            return (
              <li key={e.id} className={`ech-carte${estOuverte ? " ouverte" : ""}`}>
                <button
                  type="button"
                  className="ech-resume"
                  aria-expanded={estOuverte}
                  onClick={() => setOuverte(estOuverte ? null : e.id)}
                >
                  <span className="ech-date">{formaterDate(e.date_echeance)}</span>
                  <span className="ech-montant">{formaterAr(e.montant_du)}</span>
                  <span className={`conv-badge ${e.statut.toLowerCase()}`}>{e.statut_libelle}</span>
                  <span className={`ech-reste${reste > 0 ? " du" : ""}`}>
                    {reste > 0 ? `Reste ${formaterAr(reste)}` : "Soldée"}
                  </span>
                  <span className="ech-facture">{e.numero_facture || "Pas de facture"}</span>
                  <svg
                    className="ech-chevron"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {estOuverte && (
                  <div className="ech-detail">
                    {/* ---- Facture ---- */}
                    <div className="ech-bloc">
                      <h4>Facture</h4>
                      {e.numero_facture ? (
                        <>
                          <p>
                            <strong>{e.numero_facture}</strong> du {formaterDate(e.date_facture)} ·{" "}
                            {e.facture_envoyee_le
                              ? `envoyée par e-mail le ${formaterDateHeure(e.facture_envoyee_le)}`
                              : "pas encore envoyée par e-mail"}
                          </p>
                          <div className="ech-actions">
                            <button
                              type="button"
                              className="conv-pdf"
                              onClick={() => void voirPdf(`/conventions/echeances/${e.id}/facture-pdf/`)}
                            >
                              Voir le PDF
                            </button>
                            <button
                              type="button"
                              className="conv-pdf"
                              onClick={() => renvoyerFacture(e)}
                              disabled={occupe}
                            >
                              Renvoyer par e-mail
                            </button>
                          </div>
                        </>
                      ) : conventionActive ? (
                        <>
                          <p>
                            Pas encore facturée. Le numéro est généré automatiquement et la facture
                            part par e-mail au partenaire.
                          </p>
                          <div className="ech-actions">
                            <button
                              type="button"
                              className="conv-bouton"
                              onClick={() => facturer(e)}
                              disabled={occupe}
                            >
                              Émettre la facture
                            </button>
                          </div>
                        </>
                      ) : (
                        <p>Pas de facture.</p>
                      )}
                    </div>

                    {/* ---- Paiements ---- */}
                    <div className="ech-bloc">
                      <h4>
                        Paiements
                        {e.paiements.length > 0 && (
                          <span className="ech-compte">
                            {actifs.length} enregistré{actifs.length > 1 ? "s" : ""}
                            {e.paiements.length > actifs.length
                              ? ` · ${e.paiements.length - actifs.length} annulé${e.paiements.length - actifs.length > 1 ? "s" : ""}`
                              : ""}
                          </span>
                        )}
                      </h4>

                      {e.paiements.length === 0 ? (
                        <p>Aucun paiement enregistré.</p>
                      ) : (
                        <ul className="ech-paiements">
                          {e.paiements.map((p) => (
                            <LignePaiement
                              key={p.id}
                              paiement={p}
                              occupe={occupe}
                              annulation={annulation}
                              onChangerMotif={(motif) => setAnnulation({ id: p.id, motif })}
                              onDemanderAnnulation={() => {
                                setErreur("");
                                setAnnulation({ id: p.id, motif: "" });
                              }}
                              onConfirmerAnnulation={annulerPaiement}
                              onGarder={() => setAnnulation(null)}
                              onVoirRecu={() => void voirPdf(`/conventions/paiements/${p.id}/recu-pdf/`)}
                              onRenvoyerRecu={() => renvoyerRecu(p)}
                              onJoindre={(ev) => joindrePiece(p, ev)}
                              onRetirerPiece={() => retirerPiece(p)}
                            />
                          ))}
                        </ul>
                      )}

                      {formPaiement?.echeance === e.id ? (
                        recapitulatif ? (
                          <RecapitulatifPaiement
                            convention={convention}
                            form={formPaiement}
                            echeance={e}
                            occupe={occupe}
                            onConfirmer={enregistrerPaiement}
                            onModifier={() => setRecapitulatif(false)}
                          />
                        ) : (
                          <FormulairePaiement
                            form={formPaiement}
                            convention={convention}
                            echeance={e}
                            occupe={occupe}
                            onChange={changerPaiement}
                            onFichier={choisirFichierPaiement}
                            onSubmit={validerPaiement}
                            onAnnuler={() => setFormPaiement(null)}
                          />
                        )
                      ) : (
                        conventionActive &&
                        reste > 0 && (
                          <div className="ech-actions">
                            <button
                              type="button"
                              className="conv-bouton"
                              onClick={() => ouvrirFormPaiement(e)}
                              disabled={occupe}
                            >
                              + Enregistrer un paiement
                            </button>
                          </div>
                        )
                      )}
                    </div>

                    {/* ---- Relances envoyées ---- */}
                    {e.relances.length > 0 && (
                      <div className="ech-bloc">
                        <h4>Relances envoyées</h4>
                        <ul className="ech-relances">
                          {e.relances.map((r) => (
                            <li key={r.id}>
                              {r.type_libelle} · {formaterDateHeure(r.date_envoi)}
                              {!r.email_envoye && <small> (e-mail non envoyé)</small>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* ---- Modifier / supprimer l'échéance ---- */}
                    <div className="ech-bloc">
                      <h4>Échéance</h4>
                      {formEcheance?.id === e.id ? (
                        formulaireEcheance("Modifier l'échéance")
                      ) : (
                        <div className="ech-actions">
                          <button
                            type="button"
                            className="conv-pdf"
                            onClick={() => ouvrirModifEcheance(e)}
                            disabled={occupe}
                          >
                            Modifier la date ou le montant
                          </button>
                          {e.paiements.length > 0 ? (
                            <small>Une échéance qui a des paiements (même annulés) ne peut pas être supprimée.</small>
                          ) : confirmation === `echeance-${e.id}` ? (
                            <>
                              <span className="conv-confirmation">Supprimer cette échéance ?</span>
                              <button
                                type="button"
                                className="conv-pdf danger"
                                onClick={() => supprimerEcheance(e)}
                                disabled={occupe}
                              >
                                Oui
                              </button>
                              <button type="button" className="conv-pdf" onClick={() => setConfirmation(null)}>
                                Non
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="conv-pdf danger"
                              onClick={() => setConfirmation(`echeance-${e.id}`)}
                              disabled={occupe}
                            >
                              Supprimer
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}