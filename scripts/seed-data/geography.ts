/**
 * Geographic seed data.
 *
 * Andhra Pradesh and Telangana are seeded with their full district lists
 * because that is where the platform launches. The other states are seeded as
 * *rows with no districts*, which is the point: adding Karnataka later is a
 * data task, not a code change (spec §46, §47). Nothing in the application
 * names a state.
 *
 * District lists follow the current administrative divisions — Andhra Pradesh
 * reorganised into 26 districts in 2022, and Telangana into 33.
 */

export type StateSeed = {
  name: string;
  code: string;
  kind?: "state" | "union-territory";
  /** Lower sorts first, so the launch states head every picker. */
  displayOrder: number;
  districts?: { name: string; cities?: string[] }[];
};

export const STATES: StateSeed[] = [
  {
    name: "Andhra Pradesh",
    code: "AP",
    displayOrder: 1,
    districts: [
      { name: "Alluri Sitharama Raju", cities: ["Paderu", "Rampachodavaram"] },
      { name: "Anakapalli", cities: ["Anakapalli", "Narsipatnam"] },
      { name: "Ananthapuramu", cities: ["Anantapur", "Guntakal", "Tadipatri"] },
      { name: "Annamayya", cities: ["Rayachoti", "Madanapalle"] },
      { name: "Bapatla", cities: ["Bapatla", "Chirala", "Repalle"] },
      { name: "Chittoor", cities: ["Chittoor", "Palamaner", "Punganur"] },
      { name: "Dr. B.R. Ambedkar Konaseema", cities: ["Amalapuram", "Ramachandrapuram"] },
      { name: "East Godavari", cities: ["Rajahmundry", "Nidadavole"] },
      { name: "Eluru", cities: ["Eluru", "Jangareddygudem"] },
      { name: "Guntur", cities: ["Guntur", "Tenali", "Ponnur"] },
      { name: "Kakinada", cities: ["Kakinada", "Peddapuram", "Samalkot"] },
      { name: "Konaseema", cities: ["Amalapuram"] },
      { name: "Krishna", cities: ["Machilipatnam", "Gudivada", "Pedana"] },
      { name: "Kurnool", cities: ["Kurnool", "Adoni", "Yemmiganur"] },
      { name: "Nandyal", cities: ["Nandyal", "Dhone", "Allagadda"] },
      { name: "NTR", cities: ["Vijayawada", "Nandigama", "Jaggayyapeta"] },
      { name: "Palnadu", cities: ["Narasaraopet", "Sattenapalle", "Macherla"] },
      { name: "Parvathipuram Manyam", cities: ["Parvathipuram", "Salur"] },
      { name: "Prakasam", cities: ["Ongole", "Markapur", "Kandukur"] },
      { name: "Sri Potti Sriramulu Nellore", cities: ["Nellore", "Kavali", "Gudur"] },
      { name: "Sri Sathya Sai", cities: ["Puttaparthi", "Dharmavaram", "Hindupur"] },
      { name: "Srikakulam", cities: ["Srikakulam", "Palasa", "Amadalavalasa"] },
      { name: "Tirupati", cities: ["Tirupati", "Srikalahasti", "Sullurpeta"] },
      { name: "Visakhapatnam", cities: ["Visakhapatnam", "Bheemunipatnam"] },
      { name: "Vizianagaram", cities: ["Vizianagaram", "Bobbili", "Gajapathinagaram"] },
      { name: "West Godavari", cities: ["Bhimavaram", "Tadepalligudem", "Tanuku", "Narsapur"] },
      { name: "YSR Kadapa", cities: ["Kadapa", "Proddatur", "Pulivendula"] },
    ],
  },
  {
    name: "Telangana",
    code: "TS",
    displayOrder: 2,
    districts: [
      { name: "Adilabad", cities: ["Adilabad"] },
      { name: "Bhadradri Kothagudem", cities: ["Kothagudem", "Bhadrachalam"] },
      { name: "Hanumakonda", cities: ["Hanumakonda"] },
      { name: "Hyderabad", cities: ["Hyderabad", "Secunderabad"] },
      { name: "Jagtial", cities: ["Jagtial"] },
      { name: "Jangaon", cities: ["Jangaon"] },
      { name: "Jayashankar Bhupalpally", cities: ["Bhupalpally"] },
      { name: "Jogulamba Gadwal", cities: ["Gadwal"] },
      { name: "Kamareddy", cities: ["Kamareddy"] },
      { name: "Karimnagar", cities: ["Karimnagar"] },
      { name: "Khammam", cities: ["Khammam"] },
      { name: "Komaram Bheem Asifabad", cities: ["Asifabad"] },
      { name: "Mahabubabad", cities: ["Mahabubabad"] },
      { name: "Mahabubnagar", cities: ["Mahabubnagar"] },
      { name: "Mancherial", cities: ["Mancherial"] },
      { name: "Medak", cities: ["Medak"] },
      { name: "Medchal-Malkajgiri", cities: ["Medchal", "Kompally", "Dundigal"] },
      { name: "Mulugu", cities: ["Mulugu"] },
      { name: "Nagarkurnool", cities: ["Nagarkurnool"] },
      { name: "Nalgonda", cities: ["Nalgonda", "Miryalaguda"] },
      { name: "Narayanpet", cities: ["Narayanpet"] },
      { name: "Nirmal", cities: ["Nirmal"] },
      { name: "Nizamabad", cities: ["Nizamabad", "Bodhan"] },
      { name: "Peddapalli", cities: ["Peddapalli", "Ramagundam"] },
      { name: "Rajanna Sircilla", cities: ["Sircilla"] },
      { name: "Rangareddy", cities: ["Shamshabad", "Ibrahimpatnam", "Maheshwaram"] },
      { name: "Sangareddy", cities: ["Sangareddy", "Patancheru", "Kandi"] },
      { name: "Siddipet", cities: ["Siddipet"] },
      { name: "Suryapet", cities: ["Suryapet", "Kodad"] },
      { name: "Vikarabad", cities: ["Vikarabad"] },
      { name: "Wanaparthy", cities: ["Wanaparthy"] },
      { name: "Warangal", cities: ["Warangal"] },
      { name: "Yadadri Bhuvanagiri", cities: ["Bhongir", "Yadagirigutta"] },
    ],
  },

  // Seeded without districts. Their presence is the proof that the model is not
  // AP/Telangana-shaped; districts arrive when the platform expands there.
  { name: "Karnataka", code: "KA", displayOrder: 10 },
  { name: "Tamil Nadu", code: "TN", displayOrder: 11 },
  { name: "Maharashtra", code: "MH", displayOrder: 12 },
  { name: "Kerala", code: "KL", displayOrder: 13 },
  { name: "Odisha", code: "OD", displayOrder: 14 },
  { name: "Delhi", code: "DL", kind: "union-territory", displayOrder: 15 },
  { name: "West Bengal", code: "WB", displayOrder: 16 },
  { name: "Uttar Pradesh", code: "UP", displayOrder: 17 },
  { name: "Gujarat", code: "GJ", displayOrder: 18 },
  { name: "Rajasthan", code: "RJ", displayOrder: 19 },
  { name: "Madhya Pradesh", code: "MP", displayOrder: 20 },
  { name: "Punjab", code: "PB", displayOrder: 21 },
  { name: "Puducherry", code: "PY", kind: "union-territory", displayOrder: 30 },
];
