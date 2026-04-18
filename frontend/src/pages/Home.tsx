import { Link } from "react-router-dom";

function IconFactory() {
  return (
    <svg className="home-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21V9l4-4 4 4 4-4 4 4v12H3z" />
      <rect x="9" y="14" width="6" height="7" />
      <line x1="3" y1="21" x2="21" y2="21" />
    </svg>
  );
}

function IconLayers() {
  return (
    <svg className="home-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

function IconUpload() {
  return (
    <svg className="home-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  );
}

function IconDatabase() {
  return (
    <svg className="home-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className="page">
      <div className="home-hero">
        <div className="home-hero-inner">
          <h1>Danfoss Production Intelligence</h1>
          <p>Explore materials, analyze scrap, manage production data, and inspect the database.</p>
        </div>
      </div>

      <div className="home-grid-wrap">
        <div className="home-grid">
          <div className="home-card disabled">
            <IconFactory />
            <div>
              <p className="home-card-title">Your MRP</p>
              <p className="home-card-desc">View and manage your MRP controller assignments and production planning parameters.</p>
            </div>
            <span className="home-card-badge">Coming Soon</span>
          </div>

          <Link to="/materials" className="home-card">
            <IconLayers />
            <div>
              <p className="home-card-title">Materials</p>
              <p className="home-card-desc">Browse all materials with scrap rates, throughput metrics, and production statistics.</p>
            </div>
          </Link>

          <Link to="/data" className="home-card">
            <IconUpload />
            <div>
              <p className="home-card-title">Data Upload</p>
              <p className="home-card-desc">Import production orders and scrap records from CSV files to update statistics.</p>
            </div>
          </Link>

          <Link to="/db" className="home-card">
            <IconDatabase />
            <div>
              <p className="home-card-title">DB Browser</p>
              <p className="home-card-desc">Inspect raw database tables, preview data, and verify imported records.</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
