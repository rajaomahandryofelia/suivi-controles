import axios from "axios";

// Adresse du backend Django
export const API_URL = "http://127.0.0.1:8000/api";

const client = axios.create({
  baseURL: API_URL,
});

// Ajoute le jeton à chaque requête, s'il existe
client.interceptors.request.use((config) => {
  const jeton = localStorage.getItem("jeton");
  if (jeton) {
    config.headers.Authorization = `Token ${jeton}`;
  }
  return config;
});

// Si le jeton n'est plus valable, on revient à la page de connexion
client.interceptors.response.use(
  (reponse) => reponse,
  (erreur) => {
    if (erreur.response?.status === 401 && !erreur.config.url?.includes("/auth/connexion/")) {
      localStorage.removeItem("jeton");
      localStorage.removeItem("utilisateur");
      window.location.href = "/connexion";
    }
    return Promise.reject(erreur);
  }
);

export default client;