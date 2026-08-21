/**
 * Seeds the college directory that backs the onboarding autocomplete.
 *
 * Upserts by normalised name, so it is safe to re-run and safe to run against a
 * database where students have already added colleges of their own — a curated
 * entry that collides with a user-added one takes over the row and gains its
 * city and state, rather than creating a duplicate the search would show twice.
 *
 * This list is a starting point, not a register of Indian higher education. It
 * exists so the field is useful on day one; everything else arrives through
 * students typing it.
 *
 * Run with:  npm run seed:colleges
 */
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db";
import { College, normalizeCollegeName } from "../src/models/College";

type Seed = { name: string; city: string; state: string };

const COLLEGES: Seed[] = [
  // Andhra Pradesh
  { name: "Andhra University", city: "Visakhapatnam", state: "Andhra Pradesh" },
  { name: "Andhra Loyola College", city: "Vijayawada", state: "Andhra Pradesh" },
  { name: "Sri Venkateswara University", city: "Tirupati", state: "Andhra Pradesh" },
  { name: "GITAM University", city: "Visakhapatnam", state: "Andhra Pradesh" },
  { name: "K L University", city: "Guntur", state: "Andhra Pradesh" },
  { name: "Vignan's Foundation for Science, Technology and Research", city: "Guntur", state: "Andhra Pradesh" },
  { name: "SRM University AP", city: "Amaravati", state: "Andhra Pradesh" },
  { name: "Acharya Nagarjuna University", city: "Guntur", state: "Andhra Pradesh" },
  { name: "Indian Institute of Technology Tirupati", city: "Tirupati", state: "Andhra Pradesh" },
  { name: "National Institute of Technology Andhra Pradesh", city: "Tadepalligudem", state: "Andhra Pradesh" },

  // Telangana
  { name: "Osmania University", city: "Hyderabad", state: "Telangana" },
  { name: "International Institute of Information Technology Hyderabad", city: "Hyderabad", state: "Telangana" },
  { name: "Indian Institute of Technology Hyderabad", city: "Sangareddy", state: "Telangana" },
  { name: "Birla Institute of Technology and Science, Pilani - Hyderabad Campus", city: "Hyderabad", state: "Telangana" },
  { name: "Chaitanya Bharathi Institute of Technology", city: "Hyderabad", state: "Telangana" },
  { name: "Vasavi College of Engineering", city: "Hyderabad", state: "Telangana" },
  { name: "CVR College of Engineering", city: "Hyderabad", state: "Telangana" },
  { name: "Vardhaman College of Engineering", city: "Hyderabad", state: "Telangana" },
  { name: "National Institute of Technology Warangal", city: "Warangal", state: "Telangana" },
  { name: "Jawaharlal Nehru Technological University Hyderabad", city: "Hyderabad", state: "Telangana" },

  // Delhi NCR
  { name: "University of Delhi", city: "New Delhi", state: "Delhi" },
  { name: "Indian Institute of Technology Delhi", city: "New Delhi", state: "Delhi" },
  { name: "Jawaharlal Nehru University", city: "New Delhi", state: "Delhi" },
  { name: "Jamia Millia Islamia", city: "New Delhi", state: "Delhi" },
  { name: "Delhi Technological University", city: "New Delhi", state: "Delhi" },
  { name: "Netaji Subhas University of Technology", city: "New Delhi", state: "Delhi" },
  { name: "Indraprastha Institute of Information Technology Delhi", city: "New Delhi", state: "Delhi" },
  { name: "St. Stephen's College", city: "New Delhi", state: "Delhi" },
  { name: "Hindu College", city: "New Delhi", state: "Delhi" },
  { name: "Shri Ram College of Commerce", city: "New Delhi", state: "Delhi" },
  { name: "Lady Shri Ram College for Women", city: "New Delhi", state: "Delhi" },
  { name: "Hansraj College", city: "New Delhi", state: "Delhi" },
  { name: "Miranda House", city: "New Delhi", state: "Delhi" },
  { name: "Amity University", city: "Noida", state: "Uttar Pradesh" },
  { name: "Bennett University", city: "Greater Noida", state: "Uttar Pradesh" },
  { name: "Shiv Nadar University", city: "Greater Noida", state: "Uttar Pradesh" },
  { name: "Ashoka University", city: "Sonipat", state: "Haryana" },
  { name: "O.P. Jindal Global University", city: "Sonipat", state: "Haryana" },
  { name: "National Institute of Technology Kurukshetra", city: "Kurukshetra", state: "Haryana" },
  { name: "Manav Rachna University", city: "Faridabad", state: "Haryana" },

  // Maharashtra
  { name: "Indian Institute of Technology Bombay", city: "Mumbai", state: "Maharashtra" },
  { name: "University of Mumbai", city: "Mumbai", state: "Maharashtra" },
  { name: "Institute of Chemical Technology", city: "Mumbai", state: "Maharashtra" },
  { name: "Veermata Jijabai Technological Institute", city: "Mumbai", state: "Maharashtra" },
  { name: "St. Xavier's College", city: "Mumbai", state: "Maharashtra" },
  { name: "Narsee Monjee Institute of Management Studies", city: "Mumbai", state: "Maharashtra" },
  { name: "Sardar Patel Institute of Technology", city: "Mumbai", state: "Maharashtra" },
  { name: "Savitribai Phule Pune University", city: "Pune", state: "Maharashtra" },
  { name: "College of Engineering Pune", city: "Pune", state: "Maharashtra" },
  { name: "Vishwakarma Institute of Technology", city: "Pune", state: "Maharashtra" },
  { name: "MIT World Peace University", city: "Pune", state: "Maharashtra" },
  { name: "Symbiosis Institute of Technology", city: "Pune", state: "Maharashtra" },
  { name: "Pune Institute of Computer Technology", city: "Pune", state: "Maharashtra" },
  { name: "Visvesvaraya National Institute of Technology", city: "Nagpur", state: "Maharashtra" },
  { name: "Fergusson College", city: "Pune", state: "Maharashtra" },

  // Karnataka
  { name: "Indian Institute of Science", city: "Bengaluru", state: "Karnataka" },
  { name: "Indian Institute of Management Bangalore", city: "Bengaluru", state: "Karnataka" },
  { name: "R.V. College of Engineering", city: "Bengaluru", state: "Karnataka" },
  { name: "B.M.S. College of Engineering", city: "Bengaluru", state: "Karnataka" },
  { name: "PES University", city: "Bengaluru", state: "Karnataka" },
  { name: "M.S. Ramaiah Institute of Technology", city: "Bengaluru", state: "Karnataka" },
  { name: "Dayananda Sagar College of Engineering", city: "Bengaluru", state: "Karnataka" },
  { name: "Christ University", city: "Bengaluru", state: "Karnataka" },
  { name: "Bangalore University", city: "Bengaluru", state: "Karnataka" },
  { name: "Manipal Institute of Technology", city: "Manipal", state: "Karnataka" },
  { name: "National Institute of Technology Karnataka", city: "Surathkal", state: "Karnataka" },
  { name: "Visvesvaraya Technological University", city: "Belagavi", state: "Karnataka" },
  { name: "International Institute of Information Technology Bangalore", city: "Bengaluru", state: "Karnataka" },

  // Tamil Nadu
  { name: "Indian Institute of Technology Madras", city: "Chennai", state: "Tamil Nadu" },
  { name: "Anna University", city: "Chennai", state: "Tamil Nadu" },
  { name: "College of Engineering Guindy", city: "Chennai", state: "Tamil Nadu" },
  { name: "Vellore Institute of Technology", city: "Vellore", state: "Tamil Nadu" },
  { name: "SRM Institute of Science and Technology", city: "Chennai", state: "Tamil Nadu" },
  { name: "SSN College of Engineering", city: "Chennai", state: "Tamil Nadu" },
  { name: "PSG College of Technology", city: "Coimbatore", state: "Tamil Nadu" },
  { name: "Coimbatore Institute of Technology", city: "Coimbatore", state: "Tamil Nadu" },
  { name: "Amrita Vishwa Vidyapeetham", city: "Coimbatore", state: "Tamil Nadu" },
  { name: "National Institute of Technology Tiruchirappalli", city: "Tiruchirappalli", state: "Tamil Nadu" },
  { name: "Thiagarajar College of Engineering", city: "Madurai", state: "Tamil Nadu" },
  { name: "Loyola College", city: "Chennai", state: "Tamil Nadu" },
  { name: "Madras Christian College", city: "Chennai", state: "Tamil Nadu" },

  // Kerala
  { name: "Indian Institute of Technology Palakkad", city: "Palakkad", state: "Kerala" },
  { name: "National Institute of Technology Calicut", city: "Kozhikode", state: "Kerala" },
  { name: "Cochin University of Science and Technology", city: "Kochi", state: "Kerala" },
  { name: "College of Engineering Trivandrum", city: "Thiruvananthapuram", state: "Kerala" },
  { name: "University of Kerala", city: "Thiruvananthapuram", state: "Kerala" },
  { name: "Mahatma Gandhi University", city: "Kottayam", state: "Kerala" },

  // West Bengal
  { name: "Indian Institute of Technology Kharagpur", city: "Kharagpur", state: "West Bengal" },
  { name: "Jadavpur University", city: "Kolkata", state: "West Bengal" },
  { name: "University of Calcutta", city: "Kolkata", state: "West Bengal" },
  { name: "Indian Statistical Institute", city: "Kolkata", state: "West Bengal" },
  { name: "Presidency University", city: "Kolkata", state: "West Bengal" },
  { name: "Indian Institute of Engineering Science and Technology, Shibpur", city: "Howrah", state: "West Bengal" },
  { name: "National Institute of Technology Durgapur", city: "Durgapur", state: "West Bengal" },
  { name: "St. Xavier's College", city: "Kolkata", state: "West Bengal" },

  // Uttar Pradesh, Bihar and the north
  { name: "Indian Institute of Technology Kanpur", city: "Kanpur", state: "Uttar Pradesh" },
  { name: "Indian Institute of Technology BHU Varanasi", city: "Varanasi", state: "Uttar Pradesh" },
  { name: "Banaras Hindu University", city: "Varanasi", state: "Uttar Pradesh" },
  { name: "Aligarh Muslim University", city: "Aligarh", state: "Uttar Pradesh" },
  { name: "University of Lucknow", city: "Lucknow", state: "Uttar Pradesh" },
  { name: "Motilal Nehru National Institute of Technology", city: "Prayagraj", state: "Uttar Pradesh" },
  { name: "Harcourt Butler Technical University", city: "Kanpur", state: "Uttar Pradesh" },
  { name: "Indian Institute of Technology Roorkee", city: "Roorkee", state: "Uttarakhand" },
  { name: "Indian Institute of Technology Patna", city: "Patna", state: "Bihar" },
  { name: "National Institute of Technology Patna", city: "Patna", state: "Bihar" },
  { name: "Birla Institute of Technology Mesra", city: "Ranchi", state: "Jharkhand" },
  { name: "Indian Institute of Technology (ISM) Dhanbad", city: "Dhanbad", state: "Jharkhand" },

  // Punjab, Rajasthan, Gujarat and the west
  { name: "Indian Institute of Technology Ropar", city: "Rupnagar", state: "Punjab" },
  { name: "Thapar Institute of Engineering and Technology", city: "Patiala", state: "Punjab" },
  { name: "Lovely Professional University", city: "Phagwara", state: "Punjab" },
  { name: "Panjab University", city: "Chandigarh", state: "Chandigarh" },
  { name: "Punjab Engineering College", city: "Chandigarh", state: "Chandigarh" },
  { name: "Chandigarh University", city: "Mohali", state: "Punjab" },
  { name: "Birla Institute of Technology and Science, Pilani", city: "Pilani", state: "Rajasthan" },
  { name: "Malaviya National Institute of Technology Jaipur", city: "Jaipur", state: "Rajasthan" },
  { name: "Indian Institute of Technology Jodhpur", city: "Jodhpur", state: "Rajasthan" },
  { name: "Manipal University Jaipur", city: "Jaipur", state: "Rajasthan" },
  { name: "Indian Institute of Technology Gandhinagar", city: "Gandhinagar", state: "Gujarat" },
  { name: "Nirma University", city: "Ahmedabad", state: "Gujarat" },
  { name: "Sardar Vallabhbhai National Institute of Technology", city: "Surat", state: "Gujarat" },
  { name: "Dhirubhai Ambani Institute of Information and Communication Technology", city: "Gandhinagar", state: "Gujarat" },
  { name: "Gujarat Technological University", city: "Ahmedabad", state: "Gujarat" },

  // Central and east
  { name: "Indian Institute of Technology Indore", city: "Indore", state: "Madhya Pradesh" },
  { name: "Maulana Azad National Institute of Technology", city: "Bhopal", state: "Madhya Pradesh" },
  { name: "Indian Institute of Information Technology Design and Manufacturing Jabalpur", city: "Jabalpur", state: "Madhya Pradesh" },
  { name: "National Institute of Technology Raipur", city: "Raipur", state: "Chhattisgarh" },
  { name: "National Institute of Technology Rourkela", city: "Rourkela", state: "Odisha" },
  { name: "Kalinga Institute of Industrial Technology", city: "Bhubaneswar", state: "Odisha" },
  { name: "Indian Institute of Technology Bhubaneswar", city: "Bhubaneswar", state: "Odisha" },
  { name: "Indian Institute of Technology Guwahati", city: "Guwahati", state: "Assam" },
  { name: "National Institute of Technology Silchar", city: "Silchar", state: "Assam" },
  { name: "Gauhati University", city: "Guwahati", state: "Assam" },
];

async function main() {
  await connectDB();
  console.log("connected to", mongoose.connection.name);

  // Two curated entries can share a name in different states ("St. Xavier's
  // College" in Mumbai and Kolkata). `normalizedName` is unique, so the second
  // would overwrite the first — disambiguate before writing rather than
  // silently losing one.
  const byNormalized = new Map<string, Seed>();
  for (const college of COLLEGES) {
    const key = normalizeCollegeName(college.name);
    const clash = byNormalized.get(key);
    if (clash) {
      const renamed = { ...college, name: `${college.name}, ${college.city}` };
      byNormalized.set(normalizeCollegeName(renamed.name), renamed);
      // Give the first one a city too, so neither is the ambiguous bare name.
      const clashRenamed = { ...clash, name: `${clash.name}, ${clash.city}` };
      byNormalized.delete(key);
      byNormalized.set(normalizeCollegeName(clashRenamed.name), clashRenamed);
      continue;
    }
    byNormalized.set(key, college);
  }

  const operations = [...byNormalized.entries()].map(([normalizedName, college]) => ({
    updateOne: {
      filter: { normalizedName },
      update: {
        $set: {
          name: college.name,
          city: college.city,
          state: college.state,
          source: "seed" as const,
        },
        $setOnInsert: { normalizedName },
      },
      upsert: true,
    },
  }));

  const result = await College.bulkWrite(operations, { ordered: false });
  console.log(
    `colleges: ${result.upsertedCount} added, ${result.modifiedCount} updated, ` +
      `${await College.countDocuments()} in the directory`
  );

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
