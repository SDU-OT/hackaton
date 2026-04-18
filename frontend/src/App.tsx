import { Routes, Route } from "react-router-dom";
import TopNav from "./components/TopNav";
import Home from "./pages/Home";
import MaterialBrowser from "./pages/MaterialBrowser";
import MaterialDetail from "./pages/MaterialDetail";
import BomExplorer from "./pages/BomExplorer";
import ProductionPlanner from "./pages/ProductionPlanner";
import DatabaseBrowser from "./pages/DatabaseBrowser";
import ScrapExplorer from "./pages/ScrapExplorer";
import DataManagement from "./pages/DataManagement";

export default function App() {
  return (
    <>
      <TopNav />
      <main className="page">
        <Routes>
          <Route path="/"                element={<Home />} />
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
    </>
  );
}
