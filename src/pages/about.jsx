import * as React from "react";
import { useWiggle } from "../hooks/wiggle";
import { animated } from "react-spring";
/* ADD IMPORTS FROM TODO ON THE NEXT LINE */


/**
* The About function defines the component that makes up the About page
* This component is attached to the /about path in router.jsx
*/

export default function About() {
  /* DECLARE STYLE AND TRIGGER FOR WIGGLE EFFECT FROM TODO ON NEXT LINE */
  const [style, trigger] = useWiggle({ x: 50, rotation: 1, scale: 1.2 });

  return (
    <div className="page">
      {/* REPLACE H1 ELEMENT BELOW WITH CODE FROM TODO */}
      <animated.h1 className="title" style={style}>
        About OligoQHSE
        </animated.h1>
      {/* REPLACE OPENING P TAG BELOW WITH CODE FROM TODO */}
      <p onMouseEnter={trigger}>Reduce operational risks related to occupational safety and environmental impact.</p>
      <p>
        <em>
        OligoQHSE software application provides a platform to record, track and respond to quality and safety incidents 
        and makes a major contribution in reducing operational risks related to occupational safety and environmental impact.
        </em>
      </p>
      <p>
      This platform manages all QHSE non conformance, incidents, risk, risk analysis, audits, assessments, 
      root cause analysis and improvement suggestions.
      </p>
      <ul>
        <li>
        OligoQHSE can support operators in multiple industries including Oil and Gas, Aerospace, 
        Marine, Mining, Construction, Power, Transportation and Tourism.
        </li>
        <li>
        By improving the efficiency and effectiveness of the incident management processes, 
        it can immensely contribute to performance improvement, cost reduction and also to minimize environmental footprint.
        </li>
        <li>
        OligoQHSE is built on a framework in compliance with ISO 45001, ISO 14001, ISO 9001 standards.
        </li>
      </ul>

      <p>
      OligoQHSE software system is capable of positive disruption in HSE by incorporating 
      Artificial Intelligence (AI), Machine Learning (ML) and BigData innovations.
      </p>
    </div>
  );
}
