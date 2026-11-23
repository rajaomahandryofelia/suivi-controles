import { isAxiosError } from "axios";
import client from "../../api/client";

// Dit pourquoi un PDF n'a pas pu s'ouvrir (code d'erreur + message du serveur).
// La réponse d'erreur arrive sous forme de fichier (blob) : on la relit pour en extraire le texte.
async function expliquerEchec(erreur: unknown): Promise<string> {
  const debut = "Impossible d'ouvrir le document";
  if (isAxiosError(erreur)) {
    if (!erreur.response) return `${debut} : le serveur ne répond pas.`;
    let detail = "";
    const donnees: unknown = erreur.response.data;
    if (donnees instanceof Blob) {
      try {
        const json = JSON.parse(await donnees.text()) as { detail?: string };
        detail = json.detail ?? "";
      } catch {
        // Réponse qui n'est pas du JSON (page d'erreur du serveur) : on garde seulement le code
      }
    }
    return `${debut} (erreur ${erreur.response.status})${detail ? ` : ${detail}` : "."}`;
  }
  return `${debut} : ${erreur instanceof Error ? erreur.message : "erreur inconnue"}.`;
}

// Ouvre un PDF de l'API dans un nouvel onglet.
// L'onglet est ouvert tout de suite pour ne pas être bloqué par le navigateur.
// Retourne un message d'erreur, ou une chaîne vide si tout s'est bien passé.
export async function ouvrirPdf(chemin: string): Promise<string> {
  const fenetre = window.open("", "_blank");
  try {
    const reponse = await client.get(chemin, { responseType: "blob" });
    const adresse = URL.createObjectURL(reponse.data as Blob);
    if (fenetre) fenetre.location.href = adresse;
    else window.open(adresse, "_blank");
    setTimeout(() => URL.revokeObjectURL(adresse), 60_000);
    return "";
  } catch (e) {
    fenetre?.close();
    return await expliquerEchec(e);
  }
}