import { Link, NavLink } from "react-router-dom";

export default function TopNav() {
  return (
    <header className="topnav">
      <Link to="/" className="topnav-logo">
        <img
          src="/Danfoss%20logo.svg"
          alt="Danfoss"
          className="topnav-logo-image"
        />
      </Link>

      <nav className="topnav-links">
        <NavLink
          to="/mrp"
          className={({ isActive }) => `topnav-link${isActive ? " active" : ""}`}
        >
          MRP
        </NavLink>
        <NavLink
          to="/materials"
          className={({ isActive }) => `topnav-link${isActive ? " active" : ""}`}
        >
          Materials
        </NavLink>
        <NavLink
          to="/data"
          className={({ isActive }) => `topnav-link${isActive ? " active" : ""}`}
        >
          Data Upload
        </NavLink>
        <NavLink
          to="/db"
          className={({ isActive }) => `topnav-link${isActive ? " active" : ""}`}
        >
          DB Browser
        </NavLink>
      </nav>

      <div className="topnav-actions">
        <button className="topnav-icon-btn" title="Search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
        <button className="topnav-icon-btn" title="Account">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </button>
      </div>
    </header>
  );
}
