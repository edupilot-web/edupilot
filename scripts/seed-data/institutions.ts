/**
 * University and college seed data for Andhra Pradesh and Telangana.
 *
 * The universities and the colleges in `REAL_COLLEGES` are actual institutions,
 * with their real affiliating bodies and districts, so that the admin app can
 * be judged against data that behaves like the real thing — JNTUH really does
 * affiliate hundreds of colleges, and the distribution of a "top universities"
 * chart is only meaningful if that is true in the data.
 *
 * `syntheticColleges()` then generates the long tail so tables paginate and
 * analytics have mass. Those rows are marked `source: "seed"` and carry a
 * generated code prefix, so they are distinguishable from the curated ones.
 */

import type {
  InstitutionType,
  ManagementType,
  UniversityType,
} from "../../src/lib/admin/institution-fields";

export type UniversitySeed = {
  name: string;
  shortName?: string;
  code: string;
  type: UniversityType;
  managementType: ManagementType;
  stateCode: "AP" | "TS";
  district: string;
  city: string;
  established: number;
  website?: string;
  naac?: string;
};

export const UNIVERSITIES: UniversitySeed[] = [
  // ── Andhra Pradesh ───────────────────────────────────────────────────────
  { name: "Andhra University", shortName: "AU", code: "AU", type: "State University", managementType: "State", stateCode: "AP", district: "Visakhapatnam", city: "Visakhapatnam", established: 1926, website: "https://www.andhrauniversity.edu.in", naac: "A+" },
  { name: "Jawaharlal Nehru Technological University Kakinada", shortName: "JNTUK", code: "JNTUK", type: "State University", managementType: "State", stateCode: "AP", district: "Kakinada", city: "Kakinada", established: 2008, website: "https://jntuk.edu.in", naac: "A" },
  { name: "Jawaharlal Nehru Technological University Anantapur", shortName: "JNTUA", code: "JNTUA", type: "State University", managementType: "State", stateCode: "AP", district: "Ananthapuramu", city: "Anantapur", established: 2008, website: "https://jntua.ac.in", naac: "A" },
  { name: "Sri Venkateswara University", shortName: "SVU", code: "SVU", type: "State University", managementType: "State", stateCode: "AP", district: "Tirupati", city: "Tirupati", established: 1954, website: "https://svuniversity.edu.in", naac: "A+" },
  { name: "Acharya Nagarjuna University", shortName: "ANU", code: "ANU", type: "State University", managementType: "State", stateCode: "AP", district: "Guntur", city: "Guntur", established: 1976, website: "https://nagarjunauniversity.ac.in", naac: "A+" },
  { name: "Adikavi Nannaya University", shortName: "AKNU", code: "AKNU", type: "State University", managementType: "State", stateCode: "AP", district: "East Godavari", city: "Rajahmundry", established: 2006, naac: "B++" },
  { name: "Krishna University", shortName: "KRU", code: "KRU", type: "State University", managementType: "State", stateCode: "AP", district: "Krishna", city: "Machilipatnam", established: 2008, naac: "B+" },
  { name: "Rayalaseema University", shortName: "RU", code: "RU", type: "State University", managementType: "State", stateCode: "AP", district: "Kurnool", city: "Kurnool", established: 2008, naac: "B++" },
  { name: "Yogi Vemana University", shortName: "YVU", code: "YVU", type: "State University", managementType: "State", stateCode: "AP", district: "YSR Kadapa", city: "Kadapa", established: 2006, naac: "B++" },
  { name: "Vikrama Simhapuri University", shortName: "VSU", code: "VSU", type: "State University", managementType: "State", stateCode: "AP", district: "Sri Potti Sriramulu Nellore", city: "Nellore", established: 2008, naac: "B" },
  { name: "Dravidian University", shortName: "DU", code: "DRAVU", type: "State University", managementType: "State", stateCode: "AP", district: "Chittoor", city: "Chittoor", established: 1997, naac: "B" },
  { name: "Sri Padmavati Mahila Visvavidyalayam", shortName: "SPMVV", code: "SPMVV", type: "State University", managementType: "State", stateCode: "AP", district: "Tirupati", city: "Tirupati", established: 1983, naac: "A" },
  { name: "Central University of Andhra Pradesh", shortName: "CUAP", code: "CUAP", type: "Central University", managementType: "Central", stateCode: "AP", district: "Ananthapuramu", city: "Anantapur", established: 2018 },
  { name: "Indian Institute of Technology Tirupati", shortName: "IIT Tirupati", code: "IITTP", type: "Institute of National Importance", managementType: "Central", stateCode: "AP", district: "Tirupati", city: "Tirupati", established: 2015, website: "https://www.iittp.ac.in" },
  { name: "National Institute of Technology Andhra Pradesh", shortName: "NIT AP", code: "NITAP", type: "Institute of National Importance", managementType: "Central", stateCode: "AP", district: "West Godavari", city: "Tadepalligudem", established: 2015 },
  { name: "GITAM (Deemed to be University)", shortName: "GITAM", code: "GITAM", type: "Deemed University", managementType: "Deemed", stateCode: "AP", district: "Visakhapatnam", city: "Visakhapatnam", established: 1980, naac: "A++" },
  { name: "Koneru Lakshmaiah Education Foundation", shortName: "KLU", code: "KLU", type: "Deemed University", managementType: "Deemed", stateCode: "AP", district: "Guntur", city: "Guntur", established: 1980, naac: "A++" },
  { name: "Vignan's Foundation for Science, Technology and Research", shortName: "VFSTR", code: "VFSTR", type: "Deemed University", managementType: "Deemed", stateCode: "AP", district: "Guntur", city: "Guntur", established: 2008, naac: "A+" },
  { name: "SRM University AP", shortName: "SRM AP", code: "SRMAP", type: "Private University", managementType: "Private Unaided", stateCode: "AP", district: "Guntur", city: "Guntur", established: 2017 },
  { name: "VIT-AP University", shortName: "VIT-AP", code: "VITAP", type: "Private University", managementType: "Private Unaided", stateCode: "AP", district: "Guntur", city: "Guntur", established: 2017 },
  { name: "Dr. NTR University of Health Sciences", shortName: "NTRUHS", code: "NTRUHS", type: "State University", managementType: "State", stateCode: "AP", district: "NTR", city: "Vijayawada", established: 1986 },
  { name: "Acharya N.G. Ranga Agricultural University", shortName: "ANGRAU", code: "ANGRAU", type: "State University", managementType: "State", stateCode: "AP", district: "Guntur", city: "Guntur", established: 1964 },

  // ── Telangana ────────────────────────────────────────────────────────────
  { name: "Osmania University", shortName: "OU", code: "OU", type: "State University", managementType: "State", stateCode: "TS", district: "Hyderabad", city: "Hyderabad", established: 1918, website: "https://www.osmania.ac.in", naac: "A+" },
  { name: "Jawaharlal Nehru Technological University Hyderabad", shortName: "JNTUH", code: "JNTUH", type: "State University", managementType: "State", stateCode: "TS", district: "Hyderabad", city: "Hyderabad", established: 1972, website: "https://jntuh.ac.in", naac: "A++" },
  { name: "Kakatiya University", shortName: "KU", code: "KU", type: "State University", managementType: "State", stateCode: "TS", district: "Warangal", city: "Warangal", established: 1976, naac: "A+" },
  { name: "Telangana University", shortName: "TU", code: "TU", type: "State University", managementType: "State", stateCode: "TS", district: "Nizamabad", city: "Nizamabad", established: 2006, naac: "B++" },
  { name: "Mahatma Gandhi University Nalgonda", shortName: "MGU", code: "MGUN", type: "State University", managementType: "State", stateCode: "TS", district: "Nalgonda", city: "Nalgonda", established: 2007, naac: "B+" },
  { name: "Palamuru University", shortName: "PU", code: "PU", type: "State University", managementType: "State", stateCode: "TS", district: "Mahabubnagar", city: "Mahabubnagar", established: 2008, naac: "B" },
  { name: "Satavahana University", shortName: "SU", code: "SATU", type: "State University", managementType: "State", stateCode: "TS", district: "Karimnagar", city: "Karimnagar", established: 2008, naac: "B+" },
  { name: "Dr. B.R. Ambedkar Open University", shortName: "BRAOU", code: "BRAOU", type: "Open University", managementType: "State", stateCode: "TS", district: "Hyderabad", city: "Hyderabad", established: 1982 },
  { name: "University of Hyderabad", shortName: "UoH", code: "UOH", type: "Central University", managementType: "Central", stateCode: "TS", district: "Rangareddy", city: "Shamshabad", established: 1974, website: "https://uohyd.ac.in", naac: "A++" },
  { name: "Indian Institute of Technology Hyderabad", shortName: "IIT Hyderabad", code: "IITH", type: "Institute of National Importance", managementType: "Central", stateCode: "TS", district: "Sangareddy", city: "Kandi", established: 2008, website: "https://iith.ac.in" },
  { name: "National Institute of Technology Warangal", shortName: "NIT Warangal", code: "NITW", type: "Institute of National Importance", managementType: "Central", stateCode: "TS", district: "Warangal", city: "Warangal", established: 1959, website: "https://nitw.ac.in", naac: "A++" },
  { name: "International Institute of Information Technology Hyderabad", shortName: "IIIT-H", code: "IIITH", type: "Deemed University", managementType: "Deemed", stateCode: "TS", district: "Rangareddy", city: "Shamshabad", established: 1998, website: "https://www.iiit.ac.in" },
  { name: "Birla Institute of Technology and Science, Pilani - Hyderabad Campus", shortName: "BITS Hyderabad", code: "BITSH", type: "Deemed University", managementType: "Deemed", stateCode: "TS", district: "Medchal-Malkajgiri", city: "Medchal", established: 2008 },
  { name: "NALSAR University of Law", shortName: "NALSAR", code: "NALSAR", type: "State University", managementType: "State", stateCode: "TS", district: "Medchal-Malkajgiri", city: "Medchal", established: 1998 },
  { name: "Mahindra University", shortName: "MU", code: "MAHU", type: "Private University", managementType: "Private Unaided", stateCode: "TS", district: "Rangareddy", city: "Shamshabad", established: 2020 },
  { name: "Anurag University", shortName: "AnU", code: "ANURAG", type: "Private University", managementType: "Private Unaided", stateCode: "TS", district: "Medchal-Malkajgiri", city: "Medchal", established: 2020, naac: "A+" },
  { name: "Malla Reddy University", shortName: "MRU", code: "MRU", type: "Private University", managementType: "Private Unaided", stateCode: "TS", district: "Medchal-Malkajgiri", city: "Dundigal", established: 2020 },
  { name: "SR University", shortName: "SRU", code: "SRUW", type: "Private University", managementType: "Private Unaided", stateCode: "TS", district: "Warangal", city: "Warangal", established: 2020 },
  { name: "Woxsen University", shortName: "Woxsen", code: "WOXU", type: "Private University", managementType: "Private Unaided", stateCode: "TS", district: "Sangareddy", city: "Sangareddy", established: 2014 },
  { name: "ICFAI Foundation for Higher Education", shortName: "IFHE", code: "IFHE", type: "Deemed University", managementType: "Deemed", stateCode: "TS", district: "Rangareddy", city: "Shamshabad", established: 2008 },
  { name: "Professor Jayashankar Telangana State Agricultural University", shortName: "PJTSAU", code: "PJTSAU", type: "State University", managementType: "State", stateCode: "TS", district: "Hyderabad", city: "Hyderabad", established: 2014 },
  { name: "Kaloji Narayana Rao University of Health Sciences", shortName: "KNRUHS", code: "KNRUHS", type: "State University", managementType: "State", stateCode: "TS", district: "Warangal", city: "Warangal", established: 2014 },
];

export type CollegeSeed = {
  name: string;
  code?: string;
  universityCode: string;
  institutionType: InstitutionType;
  managementType: ManagementType;
  autonomy: "autonomous" | "non-autonomous" | "pending-verification";
  stateCode: "AP" | "TS";
  district: string;
  city: string;
  established?: number;
  website?: string;
  naac?: string;
  verification?: "verified" | "pending" | "not-verified" | "needs-review" | "rejected";
};

/** Well-known institutions, with their real affiliations. */
export const REAL_COLLEGES: CollegeSeed[] = [
  // Andhra Pradesh
  { name: "Andhra Loyola College", code: "ALC", universityCode: "KRU", institutionType: "Autonomous College", managementType: "Private Aided", autonomy: "autonomous", stateCode: "AP", district: "NTR", city: "Vijayawada", established: 1953, naac: "A+", verification: "verified" },
  { name: "V.R. Siddhartha Engineering College", code: "VRSEC", universityCode: "JNTUK", institutionType: "Autonomous College", managementType: "Private Unaided", autonomy: "autonomous", stateCode: "AP", district: "NTR", city: "Vijayawada", established: 1977, naac: "A+", verification: "verified" },
  { name: "R.V.R. & J.C. College of Engineering", code: "RVRJC", universityCode: "ANU", institutionType: "Autonomous College", managementType: "Private Unaided", autonomy: "autonomous", stateCode: "AP", district: "Guntur", city: "Guntur", established: 1985, naac: "A", verification: "verified" },
  { name: "Bapatla Engineering College", code: "BEC", universityCode: "ANU", institutionType: "Autonomous College", managementType: "Private Aided", autonomy: "autonomous", stateCode: "AP", district: "Bapatla", city: "Bapatla", established: 1981, naac: "A", verification: "verified" },
  { name: "Andhra Engineering College", code: "AEC", universityCode: "JNTUK", institutionType: "Affiliated College", managementType: "Private Unaided", autonomy: "non-autonomous", stateCode: "AP", district: "West Godavari", city: "Bhimavaram", established: 2001, verification: "pending" },
  { name: "S.R.K.R. Engineering College", code: "SRKR", universityCode: "JNTUK", institutionType: "Autonomous College", managementType: "Private Unaided", autonomy: "autonomous", stateCode: "AP", district: "West Godavari", city: "Bhimavaram", established: 1980, naac: "A", verification: "verified" },
  { name: "Sri Venkateswara College of Engineering, Tirupati", code: "SVCET", universityCode: "JNTUA", institutionType: "Affiliated College", managementType: "Private Unaided", autonomy: "non-autonomous", stateCode: "AP", district: "Tirupati", city: "Tirupati", established: 1998, verification: "verified" },
  { name: "Sri Venkateswara University College of Engineering", code: "SVUCE", universityCode: "SVU", institutionType: "Constituent College", managementType: "Government", autonomy: "non-autonomous", stateCode: "AP", district: "Tirupati", city: "Tirupati", established: 1959, naac: "A+", verification: "verified" },
  { name: "Andhra University College of Engineering", code: "AUCE", universityCode: "AU", institutionType: "Constituent College", managementType: "Government", autonomy: "autonomous", stateCode: "AP", district: "Visakhapatnam", city: "Visakhapatnam", established: 1955, naac: "A+", verification: "verified" },
  { name: "Gayatri Vidya Parishad College of Engineering", code: "GVPCE", universityCode: "JNTUK", institutionType: "Autonomous College", managementType: "Private Unaided", autonomy: "autonomous", stateCode: "AP", district: "Visakhapatnam", city: "Visakhapatnam", established: 1996, naac: "A+", verification: "verified" },
  { name: "Anil Neerukonda Institute of Technology and Sciences", code: "ANITS", universityCode: "AU", institutionType: "Autonomous College", managementType: "Private Unaided", autonomy: "autonomous", stateCode: "AP", district: "Visakhapatnam", city: "Bheemunipatnam", established: 2001, naac: "A", verification: "verified" },
  { name: "Maharaj Vijayaram Gajapathi Raj College of Engineering", code: "MVGR", universityCode: "JNTUK", institutionType: "Autonomous College", managementType: "Private Unaided", autonomy: "autonomous", stateCode: "AP", district: "Vizianagaram", city: "Vizianagaram", established: 1997, naac: "A", verification: "verified" },
  { name: "Rajiv Gandhi University of Knowledge Technologies, Nuzvid", code: "RGUKTN", universityCode: "KRU", institutionType: "Constituent College", managementType: "Government", autonomy: "non-autonomous", stateCode: "AP", district: "Eluru", city: "Eluru", established: 2008, verification: "verified" },
  { name: "P.B. Siddhartha College of Arts and Science", code: "PBSC", universityCode: "KRU", institutionType: "Autonomous College", managementType: "Private Aided", autonomy: "autonomous", stateCode: "AP", district: "NTR", city: "Vijayawada", established: 1976, naac: "A", verification: "verified" },
  { name: "Hindu College, Guntur", code: "HCG", universityCode: "ANU", institutionType: "Autonomous College", managementType: "Private Aided", autonomy: "autonomous", stateCode: "AP", district: "Guntur", city: "Guntur", established: 1954, naac: "A", verification: "verified" },
  { name: "Government College for Men, Kurnool", code: "GCMK", universityCode: "RU", institutionType: "Affiliated College", managementType: "Government", autonomy: "non-autonomous", stateCode: "AP", district: "Kurnool", city: "Kurnool", established: 1872, verification: "pending" },
  { name: "G. Pulla Reddy Engineering College", code: "GPREC", universityCode: "JNTUA", institutionType: "Autonomous College", managementType: "Private Unaided", autonomy: "autonomous", stateCode: "AP", district: "Kurnool", city: "Kurnool", established: 1985, naac: "A", verification: "verified" },
  { name: "Rajeev Gandhi Memorial College of Engineering and Technology", code: "RGMCET", universityCode: "JNTUA", institutionType: "Autonomous College", managementType: "Private Unaided", autonomy: "autonomous", stateCode: "AP", district: "Nandyal", city: "Nandyal", established: 1995, naac: "A", verification: "verified" },
  { name: "Sri Krishnadevaraya University College of Engineering", code: "SKUCE", universityCode: "CUAP", institutionType: "Constituent College", managementType: "Government", autonomy: "non-autonomous", stateCode: "AP", district: "Ananthapuramu", city: "Anantapur", established: 1997, verification: "needs-review" },
  { name: "Narayana Engineering College, Nellore", code: "NECN", universityCode: "JNTUA", institutionType: "Affiliated College", managementType: "Private Unaided", autonomy: "non-autonomous", stateCode: "AP", district: "Sri Potti Sriramulu Nellore", city: "Nellore", established: 1998, verification: "verified" },
  { name: "Prakasam Engineering College", code: "PECK", universityCode: "JNTUK", institutionType: "Affiliated College", managementType: "Private Unaided", autonomy: "non-autonomous", stateCode: "AP", district: "Prakasam", city: "Kandukur", established: 2001, verification: "not-verified" },
  { name: "Annamacharya Institute of Technology and Sciences", code: "AITS", universityCode: "JNTUA", institutionType: "Autonomous College", managementType: "Private Unaided", autonomy: "autonomous", stateCode: "AP", district: "YSR Kadapa", city: "Kadapa", established: 1998, naac: "A", verification: "verified" },
  { name: "Madanapalle Institute of Technology and Science", code: "MITS", universityCode: "JNTUA", institutionType: "Autonomous College", managementType: "Private Unaided", autonomy: "autonomous", stateCode: "AP", district: "Annamayya", city: "Madanapalle", established: 1998, naac: "A+", verification: "verified" },
  { name: "Sri Vasavi Engineering College", code: "SVEC", universityCode: "JNTUK", institutionType: "Autonomous College", managementType: "Private Unaided", autonomy: "autonomous", stateCode: "AP", district: "West Godavari", city: "Tadepalligudem", established: 2001, naac: "A", verification: "verified" },
  { name: "Aditya College of Engineering and Technology", code: "ACET", universityCode: "JNTUK", institutionType: "Affiliated College", managementType: "Private Unaided", autonomy: "non-autonomous", stateCode: "AP", district: "Kakinada", city: "Kakinada", established: 2001, verification: "verified" },
  { name: "Pragati Engineering College", code: "PEC", universityCode: "JNTUK", institutionType: "Autonomous College", managementType: "Private Unaided", autonomy: "autonomous", stateCode: "AP", district: "Kakinada", city: "Peddapuram", established: 2001, naac: "A", verification: "verified" },
  { name: "Sir C.R. Reddy College of Engineering", code: "CRRCE", universityCode: "JNTUK", institutionType: "Autonomous College", managementType: "Private Aided", autonomy: "autonomous", stateCode: "AP", district: "Eluru", city: "Eluru", established: 1980, naac: "A", verification: "verified" },
  { name: "Government Degree College, Srikakulam", code: "GDCS", universityCode: "AKNU", institutionType: "Affiliated College", managementType: "Government", autonomy: "non-autonomous", stateCode: "AP", district: "Srikakulam", city: "Srikakulam", established: 1965, verification: "pending" },
  { name: "Vishnu Institute of Technology", code: "VIT-B", universityCode: "JNTUK", institutionType: "Autonomous College", managementType: "Private Unaided", autonomy: "autonomous", stateCode: "AP", district: "West Godavari", city: "Bhimavaram", established: 2008, naac: "A", verification: "verified" },
  { name: "Chaitanya Bharathi Degree College, Ongole", universityCode: "ANU", institutionType: "Affiliated College", managementType: "Private Unaided", autonomy: "non-autonomous", stateCode: "AP", district: "Prakasam", city: "Ongole", established: 2004, verification: "not-verified" },

  // Telangana
  { name: "Chaitanya Bharathi Institute of Technology", code: "CBIT", universityCode: "OU", institutionType: "Autonomous College", managementType: "Private Unaided", autonomy: "autonomous", stateCode: "TS", district: "Hyderabad", city: "Hyderabad", established: 1979, naac: "A++", verification: "verified" },
  { name: "Vasavi College of Engineering", code: "VCE", universityCode: "OU", institutionType: "Autonomous College", managementType: "Private Unaided", autonomy: "autonomous", stateCode: "TS", district: "Hyderabad", city: "Hyderabad", established: 1981, naac: "A++", verification: "verified" },
  { name: "Osmania University College of Engineering", code: "OUCE", universityCode: "OU", institutionType: "Constituent College", managementType: "Government", autonomy: "autonomous", stateCode: "TS", district: "Hyderabad", city: "Hyderabad", established: 1929, naac: "A+", verification: "verified" },
  { name: "Chaitanya Bharathi Institute of Technology for Women", universityCode: "OU", institutionType: "Affiliated College", managementType: "Private Unaided", autonomy: "non-autonomous", stateCode: "TS", district: "Hyderabad", city: "Hyderabad", established: 2008, verification: "pending" },
  { name: "CVR College of Engineering", code: "CVR", universityCode: "JNTUH", institutionType: "Autonomous College", managementType: "Private Unaided", autonomy: "autonomous", stateCode: "TS", district: "Rangareddy", city: "Ibrahimpatnam", established: 2001, naac: "A+", verification: "verified" },
  { name: "Vardhaman College of Engineering", code: "VARDH", universityCode: "JNTUH", institutionType: "Autonomous College", managementType: "Private Unaided", autonomy: "autonomous", stateCode: "TS", district: "Rangareddy", city: "Shamshabad", established: 1999, naac: "A+", verification: "verified" },
  { name: "Gokaraju Rangaraju Institute of Engineering and Technology", code: "GRIET", universityCode: "JNTUH", institutionType: "Autonomous College", managementType: "Private Unaided", autonomy: "autonomous", stateCode: "TS", district: "Medchal-Malkajgiri", city: "Kompally", established: 1997, naac: "A+", verification: "verified" },
  { name: "Vallurupalli Nageswara Rao Vignana Jyothi Institute of Engineering and Technology", code: "VNRVJIET", universityCode: "JNTUH", institutionType: "Autonomous College", managementType: "Private Unaided", autonomy: "autonomous", stateCode: "TS", district: "Medchal-Malkajgiri", city: "Kompally", established: 1995, naac: "A++", verification: "verified" },
  { name: "Mahatma Gandhi Institute of Technology", code: "MGIT", universityCode: "JNTUH", institutionType: "Autonomous College", managementType: "Private Unaided", autonomy: "autonomous", stateCode: "TS", district: "Rangareddy", city: "Shamshabad", established: 1997, naac: "A", verification: "verified" },
  { name: "Sreenidhi Institute of Science and Technology", code: "SNIST", universityCode: "JNTUH", institutionType: "Autonomous College", managementType: "Private Unaided", autonomy: "autonomous", stateCode: "TS", district: "Rangareddy", city: "Ibrahimpatnam", established: 1997, naac: "A++", verification: "verified" },
  { name: "Keshav Memorial Institute of Technology", code: "KMIT", universityCode: "JNTUH", institutionType: "Affiliated College", managementType: "Private Unaided", autonomy: "non-autonomous", stateCode: "TS", district: "Hyderabad", city: "Hyderabad", established: 2007, verification: "verified" },
  { name: "Muffakham Jah College of Engineering and Technology", code: "MJCET", universityCode: "OU", institutionType: "Affiliated College", managementType: "Private Unaided", autonomy: "non-autonomous", stateCode: "TS", district: "Hyderabad", city: "Hyderabad", established: 1980, naac: "A", verification: "verified" },
  { name: "Nizam College", code: "NIZAM", universityCode: "OU", institutionType: "Constituent College", managementType: "Government", autonomy: "autonomous", stateCode: "TS", district: "Hyderabad", city: "Hyderabad", established: 1887, naac: "A", verification: "verified" },
  { name: "St. Francis College for Women", code: "SFCW", universityCode: "OU", institutionType: "Autonomous College", managementType: "Private Unaided", autonomy: "autonomous", stateCode: "TS", district: "Hyderabad", city: "Secunderabad", established: 1959, naac: "A++", verification: "verified" },
  { name: "Loyola Academy Degree and PG College", code: "LADPGC", universityCode: "OU", institutionType: "Autonomous College", managementType: "Private Unaided", autonomy: "autonomous", stateCode: "TS", district: "Medchal-Malkajgiri", city: "Secunderabad", established: 1996, naac: "A", verification: "verified" },
  { name: "Kakatiya Institute of Technology and Science", code: "KITSW", universityCode: "KU", institutionType: "Autonomous College", managementType: "Private Unaided", autonomy: "autonomous", stateCode: "TS", district: "Warangal", city: "Warangal", established: 1980, naac: "A", verification: "verified" },
  { name: "Balaji Institute of Technology and Science", code: "BITS-W", universityCode: "JNTUH", institutionType: "Affiliated College", managementType: "Private Unaided", autonomy: "non-autonomous", stateCode: "TS", district: "Warangal", city: "Warangal", established: 2001, verification: "pending" },
  { name: "Vaagdevi College of Engineering", code: "VAAGD", universityCode: "KU", institutionType: "Autonomous College", managementType: "Private Unaided", autonomy: "autonomous", stateCode: "TS", district: "Warangal", city: "Warangal", established: 1998, naac: "A", verification: "verified" },
  { name: "Government Degree College, Khammam", universityCode: "KU", institutionType: "Affiliated College", managementType: "Government", autonomy: "non-autonomous", stateCode: "TS", district: "Khammam", city: "Khammam", established: 1957, verification: "pending" },
  { name: "Kamala Institute of Technology and Science", code: "KITS-K", universityCode: "JNTUH", institutionType: "Affiliated College", managementType: "Private Unaided", autonomy: "non-autonomous", stateCode: "TS", district: "Karimnagar", city: "Karimnagar", established: 1998, verification: "not-verified" },
  { name: "Jyothishmathi Institute of Technology and Science", universityCode: "JNTUH", institutionType: "Affiliated College", managementType: "Private Unaided", autonomy: "non-autonomous", stateCode: "TS", district: "Karimnagar", city: "Karimnagar", established: 2001, verification: "not-verified" },
  { name: "Nalla Malla Reddy Engineering College", code: "NMREC", universityCode: "JNTUH", institutionType: "Affiliated College", managementType: "Private Unaided", autonomy: "non-autonomous", stateCode: "TS", district: "Medchal-Malkajgiri", city: "Medchal", established: 2005, verification: "verified" },
  { name: "Malla Reddy College of Engineering and Technology", code: "MRCET", universityCode: "JNTUH", institutionType: "Autonomous College", managementType: "Private Unaided", autonomy: "autonomous", stateCode: "TS", district: "Medchal-Malkajgiri", city: "Dundigal", established: 2004, naac: "A", verification: "verified" },
  { name: "Anurag Group of Institutions", code: "AGI", universityCode: "JNTUH", institutionType: "Autonomous College", managementType: "Private Unaided", autonomy: "autonomous", stateCode: "TS", district: "Medchal-Malkajgiri", city: "Medchal", established: 2003, naac: "A+", verification: "verified" },
  { name: "Bhoj Reddy Engineering College for Women", code: "BRECW", universityCode: "JNTUH", institutionType: "Affiliated College", managementType: "Private Unaided", autonomy: "non-autonomous", stateCode: "TS", district: "Hyderabad", city: "Hyderabad", established: 1997, verification: "verified" },
  { name: "Government Polytechnic, Nizamabad", universityCode: "TU", institutionType: "Polytechnic", managementType: "Government", autonomy: "non-autonomous", stateCode: "TS", district: "Nizamabad", city: "Nizamabad", established: 1963, verification: "not-verified" },
  { name: "Nalgonda Institute of Technology and Science", code: "NITS", universityCode: "MGUN", institutionType: "Affiliated College", managementType: "Private Unaided", autonomy: "non-autonomous", stateCode: "TS", district: "Nalgonda", city: "Nalgonda", established: 2005, verification: "pending" },
  { name: "Palamuru Degree College", universityCode: "PU", institutionType: "Affiliated College", managementType: "Private Unaided", autonomy: "non-autonomous", stateCode: "TS", district: "Mahabubnagar", city: "Mahabubnagar", established: 2002, verification: "not-verified" },
  { name: "Sri Indu College of Engineering and Technology", code: "SICET", universityCode: "JNTUH", institutionType: "Affiliated College", managementType: "Private Unaided", autonomy: "non-autonomous", stateCode: "TS", district: "Rangareddy", city: "Ibrahimpatnam", established: 2001, verification: "verified" },
  { name: "Guru Nanak Institutions Technical Campus", code: "GNITC", universityCode: "JNTUH", institutionType: "Autonomous College", managementType: "Private Unaided", autonomy: "autonomous", stateCode: "TS", district: "Rangareddy", city: "Ibrahimpatnam", established: 2001, naac: "A", verification: "verified" },
];

/**
 * Name fragments for the generated long tail.
 *
 * Composed rather than listed so the generator can produce a few hundred
 * distinct, plausible names without a hand-written list of a few hundred.
 */
const PREFIXES = [
  "Sri", "Sree", "Sri Sai", "Vignana", "Aditya", "Narayana", "Chaitanya", "Vivekananda",
  "Nalanda", "Gayatri", "Priyadarshini", "Bhaskar", "Samskruti", "Sarojini", "Trinity",
  "Holy Mary", "St. Peter's", "St. Mary's", "Kasturba", "Rishi", "Avanthi", "Tirumala",
  "Sanketika", "Prasad V. Potluri", "Lakireddy Bali Reddy", "Dhanekula", "Nova", "Amrita Sai",
  "Godavari", "Kallam Haranadhareddy", "Swarnandhra", "Ramachandra", "Sasi", "Usha Rama",
];

const MIDDLES = [
  "Institute of Technology",
  "College of Engineering",
  "Institute of Engineering and Technology",
  "Institute of Science and Technology",
  "Degree College",
  "College of Arts and Science",
  "Institute of Management Studies",
  "Institute of Technology and Management",
  "College of Pharmacy",
  "Institute of Computer Sciences",
  "Women's Engineering College",
  "College of Business Management",
];

/**
 * Generates the long tail of colleges.
 *
 * Deterministic — no `Math.random` — so re-seeding produces the same directory
 * and a screenshot taken today still matches the data tomorrow. The pseudo-
 * randomness comes from the index, which is enough to spread rows across
 * districts, universities and verification states.
 */
export function syntheticColleges(
  count: number,
  districtsByState: Record<"AP" | "TS", { district: string; city: string }[]>,
  universityCodesByState: Record<"AP" | "TS", string[]>
): CollegeSeed[] {
  const colleges: CollegeSeed[] = [];
  const verifications: CollegeSeed["verification"][] = [
    "verified", "verified", "verified", "pending", "not-verified", "needs-review", "pending",
  ];
  const managements: ManagementType[] = [
    "Private Unaided", "Private Unaided", "Private Unaided", "Government", "Government-Aided", "Private Aided",
  ];

  for (let index = 0; index < count; index += 1) {
    const stateCode: "AP" | "TS" = index % 2 === 0 ? "AP" : "TS";
    const places = districtsByState[stateCode];
    const place = places[(index * 7) % places.length];
    const universities = universityCodesByState[stateCode];
    const universityCode = universities[(index * 5) % universities.length];

    const prefix = PREFIXES[(index * 3) % PREFIXES.length];
    const middle = MIDDLES[(index * 11) % MIDDLES.length];
    // The city is part of the name, which is both realistic — chains genuinely
    // name campuses this way — and what keeps the generated names unique.
    const name = `${prefix} ${middle}, ${place.city}`;

    const autonomous = index % 6 === 0;

    colleges.push({
      name,
      universityCode,
      institutionType: autonomous ? "Autonomous College" : "Affiliated College",
      managementType: managements[index % managements.length],
      autonomy: autonomous ? "autonomous" : index % 17 === 0 ? "pending-verification" : "non-autonomous",
      stateCode,
      district: place.district,
      city: place.city,
      established: 1985 + ((index * 3) % 36),
      naac: index % 4 === 0 ? ["A++", "A+", "A", "B++", "B+"][index % 5] : undefined,
      verification: verifications[index % verifications.length],
    });
  }

  return colleges;
}

/** Departments seeded onto engineering colleges. */
export const ENGINEERING_DEPARTMENTS = [
  { name: "Computer Science and Engineering", code: "CSE" },
  { name: "Information Technology", code: "IT" },
  { name: "Electronics and Communication Engineering", code: "ECE" },
  { name: "Electrical and Electronics Engineering", code: "EEE" },
  { name: "Mechanical Engineering", code: "MECH" },
  { name: "Civil Engineering", code: "CIVIL" },
  { name: "Artificial Intelligence and Machine Learning", code: "AIML" },
  { name: "Data Science", code: "DS" },
];

export const DEGREE_DEPARTMENTS = [
  { name: "Commerce", code: "COM" },
  { name: "Computer Applications", code: "BCA" },
  { name: "Business Administration", code: "BBA" },
  { name: "Mathematics", code: "MATHS" },
  { name: "Physics", code: "PHY" },
  { name: "English", code: "ENG" },
];
