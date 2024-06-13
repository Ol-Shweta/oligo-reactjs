import React from "react";
import { createRoot } from 'react-dom/client';
import App from "./app.jsx";
import { HelmetProvider } from 'react-helmet-async';

createRoot(document.getElementById('root')).render(<App />);