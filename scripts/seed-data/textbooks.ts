/**
 * Textbook catalogue seed data.
 *
 * Real books with real ISBNs and their actual chapter structure, chosen because
 * the curriculum seed already cites them by title in `referenceBooks` — so the
 * mapping attaches to something true rather than to invented titles that would
 * have to be thrown away later.
 *
 * Topics are the honest part of the invention. Chapter titles and page ranges
 * follow the published contents; the topic breakdown inside each chapter is
 * representative rather than transcribed, which is enough to build and exercise
 * the screen and is replaced by a real import when one exists.
 *
 * `matchTitles` is how a book finds the subjects that cite it: the curriculum's
 * `referenceBooks[].title` is matched against these, so a book renamed in the
 * curriculum does not silently lose its mapping.
 */

export type SeedTopic = {
  title: string;
  /** Minutes of reading. Used for "about 4 hours for this unit". */
  minutes?: number;
  difficulty?: "basic" | "intermediate" | "advanced";
  keywords?: string[];
};

export type SeedChapter = {
  chapterNumber: number;
  title: string;
  pageStart?: number;
  pageEnd?: number;
  topics: SeedTopic[];
};

export type SeedTextbook = {
  /** Stable key used by the subject mappings below. */
  key: string;
  title: string;
  subtitle?: string;
  authors: string[];
  publisher: string;
  edition?: string;
  year?: number;
  isbn13?: string;
  totalPages?: number;
  /** Titles as the curriculum cites them, for attaching to subjects. */
  matchTitles: string[];
  chapters: SeedChapter[];
};

/**
 * How a book's chapters line up with a syllabus unit.
 *
 * Keyed by subject code, because that is what `CurriculumSubject` is uniquely
 * identified by within a regulation and branch, and it is stable across the six
 * seeded colleges — the same MA101 exists at each of them.
 *
 * `units` is intentionally partial: a book that covers four of five units is
 * the normal case, and claiming the fifth would be the kind of quiet lie this
 * data exists to avoid.
 */
export type SeedSubjectMapping = {
  subjectCode: string;
  textbookKey: string;
  role: "primary" | "reference" | "supplementary";
  isPrimary: boolean;
  coveragePercent?: number;
  /** Syllabus unit number → the book's chapters that cover it. */
  units: { unitNumber: number; chapterNumbers: number[]; note?: string }[];
};

export const TEXTBOOKS: SeedTextbook[] = [
  {
    key: "grewal-hem",
    title: "Higher Engineering Mathematics",
    authors: ["B.S. Grewal"],
    publisher: "Khanna Publishers",
    edition: "44th",
    year: 2018,
    isbn13: "978-81-933284-9-1",
    totalPages: 1327,
    matchTitles: ["Higher Engineering Mathematics"],
    chapters: [
      {
        chapterNumber: 1,
        title: "Determinants and Matrices",
        pageStart: 25,
        pageEnd: 96,
        topics: [
          { title: "Determinants and their properties", minutes: 45, keywords: ["determinant", "minor", "cofactor"] },
          { title: "Matrix algebra and special matrices", minutes: 40 },
          { title: "Rank of a matrix", minutes: 50, difficulty: "intermediate", keywords: ["rank", "echelon"] },
          { title: "Echelon and normal form", minutes: 45, difficulty: "intermediate" },
          { title: "Consistency of a system of linear equations", minutes: 55, difficulty: "intermediate" },
          { title: "Gauss elimination and Gauss-Jordan method", minutes: 60, difficulty: "intermediate", keywords: ["gauss", "elimination"] },
        ],
      },
      {
        chapterNumber: 2,
        title: "Linear Transformations and Eigenvalues",
        pageStart: 97,
        pageEnd: 158,
        topics: [
          { title: "Linear transformations", minutes: 40 },
          { title: "Characteristic equation, eigenvalues and eigenvectors", minutes: 65, difficulty: "intermediate", keywords: ["eigenvalue", "eigenvector"] },
          { title: "Properties of eigenvalues", minutes: 35 },
          { title: "Cayley-Hamilton theorem", minutes: 45, difficulty: "intermediate" },
          { title: "Diagonalisation of a matrix", minutes: 55, difficulty: "advanced" },
          { title: "Quadratic forms and their nature", minutes: 50, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 3,
        title: "Differential Calculus",
        pageStart: 159,
        pageEnd: 232,
        topics: [
          { title: "Rolle's theorem and Lagrange's mean value theorem", minutes: 50, difficulty: "intermediate" },
          { title: "Cauchy's mean value theorem", minutes: 40, difficulty: "intermediate" },
          { title: "Taylor's and Maclaurin's series", minutes: 60, difficulty: "intermediate" },
          { title: "Indeterminate forms and L'Hospital's rule", minutes: 45 },
          { title: "Curvature and radius of curvature", minutes: 55, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 4,
        title: "Partial Differentiation",
        pageStart: 233,
        pageEnd: 310,
        topics: [
          { title: "Functions of several variables", minutes: 40 },
          { title: "Total derivative and chain rule", minutes: 50, difficulty: "intermediate" },
          { title: "Jacobians", minutes: 55, difficulty: "advanced", keywords: ["jacobian"] },
          { title: "Taylor's theorem for two variables", minutes: 45, difficulty: "advanced" },
          { title: "Maxima and minima of functions of two variables", minutes: 60, difficulty: "intermediate" },
          { title: "Lagrange's method of undetermined multipliers", minutes: 55, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 5,
        title: "Multiple Integrals",
        pageStart: 311,
        pageEnd: 392,
        topics: [
          { title: "Double integrals and change of order", minutes: 60, difficulty: "intermediate" },
          { title: "Area enclosed by plane curves", minutes: 45 },
          { title: "Triple integrals and volume", minutes: 55, difficulty: "intermediate" },
          { title: "Change of variables and polar coordinates", minutes: 50, difficulty: "advanced" },
          { title: "Beta and Gamma functions", minutes: 50, difficulty: "advanced" },
        ],
      },
    ],
  },

  {
    key: "kreyszig-aem",
    title: "Advanced Engineering Mathematics",
    authors: ["Erwin Kreyszig"],
    publisher: "Wiley",
    edition: "10th",
    year: 2015,
    isbn13: "978-0-470-45836-5",
    totalPages: 1283,
    matchTitles: ["Advanced Engineering Mathematics"],
    chapters: [
      {
        chapterNumber: 1,
        title: "First-Order ODEs",
        pageStart: 2,
        pageEnd: 60,
        topics: [
          { title: "Basic concepts and modelling", minutes: 40 },
          { title: "Separable ODEs", minutes: 45 },
          { title: "Exact ODEs and integrating factors", minutes: 55, difficulty: "intermediate" },
          { title: "Linear ODEs and Bernoulli equation", minutes: 60, difficulty: "intermediate" },
        ],
      },
      {
        chapterNumber: 2,
        title: "Second-Order Linear ODEs",
        pageStart: 61,
        pageEnd: 132,
        topics: [
          { title: "Homogeneous linear ODEs", minutes: 50 },
          { title: "Constant coefficients", minutes: 55, difficulty: "intermediate" },
          { title: "Method of undetermined coefficients", minutes: 60, difficulty: "intermediate" },
          { title: "Variation of parameters", minutes: 55, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 4,
        title: "Linear Algebra: Matrices and Vector Spaces",
        pageStart: 256,
        pageEnd: 340,
        topics: [
          { title: "Matrices and vectors", minutes: 40 },
          { title: "Linear systems and Gauss elimination", minutes: 55, difficulty: "intermediate" },
          { title: "Rank and vector space", minutes: 50, difficulty: "intermediate" },
          { title: "Eigenvalue problems", minutes: 65, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 10,
        title: "Vector Integral Calculus",
        pageStart: 413,
        pageEnd: 470,
        topics: [
          { title: "Line integrals", minutes: 50, difficulty: "intermediate" },
          { title: "Green's theorem in the plane", minutes: 55, difficulty: "advanced" },
          { title: "Divergence theorem of Gauss", minutes: 55, difficulty: "advanced" },
          { title: "Stokes's theorem", minutes: 55, difficulty: "advanced" },
        ],
      },
    ],
  },

  {
    key: "knr-c",
    title: "The C Programming Language",
    authors: ["Brian W. Kernighan", "Dennis M. Ritchie"],
    publisher: "Pearson",
    edition: "2nd",
    year: 1988,
    isbn13: "978-0-13-110362-7",
    totalPages: 272,
    matchTitles: ["The C Programming Language"],
    chapters: [
      {
        chapterNumber: 1,
        title: "A Tutorial Introduction",
        pageStart: 5,
        pageEnd: 36,
        topics: [
          { title: "Getting started and variables", minutes: 30 },
          { title: "The for statement and symbolic constants", minutes: 35 },
          { title: "Character input and output", minutes: 40 },
          { title: "Arrays and functions", minutes: 45, difficulty: "intermediate" },
          { title: "Arguments: call by value", minutes: 30, difficulty: "intermediate" },
        ],
      },
      {
        chapterNumber: 2,
        title: "Types, Operators and Expressions",
        pageStart: 37,
        pageEnd: 60,
        topics: [
          { title: "Variable names and data types", minutes: 30 },
          { title: "Constants and declarations", minutes: 30 },
          { title: "Arithmetic, relational and logical operators", minutes: 40 },
          { title: "Type conversions", minutes: 45, difficulty: "intermediate" },
          { title: "Bitwise operators", minutes: 50, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 3,
        title: "Control Flow",
        pageStart: 61,
        pageEnd: 74,
        topics: [
          { title: "If-else and else-if", minutes: 30 },
          { title: "Switch", minutes: 30 },
          { title: "Loops: while, for and do-while", minutes: 45 },
          { title: "Break, continue and goto", minutes: 30, difficulty: "intermediate" },
        ],
      },
      {
        chapterNumber: 4,
        title: "Functions and Program Structure",
        pageStart: 75,
        pageEnd: 102,
        topics: [
          { title: "Basics of functions", minutes: 40 },
          { title: "External variables and scope rules", minutes: 45, difficulty: "intermediate" },
          { title: "Header files and static variables", minutes: 35, difficulty: "intermediate" },
          { title: "Recursion", minutes: 50, difficulty: "intermediate" },
          { title: "The C preprocessor", minutes: 40, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 5,
        title: "Pointers and Arrays",
        pageStart: 103,
        pageEnd: 138,
        topics: [
          { title: "Pointers and addresses", minutes: 50, difficulty: "intermediate" },
          { title: "Pointers and function arguments", minutes: 45, difficulty: "intermediate" },
          { title: "Pointers and arrays, address arithmetic", minutes: 60, difficulty: "advanced" },
          { title: "Character pointers and functions", minutes: 45, difficulty: "advanced" },
          { title: "Pointer arrays and multi-dimensional arrays", minutes: 55, difficulty: "advanced" },
          { title: "Command-line arguments", minutes: 35, difficulty: "intermediate" },
        ],
      },
      {
        chapterNumber: 6,
        title: "Structures",
        pageStart: 139,
        pageEnd: 164,
        topics: [
          { title: "Basics of structures", minutes: 40 },
          { title: "Structures and functions", minutes: 40, difficulty: "intermediate" },
          { title: "Arrays of structures", minutes: 45, difficulty: "intermediate" },
          { title: "Pointers to structures and self-referential structures", minutes: 55, difficulty: "advanced" },
          { title: "Typedef and unions", minutes: 40, difficulty: "intermediate" },
        ],
      },
      {
        chapterNumber: 7,
        title: "Input and Output",
        pageStart: 165,
        pageEnd: 186,
        topics: [
          { title: "Standard input and output", minutes: 30 },
          { title: "Formatted output: printf", minutes: 35 },
          { title: "Formatted input: scanf", minutes: 35 },
          { title: "File access", minutes: 50, difficulty: "intermediate" },
          { title: "Error handling: stderr and exit", minutes: 30, difficulty: "intermediate" },
        ],
      },
    ],
  },

  {
    key: "weiss-dsaa",
    title: "Data Structures and Algorithm Analysis in C",
    authors: ["Mark Allen Weiss"],
    publisher: "Pearson",
    edition: "2nd",
    year: 1996,
    isbn13: "978-0-201-49840-0",
    totalPages: 528,
    matchTitles: [
      "Data Structures and Algorithm Analysis in C",
      "Fundamentals of Data Structures in C",
    ],
    chapters: [
      {
        chapterNumber: 2,
        title: "Algorithm Analysis",
        pageStart: 33,
        pageEnd: 60,
        topics: [
          { title: "Mathematical background and asymptotic notation", minutes: 50, difficulty: "intermediate", keywords: ["big-o", "asymptotic"] },
          { title: "Model of computation", minutes: 30 },
          { title: "Running-time calculations", minutes: 55, difficulty: "intermediate" },
        ],
      },
      {
        chapterNumber: 3,
        title: "Lists, Stacks and Queues",
        pageStart: 61,
        pageEnd: 118,
        topics: [
          { title: "Abstract data types", minutes: 30 },
          { title: "Singly linked lists and their implementation", minutes: 55, difficulty: "intermediate" },
          { title: "Doubly and circularly linked lists", minutes: 50, difficulty: "intermediate" },
          { title: "The stack ADT and applications", minutes: 55, difficulty: "intermediate", keywords: ["stack", "postfix"] },
          { title: "The queue ADT and circular queues", minutes: 50, difficulty: "intermediate" },
        ],
      },
      {
        chapterNumber: 4,
        title: "Trees",
        pageStart: 119,
        pageEnd: 186,
        topics: [
          { title: "Preliminaries and tree traversals", minutes: 50 },
          { title: "Binary trees and expression trees", minutes: 55, difficulty: "intermediate" },
          { title: "Binary search trees", minutes: 60, difficulty: "intermediate", keywords: ["bst"] },
          { title: "AVL trees and rotations", minutes: 70, difficulty: "advanced", keywords: ["avl", "rotation"] },
          { title: "Splay trees", minutes: 55, difficulty: "advanced" },
          { title: "B-trees", minutes: 60, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 5,
        title: "Hashing",
        pageStart: 187,
        pageEnd: 216,
        topics: [
          { title: "Hash function", minutes: 40, difficulty: "intermediate" },
          { title: "Separate chaining", minutes: 45, difficulty: "intermediate" },
          { title: "Open addressing: linear and quadratic probing", minutes: 60, difficulty: "advanced" },
          { title: "Rehashing", minutes: 35, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 6,
        title: "Priority Queues (Heaps)",
        pageStart: 217,
        pageEnd: 252,
        topics: [
          { title: "Model and simple implementations", minutes: 35 },
          { title: "Binary heap", minutes: 60, difficulty: "intermediate", keywords: ["heap"] },
          { title: "Applications of priority queues", minutes: 40, difficulty: "intermediate" },
          { title: "Heapsort", minutes: 50, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 7,
        title: "Sorting",
        pageStart: 253,
        pageEnd: 300,
        topics: [
          { title: "Insertion sort and lower bounds", minutes: 45 },
          { title: "Shellsort", minutes: 45, difficulty: "intermediate" },
          { title: "Mergesort", minutes: 55, difficulty: "intermediate" },
          { title: "Quicksort and pivot selection", minutes: 70, difficulty: "advanced", keywords: ["quicksort"] },
          { title: "External sorting", minutes: 45, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 9,
        title: "Graph Algorithms",
        pageStart: 335,
        pageEnd: 404,
        topics: [
          { title: "Definitions and representation", minutes: 40 },
          { title: "Topological sort", minutes: 45, difficulty: "intermediate" },
          { title: "Shortest-path algorithms: Dijkstra", minutes: 70, difficulty: "advanced", keywords: ["dijkstra"] },
          { title: "Minimum spanning tree: Prim and Kruskal", minutes: 65, difficulty: "advanced" },
          { title: "Depth-first search and applications", minutes: 55, difficulty: "advanced" },
        ],
      },
    ],
  },

  {
    key: "silberschatz-dbs",
    title: "Database System Concepts",
    authors: ["Abraham Silberschatz", "Henry F. Korth", "S. Sudarshan"],
    publisher: "McGraw Hill",
    edition: "7th",
    year: 2019,
    isbn13: "978-0-07-802215-9",
    totalPages: 1376,
    matchTitles: ["Database System Concepts"],
    chapters: [
      {
        chapterNumber: 1,
        title: "Introduction",
        pageStart: 1,
        pageEnd: 32,
        topics: [
          { title: "Database-system applications and purpose", minutes: 35 },
          { title: "View of data and data abstraction", minutes: 40 },
          { title: "Database languages", minutes: 35 },
          { title: "Database architecture and users", minutes: 40 },
        ],
      },
      {
        chapterNumber: 2,
        title: "Introduction to the Relational Model",
        pageStart: 37,
        pageEnd: 64,
        topics: [
          { title: "Structure of relational databases", minutes: 40 },
          { title: "Database schema and keys", minutes: 45, difficulty: "intermediate" },
          { title: "Schema diagrams", minutes: 25 },
          { title: "Relational query languages and algebra", minutes: 60, difficulty: "intermediate" },
        ],
      },
      {
        chapterNumber: 3,
        title: "Introduction to SQL",
        pageStart: 65,
        pageEnd: 122,
        topics: [
          { title: "Overview of the SQL query language and DDL", minutes: 45 },
          { title: "Basic query structure and set operations", minutes: 55, difficulty: "intermediate" },
          { title: "Null values and aggregate functions", minutes: 50, difficulty: "intermediate" },
          { title: "Nested subqueries", minutes: 60, difficulty: "advanced" },
          { title: "Modification of the database", minutes: 40, difficulty: "intermediate" },
        ],
      },
      {
        chapterNumber: 6,
        title: "Database Design Using the E-R Model",
        pageStart: 241,
        pageEnd: 300,
        topics: [
          { title: "Overview of the design process", minutes: 30 },
          { title: "The entity-relationship model", minutes: 55, difficulty: "intermediate", keywords: ["er model", "entity"] },
          { title: "Complex attributes and mapping cardinalities", minutes: 50, difficulty: "intermediate" },
          { title: "Removing redundant attributes and E-R diagrams", minutes: 45, difficulty: "intermediate" },
          { title: "Reduction to relational schemas", minutes: 60, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 7,
        title: "Relational Database Design",
        pageStart: 303,
        pageEnd: 366,
        topics: [
          { title: "Features of good relational designs", minutes: 40 },
          { title: "Functional dependencies", minutes: 60, difficulty: "intermediate", keywords: ["functional dependency"] },
          { title: "Normal forms: 1NF, 2NF, 3NF", minutes: 70, difficulty: "intermediate", keywords: ["normalisation", "3nf"] },
          { title: "Boyce-Codd normal form", minutes: 55, difficulty: "advanced", keywords: ["bcnf"] },
          { title: "Decomposition and dependency preservation", minutes: 60, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 17,
        title: "Transactions",
        pageStart: 799,
        pageEnd: 838,
        topics: [
          { title: "Transaction concept and ACID properties", minutes: 50, difficulty: "intermediate", keywords: ["acid", "transaction"] },
          { title: "Serializability", minutes: 60, difficulty: "advanced" },
          { title: "Recoverability and isolation levels", minutes: 55, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 18,
        title: "Concurrency Control",
        pageStart: 839,
        pageEnd: 900,
        topics: [
          { title: "Lock-based protocols and two-phase locking", minutes: 65, difficulty: "advanced", keywords: ["2pl", "locking"] },
          { title: "Deadlock handling", minutes: 50, difficulty: "advanced" },
          { title: "Timestamp-based protocols", minutes: 50, difficulty: "advanced" },
        ],
      },
    ],
  },

  {
    key: "schildt-java",
    title: "Java: The Complete Reference",
    authors: ["Herbert Schildt"],
    publisher: "McGraw Hill",
    edition: "11th",
    year: 2018,
    isbn13: "978-1-260-44023-2",
    totalPages: 1248,
    matchTitles: ["Java: The Complete Reference"],
    chapters: [
      {
        chapterNumber: 2,
        title: "An Overview of Java",
        pageStart: 17,
        pageEnd: 36,
        topics: [
          { title: "Object-oriented programming principles", minutes: 45 },
          { title: "A first simple program", minutes: 30 },
          { title: "Two control statements", minutes: 35 },
          { title: "Using blocks of code", minutes: 25 },
        ],
      },
      {
        chapterNumber: 6,
        title: "Introducing Classes",
        pageStart: 111,
        pageEnd: 134,
        topics: [
          { title: "Class fundamentals and objects", minutes: 45 },
          { title: "Constructors and the this keyword", minutes: 50, difficulty: "intermediate" },
          { title: "Garbage collection", minutes: 30, difficulty: "intermediate" },
          { title: "Overloading methods and constructors", minutes: 50, difficulty: "intermediate" },
        ],
      },
      {
        chapterNumber: 8,
        title: "Inheritance",
        pageStart: 161,
        pageEnd: 186,
        topics: [
          { title: "Inheritance basics and member access", minutes: 45, difficulty: "intermediate" },
          { title: "Using super", minutes: 40, difficulty: "intermediate" },
          { title: "Method overriding and dynamic dispatch", minutes: 60, difficulty: "advanced", keywords: ["polymorphism"] },
          { title: "Abstract classes and final", minutes: 45, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 9,
        title: "Packages and Interfaces",
        pageStart: 187,
        pageEnd: 212,
        topics: [
          { title: "Packages and access protection", minutes: 45, difficulty: "intermediate" },
          { title: "Importing packages", minutes: 30 },
          { title: "Interfaces and default methods", minutes: 60, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 10,
        title: "Exception Handling",
        pageStart: 213,
        pageEnd: 234,
        topics: [
          { title: "Exception types and try-catch", minutes: 50, difficulty: "intermediate" },
          { title: "Multiple catch clauses and nested try", minutes: 45, difficulty: "intermediate" },
          { title: "Throw, throws and finally", minutes: 50, difficulty: "intermediate" },
          { title: "Creating your own exception subclasses", minutes: 40, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 11,
        title: "Multithreaded Programming",
        pageStart: 235,
        pageEnd: 268,
        topics: [
          { title: "The Java thread model", minutes: 45, difficulty: "intermediate" },
          { title: "Creating threads: Thread and Runnable", minutes: 55, difficulty: "intermediate" },
          { title: "Thread priorities and synchronization", minutes: 65, difficulty: "advanced", keywords: ["synchronized"] },
          { title: "Interthread communication and deadlock", minutes: 60, difficulty: "advanced" },
        ],
      },
    ],
  },

  {
    key: "khurmi-tom",
    title: "Theory of Machines",
    authors: ["R.S. Khurmi", "J.K. Gupta"],
    publisher: "S. Chand",
    edition: "14th",
    year: 2005,
    isbn13: "978-81-219-2524-6",
    totalPages: 1071,
    matchTitles: ["Theory of Machines"],
    chapters: [
      {
        chapterNumber: 1,
        title: "Introduction to Mechanisms",
        pageStart: 1,
        pageEnd: 40,
        topics: [
          { title: "Kinematic links, pairs and chains", minutes: 50 },
          { title: "Degrees of freedom and Grubler's criterion", minutes: 55, difficulty: "intermediate" },
          { title: "Inversions of the four-bar chain", minutes: 60, difficulty: "intermediate" },
          { title: "Slider-crank and its inversions", minutes: 55, difficulty: "intermediate" },
        ],
      },
      {
        chapterNumber: 2,
        title: "Velocity and Acceleration Analysis",
        pageStart: 41,
        pageEnd: 120,
        topics: [
          { title: "Velocity of a point on a link", minutes: 50, difficulty: "intermediate" },
          { title: "Instantaneous centre method", minutes: 60, difficulty: "advanced" },
          { title: "Relative velocity method", minutes: 55, difficulty: "intermediate" },
          { title: "Coriolis component of acceleration", minutes: 65, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 6,
        title: "Cams",
        pageStart: 221,
        pageEnd: 280,
        topics: [
          { title: "Classification of cams and followers", minutes: 40 },
          { title: "Displacement, velocity and acceleration diagrams", minutes: 60, difficulty: "intermediate" },
          { title: "Cam profile construction", minutes: 70, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 8,
        title: "Gears and Gear Trains",
        pageStart: 331,
        pageEnd: 420,
        topics: [
          { title: "Classification and terminology of gears", minutes: 45 },
          { title: "Law of gearing and involute profile", minutes: 60, difficulty: "intermediate" },
          { title: "Interference and minimum number of teeth", minutes: 55, difficulty: "advanced" },
          { title: "Simple, compound and reverted gear trains", minutes: 60, difficulty: "intermediate" },
          { title: "Epicyclic gear trains and torque", minutes: 70, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 15,
        title: "Balancing and Vibrations",
        pageStart: 675,
        pageEnd: 780,
        topics: [
          { title: "Balancing of rotating masses", minutes: 60, difficulty: "intermediate" },
          { title: "Balancing of reciprocating masses", minutes: 60, difficulty: "advanced" },
          { title: "Free longitudinal and transverse vibrations", minutes: 65, difficulty: "advanced" },
          { title: "Damped and forced vibrations", minutes: 60, difficulty: "advanced" },
        ],
      },
    ],
  },

  {
    key: "rajput-thermal",
    title: "Engineering Thermodynamics",
    authors: ["R.K. Rajput"],
    publisher: "Laxmi Publications",
    edition: "4th",
    year: 2010,
    isbn13: "978-93-80386-04-4",
    totalPages: 1024,
    matchTitles: ["Engineering Thermodynamics", "Thermodynamics"],
    chapters: [
      {
        chapterNumber: 1,
        title: "Basic Concepts and Definitions",
        pageStart: 1,
        pageEnd: 44,
        topics: [
          { title: "Thermodynamic systems, boundary and surroundings", minutes: 40 },
          { title: "Properties, state and process", minutes: 45 },
          { title: "Thermodynamic equilibrium and quasi-static process", minutes: 50, difficulty: "intermediate" },
          { title: "Zeroth law and temperature scales", minutes: 40 },
        ],
      },
      {
        chapterNumber: 3,
        title: "First Law of Thermodynamics",
        pageStart: 87,
        pageEnd: 160,
        topics: [
          { title: "Internal energy and the first law for a cycle", minutes: 55, difficulty: "intermediate" },
          { title: "Application to non-flow processes", minutes: 60, difficulty: "intermediate" },
          { title: "Steady flow energy equation", minutes: 65, difficulty: "advanced", keywords: ["sfee"] },
          { title: "Applications: nozzle, turbine, compressor", minutes: 60, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 4,
        title: "Second Law and Entropy",
        pageStart: 161,
        pageEnd: 248,
        topics: [
          { title: "Kelvin-Planck and Clausius statements", minutes: 50, difficulty: "intermediate" },
          { title: "Carnot cycle and Carnot efficiency", minutes: 60, difficulty: "intermediate" },
          { title: "Clausius inequality and entropy", minutes: 65, difficulty: "advanced", keywords: ["entropy"] },
          { title: "Entropy change in processes and irreversibility", minutes: 60, difficulty: "advanced" },
          { title: "Availability and exergy", minutes: 55, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 6,
        title: "Properties of Steam",
        pageStart: 305,
        pageEnd: 380,
        topics: [
          { title: "Formation of steam and dryness fraction", minutes: 50, difficulty: "intermediate" },
          { title: "Steam tables and Mollier chart", minutes: 55, difficulty: "intermediate" },
          { title: "Steam calorimeters", minutes: 45, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 9,
        title: "Gas Power Cycles",
        pageStart: 465,
        pageEnd: 550,
        topics: [
          { title: "Otto cycle", minutes: 55, difficulty: "intermediate" },
          { title: "Diesel and dual cycles", minutes: 60, difficulty: "intermediate" },
          { title: "Brayton cycle and gas turbines", minutes: 60, difficulty: "advanced" },
          { title: "Comparison of cycles and air-standard efficiency", minutes: 50, difficulty: "advanced" },
        ],
      },
    ],
  },

  {
    key: "bansal-fm",
    title: "A Textbook of Fluid Mechanics and Hydraulic Machines",
    authors: ["R.K. Bansal"],
    publisher: "Laxmi Publications",
    edition: "9th",
    year: 2010,
    isbn13: "978-81-318-0815-3",
    totalPages: 1093,
    matchTitles: [
      "A Textbook of Fluid Mechanics and Hydraulic Machines",
      "Fluid Mechanics and Hydraulic Machines",
      "Fluid Mechanics",
    ],
    chapters: [
      {
        chapterNumber: 1,
        title: "Properties of Fluids",
        pageStart: 1,
        pageEnd: 40,
        topics: [
          { title: "Density, specific weight and specific gravity", minutes: 35 },
          { title: "Viscosity and Newton's law of viscosity", minutes: 55, difficulty: "intermediate" },
          { title: "Surface tension and capillarity", minutes: 45, difficulty: "intermediate" },
          { title: "Compressibility and bulk modulus", minutes: 40, difficulty: "intermediate" },
        ],
      },
      {
        chapterNumber: 2,
        title: "Pressure and its Measurement",
        pageStart: 41,
        pageEnd: 86,
        topics: [
          { title: "Pascal's law and hydrostatic law", minutes: 45 },
          { title: "Absolute, gauge and vacuum pressure", minutes: 35 },
          { title: "Manometers: simple and differential", minutes: 55, difficulty: "intermediate" },
        ],
      },
      {
        chapterNumber: 5,
        title: "Kinematics of Flow",
        pageStart: 173,
        pageEnd: 250,
        topics: [
          { title: "Types of flow and continuity equation", minutes: 55, difficulty: "intermediate" },
          { title: "Velocity potential and stream function", minutes: 60, difficulty: "advanced" },
          { title: "Flow nets and vortex flow", minutes: 50, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 6,
        title: "Dynamics of Fluid Flow",
        pageStart: 251,
        pageEnd: 330,
        topics: [
          { title: "Euler's equation of motion", minutes: 55, difficulty: "advanced" },
          { title: "Bernoulli's equation and applications", minutes: 65, difficulty: "intermediate", keywords: ["bernoulli"] },
          { title: "Venturimeter, orificemeter and pitot tube", minutes: 60, difficulty: "intermediate" },
          { title: "Momentum equation and forces on bends", minutes: 55, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 10,
        title: "Viscous Flow and Flow Through Pipes",
        pageStart: 445,
        pageEnd: 540,
        topics: [
          { title: "Laminar flow through circular pipes", minutes: 60, difficulty: "advanced" },
          { title: "Reynolds number and laminar-turbulent transition", minutes: 50, difficulty: "intermediate" },
          { title: "Darcy-Weisbach equation and major losses", minutes: 60, difficulty: "intermediate" },
          { title: "Minor losses and hydraulic gradient line", minutes: 50, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 18,
        title: "Centrifugal Pumps",
        pageStart: 875,
        pageEnd: 940,
        topics: [
          { title: "Main parts and work done by impeller", minutes: 55, difficulty: "intermediate" },
          { title: "Heads, efficiencies and minimum starting speed", minutes: 60, difficulty: "advanced" },
          { title: "Specific speed and characteristic curves", minutes: 50, difficulty: "advanced" },
        ],
      },
    ],
  },

  {
    key: "bhavikatti-som",
    title: "Strength of Materials",
    authors: ["S.S. Bhavikatti"],
    publisher: "Vikas Publishing",
    edition: "4th",
    year: 2013,
    isbn13: "978-93-259-6070-8",
    totalPages: 640,
    matchTitles: ["Strength of Materials", "Mechanics of Solids"],
    chapters: [
      {
        chapterNumber: 1,
        title: "Simple Stresses and Strains",
        pageStart: 1,
        pageEnd: 58,
        topics: [
          { title: "Stress, strain and Hooke's law", minutes: 45 },
          { title: "Elastic constants and their relationships", minutes: 55, difficulty: "intermediate" },
          { title: "Bars of varying section and composite bars", minutes: 60, difficulty: "intermediate" },
          { title: "Thermal stresses", minutes: 50, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 3,
        title: "Principal Stresses and Strains",
        pageStart: 95,
        pageEnd: 140,
        topics: [
          { title: "Stresses on an inclined plane", minutes: 55, difficulty: "intermediate" },
          { title: "Principal planes and principal stresses", minutes: 60, difficulty: "advanced" },
          { title: "Mohr's circle of stress", minutes: 65, difficulty: "advanced", keywords: ["mohr"] },
        ],
      },
      {
        chapterNumber: 5,
        title: "Shear Force and Bending Moment",
        pageStart: 175,
        pageEnd: 240,
        topics: [
          { title: "Types of beams and loading", minutes: 40 },
          { title: "SF and BM diagrams for cantilevers", minutes: 60, difficulty: "intermediate" },
          { title: "SF and BM diagrams for simply supported beams", minutes: 65, difficulty: "intermediate" },
          { title: "Point of contraflexure", minutes: 40, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 6,
        title: "Stresses in Beams",
        pageStart: 241,
        pageEnd: 310,
        topics: [
          { title: "Theory of simple bending", minutes: 55, difficulty: "intermediate" },
          { title: "Section modulus and moment of resistance", minutes: 55, difficulty: "intermediate" },
          { title: "Shear stress distribution in beams", minutes: 60, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 9,
        title: "Torsion of Circular Shafts",
        pageStart: 411,
        pageEnd: 460,
        topics: [
          { title: "Theory of pure torsion", minutes: 50, difficulty: "intermediate" },
          { title: "Power transmitted by a shaft", minutes: 45, difficulty: "intermediate" },
          { title: "Combined bending and torsion", minutes: 60, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 11,
        title: "Columns and Struts",
        pageStart: 501,
        pageEnd: 550,
        topics: [
          { title: "Euler's theory of columns", minutes: 55, difficulty: "advanced" },
          { title: "Effective length and slenderness ratio", minutes: 45, difficulty: "intermediate" },
          { title: "Rankine's formula", minutes: 50, difficulty: "advanced" },
        ],
      },
    ],
  },

  {
    key: "arora-rac",
    title: "Refrigeration and Air Conditioning",
    authors: ["C.P. Arora"],
    publisher: "McGraw Hill",
    edition: "3rd",
    year: 2008,
    isbn13: "978-0-07-008390-8",
    totalPages: 838,
    matchTitles: ["Refrigeration and Air Conditioning"],
    chapters: [
      {
        chapterNumber: 2,
        title: "Refrigerating Machine and Reversed Carnot Cycle",
        pageStart: 33,
        pageEnd: 78,
        topics: [
          { title: "Refrigerating machine and heat pump", minutes: 40 },
          { title: "Reversed Carnot cycle and COP", minutes: 55, difficulty: "intermediate" },
          { title: "Gas as a refrigerant: the Bell-Coleman cycle", minutes: 55, difficulty: "intermediate" },
          { title: "Aircraft refrigeration systems", minutes: 50, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 3,
        title: "Vapour Compression System",
        pageStart: 79,
        pageEnd: 148,
        topics: [
          { title: "Simple saturation cycle on p-h and T-s diagrams", minutes: 60, difficulty: "intermediate" },
          { title: "Effect of superheating and subcooling", minutes: 55, difficulty: "intermediate" },
          { title: "Actual cycle and pressure drops", minutes: 50, difficulty: "advanced" },
          { title: "Multistage and cascade systems", minutes: 65, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 4,
        title: "Refrigerants",
        pageStart: 149,
        pageEnd: 200,
        topics: [
          { title: "Designation and desirable properties", minutes: 40 },
          { title: "Ozone depletion and global warming potential", minutes: 45, difficulty: "intermediate", keywords: ["odp", "gwp"] },
          { title: "Secondary refrigerants and brines", minutes: 40, difficulty: "intermediate" },
        ],
      },
      {
        chapterNumber: 12,
        title: "Vapour Absorption System",
        pageStart: 501,
        pageEnd: 556,
        topics: [
          { title: "Simple absorption system and its COP", minutes: 55, difficulty: "intermediate" },
          { title: "Aqua-ammonia system", minutes: 60, difficulty: "advanced" },
          { title: "Lithium bromide-water system", minutes: 55, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 14,
        title: "Psychrometry",
        pageStart: 601,
        pageEnd: 660,
        topics: [
          { title: "Psychrometric properties of air", minutes: 50, difficulty: "intermediate" },
          { title: "The psychrometric chart and processes", minutes: 60, difficulty: "intermediate" },
          { title: "Adiabatic saturation and wet bulb temperature", minutes: 50, difficulty: "advanced" },
          { title: "Bypass factor and apparatus dew point", minutes: 55, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 16,
        title: "Load Calculations and Air Conditioning Systems",
        pageStart: 701,
        pageEnd: 770,
        topics: [
          { title: "Sensible and latent heat loads", minutes: 55, difficulty: "intermediate" },
          { title: "Cooling load estimation", minutes: 65, difficulty: "advanced" },
          { title: "Summer and winter air conditioning", minutes: 50, difficulty: "intermediate" },
          { title: "Duct design and air distribution", minutes: 55, difficulty: "advanced" },
        ],
      },
    ],
  },

  {
    key: "chandrupatla-fem",
    title: "Introduction to Finite Elements in Engineering",
    authors: ["Tirupathi R. Chandrupatla", "Ashok D. Belegundu"],
    publisher: "Pearson",
    edition: "4th",
    year: 2011,
    isbn13: "978-0-13-216274-2",
    totalPages: 512,
    matchTitles: ["Introduction to Finite Elements in Engineering"],
    chapters: [
      {
        chapterNumber: 1,
        title: "Fundamental Concepts",
        pageStart: 1,
        pageEnd: 40,
        topics: [
          { title: "Historical background and outline of the method", minutes: 35 },
          { title: "Stresses, strains and boundary conditions", minutes: 50, difficulty: "intermediate" },
          { title: "Potential energy and equilibrium: the Rayleigh-Ritz method", minutes: 65, difficulty: "advanced" },
          { title: "The Galerkin method", minutes: 55, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 3,
        title: "One-Dimensional Problems",
        pageStart: 65,
        pageEnd: 128,
        topics: [
          { title: "Finite element modelling and coordinates", minutes: 45, difficulty: "intermediate" },
          { title: "Shape functions and the bar element stiffness matrix", minutes: 65, difficulty: "intermediate" },
          { title: "Assembly of the global stiffness matrix", minutes: 60, difficulty: "advanced" },
          { title: "Treatment of boundary conditions", minutes: 50, difficulty: "advanced" },
          { title: "Quadratic shape functions", minutes: 55, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 4,
        title: "Trusses",
        pageStart: 129,
        pageEnd: 166,
        topics: [
          { title: "Plane trusses and local-global transformation", minutes: 60, difficulty: "intermediate" },
          { title: "Element stiffness in global coordinates", minutes: 55, difficulty: "advanced" },
          { title: "Stress calculations and three-dimensional trusses", minutes: 55, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 5,
        title: "Beams and Frames",
        pageStart: 167,
        pageEnd: 210,
        topics: [
          { title: "Beam element and Hermite shape functions", minutes: 65, difficulty: "advanced" },
          { title: "Load vector and boundary considerations", minutes: 50, difficulty: "advanced" },
          { title: "Plane frames", minutes: 55, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 6,
        title: "Two-Dimensional Problems",
        pageStart: 211,
        pageEnd: 274,
        topics: [
          { title: "Plane stress and plane strain", minutes: 50, difficulty: "intermediate" },
          { title: "The constant strain triangle", minutes: 65, difficulty: "advanced", keywords: ["cst"] },
          { title: "Isoparametric representation and the Jacobian", minutes: 60, difficulty: "advanced" },
          { title: "Numerical integration by Gauss quadrature", minutes: 55, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 10,
        title: "Scalar Field Problems",
        pageStart: 355,
        pageEnd: 410,
        topics: [
          { title: "One-dimensional steady heat conduction", minutes: 55, difficulty: "intermediate" },
          { title: "Two-dimensional heat conduction", minutes: 60, difficulty: "advanced" },
          { title: "Torsion of non-circular sections", minutes: 50, difficulty: "advanced" },
        ],
      },
      {
        chapterNumber: 11,
        title: "Dynamic Considerations",
        pageStart: 411,
        pageEnd: 450,
        topics: [
          { title: "Consistent and lumped mass matrices", minutes: 55, difficulty: "advanced" },
          { title: "Eigenvalues and eigenvectors: natural frequencies", minutes: 65, difficulty: "advanced" },
          { title: "Mode shapes and modal analysis", minutes: 50, difficulty: "advanced" },
        ],
      },
    ],
  },

];

/**
 * Subject-to-book mappings, with the unit alignment.
 *
 * Only subjects whose syllabus units these books genuinely cover appear here.
 * Mapping every subject to something would make the screen look finished while
 * teaching students to distrust it, and an unmapped subject already has a
 * correct fallback: its own syllabus units and topics.
 */
export const SUBJECT_MAPPINGS: SeedSubjectMapping[] = [
  // ── Shared first year ───────────────────────────────────────────────────
  {
    subjectCode: "MA101", // Linear Algebra and Calculus
    textbookKey: "grewal-hem",
    role: "primary",
    isPrimary: true,
    coveragePercent: 90,
    units: [
      { unitNumber: 1, chapterNumbers: [1] },
      { unitNumber: 2, chapterNumbers: [2] },
      { unitNumber: 3, chapterNumbers: [3] },
      { unitNumber: 4, chapterNumbers: [4] },
      { unitNumber: 5, chapterNumbers: [5] },
    ],
  },
  {
    subjectCode: "MA101",
    textbookKey: "kreyszig-aem",
    role: "reference",
    isPrimary: false,
    coveragePercent: 55,
    units: [
      { unitNumber: 1, chapterNumbers: [4], note: "Chapter 4 covers matrices, rank and linear systems" },
      { unitNumber: 2, chapterNumbers: [4], note: "Eigenvalue problems, section 4.4 onward" },
    ],
  },
  {
    subjectCode: "MA102", // Differential Equations and Vector Calculus
    textbookKey: "kreyszig-aem",
    role: "primary",
    isPrimary: true,
    coveragePercent: 85,
    units: [
      { unitNumber: 1, chapterNumbers: [1] },
      { unitNumber: 2, chapterNumbers: [2] },
      { unitNumber: 3, chapterNumbers: [10] },
    ],
  },
  {
    subjectCode: "MA102",
    textbookKey: "grewal-hem",
    role: "reference",
    isPrimary: false,
    coveragePercent: 50,
    units: [{ unitNumber: 4, chapterNumbers: [5], note: "Multiple integrals for the vector calculus unit" }],
  },
  {
    subjectCode: "CS101", // Programming for Problem Solving using C
    textbookKey: "knr-c",
    role: "primary",
    isPrimary: true,
    coveragePercent: 95,
    units: [
      { unitNumber: 1, chapterNumbers: [1, 2] },
      { unitNumber: 2, chapterNumbers: [3] },
      { unitNumber: 3, chapterNumbers: [4] },
      { unitNumber: 4, chapterNumbers: [5] },
      { unitNumber: 5, chapterNumbers: [6, 7] },
    ],
  },

  // ── CSE ─────────────────────────────────────────────────────────────────
  {
    subjectCode: "CS201", // Data Structures
    textbookKey: "weiss-dsaa",
    role: "primary",
    isPrimary: true,
    coveragePercent: 90,
    units: [
      { unitNumber: 1, chapterNumbers: [2, 3] },
      { unitNumber: 2, chapterNumbers: [3] },
      { unitNumber: 3, chapterNumbers: [4] },
      { unitNumber: 4, chapterNumbers: [5, 6] },
      { unitNumber: 5, chapterNumbers: [7, 9] },
    ],
  },
  {
    subjectCode: "CS203", // Object Oriented Programming through Java
    textbookKey: "schildt-java",
    role: "primary",
    isPrimary: true,
    coveragePercent: 85,
    units: [
      { unitNumber: 1, chapterNumbers: [2, 6] },
      { unitNumber: 2, chapterNumbers: [8] },
      { unitNumber: 3, chapterNumbers: [9] },
      { unitNumber: 4, chapterNumbers: [10] },
      { unitNumber: 5, chapterNumbers: [11] },
    ],
  },
  {
    subjectCode: "CS205", // Database Management Systems
    textbookKey: "silberschatz-dbs",
    role: "primary",
    isPrimary: true,
    coveragePercent: 90,
    units: [
      { unitNumber: 1, chapterNumbers: [1, 2] },
      { unitNumber: 2, chapterNumbers: [3] },
      { unitNumber: 3, chapterNumbers: [6] },
      { unitNumber: 4, chapterNumbers: [7] },
      { unitNumber: 5, chapterNumbers: [17, 18] },
    ],
  },
  {
    subjectCode: "CS20-201", // Data Structures through C++ (R20 variant)
    textbookKey: "weiss-dsaa",
    role: "reference",
    isPrimary: true,
    coveragePercent: 70,
    units: [
      { unitNumber: 1, chapterNumbers: [2, 3], note: "Examples are in C; the structures are the same" },
      { unitNumber: 2, chapterNumbers: [4] },
      { unitNumber: 3, chapterNumbers: [5, 6] },
    ],
  },

  // ── Mechanical ──────────────────────────────────────────────────────────
  {
    subjectCode: "ME201", // Engineering Thermodynamics
    textbookKey: "rajput-thermal",
    role: "primary",
    isPrimary: true,
    coveragePercent: 90,
    units: [
      { unitNumber: 1, chapterNumbers: [1] },
      { unitNumber: 2, chapterNumbers: [3] },
      { unitNumber: 3, chapterNumbers: [4] },
      { unitNumber: 4, chapterNumbers: [6] },
      { unitNumber: 5, chapterNumbers: [9] },
    ],
  },
  {
    subjectCode: "ME202", // Mechanics of Solids
    textbookKey: "bhavikatti-som",
    role: "primary",
    isPrimary: true,
    coveragePercent: 88,
    units: [
      { unitNumber: 1, chapterNumbers: [1] },
      { unitNumber: 2, chapterNumbers: [3] },
      { unitNumber: 3, chapterNumbers: [5] },
      { unitNumber: 4, chapterNumbers: [6] },
      { unitNumber: 5, chapterNumbers: [9, 11] },
    ],
  },
  {
    subjectCode: "ME204", // Fluid Mechanics and Hydraulic Machines
    textbookKey: "bansal-fm",
    role: "primary",
    isPrimary: true,
    coveragePercent: 92,
    units: [
      { unitNumber: 1, chapterNumbers: [1, 2] },
      { unitNumber: 2, chapterNumbers: [5] },
      { unitNumber: 3, chapterNumbers: [6] },
      { unitNumber: 4, chapterNumbers: [10] },
      { unitNumber: 5, chapterNumbers: [18], note: "Turbines are in chapter 17, pumps in 18" },
    ],
  },
  {
    subjectCode: "ME205", // Kinematics of Machinery
    textbookKey: "khurmi-tom",
    role: "primary",
    isPrimary: true,
    coveragePercent: 80,
    units: [
      { unitNumber: 1, chapterNumbers: [1] },
      { unitNumber: 2, chapterNumbers: [2] },
      { unitNumber: 3, chapterNumbers: [6] },
      { unitNumber: 4, chapterNumbers: [8] },
    ],
  },
  {
    subjectCode: "ME301", // Dynamics of Machinery
    textbookKey: "khurmi-tom",
    role: "primary",
    isPrimary: true,
    coveragePercent: 70,
    units: [
      { unitNumber: 3, chapterNumbers: [15], note: "Balancing of rotating and reciprocating masses" },
      { unitNumber: 4, chapterNumbers: [15], note: "Free vibrations, later sections of the chapter" },
      { unitNumber: 5, chapterNumbers: [15], note: "Forced vibrations and whirling" },
    ],
  },
  {
    subjectCode: "ME302", // Design of Machine Elements
    textbookKey: "bhavikatti-som",
    role: "reference",
    isPrimary: true,
    coveragePercent: 40,
    units: [
      { unitNumber: 1, chapterNumbers: [3], note: "Theories of failure build on principal stresses" },
      { unitNumber: 4, chapterNumbers: [9], note: "Shaft design rests on the torsion theory here" },
    ],
  },
  {
    subjectCode: "ME304", // Thermal Engineering
    textbookKey: "rajput-thermal",
    role: "reference",
    isPrimary: true,
    coveragePercent: 45,
    units: [{ unitNumber: 5, chapterNumbers: [9], note: "Gas power cycles underpin the plant cycles unit" }],
  },

  // Semester 7, which is where a 2023 admission actually sits this year. Without
  // these two, the seeded Mechanical student reaches a curriculum with subjects
  // and syllabus units but nothing to read.
  {
    subjectCode: "ME401", // Refrigeration and Air Conditioning
    textbookKey: "arora-rac",
    role: "primary",
    isPrimary: true,
    coveragePercent: 92,
    units: [
      { unitNumber: 1, chapterNumbers: [2] },
      { unitNumber: 2, chapterNumbers: [3] },
      { unitNumber: 3, chapterNumbers: [4, 12] },
      { unitNumber: 4, chapterNumbers: [14] },
      { unitNumber: 5, chapterNumbers: [16] },
    ],
  },
  {
    subjectCode: "ME402", // Finite Element Methods
    textbookKey: "chandrupatla-fem",
    role: "primary",
    isPrimary: true,
    coveragePercent: 90,
    units: [
      { unitNumber: 1, chapterNumbers: [1] },
      { unitNumber: 2, chapterNumbers: [3, 4] },
      { unitNumber: 3, chapterNumbers: [5] },
      { unitNumber: 4, chapterNumbers: [6] },
      { unitNumber: 5, chapterNumbers: [10, 11] },
    ],
  },
];
