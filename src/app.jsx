import React from "react";
import { Router, Link } from "wouter";

// Import and apply CSS stylesheet
import "./styles/styles.css";

// Where all of our pages come from
import PageRouter from "./components/router.jsx";

// The component that adds our Meta tags to the page
import Seo from './components/seo.jsx';

// Home function that is reflected across the site
export default function App() {
  return (
    <Router>
      <Seo />
      <header className="header">
        <nav className="navigation">
          <Link href="/">Home</Link>
          <span className="divider">|</span>
          <Link href="/about">About</Link>
          <span className="divider">|</span>
          <Link href="/policies">QHSE Policies</Link>
          <span className="divider">|</span>
          <Link href="/predictiveanalytics">Predictive Analytics</Link>
          <span className="divider">|</span>
          <Link href="/reports">Reports</Link>
          <span className="divider">|</span>
          <Link href="/dashboard">Dashboard</Link>
          <span className="divider">|</span>
          <Link href="/contact">Contact</Link>
        </nav>
      </header>
      <main role="main" className="wrapper">
        <div className="content">
          <PageRouter />
        </div>
      </main>
      <footer className="footer">
        <div className="links">
          <Link href="/">Home</Link>
          <span className="divider">|</span>
          <Link href="/about">About</Link>
          <span className="divider">|</span>
          <Link href="/contact">Contact</Link>
        </div>
      </footer>
    </Router>
  );
}
