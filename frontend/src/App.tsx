import { Routes, Route, NavLink } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import MaterialBrowser from "./pages/MaterialBrowser";
import MaterialDetail from "./pages/MaterialDetail";
import BomExplorer from "./pages/BomExplorer";
import ProductionPlanner from "./pages/ProductionPlanner";
import FinalProducts from "./pages/FinalProducts";
import RawMaterials from "./pages/RawMaterials";

const NAV = [
  { to: "/",              label: "Dashboard",        icon: "⬡" },
  { to: "/materials",     label: "Materials",        icon: "◈" },
  { to: "/bom",           label: "BOM Explorer",     icon: "⬡" },
  { to: "/planner",       label: "Planner",          icon: "⚙" },
  { to: "/final-products",label: "Final Products",   icon: "★" },
  { to: "/raw-materials", label: "Raw Materials",    icon: "◇" },
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
          <Route path="/"               element={<Dashboard />} />
          <Route path="/materials"      element={<MaterialBrowser />} />
          <Route path="/materials/:id"  element={<MaterialDetail />} />
          <Route path="/bom"            element={<BomExplorer />} />
          <Route path="/bom/:id"        element={<BomExplorer />} />
          <Route path="/planner"        element={<ProductionPlanner />} />
          <Route path="/final-products" element={<FinalProducts />} />
          <Route path="/raw-materials"  element={<RawMaterials />} />
        </Routes>
      </main>
    </div>
  );
}
