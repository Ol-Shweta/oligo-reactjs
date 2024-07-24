import React from 'react';
import { Router, Link } from 'wouter';

import './styles/styles.css';
import PageRouter from './components/router.jsx';
import Seo from './components/seo.jsx';

export default function App() {
  return (
    <Router>
      <Seo />
          <header className="header">
              <div className="container">
      <div className="links">
        <nav className="navigation">
          <Link href="/">Home</Link>
          <span className="divider">|</span>
          <Link href="/trainmodel">Train Model</Link>
          <span className="divider">|</span>
          <Link href="/predictiveanalytics">Predictive Analytics</Link>
          <span className="divider">|</span>
          <Link href="/chat">Chat</Link>
        </nav>
                  </div></div>
      </header>
      <main role="main" className="wrapper">
        <div className="content">
          <PageRouter />
        </div>
      </main>
          <footer className="footer">
              <div className="container">
        <div className="links">
          <Link href="/">Home</Link>
          <span className="divider">|</span>
          <Link href="/about">About</Link>
          <span className="divider">|</span>
          <Link href="/dashboard">Dashboard</Link>
          <span className="divider">|</span>
          <Link href="/policies">QHSE Policies</Link>
          <span className="divider">|</span>
          <Link href="/reports">Reports</Link>
          <span className="divider">|</span>
          <Link href="/contact">Contact</Link>
        </div></div>
      </footer>
    </Router>
  );
}
