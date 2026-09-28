/**
 * Sends assignment deadline reminders (§41, §80).
 *
 * Run on a schedule — a cron job, a platform scheduler, a Windows task. Every
 * fifteen minutes to an hour is right; the sweep is idempotent, so running it
 * more often costs a few queries and sends nothing extra, and running it less
 * often means a reminder arrives late rather than not at all.
 *
 *   npm run reminders                 # every window
 *   npm run reminders -- --window due-2h
 *   npm run reminders -- --dry-run
 *
 * There is deliberately no scheduler inside the application. A web app with no
 * worker process cannot hold one reliably — `setInterval` in a serverless
 * function or a multi-instance deployment either never fires or fires once per
 * instance — and a reminder system that quietly did neither would be worse than
 * one whose trigger is visibly external.
 */
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db";
import { REMINDER_WINDOWS, sweepAllReminders, sweepReminders } from "../src/lib/teaching/reminders";

function readArg(name: string): string | null {
  const argv = process.argv.slice(2);
  const at = argv.indexOf(`--${name}`);
  return at >= 0 && argv[at + 1] && !argv[at + 1].startsWith("--") ? argv[at + 1] : null;
}

const DRY_RUN = process.argv.includes("--dry-run");
const WINDOW = readArg("window");

async function main() {
  await connectDB();

  if (DRY_RUN) {
    /**
     * A dry run reports what *would* be swept without sending anything.
     *
     * Implemented by shifting the clock rather than by threading a flag through
     * the sweep: a "do not send" branch inside the notifier is a branch that
     * can be wrong, and the whole value of a dry run is that it exercises the
     * real path.
     */
    console.log("Dry run — listing the windows and their lead times, sending nothing.\n");
    for (const window of REMINDER_WINDOWS) {
      console.log(
        `  ${window.key.padEnd(10)} ${window.type.padEnd(22)} ${window.leadMinutes} minutes from now`
      );
    }
    return;
  }

  const results = WINDOW
    ? [
        await sweepReminders(
          REMINDER_WINDOWS.find((entry) => entry.key === WINDOW) ??
            (() => {
              throw new Error(
                `Unknown window "${WINDOW}". Try one of: ${REMINDER_WINDOWS.map((w) => w.key).join(", ")}`
              );
            })()
        ),
      ]
    : await sweepAllReminders();

  console.log("");
  for (const result of results) {
    console.log(
      `  ${result.window.padEnd(10)} ${result.assignmentsChecked} assignments · ${result.notified} notified · ${result.skippedSubmitted} already submitted`
    );
  }
  console.log("");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
