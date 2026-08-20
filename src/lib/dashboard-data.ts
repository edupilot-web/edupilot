/**
 * Static content for the dashboard cards.
 *
 * NONE OF THIS IS REAL YET. There are no models for tasks, wallets, streaks,
 * timetables, notices or placements — the database has Users, Courses, Lessons
 * and Enrollments and nothing else. The screen is built against this module so
 * that wiring a card to real data is a one-place change: give the card its own
 * query and delete the matching entry here.
 *
 * The only live value on the dashboard is the signed-in user, which comes from
 * the session.
 */

export type DailyTask = { label: string; done: boolean };

export type WalletEntry = {
  label: string;
  when: string;
  amount: number;
  kind: "credit" | "debit";
};

export type TimetableSlot = { time: string; subject: string; room: string };

export type Notice = { title: string; when: string };

export type Placement = {
  company: string;
  role: string;
  location: string;
  closes: string;
};

export const DAILY_TASKS: DailyTask[] = [
  { label: "Revise DBMS normalisation", done: true },
  { label: "AI Tutor session on joins", done: true },
  { label: "Maths III problem set 4", done: true },
  { label: "Mock interview — round 2", done: false },
];

/** Percentage for the progress bar, derived so the bar cannot disagree with the list. */
export function taskCompletion(tasks: DailyTask[] = DAILY_TASKS): number {
  if (tasks.length === 0) return 0;
  return Math.round((tasks.filter((task) => task.done).length / tasks.length) * 100);
}

export const WALLET_BALANCE = 1250;

export const WALLET_ENTRIES: WalletEntry[] = [
  { label: "Canteen top-up", when: "Mon", amount: 500, kind: "credit" },
  { label: "Library fine", when: "Wed", amount: 50, kind: "debit" },
];

/** `week` is Monday-first; the last entry is today, still open. */
export const STREAK = { days: 7, week: [true, true, true, true, true, true, false] };

export const TIMETABLE: TimetableSlot[] = [
  { time: "9:00 AM", subject: "DBMS", room: "Room 204" },
  { time: "11:00 AM", subject: "Maths III", room: "Room 105" },
];

export const NOTICES: Notice[] = [
  { title: "Semester 5 fee deadline extended to Friday", when: "2h ago" },
  { title: "Guest lecture: Systems design at scale", when: "Yesterday" },
  { title: "Library closed on Saturday for stock-taking", when: "2 days ago" },
];

export const PLACEMENT: Placement = {
  company: "Northwind Analytics",
  role: "Graduate Data Engineer",
  location: "Bengaluru · Hybrid",
  closes: "Closes in 3 days",
};

/** Drives the dot on the top bar's bell. */
export const UNREAD_NOTIFICATIONS = NOTICES.length;

export function formatRupees(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}
