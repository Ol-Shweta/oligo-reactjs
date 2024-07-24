import * as React from "react";
import { animated } from "react-spring";
import { useWiggle } from "../hooks/wiggle";
import { Link } from "wouter";

// Our language strings for the header
const strings = [
  "Hello OligoQHSE",
  "Salut OligoQHSE",
  "Hola OligoQHSE",
  "안녕 OligoQHSE",
  "Hej OligoQHSE"
];

// Utility function to choose a random value from the language array
function randomLanguage() {
  return strings[Math.floor(Math.random() * strings.length)];
}

/**
* The Home function defines the content that makes up the main content of the Home page
*
* This component is attached to the /about path in router.jsx
* The function in app.jsx defines the page wrapper that this appears in along with the footer
*/

export default function Home() {
  /* We use state to set the hello string from the array https://reactjs.org/docs/hooks-state.html
     - We'll call setHello when the user clicks to change the string
  */
  const [hello, setHello] = React.useState(strings[0]);
  
  /* The wiggle function defined in /hooks/wiggle.jsx returns the style effect and trigger function
     - We can attach this to events on elements in the page and apply the resulting style
  */
  const [style, trigger] = useWiggle({ x: 5, y: 5, scale: 1 });

  // When the user clicks we change the header language
  const handleChangeHello = () => {
    
    // Choose a new Hello from our languages
    const newHello = randomLanguage();
    
    // Call the function to set the state string in our component
    setHello(newHello);
  };
  return (
    <>
          <section id="fh5co-services">
              <div className="container">
                  <div className="instructions">
                      <h1>AI based OligoQHSE</h1>
                         <h2>make your HSE easier</h2>
                  </div>
              </div></section>
          <section id="fh5co-services">
          <div className="container">
      <div className="instructions">
         <h2>Reduce operational risks related to occupational safety and environmental impact.</h2>
        <p>
        Reduce operational risks related to occupational safety and environmental impact. OligoQHSE software application 
        provides a platform to record, track and respond to quality and safety incidents and makes a major contribution 
        in reducing operational risks related to occupational safety and environmental impact. This platform manages all 
        QHSE non conformance, incidents, risk, risk analysis, audits, assessments, root cause analysis and improvement 
        suggestions.
     
        </p>
                  </div>
              </div></section>
    </>
  );
}
