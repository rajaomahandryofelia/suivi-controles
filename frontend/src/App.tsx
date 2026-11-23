import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import Layout from "./components/Layout";
import Connexion from "./pages/Authentification/Connexion";
import Inscription from "./pages/Authentification/Inscription";
import Conventions from "./pages/Conventions/Conventions";
import ListeControleurs from "./pages/Controleurs/ListeControleurs";
import Grilles from "./pages/Grilles/Grilles";
import MaJournee from "./pages/MaJournee/MaJournee";
import Missions from "./pages/Missions/Missions";
import NonConformites from "./pages/NonConformites/NonConformites";
import Ordres from "./pages/Ordres/Ordres";
import Partenaires from "./pages/Partenaires/Partenaires";
import Rapports from "./pages/Rapports/Rapports";
import Sites from "./pages/Sites/Sites";
import TableauDeBord from "./pages/TableauDeBord";
import CarteDirect from "./pages/Tracabilite/CarteDirect";
import TrajetDetail from "./pages/Trajets/TrajetDetail";
import TrajetTournee from "./pages/Trajets/TrajetTournee";
import Trajets from "./pages/Trajets/Trajets";
import Verifier from "./pages/Verifier/Verifier";
import SuiviTrajet from "./suivi/SuiviTrajet";

function PagesProtegees() {
  const { utilisateur } = useAuth();
  return utilisateur ? (
    <SuiviTrajet>
      <Layout />
    </SuiviTrajet>
  ) : (
    <Navigate to="/connexion" replace />
  );
}

// Page réservée au directeur : un contrôleur qui tape l'adresse est renvoyé à l'accueil
function PageDirecteur({ children }: { children: ReactNode }) {
  const { estDirecteur } = useAuth();
  return estDirecteur ? <>{children}</> : <Navigate to="/" replace />;
}

// Page d'accueil : le Directeur a son tableau de bord, le contrôleur sa journée de terrain
function Accueil() {
  const { estDirecteur } = useAuth();
  return estDirecteur ? <TableauDeBord /> : <MaJournee />;
}

// Les tournées font désormais partie des missions : les anciens liens (/tournees?tournee=ID)
// mènent à la page des missions
function VersMissions() {
  const { search } = useLocation();
  return <Navigate to={`/missions${search}`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/connexion" element={<Connexion />} />
      <Route path="/inscription" element={<Inscription />} />
      {/* Page publique ouverte par le QR code des documents officiels : sans connexion */}
      <Route path="/verifier" element={<Verifier />} />

      <Route element={<PagesProtegees />}>
        <Route index element={<Accueil />} />
        <Route path="missions" element={<Missions />} />
        <Route path="tournees" element={<VersMissions />} />
        <Route
          path="ordres"
          element={
            <PageDirecteur>
              <Ordres />
            </PageDirecteur>
          }
        />
        {/* Les deux rôles : le Directeur voit tout, le contrôleur ses propres rapports */}
        <Route path="rapports" element={<Rapports />} />
        <Route path="non-conformites" element={<NonConformites />} />
        {/* Trajets : le Directeur voit tous les contrôleurs, un contrôleur les siens */}
        <Route path="trajets" element={<Trajets />} />
        <Route
          path="trajets/direct"
          element={
            <PageDirecteur>
              <CarteDirect />
            </PageDirecteur>
          }
        />
        <Route path="trajets/tournee/:id" element={<TrajetTournee />} />
        <Route path="trajets/:mission" element={<TrajetDetail />} />
        {/* Anciennes adresses de la traçabilité */}
        <Route path="tracabilite" element={<Navigate to="/trajets" replace />} />
        <Route path="tracabilite/carte" element={<Navigate to="/trajets/direct" replace />} />
        <Route
          path="conventions"
          element={
            <PageDirecteur>
              <Conventions />
            </PageDirecteur>
          }
        />
        <Route
          path="sites"
          element={
            <PageDirecteur>
              <Sites />
            </PageDirecteur>
          }
        />
        <Route
          path="partenaires"
          element={
            <PageDirecteur>
              <Partenaires />
            </PageDirecteur>
          }
        />
        <Route
          path="grilles"
          element={
            <PageDirecteur>
              <Grilles />
            </PageDirecteur>
          }
        />
        <Route
          path="controleurs"
          element={
            <PageDirecteur>
              <ListeControleurs />
            </PageDirecteur>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}