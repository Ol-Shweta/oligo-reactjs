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
import TrainModel from "../pages/trainmodel";
import Chat from '../pages/chat.jsx';

/**
* The router is imported in app.jsx
*
* Our site just has several routes in it, each defined as a component in /pages
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
        <Route path="/predictiveanalytics" component={PredictiveAnalytics} />
        <Route path="/trainmodel" component={TrainModel} />
        <Route path="/chat" component={Chat} />
    </Switch>
);
