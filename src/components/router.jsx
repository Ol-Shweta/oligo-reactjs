import * as React from "react";
import { Switch, Route, Router } from "wouter";

// Import page components
import Home from "../pages/home";
import About from "../pages/about";
import Policies from "../pages/policies";
import Reports from "../pages/reports";
import Dashboard from "../pages/dashboard";
import Contact from "../pages/contact";
import PredictiveAnalytics from "../pages/predictiveanalytics";

/**
* The router is imported in app.jsx
*
* Our site just has two routes in it–Home and About
* Each one is defined as a component in /pages
* We use Switch to only render one route at a time https://github.com/molefrog/wouter#switch-
*/

export default () => (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/about" component={About} />
      <Route path="/policies" component={Policies} />
      <Route path="/reports" component={Reports} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/contact" component={Contact} />
      <Route path="/predictiveanalytics" component={Predictiveanalytics} />
    </Switch>
);
