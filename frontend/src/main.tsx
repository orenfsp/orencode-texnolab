import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import type { Role } from "./api";
import { AuthProvider, HOME, useAuth } from "./auth";
import Hub from "./components/Hub";
import Layout from "./components/Layout";
import { Loading } from "./components/ui";
import "./index.css";
import AdminAppeals from "./pages/admin/Appeals";
import AdminAudit from "./pages/admin/Audit";
import AdminCompetitions from "./pages/admin/Competitions";
import CompetitionDetail from "./pages/admin/CompetitionDetail";
import AdminDashboard from "./pages/admin/Dashboard";
import Indicators from "./pages/admin/Indicators";
import Integrations from "./pages/admin/Integrations";
import AdminJudges from "./pages/admin/Judges";
import Norms from "./pages/admin/Norms";
import Organization from "./pages/admin/Organization";
import AdminRanks from "./pages/admin/Ranks";
import Prizes from "./pages/admin/Prizes";
import Rating from "./pages/admin/Rating";
import Registry from "./pages/admin/Registry";
import Reports from "./pages/admin/Reports";
import Teams, { TeamPage } from "./pages/admin/Teams";
import Appeals from "./pages/Appeals";
import Applications from "./pages/athlete/Applications";
import Path from "./pages/athlete/Path";
import Results from "./pages/athlete/Results";
import Calendar, { CompetitionLink } from "./pages/Calendar";
import CoachAthletes from "./pages/coach/Athletes";
import Groups, { GroupPage } from "./pages/coach/Groups";
import CoachRanks from "./pages/coach/Ranks";
import Judging from "./pages/judge/Judging";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import ProtocolPage from "./pages/Protocol";
import Consent from "./pages/public/Consent";
import Guide from "./pages/public/Guide";
import Register from "./pages/public/Register";
import Start from "./pages/public/Start";
import Verify from "./pages/public/Verify";

function Guard({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { me, loading } = useAuth();
  if (loading) return <Loading />;
  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (roles && !roles.includes(me.active_role)) return <Navigate to={HOME[me.active_role]} replace />;
  return <>{children}</>;
}

function Home() {
  const { me, loading } = useAuth();
  if (loading) return <Loading />;
  return <Navigate to={me ? HOME[me.active_role] : "/login"} replace />;
}

const ADMIN: Role[] = ["admin"];
const READERS: Role[] = ["admin", "ministry"];
const R = (roles: Role[] | undefined, el: ReactNode) => <Guard roles={roles}>{el}</Guard>;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Layout />}>
            <Route element={<Hub />}>
            <Route path="/" element={<Home />} />
            <Route path="/start" element={<Start />} />
            <Route path="/guide" element={<Guide />} />
            <Route path="/register" element={<Register />} />
            <Route path="/verify/:code" element={<Verify />} />
            <Route path="/protocols/:id" element={<ProtocolPage />} />
            <Route path="/oauth/consent" element={<Consent />} />
            <Route path="/competitions/:id" element={R(undefined, <CompetitionLink />)} />
            <Route path="/profile" element={R(undefined, <Profile />)} />
            <Route path="/appeals" element={R(["athlete", "coach"], <Appeals />)} />
            <Route path="/admin" element={R(READERS, <AdminDashboard />)} />
            <Route path="/admin/competitions" element={R(READERS, <AdminCompetitions />)} />
            <Route path="/admin/competitions/:id" element={R(READERS, <CompetitionDetail />)} />
            <Route path="/admin/registry" element={R(READERS, <Registry />)} />
            <Route path="/admin/organizations/:id" element={R(READERS, <Organization />)} />
            <Route path="/admin/groups" element={R(READERS, <Groups />)} />
            <Route path="/admin/groups/:id" element={R(READERS, <GroupPage />)} />
            <Route path="/admin/reports" element={R(READERS, <Reports />)} />
            <Route path="/admin/rating" element={R(READERS, <Rating />)} />
            <Route path="/admin/teams" element={R(READERS, <Teams />)} />
            <Route path="/admin/teams/:id" element={R(READERS, <TeamPage />)} />
            <Route path="/admin/indicators" element={R(READERS, <Indicators />)} />
            <Route path="/admin/ranks" element={R(ADMIN, <AdminRanks />)} />
            <Route path="/admin/judges" element={R(ADMIN, <AdminJudges />)} />
            <Route path="/admin/appeals" element={R(ADMIN, <AdminAppeals />)} />
            <Route path="/admin/prizes" element={R(ADMIN, <Prizes />)} />
            <Route path="/admin/norms" element={R(ADMIN, <Norms />)} />
            <Route path="/admin/integrations" element={R(ADMIN, <Integrations />)} />
            <Route path="/admin/audit" element={R(ADMIN, <AdminAudit />)} />
            <Route path="/calendar" element={R(["athlete", "coach"], <Calendar />)} />
            <Route path="/athlete/applications" element={R(["athlete"], <Applications />)} />
            <Route path="/athlete/results" element={R(["athlete"], <Results />)} />
            <Route path="/athlete/path" element={R(["athlete"], <Path />)} />
            <Route path="/athlete/profile" element={<Navigate to="/profile" replace />} />
            <Route path="/athlete/appeals" element={<Navigate to="/appeals" replace />} />
            <Route path="/coach/athletes" element={R(["coach"], <CoachAthletes />)} />
            <Route path="/coach/applications" element={R(["coach"], <Applications />)} />
            <Route path="/coach/ranks" element={R(["coach"], <CoachRanks />)} />
            <Route path="/coach/groups" element={R(["coach"], <Groups />)} />
            <Route path="/coach/groups/:id" element={R(["coach"], <GroupPage />)} />
            <Route path="/judge" element={R(["judge"], <Judging />)} />
            <Route path="*" element={<Home />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
