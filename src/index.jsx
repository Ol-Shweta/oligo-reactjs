import React from "react";
import { createRoot } from 'react-dom/client';
import App from "./app.jsx";
import { HelmetProvider } from 'react-helmet-async';


const rootElement = document.getElementById('root');
const root = createRoot(rootElement);

root.render(<React.StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </React.StrictMode>,);
