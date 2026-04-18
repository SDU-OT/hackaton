import { Routes, Route, NavLink } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import MaterialBrowser from "./pages/MaterialBrowser";
import MaterialDetail from "./pages/MaterialDetail";
import BomExplorer from "./pages/BomExplorer";
import ProductionPlanner from "./pages/ProductionPlanner";
import DatabaseBrowser from "./pages/DatabaseBrowser";
import ScrapExplorer from "./pages/ScrapExplorer";
import DataManagement from "./pages/DataManagement";

const NAV = [
  { to: "/",               label: "Dashboard",        icon: "⬡" },
  { to: "/materials",      label: "Materials",        icon: "◈" },
  { to: "/bom",            label: "BOM Explorer",     icon: "⬡" },
  { to: "/planner",        label: "Planner",          icon: "⚙" },
  { to: "/scrap",          label: "Scrap Explorer",   icon: "⚠" },
  { to: "/db",             label: "DB Browser",       icon: "⊞" },
  { to: "/data",           label: "Data Management",  icon: "↑" },
];

export default function App() {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">Danfoss <span>Planner</span></div>
        <nav>
          {NAV.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              <span>{icon}</span> {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="page">
        <Routes>
          <Route path="/"                element={<Dashboard />} />
          <Route path="/materials"       element={<MaterialBrowser />} />
          <Route path="/materials/:id"   element={<MaterialDetail />} />
          <Route path="/bom"             element={<BomExplorer />} />
          <Route path="/bom/:id"         element={<BomExplorer />} />
          <Route path="/planner"         element={<ProductionPlanner />} />
          <Route path="/scrap"           element={<ScrapExplorer />} />
          <Route path="/db"              element={<DatabaseBrowser />} />
          <Route path="/data"            element={<DataManagement />} />
        </Routes>
      </main>
    </div>
  );
}
