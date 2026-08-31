/**
 * Mechanical Engineering curriculum, semesters 3 to 8.
 *
 * Its own module because it carries the full spread rather than the two
 * semesters the other branches sample, and `curriculum.ts` was already long
 * enough that adding it inline would bury the shared first year.
 *
 * The full spread is the point: a student's position is derived from their
 * admission year and can land anywhere in the course — a 2023 admission is in
 * semester 7 this academic year — and a branch seeded only at semester 3 leaves
 * that student looking at an empty curriculum with no way to tell whether the
 * subjects or the mapping were what went missing.
 */
import type { SeedSubject } from "./curriculum";

export const MECH_SUBJECTS: SeedSubject[] = [
  // ── Semester 3 ──────────────────────────────────────────────────────────
  {
    name: "Engineering Thermodynamics",
    code: "ME201",
    semester: 3,
    credits: 4,
    ltp: [3, 1, 0],
    courseType: "Core",
    prerequisites: ["Engineering Physics"],
    learningObjectives: [
      "State the laws of thermodynamics and apply them to closed and open systems.",
      "Evaluate the properties of pure substances using steam tables and charts.",
      "Analyse air-standard power cycles and compare their efficiencies.",
    ],
    outcomes: [
      "Apply the first law to non-flow and steady-flow processes.",
      "Calculate entropy change and identify irreversibility in a process.",
      "Determine the efficiency of Otto, Diesel and Brayton cycles.",
    ],
    units: [
      {
        unitNumber: 1,
        title: "Basic Concepts and Zeroth Law",
        description:
          "Thermodynamic systems and their boundaries, properties and state, and the definition of temperature.",
        topics: [
          "System, boundary and surroundings",
          "Properties, state, path and process",
          "Thermodynamic equilibrium and quasi-static process",
          "Zeroth law and temperature scales",
        ],
        hours: 8,
      },
      {
        unitNumber: 2,
        title: "First Law of Thermodynamics",
        description: "Energy conservation applied to closed systems and to control volumes.",
        topics: [
          "Internal energy and enthalpy",
          "First law for a cycle and for a process",
          "Application to non-flow processes",
          "Steady flow energy equation",
          "Applications: nozzle, turbine, compressor, throttling",
        ],
        hours: 12,
      },
      {
        unitNumber: 3,
        title: "Second Law and Entropy",
        description: "The direction of processes, the Carnot cycle, entropy and availability.",
        topics: [
          "Kelvin-Planck and Clausius statements",
          "Carnot cycle and Carnot efficiency",
          "Clausius inequality",
          "Entropy and entropy change in processes",
          "Availability and irreversibility",
        ],
        hours: 12,
      },
      {
        unitNumber: 4,
        title: "Properties of Pure Substances",
        description: "The phase change of water, steam tables and the Mollier chart.",
        topics: [
          "Formation of steam and dryness fraction",
          "Steam tables",
          "Mollier chart",
          "Measurement of dryness fraction",
        ],
        hours: 10,
      },
      {
        unitNumber: 5,
        title: "Gas Power Cycles",
        description: "Air-standard cycles and their comparison.",
        topics: [
          "Air-standard assumptions",
          "Otto cycle",
          "Diesel and dual cycles",
          "Brayton cycle",
          "Comparison of cycles",
        ],
        hours: 10,
      },
    ],
    referenceBooks: [
      {
        title: "Engineering Thermodynamics",
        authors: "R.K. Rajput",
        publisher: "Laxmi Publications",
        edition: "4th",
        kind: "textbook",
      },
      {
        title: "Engineering Thermodynamics",
        authors: "P.K. Nag",
        publisher: "McGraw Hill",
        edition: "6th",
        kind: "reference",
      },
    ],
  },
  {
    name: "Mechanics of Solids",
    code: "ME202",
    semester: 3,
    credits: 4,
    ltp: [3, 1, 0],
    courseType: "Core",
    learningObjectives: [
      "Determine stresses and strains in axially loaded members.",
      "Draw shear force and bending moment diagrams for standard beams.",
      "Analyse shafts under torsion and columns under axial load.",
    ],
    outcomes: [
      "Compute stresses in composite and thermally loaded bars.",
      "Locate principal planes using Mohr's circle.",
      "Design a shaft for combined bending and torsion.",
    ],
    units: [
      {
        unitNumber: 1,
        title: "Simple Stresses and Strains",
        topics: [
          "Stress, strain and Hooke's law",
          "Elastic constants and their relationships",
          "Bars of varying section and composite bars",
          "Thermal stresses",
        ],
        hours: 10,
      },
      {
        unitNumber: 2,
        title: "Principal Stresses",
        topics: [
          "Stresses on an inclined plane",
          "Principal planes and principal stresses",
          "Mohr's circle of stress",
        ],
        hours: 9,
      },
      {
        unitNumber: 3,
        title: "Shear Force and Bending Moment",
        topics: [
          "Types of beams and loading",
          "SF and BM diagrams for cantilevers",
          "SF and BM diagrams for simply supported beams",
          "Point of contraflexure",
        ],
        hours: 12,
      },
      {
        unitNumber: 4,
        title: "Stresses in Beams",
        topics: [
          "Theory of simple bending",
          "Section modulus and moment of resistance",
          "Shear stress distribution in beams",
        ],
        hours: 10,
      },
      {
        unitNumber: 5,
        title: "Torsion and Columns",
        topics: [
          "Theory of pure torsion",
          "Power transmitted by a shaft",
          "Euler's theory of columns",
          "Slenderness ratio and Rankine's formula",
        ],
        hours: 11,
      },
    ],
    referenceBooks: [
      {
        title: "Strength of Materials",
        authors: "S.S. Bhavikatti",
        publisher: "Vikas Publishing",
        edition: "4th",
        kind: "textbook",
      },
      {
        title: "Strength of Materials",
        authors: "R.K. Bansal",
        publisher: "Laxmi Publications",
        edition: "5th",
        kind: "reference",
      },
    ],
  },
  {
    name: "Material Science and Metallurgy",
    code: "ME203",
    semester: 3,
    credits: 3,
    ltp: [3, 0, 0],
    courseType: "Core",
    units: [
      {
        unitNumber: 1,
        title: "Crystal Structures",
        topics: ["Unit cells and lattices", "Miller indices", "Imperfections in crystals"],
        hours: 8,
      },
      {
        unitNumber: 2,
        title: "Phase Diagrams",
        topics: ["Gibbs phase rule", "Iron-carbon diagram", "Lever rule"],
        hours: 10,
      },
      {
        unitNumber: 3,
        title: "Heat Treatment",
        topics: ["Annealing and normalising", "Hardening and tempering", "TTT diagrams"],
        hours: 10,
      },
      {
        unitNumber: 4,
        title: "Ferrous and Non-ferrous Alloys",
        topics: ["Plain carbon and alloy steels", "Cast irons", "Aluminium and copper alloys"],
        hours: 9,
      },
      {
        unitNumber: 5,
        title: "Composites and Testing",
        topics: [
          "Types of composites",
          "Hardness and impact testing",
          "Non-destructive testing",
        ],
        hours: 8,
      },
    ],
  },
  {
    name: "Mechanics of Solids Lab",
    code: "ME251",
    semester: 3,
    credits: 1.5,
    ltp: [0, 0, 3],
    courseType: "Lab",
    syllabusText:
      "Tension test on mild steel, compression test, hardness tests (Brinell and Rockwell), Izod impact test, torsion test on a mild steel rod, deflection of beams, and determination of spring stiffness.",
  },

  // ── Semester 4 ──────────────────────────────────────────────────────────
  {
    name: "Fluid Mechanics and Hydraulic Machines",
    code: "ME204",
    semester: 4,
    credits: 4,
    ltp: [3, 1, 0],
    courseType: "Core",
    prerequisites: ["Engineering Thermodynamics"],
    learningObjectives: [
      "Apply the continuity, energy and momentum equations to fluid flow.",
      "Estimate losses in pipe flow and size a pipeline.",
      "Analyse the performance of turbines and centrifugal pumps.",
    ],
    outcomes: [
      "Compute pressure using manometers and hydrostatic relations.",
      "Apply Bernoulli's equation to flow measurement devices.",
      "Determine the specific speed and efficiency of a pump.",
    ],
    units: [
      {
        unitNumber: 1,
        title: "Fluid Properties and Pressure Measurement",
        topics: [
          "Density, specific weight and viscosity",
          "Surface tension and capillarity",
          "Pascal's law and hydrostatic law",
          "Manometers: simple and differential",
        ],
        hours: 10,
      },
      {
        unitNumber: 2,
        title: "Kinematics of Flow",
        topics: [
          "Types of flow",
          "Continuity equation",
          "Velocity potential and stream function",
          "Vortex flow",
        ],
        hours: 9,
      },
      {
        unitNumber: 3,
        title: "Dynamics of Fluid Flow",
        topics: [
          "Euler's equation of motion",
          "Bernoulli's equation and its applications",
          "Venturimeter, orificemeter and pitot tube",
          "Momentum equation and forces on bends",
        ],
        hours: 12,
      },
      {
        unitNumber: 4,
        title: "Flow Through Pipes",
        topics: [
          "Laminar flow through circular pipes",
          "Reynolds number and transition to turbulence",
          "Darcy-Weisbach equation and major losses",
          "Minor losses, hydraulic and total energy gradient lines",
        ],
        hours: 11,
      },
      {
        unitNumber: 5,
        title: "Hydraulic Machines",
        topics: [
          "Impact of jets on vanes",
          "Pelton, Francis and Kaplan turbines",
          "Centrifugal pumps: work done and heads",
          "Specific speed and characteristic curves",
        ],
        hours: 12,
      },
    ],
    referenceBooks: [
      {
        title: "A Textbook of Fluid Mechanics and Hydraulic Machines",
        authors: "R.K. Bansal",
        publisher: "Laxmi Publications",
        edition: "9th",
        kind: "textbook",
      },
      {
        title: "Fluid Mechanics and Fluid Power Engineering",
        authors: "D.S. Kumar",
        publisher: "S.K. Kataria",
        edition: "8th",
        kind: "reference",
      },
    ],
  },
  {
    name: "Kinematics of Machinery",
    code: "ME205",
    semester: 4,
    credits: 3,
    ltp: [3, 0, 0],
    courseType: "Core",
    units: [
      {
        unitNumber: 1,
        title: "Mechanisms and Machines",
        topics: [
          "Kinematic links, pairs and chains",
          "Degrees of freedom and Grubler's criterion",
          "Inversions of the four-bar chain",
          "Slider-crank mechanism and its inversions",
        ],
        hours: 10,
      },
      {
        unitNumber: 2,
        title: "Velocity and Acceleration Analysis",
        topics: [
          "Velocity of a point on a link",
          "Instantaneous centre method",
          "Relative velocity method",
          "Coriolis component of acceleration",
        ],
        hours: 12,
      },
      {
        unitNumber: 3,
        title: "Cams",
        topics: [
          "Classification of cams and followers",
          "Displacement, velocity and acceleration diagrams",
          "Cam profile construction",
        ],
        hours: 10,
      },
      {
        unitNumber: 4,
        title: "Gears and Gear Trains",
        topics: [
          "Gear terminology and the law of gearing",
          "Involute profile and interference",
          "Simple, compound and reverted gear trains",
          "Epicyclic gear trains",
        ],
        hours: 12,
      },
      {
        unitNumber: 5,
        title: "Belts, Ropes and Chains",
        topics: [
          "Flat and V-belt drives",
          "Ratio of tensions",
          "Power transmitted",
          "Chain drives",
        ],
        hours: 8,
      },
    ],
    referenceBooks: [
      {
        title: "Theory of Machines",
        authors: "R.S. Khurmi and J.K. Gupta",
        publisher: "S. Chand",
        edition: "14th",
        kind: "textbook",
      },
    ],
  },
  {
    name: "Manufacturing Processes",
    code: "ME206",
    semester: 4,
    credits: 3,
    ltp: [3, 0, 0],
    courseType: "Core",
    units: [
      {
        unitNumber: 1,
        title: "Casting",
        topics: ["Sand casting and moulding", "Gating and risering", "Casting defects"],
        hours: 10,
      },
      {
        unitNumber: 2,
        title: "Welding",
        topics: ["Arc and gas welding", "Resistance welding", "Welding defects and inspection"],
        hours: 10,
      },
      {
        unitNumber: 3,
        title: "Metal Forming",
        topics: ["Rolling", "Forging", "Extrusion and drawing"],
        hours: 10,
      },
      {
        unitNumber: 4,
        title: "Sheet Metal Work",
        topics: ["Blanking and piercing", "Bending and deep drawing", "Press selection"],
        hours: 8,
      },
      {
        unitNumber: 5,
        title: "Powder Metallurgy and Plastics",
        topics: ["Powder production and sintering", "Injection moulding", "Extrusion of plastics"],
        hours: 8,
      },
    ],
  },

  // ── Semester 5 ──────────────────────────────────────────────────────────
  {
    name: "Dynamics of Machinery",
    code: "ME301",
    semester: 5,
    credits: 3,
    ltp: [3, 0, 0],
    courseType: "Core",
    prerequisites: ["Kinematics of Machinery"],
    units: [
      {
        unitNumber: 1,
        title: "Static and Dynamic Force Analysis",
        topics: [
          "Free body diagrams",
          "D'Alembert's principle",
          "Dynamic analysis of a slider-crank mechanism",
        ],
        hours: 10,
      },
      {
        unitNumber: 2,
        title: "Flywheels and Governors",
        topics: [
          "Turning moment diagrams",
          "Coefficient of fluctuation of energy and speed",
          "Watt and Porter governors",
          "Sensitiveness, stability and hunting",
        ],
        hours: 10,
      },
      {
        unitNumber: 3,
        title: "Balancing",
        topics: [
          "Balancing of rotating masses in one plane",
          "Balancing in several planes",
          "Balancing of reciprocating masses",
        ],
        hours: 11,
      },
      {
        unitNumber: 4,
        title: "Free Vibrations",
        topics: [
          "Longitudinal and transverse vibrations",
          "Natural frequency",
          "Damped free vibrations",
          "Logarithmic decrement",
        ],
        hours: 11,
      },
      {
        unitNumber: 5,
        title: "Forced Vibrations and Whirling",
        topics: [
          "Forced vibration with damping",
          "Magnification factor",
          "Vibration isolation",
          "Whirling of shafts",
        ],
        hours: 10,
      },
    ],
    referenceBooks: [
      {
        title: "Theory of Machines",
        authors: "R.S. Khurmi and J.K. Gupta",
        publisher: "S. Chand",
        edition: "14th",
        kind: "textbook",
      },
    ],
  },
  {
    name: "Design of Machine Elements",
    code: "ME302",
    semester: 5,
    credits: 4,
    ltp: [3, 1, 0],
    courseType: "Core",
    prerequisites: ["Mechanics of Solids"],
    units: [
      {
        unitNumber: 1,
        title: "Design Fundamentals",
        topics: [
          "The design process",
          "Factor of safety",
          "Theories of failure",
          "Stress concentration",
        ],
        hours: 10,
      },
      {
        unitNumber: 2,
        title: "Design for Fatigue",
        topics: [
          "S-N curve and endurance limit",
          "Soderberg and Goodman criteria",
          "Cumulative damage",
        ],
        hours: 10,
      },
      {
        unitNumber: 3,
        title: "Riveted and Welded Joints",
        topics: [
          "Types of riveted joints",
          "Efficiency of a joint",
          "Design of welded joints",
        ],
        hours: 10,
      },
      {
        unitNumber: 4,
        title: "Shafts, Keys and Couplings",
        topics: [
          "Design of shafts for strength and rigidity",
          "Keys and splines",
          "Rigid and flexible couplings",
        ],
        hours: 11,
      },
      {
        unitNumber: 5,
        title: "Springs and Bearings",
        topics: [
          "Helical and leaf springs",
          "Journal bearings",
          "Selection of rolling bearings",
        ],
        hours: 11,
      },
    ],
    referenceBooks: [
      {
        title: "A Textbook of Machine Design",
        authors: "R.S. Khurmi and J.K. Gupta",
        publisher: "S. Chand",
        edition: "14th",
        kind: "textbook",
      },
      {
        title: "Strength of Materials",
        authors: "S.S. Bhavikatti",
        publisher: "Vikas Publishing",
        edition: "4th",
        kind: "reference",
      },
    ],
  },
  {
    name: "Heat Transfer",
    code: "ME303",
    semester: 5,
    credits: 4,
    ltp: [3, 1, 0],
    courseType: "Core",
    prerequisites: ["Engineering Thermodynamics", "Fluid Mechanics and Hydraulic Machines"],
    units: [
      {
        unitNumber: 1,
        title: "Conduction",
        topics: [
          "Fourier's law",
          "Conduction through slabs and cylinders",
          "Critical radius of insulation",
        ],
        hours: 11,
      },
      {
        unitNumber: 2,
        title: "Fins and Transient Conduction",
        topics: [
          "Fins of uniform cross-section",
          "Fin efficiency and effectiveness",
          "Lumped capacitance and the Biot number",
        ],
        hours: 10,
      },
      {
        unitNumber: 3,
        title: "Convection",
        topics: [
          "Boundary layer concepts",
          "Dimensionless numbers",
          "Free and forced convection correlations",
        ],
        hours: 11,
      },
      {
        unitNumber: 4,
        title: "Radiation",
        topics: [
          "Black body radiation",
          "Stefan-Boltzmann and Kirchhoff's laws",
          "Shape factor and radiation shields",
        ],
        hours: 10,
      },
      {
        unitNumber: 5,
        title: "Heat Exchangers and Boiling",
        topics: [
          "LMTD and NTU methods",
          "Fouling factor",
          "Pool boiling and condensation",
        ],
        hours: 10,
      },
    ],
  },

  // ── Semester 6 ──────────────────────────────────────────────────────────
  {
    name: "Thermal Engineering",
    code: "ME304",
    semester: 6,
    credits: 4,
    ltp: [3, 1, 0],
    courseType: "Core",
    prerequisites: ["Engineering Thermodynamics"],
    units: [
      {
        unitNumber: 1,
        title: "Internal Combustion Engines",
        topics: [
          "SI and CI engine cycles",
          "Valve timing diagrams",
          "Combustion, knocking and detonation",
        ],
        hours: 11,
      },
      {
        unitNumber: 2,
        title: "Engine Testing and Performance",
        topics: [
          "Indicated and brake power",
          "Morse test",
          "Heat balance sheet",
        ],
        hours: 10,
      },
      {
        unitNumber: 3,
        title: "Air Compressors",
        topics: [
          "Reciprocating compressors",
          "Multistage compression and intercooling",
          "Rotary compressors",
        ],
        hours: 10,
      },
      {
        unitNumber: 4,
        title: "Steam Nozzles and Turbines",
        topics: [
          "Flow through nozzles",
          "Critical pressure ratio",
          "Impulse and reaction turbines",
        ],
        hours: 11,
      },
      {
        unitNumber: 5,
        title: "Power Plant Cycles",
        topics: [
          "Rankine cycle",
          "Reheat and regenerative cycles",
          "Combined cycle plants",
        ],
        hours: 10,
      },
    ],
    referenceBooks: [
      {
        title: "Engineering Thermodynamics",
        authors: "R.K. Rajput",
        publisher: "Laxmi Publications",
        edition: "4th",
        kind: "reference",
      },
    ],
  },
  {
    name: "Machine Tools and Metrology",
    code: "ME305",
    semester: 6,
    credits: 3,
    ltp: [3, 0, 0],
    courseType: "Core",
    units: [
      {
        unitNumber: 1,
        title: "Theory of Metal Cutting",
        topics: [
          "Orthogonal and oblique cutting",
          "Merchant's circle diagram",
          "Tool wear and tool life",
        ],
        hours: 10,
      },
      {
        unitNumber: 2,
        title: "Lathe and Drilling Machines",
        topics: [
          "Lathe operations",
          "Capstan and turret lathes",
          "Drilling, boring and reaming",
        ],
        hours: 10,
      },
      {
        unitNumber: 3,
        title: "Milling and Grinding",
        topics: ["Milling operations and indexing", "Grinding wheels", "Surface finish"],
        hours: 9,
      },
      {
        unitNumber: 4,
        title: "Linear and Angular Measurement",
        topics: [
          "Slip gauges and comparators",
          "Sine bar and bevel protractor",
          "Limits, fits and tolerances",
        ],
        hours: 10,
      },
      {
        unitNumber: 5,
        title: "Form Measurement",
        topics: [
          "Screw thread and gear measurement",
          "Surface roughness measurement",
          "Coordinate measuring machines",
        ],
        hours: 9,
      },
    ],
  },

  // ── Semester 7 ──────────────────────────────────────────────────────────
  {
    name: "Refrigeration and Air Conditioning",
    code: "ME401",
    semester: 7,
    credits: 3,
    ltp: [3, 0, 0],
    courseType: "Core",
    prerequisites: ["Engineering Thermodynamics", "Heat Transfer"],
    units: [
      {
        unitNumber: 1,
        title: "Refrigeration Cycles",
        topics: [
          "Reversed Carnot cycle",
          "Air refrigeration systems",
          "Bell-Coleman cycle",
        ],
        hours: 10,
      },
      {
        unitNumber: 2,
        title: "Vapour Compression Refrigeration",
        topics: [
          "Simple VCR cycle and the p-h chart",
          "Effect of superheating and subcooling",
          "Multistage and cascade systems",
        ],
        hours: 11,
      },
      {
        unitNumber: 3,
        title: "Vapour Absorption and Refrigerants",
        topics: [
          "Aqua-ammonia system",
          "Lithium bromide system",
          "Refrigerant properties, ODP and GWP",
        ],
        hours: 10,
      },
      {
        unitNumber: 4,
        title: "Psychrometry",
        topics: [
          "Psychrometric properties and chart",
          "Sensible and latent heat loads",
          "Bypass factor",
        ],
        hours: 10,
      },
      {
        unitNumber: 5,
        title: "Air Conditioning Systems",
        topics: [
          "Summer and winter air conditioning",
          "Cooling load estimation",
          "Duct design basics",
        ],
        hours: 10,
      },
    ],
  },
  {
    name: "Finite Element Methods",
    code: "ME402",
    semester: 7,
    credits: 3,
    ltp: [3, 0, 0],
    courseType: "Professional Elective",
    prerequisites: ["Mechanics of Solids"],
    units: [
      {
        unitNumber: 1,
        title: "Introduction to FEM",
        topics: ["Basic steps of FEM", "Rayleigh-Ritz method", "Galerkin method"],
        hours: 9,
      },
      {
        unitNumber: 2,
        title: "One-Dimensional Problems",
        topics: [
          "Bar element stiffness matrix",
          "Assembly and boundary conditions",
          "Analysis of trusses",
        ],
        hours: 11,
      },
      {
        unitNumber: 3,
        title: "Beam and Frame Elements",
        topics: [
          "Beam element formulation",
          "Hermite shape functions",
          "Frame analysis",
        ],
        hours: 10,
      },
      {
        unitNumber: 4,
        title: "Two-Dimensional Problems",
        topics: [
          "Constant strain triangle",
          "Isoparametric formulation",
          "Numerical integration",
        ],
        hours: 11,
      },
      {
        unitNumber: 5,
        title: "Field Problems and Dynamics",
        topics: [
          "One-dimensional heat conduction",
          "Eigenvalue problems",
          "Consistent and lumped mass matrices",
        ],
        hours: 9,
      },
    ],
  },
  {
    name: "Operations Research",
    code: "ME403",
    semester: 7,
    credits: 3,
    ltp: [3, 0, 0],
    courseType: "Open Elective",
    units: [
      {
        unitNumber: 1,
        title: "Linear Programming",
        topics: ["Formulation", "Graphical method", "Simplex method"],
        hours: 10,
      },
      {
        unitNumber: 2,
        title: "Transportation and Assignment",
        topics: [
          "North-west corner rule and VAM",
          "MODI method",
          "Hungarian method",
        ],
        hours: 10,
      },
      {
        unitNumber: 3,
        title: "Sequencing and Queuing",
        topics: ["Johnson's rule", "M/M/1 model", "Queue performance measures"],
        hours: 9,
      },
      {
        unitNumber: 4,
        title: "Network Analysis",
        topics: ["CPM", "PERT", "Crashing and resource levelling"],
        hours: 10,
      },
      {
        unitNumber: 5,
        title: "Inventory and Replacement",
        topics: ["EOQ models", "Quantity discounts", "Replacement policies"],
        hours: 9,
      },
    ],
  },

  // ── Semester 8 ──────────────────────────────────────────────────────────
  {
    name: "Major Project",
    code: "ME499",
    semester: 8,
    credits: 8,
    ltp: [0, 0, 16],
    courseType: "Project",
    syllabusText:
      "A design or fabrication project carried out in a group of up to four students, comprising a literature survey, problem definition, design or analysis, fabrication or simulation, testing, and a dissertation defended in a viva voce.",
  },
];
