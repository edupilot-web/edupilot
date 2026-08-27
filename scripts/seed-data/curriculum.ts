/**
 * Curriculum seed data: regulations and the subjects they prescribe.
 *
 * Modelled on the real JNTUK R23 and R20 B.Tech schemes — subject names, codes,
 * L-T-P-credit patterns and unit breakdowns follow the published structure, so
 * the cascade and the syllabus grounding are exercised against data that behaves
 * like the real thing. Data Structures carries exactly the five units the module
 * specification uses as its worked example.
 *
 * Deliberately varied along three axes, because the whole point of the academic
 * coordinate is that these differ (spec §1, §4):
 *
 *   - by **branch**   CSE, IT and ECE get different third-semester subjects
 *   - by **regulation** R20 and R23 disagree on several subjects
 *   - by **semester**  a subject exists at exactly one semester of a regulation
 *
 * Units are given for the subjects the AI module is most likely to be
 * demonstrated on. A subject with no units still has `syllabusText`, and the
 * generator treats a unit-less subject as ungrounded and says so rather than
 * inventing chapters.
 */

export type SeedUnit = {
  unitNumber: number;
  title: string;
  description?: string;
  topics: string[];
  hours?: number;
};

export type SeedSubject = {
  name: string;
  code: string;
  semester: number;
  credits: number;
  /** Lecture, tutorial, practical hours per week. */
  ltp: [number, number, number];
  courseType:
    | "Core"
    | "Elective"
    | "Open Elective"
    | "Professional Elective"
    | "Lab"
    | "Project"
    | "Mandatory"
    | "Audit";
  prerequisites?: string[];
  learningObjectives?: string[];
  outcomes?: string[];
  units?: SeedUnit[];
  syllabusText?: string;
  referenceBooks?: {
    title: string;
    authors?: string;
    publisher?: string;
    edition?: string;
    year?: number;
    kind?: "textbook" | "reference";
  }[];
};

export type SeedRegulation = {
  code: string;
  name: string;
  description: string;
  effectiveFromYear: number;
  effectiveToYear: number | null;
  totalSemesters: number;
  status: "active" | "superseded";
};

export const REGULATIONS: SeedRegulation[] = [
  {
    code: "R23",
    name: "R23 Regulations",
    description: "Outcome-based B.Tech scheme applicable to 2023 admissions onward.",
    effectiveFromYear: 2023,
    effectiveToYear: null,
    totalSemesters: 8,
    status: "active",
  },
  {
    code: "R20",
    name: "R20 Regulations",
    description: "Preceding B.Tech scheme, applicable to 2020–2022 admissions.",
    effectiveFromYear: 2020,
    effectiveToYear: 2023,
    totalSemesters: 8,
    status: "superseded",
  },
];

// ── Shared first-year subjects (common to every engineering branch) ────────

const FIRST_YEAR: SeedSubject[] = [
  {
    name: "Linear Algebra and Calculus",
    code: "MA101",
    semester: 1,
    credits: 3,
    ltp: [3, 0, 0],
    courseType: "Core",
    learningObjectives: [
      "Solve systems of linear equations using matrix methods.",
      "Apply differential calculus to engineering problems.",
    ],
    units: [
      { unitNumber: 1, title: "Matrices", topics: ["Rank of a matrix", "Echelon form", "System of linear equations", "Gauss elimination"], hours: 10 },
      { unitNumber: 2, title: "Eigenvalues and Eigenvectors", topics: ["Characteristic equation", "Cayley-Hamilton theorem", "Diagonalisation"], hours: 10 },
      { unitNumber: 3, title: "Mean Value Theorems", topics: ["Rolle's theorem", "Lagrange's theorem", "Taylor and Maclaurin series"], hours: 8 },
      { unitNumber: 4, title: "Partial Differentiation", topics: ["Functions of several variables", "Jacobians", "Maxima and minima"], hours: 10 },
      { unitNumber: 5, title: "Multiple Integrals", topics: ["Double integrals", "Change of order", "Triple integrals", "Applications to area and volume"], hours: 10 },
    ],
    referenceBooks: [
      { title: "Higher Engineering Mathematics", authors: "B.S. Grewal", publisher: "Khanna Publishers", edition: "44th", kind: "textbook" },
      { title: "Advanced Engineering Mathematics", authors: "Erwin Kreyszig", publisher: "Wiley", edition: "10th", kind: "reference" },
    ],
  },
  {
    name: "Communicative English",
    code: "EN101",
    semester: 1,
    credits: 3,
    ltp: [2, 0, 2],
    courseType: "Core",
    syllabusText:
      "Listening, speaking, reading and writing skills for engineering students; vocabulary building; grammar in context; technical writing; presentation skills.",
  },
  {
    name: "Engineering Physics",
    code: "PH101",
    semester: 1,
    credits: 3,
    ltp: [3, 0, 0],
    courseType: "Core",
    units: [
      { unitNumber: 1, title: "Wave Optics", topics: ["Interference", "Diffraction", "Polarisation"], hours: 10 },
      { unitNumber: 2, title: "Lasers and Fibre Optics", topics: ["Spontaneous and stimulated emission", "Types of lasers", "Optical fibre propagation"], hours: 10 },
      { unitNumber: 3, title: "Quantum Mechanics", topics: ["de Broglie hypothesis", "Schrodinger equation", "Particle in a box"], hours: 9 },
      { unitNumber: 4, title: "Semiconductor Physics", topics: ["Intrinsic and extrinsic semiconductors", "Hall effect", "p-n junction"], hours: 9 },
      { unitNumber: 5, title: "Dielectric and Magnetic Materials", topics: ["Polarisation", "Ferromagnetism", "Hysteresis"], hours: 8 },
    ],
  },
  {
    name: "Programming for Problem Solving using C",
    code: "CS101",
    semester: 1,
    credits: 3,
    ltp: [3, 0, 0],
    courseType: "Core",
    learningObjectives: [
      "Translate an algorithm into a working C program.",
      "Use arrays, strings, pointers and structures correctly.",
    ],
    units: [
      { unitNumber: 1, title: "Introduction to Programming", topics: ["Algorithms and flowcharts", "Structure of a C program", "Data types", "Operators"], hours: 9 },
      { unitNumber: 2, title: "Control Structures", topics: ["Conditional statements", "Loops", "break and continue"], hours: 9 },
      { unitNumber: 3, title: "Arrays and Strings", topics: ["One and two dimensional arrays", "String handling functions"], hours: 10 },
      { unitNumber: 4, title: "Functions and Pointers", topics: ["Function definition and call", "Recursion", "Pointer arithmetic", "Dynamic memory allocation"], hours: 10 },
      { unitNumber: 5, title: "Structures and Files", topics: ["Structures and unions", "File handling", "Command line arguments"], hours: 9 },
    ],
    referenceBooks: [
      { title: "The C Programming Language", authors: "Kernighan and Ritchie", publisher: "Pearson", edition: "2nd", kind: "textbook" },
    ],
  },
  {
    name: "Engineering Physics Lab",
    code: "PH151",
    semester: 1,
    credits: 1.5,
    ltp: [0, 0, 3],
    courseType: "Lab",
    syllabusText: "Experiments on interference, diffraction, laser characteristics, optical fibre loss, Hall effect and semiconductor characteristics.",
  },
  {
    name: "Differential Equations and Vector Calculus",
    code: "MA102",
    semester: 2,
    credits: 3,
    ltp: [3, 0, 0],
    courseType: "Core",
    prerequisites: ["Linear Algebra and Calculus"],
    units: [
      { unitNumber: 1, title: "First Order Differential Equations", topics: ["Exact equations", "Linear equations", "Bernoulli's equation", "Applications"], hours: 10 },
      { unitNumber: 2, title: "Higher Order Linear Differential Equations", topics: ["Homogeneous equations", "Method of variation of parameters", "Cauchy-Euler equations"], hours: 10 },
      { unitNumber: 3, title: "Laplace Transforms", topics: ["Transforms of standard functions", "Inverse transforms", "Convolution theorem"], hours: 10 },
      { unitNumber: 4, title: "Vector Differentiation", topics: ["Gradient", "Divergence", "Curl", "Solenoidal and irrotational fields"], hours: 8 },
      { unitNumber: 5, title: "Vector Integration", topics: ["Line integrals", "Green's theorem", "Stokes' theorem", "Gauss divergence theorem"], hours: 10 },
    ],
  },
  {
    name: "Engineering Chemistry",
    code: "CH102",
    semester: 2,
    credits: 3,
    ltp: [3, 0, 0],
    courseType: "Core",
    syllabusText:
      "Water technology; electrochemistry and corrosion; polymers; fuels and combustion; engineering materials and nanochemistry.",
  },
];

// ── Branch-specific subjects, keyed by department code ────────────────────

/**
 * Subjects that differ by branch at the same semester.
 *
 * This is what makes the cascade meaningful: third semester CSE, IT and ECE do
 * not share a subject list, so a generator that guessed from the degree alone
 * would produce content for the wrong branch.
 */
export const BRANCH_SUBJECTS: Record<string, SeedSubject[]> = {
  CSE: [
  {
    name: "Data Structures",
    code: "CS201",
    semester: 3,
    credits: 4,
    ltp: [3, 1, 0],
    courseType: "Core",
    prerequisites: ["Programming for Problem Solving using C"],
    learningObjectives: [
      "Choose an appropriate data structure for a given problem.",
      "Analyse the time and space complexity of operations on each structure.",
      "Implement linear and non-linear data structures and their traversals.",
      "Apply sorting and searching techniques and compare their behaviour.",
    ],
    outcomes: [
      "Implement stacks, queues and linked lists and state the cost of each operation.",
      "Construct and traverse binary trees and binary search trees.",
      "Represent graphs and apply BFS and DFS to them.",
      "Select and justify a sorting algorithm for a given input characteristic.",
    ],
    // The five units the module specification uses as its worked example (§9).
    units: [
      {
        unitNumber: 1,
        title: "Introduction to Data Structures",
        description:
          "Abstract data types, classification of data structures, and the analysis of algorithms used throughout the course.",
        topics: [
          "Abstract data types",
          "Classification: linear and non-linear",
          "Need for data structures",
          "Algorithm analysis: time and space complexity",
          "Asymptotic notation: big-O, omega, theta",
          "Recursion and its cost",
        ],
        hours: 10,
      },
      {
        unitNumber: 2,
        title: "Arrays and Linked Lists",
        description:
          "Contiguous and linked representations, and the trade-off between them.",
        topics: [
          "Array representation and address calculation",
          "Sparse matrices",
          "Singly linked lists: insertion, deletion, traversal",
          "Doubly linked lists",
          "Circular linked lists",
          "Polynomial representation using linked lists",
        ],
        hours: 12,
      },
      {
        unitNumber: 3,
        title: "Stacks and Queues",
        description: "LIFO and FIFO structures and their classic applications.",
        topics: [
          "Stack ADT and array/linked implementations",
          "Infix to postfix conversion",
          "Postfix expression evaluation",
          "Queue ADT and implementations",
          "Circular queues",
          "Deques and priority queues",
        ],
        hours: 10,
      },
      {
        unitNumber: 4,
        title: "Trees",
        description: "Hierarchical structures, traversals and balanced search trees.",
        topics: [
          "Binary trees and their representations",
          "Tree traversals: inorder, preorder, postorder",
          "Binary search trees: insertion, deletion, search",
          "AVL trees and rotations",
          "B-trees",
          "Heaps and heap sort",
        ],
        hours: 12,
      },
      {
        unitNumber: 5,
        title: "Graphs",
        description: "Graph representations, traversals and the standard graph algorithms.",
        topics: [
          "Graph terminology and representations",
          "Adjacency matrix and adjacency list",
          "Breadth first search",
          "Depth first search",
          "Minimum spanning trees: Prim's and Kruskal's",
          "Shortest path: Dijkstra's algorithm",
        ],
        hours: 12,
      },
    ],
    referenceBooks: [
      { title: "Data Structures and Algorithm Analysis in C", authors: "Mark Allen Weiss", publisher: "Pearson", edition: "2nd", kind: "textbook" },
      { title: "Fundamentals of Data Structures in C", authors: "Horowitz, Sahni and Anderson-Freed", publisher: "Universities Press", edition: "2nd", kind: "textbook" },
      { title: "Introduction to Algorithms", authors: "Cormen, Leiserson, Rivest and Stein", publisher: "MIT Press", edition: "3rd", kind: "reference" },
    ],
  },
    {
      name: "Digital Logic Design",
      code: "CS202",
      semester: 3,
      credits: 3,
      ltp: [3, 0, 0],
      courseType: "Core",
      units: [
        { unitNumber: 1, title: "Number Systems and Codes", topics: ["Binary, octal, hexadecimal", "Complements", "BCD and Gray codes"], hours: 8 },
        { unitNumber: 2, title: "Boolean Algebra and Minimisation", topics: ["Boolean postulates", "Karnaugh maps", "Quine-McCluskey method"], hours: 10 },
        { unitNumber: 3, title: "Combinational Circuits", topics: ["Adders and subtractors", "Multiplexers", "Decoders and encoders"], hours: 10 },
        { unitNumber: 4, title: "Sequential Circuits", topics: ["Flip-flops", "Registers", "Counters"], hours: 10 },
        { unitNumber: 5, title: "Memory and PLDs", topics: ["ROM and RAM", "PLA and PAL", "FPGA basics"], hours: 8 },
      ],
    },
    {
      name: "Object Oriented Programming through Java",
      code: "CS203",
      semester: 3,
      credits: 3,
      ltp: [3, 0, 0],
      courseType: "Core",
      prerequisites: ["Programming for Problem Solving using C"],
      units: [
        { unitNumber: 1, title: "Introduction to Java", topics: ["OOP concepts", "JVM architecture", "Data types", "Control statements"], hours: 9 },
        { unitNumber: 2, title: "Classes and Inheritance", topics: ["Classes and objects", "Constructors", "Inheritance", "Method overriding", "Abstract classes"], hours: 10 },
        { unitNumber: 3, title: "Packages and Interfaces", topics: ["Creating packages", "Access protection", "Interfaces", "Default methods"], hours: 9 },
        { unitNumber: 4, title: "Exception Handling and Multithreading", topics: ["try-catch-finally", "Custom exceptions", "Thread lifecycle", "Synchronisation"], hours: 10 },
        { unitNumber: 5, title: "Collections and Streams", topics: ["List, Set, Map", "Iterators", "Generics", "Stream API basics"], hours: 10 },
      ],
      referenceBooks: [{ title: "Java: The Complete Reference", authors: "Herbert Schildt", publisher: "McGraw Hill", edition: "11th", kind: "textbook" }],
    },
    {
      name: "Data Structures Lab",
      code: "CS251",
      semester: 3,
      credits: 1.5,
      ltp: [0, 0, 3],
      courseType: "Lab",
      syllabusText:
        "Implementation of stacks, queues, singly and doubly linked lists, binary search trees, AVL rotations, graph traversals and comparison of sorting algorithms.",
    },
    {
      name: "Discrete Mathematics",
      code: "CS204",
      semester: 4,
      credits: 3,
      ltp: [3, 0, 0],
      courseType: "Core",
      units: [
        { unitNumber: 1, title: "Mathematical Logic", topics: ["Propositions", "Truth tables", "Predicate logic", "Rules of inference"], hours: 10 },
        { unitNumber: 2, title: "Set Theory and Relations", topics: ["Sets and operations", "Relations", "Equivalence relations", "Partial orders"], hours: 9 },
        { unitNumber: 3, title: "Functions and Recurrence", topics: ["Types of functions", "Recurrence relations", "Generating functions"], hours: 9 },
        { unitNumber: 4, title: "Combinatorics", topics: ["Permutations and combinations", "Pigeonhole principle", "Inclusion-exclusion"], hours: 9 },
        { unitNumber: 5, title: "Graph Theory", topics: ["Graph isomorphism", "Euler and Hamiltonian paths", "Trees", "Planar graphs"], hours: 10 },
      ],
    },
    {
      name: "Database Management Systems",
      code: "CS205",
      semester: 4,
      credits: 3,
      ltp: [3, 0, 0],
      courseType: "Core",
      learningObjectives: ["Design a normalised relational schema.", "Write SQL for realistic query requirements.", "Explain how transactions preserve consistency."],
      units: [
        { unitNumber: 1, title: "Introduction to Databases", topics: ["File systems vs DBMS", "Three-schema architecture", "Data models", "ER modelling"], hours: 9 },
        { unitNumber: 2, title: "Relational Model and SQL", topics: ["Relational algebra", "DDL and DML", "Joins", "Nested queries", "Views"], hours: 12 },
        { unitNumber: 3, title: "Normalisation", topics: ["Functional dependencies", "1NF to 3NF", "BCNF", "Decomposition"], hours: 10 },
        { unitNumber: 4, title: "Transactions and Concurrency", topics: ["ACID properties", "Serialisability", "Two-phase locking", "Deadlock handling"], hours: 10 },
        { unitNumber: 5, title: "Storage and Indexing", topics: ["File organisation", "B+ tree indexes", "Hashing", "Query optimisation basics"], hours: 9 },
      ],
      referenceBooks: [
        { title: "Database System Concepts", authors: "Silberschatz, Korth and Sudarshan", publisher: "McGraw Hill", edition: "7th", kind: "textbook" },
      ],
    },
    {
      name: "Operating Systems",
      code: "CS301",
      semester: 5,
      credits: 3,
      ltp: [3, 0, 0],
      courseType: "Core",
      units: [
        { unitNumber: 1, title: "Introduction and Processes", topics: ["OS structure", "System calls", "Process states", "PCB"], hours: 9 },
        { unitNumber: 2, title: "CPU Scheduling", topics: ["FCFS, SJF, priority, round robin", "Multilevel queues", "Scheduling criteria"], hours: 9 },
        { unitNumber: 3, title: "Synchronisation and Deadlocks", topics: ["Critical section", "Semaphores", "Monitors", "Deadlock detection and avoidance"], hours: 10 },
        { unitNumber: 4, title: "Memory Management", topics: ["Paging", "Segmentation", "Virtual memory", "Page replacement algorithms"], hours: 10 },
        { unitNumber: 5, title: "File and I/O Systems", topics: ["File allocation methods", "Directory structures", "Disk scheduling"], hours: 9 },
      ],
    },
    {
      name: "Design and Analysis of Algorithms",
      code: "CS302",
      semester: 5,
      credits: 3,
      ltp: [3, 0, 0],
      courseType: "Core",
      prerequisites: ["Data Structures"],
      units: [
        { unitNumber: 1, title: "Algorithm Analysis", topics: ["Asymptotic notation", "Recurrence solving", "Master theorem"], hours: 9 },
        { unitNumber: 2, title: "Divide and Conquer", topics: ["Merge sort", "Quick sort", "Binary search", "Strassen's multiplication"], hours: 9 },
        { unitNumber: 3, title: "Greedy Method", topics: ["Knapsack", "Job sequencing", "Huffman coding", "Minimum spanning trees"], hours: 9 },
        { unitNumber: 4, title: "Dynamic Programming", topics: ["Matrix chain multiplication", "Longest common subsequence", "All pairs shortest path"], hours: 10 },
        { unitNumber: 5, title: "Backtracking and NP-Completeness", topics: ["N-queens", "Graph colouring", "P, NP, NP-complete", "Reductions"], hours: 10 },
      ],
    },
    {
      name: "Computer Networks",
      code: "CS303",
      semester: 6,
      credits: 3,
      ltp: [3, 0, 0],
      courseType: "Core",
      units: [
        { unitNumber: 1, title: "Introduction and Physical Layer", topics: ["OSI and TCP/IP models", "Transmission media", "Switching"], hours: 9 },
        { unitNumber: 2, title: "Data Link Layer", topics: ["Framing", "Error detection and correction", "Sliding window protocols", "MAC and Ethernet"], hours: 10 },
        { unitNumber: 3, title: "Network Layer", topics: ["IPv4 addressing and subnetting", "Routing algorithms", "IPv6", "NAT"], hours: 10 },
        { unitNumber: 4, title: "Transport Layer", topics: ["UDP", "TCP connection management", "Flow and congestion control"], hours: 10 },
        { unitNumber: 5, title: "Application Layer", topics: ["DNS", "HTTP", "SMTP", "Network security basics"], hours: 9 },
      ],
    },
    {
      name: "Machine Learning",
      code: "CS401",
      semester: 7,
      credits: 3,
      ltp: [3, 0, 0],
      courseType: "Professional Elective",
      prerequisites: ["Linear Algebra and Calculus", "Design and Analysis of Algorithms"],
      units: [
        { unitNumber: 1, title: "Introduction to Machine Learning", topics: ["Supervised and unsupervised learning", "Training and generalisation", "Bias-variance trade-off"], hours: 9 },
        { unitNumber: 2, title: "Regression", topics: ["Linear regression", "Gradient descent", "Regularisation"], hours: 9 },
        { unitNumber: 3, title: "Classification", topics: ["Logistic regression", "Decision trees", "Naive Bayes", "Support vector machines"], hours: 10 },
        { unitNumber: 4, title: "Unsupervised Learning", topics: ["k-means", "Hierarchical clustering", "Principal component analysis"], hours: 9 },
        { unitNumber: 5, title: "Neural Networks", topics: ["Perceptron", "Backpropagation", "Overfitting and dropout"], hours: 10 },
      ],
    },
    {
      name: "Major Project",
      code: "CS499",
      semester: 8,
      credits: 12,
      ltp: [0, 0, 24],
      courseType: "Project",
      syllabusText:
        "A supervised project carried out over the semester, assessed on problem definition, literature survey, design, implementation, testing, documentation and defence.",
    },
  ],

  IT: [
    {
      name: "Data Structures through Python",
      code: "IT201",
      semester: 3,
      credits: 4,
      ltp: [3, 1, 0],
      courseType: "Core",
      units: [
        { unitNumber: 1, title: "Python Fundamentals for Data Structures", topics: ["Lists, tuples, dictionaries", "Comprehensions", "Complexity basics"], hours: 10 },
        { unitNumber: 2, title: "Linear Structures", topics: ["Stacks", "Queues", "Linked lists in Python"], hours: 11 },
        { unitNumber: 3, title: "Recursion and Sorting", topics: ["Recursion patterns", "Merge and quick sort", "Timsort behaviour"], hours: 10 },
        { unitNumber: 4, title: "Trees", topics: ["Binary trees", "BST operations", "Heaps via heapq"], hours: 11 },
        { unitNumber: 5, title: "Graphs and Hashing", topics: ["Graph representations", "BFS and DFS", "Dictionaries as hash tables"], hours: 11 },
      ],
    },
    {
      name: "Web Technologies",
      code: "IT202",
      semester: 3,
      credits: 3,
      ltp: [3, 0, 0],
      courseType: "Core",
      units: [
        { unitNumber: 1, title: "HTML and CSS", topics: ["Semantic markup", "Forms", "Flexbox and grid", "Responsive design"], hours: 9 },
        { unitNumber: 2, title: "JavaScript", topics: ["Types and scope", "DOM manipulation", "Events", "Fetch API"], hours: 10 },
        { unitNumber: 3, title: "Server-side Programming", topics: ["HTTP", "Request handling", "Sessions and cookies", "REST"], hours: 10 },
        { unitNumber: 4, title: "Databases for the Web", topics: ["SQL from an application", "Connection pooling", "ORM basics"], hours: 9 },
        { unitNumber: 5, title: "Security and Deployment", topics: ["XSS and CSRF", "Authentication", "HTTPS", "Deployment basics"], hours: 9 },
      ],
    },
    {
      name: "Information Security",
      code: "IT204",
      semester: 4,
      credits: 3,
      ltp: [3, 0, 0],
      courseType: "Core",
      units: [
        { unitNumber: 1, title: "Security Fundamentals", topics: ["CIA triad", "Threats and attacks", "Security services"], hours: 9 },
        { unitNumber: 2, title: "Symmetric Cryptography", topics: ["Classical ciphers", "DES", "AES", "Modes of operation"], hours: 10 },
        { unitNumber: 3, title: "Asymmetric Cryptography", topics: ["RSA", "Diffie-Hellman", "Digital signatures"], hours: 10 },
        { unitNumber: 4, title: "Hashing and Authentication", topics: ["SHA family", "MAC", "Kerberos", "Password storage"], hours: 9 },
        { unitNumber: 5, title: "Network and Application Security", topics: ["Firewalls", "IDS", "TLS", "OWASP top ten"], hours: 9 },
      ],
    },
  ],

  ECE: [
    {
      name: "Electronic Devices and Circuits",
      code: "EC201",
      semester: 3,
      credits: 3,
      ltp: [3, 0, 0],
      courseType: "Core",
      units: [
        { unitNumber: 1, title: "Semiconductor Diodes", topics: ["p-n junction", "V-I characteristics", "Zener diode", "Rectifiers"], hours: 10 },
        { unitNumber: 2, title: "Bipolar Junction Transistors", topics: ["Transistor operation", "CB, CE, CC configurations", "Biasing"], hours: 10 },
        { unitNumber: 3, title: "Field Effect Transistors", topics: ["JFET", "MOSFET", "Small signal models"], hours: 9 },
        { unitNumber: 4, title: "Amplifiers", topics: ["Single stage amplifiers", "Frequency response", "Multistage amplifiers"], hours: 10 },
        { unitNumber: 5, title: "Feedback and Oscillators", topics: ["Feedback topologies", "Barkhausen criterion", "RC and LC oscillators"], hours: 9 },
      ],
    },
    {
      name: "Signals and Systems",
      code: "EC202",
      semester: 3,
      credits: 3,
      ltp: [3, 0, 0],
      courseType: "Core",
      units: [
        { unitNumber: 1, title: "Signal Classification", topics: ["Continuous and discrete signals", "Energy and power signals", "Basic operations"], hours: 9 },
        { unitNumber: 2, title: "LTI Systems", topics: ["Impulse response", "Convolution", "Causality and stability"], hours: 10 },
        { unitNumber: 3, title: "Fourier Analysis", topics: ["Fourier series", "Fourier transform", "Properties"], hours: 10 },
        { unitNumber: 4, title: "Laplace and Z Transforms", topics: ["Region of convergence", "Transfer functions", "Inverse transforms"], hours: 10 },
        { unitNumber: 5, title: "Sampling", topics: ["Sampling theorem", "Aliasing", "Reconstruction"], hours: 8 },
      ],
    },
    {
      name: "Analog Communications",
      code: "EC204",
      semester: 4,
      credits: 3,
      ltp: [3, 0, 0],
      courseType: "Core",
      units: [
        { unitNumber: 1, title: "Amplitude Modulation", topics: ["AM, DSB-SC, SSB", "Modulation index", "Generation and detection"], hours: 10 },
        { unitNumber: 2, title: "Angle Modulation", topics: ["FM and PM", "Bandwidth", "Carson's rule"], hours: 10 },
        { unitNumber: 3, title: "Noise in Communication", topics: ["Noise figure", "SNR", "Noise in AM and FM"], hours: 9 },
        { unitNumber: 4, title: "Transmitters and Receivers", topics: ["Superheterodyne receiver", "Sensitivity and selectivity"], hours: 9 },
        { unitNumber: 5, title: "Pulse Modulation", topics: ["PAM, PWM, PPM", "Time division multiplexing"], hours: 9 },
      ],
    },
  ],
};

/**
 * Subjects R20 prescribes where R23 differs.
 *
 * A short list on purpose: what matters is that the two regulations are *not*
 * interchangeable, so content generated under R23 can never be shown for an R20
 * cohort. Anything not overridden here is shared by both.
 */
export const R20_OVERRIDES: Record<string, SeedSubject[]> = {
  CSE: [
    {
      name: "Data Structures through C++",
      code: "CS20-201",
      semester: 3,
      credits: 4,
      ltp: [3, 1, 0],
      courseType: "Core",
      units: [
        { unitNumber: 1, title: "C++ Review and ADTs", topics: ["Classes", "Templates", "Abstract data types"], hours: 10 },
        { unitNumber: 2, title: "Linear Lists", topics: ["Arrays", "Linked lists", "Stacks", "Queues"], hours: 12 },
        { unitNumber: 3, title: "Trees and Search Structures", topics: ["Binary trees", "BST", "AVL", "Splay trees"], hours: 12 },
        { unitNumber: 4, title: "Graphs", topics: ["Representations", "Traversals", "Spanning trees"], hours: 10 },
        { unitNumber: 5, title: "Sorting, Searching and Hashing", topics: ["Comparison sorts", "Radix sort", "Hash functions", "Collision resolution"], hours: 12 },
      ],
    },
    {
      name: "Mathematical Foundations of Computer Science",
      code: "CS20-204",
      semester: 4,
      credits: 3,
      ltp: [3, 0, 0],
      courseType: "Core",
      units: [
        { unitNumber: 1, title: "Statements and Notation", topics: ["Connectives", "Normal forms", "Inference theory"], hours: 9 },
        { unitNumber: 2, title: "Set Theory", topics: ["Relations", "Functions", "Lattices"], hours: 9 },
        { unitNumber: 3, title: "Algebraic Structures", topics: ["Semigroups", "Monoids", "Groups"], hours: 9 },
        { unitNumber: 4, title: "Elementary Combinatorics", topics: ["Counting", "Binomial coefficients", "Recurrence relations"], hours: 9 },
        { unitNumber: 5, title: "Graph Theory", topics: ["Basic concepts", "Spanning trees", "Chromatic numbers"], hours: 9 },
      ],
    },
  ],
  IT: [],
  ECE: [],
};

/** Colleges the curriculum is seeded for, by code. */
export const CURRICULUM_COLLEGE_CODES = ["ACET", "VRSEC", "RVRJC", "BEC", "AEC", "GVPCE"];

/** First-year subjects are shared across every branch of a regulation. */
export const SHARED_SUBJECTS = FIRST_YEAR;
