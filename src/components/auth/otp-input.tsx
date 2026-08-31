"use client";

import { useId, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { FieldError } from "@/components/auth/fields";
import { VERIFICATION_CODE_LENGTH } from "@/lib/verification-code";

const BOX =
  "h-13 w-full rounded-xl border bg-white text-center text-[22px] font-semibold tabular-nums text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition disabled:opacity-60 dark:bg-slate-900 dark:text-white";

const BOX_IDLE =
  "border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:focus:border-blue-500";

const BOX_INVALID =
  "border-rose-300 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 dark:border-rose-500/60";

const SLOTS = Array.from({ length: VERIFICATION_CODE_LENGTH }, (_, index) => index);

/**
 * The six-box code entry.
 *
 * One box per digit is what people expect from an OTP, but boxes are only a
 * presentation: the value submitted is a single hidden field holding the joined
 * digits, so the server sees one `code` and never has to reassemble anything.
 *
 * The behaviours below are not decoration — each is a way this control is
 * commonly broken:
 *
 * - Pasting the whole code into any box fills all of them. Most people paste.
 * - Backspace in an empty box moves back and clears the one before it, so a
 *   correction does not need the mouse.
 * - `inputMode="numeric"` brings up the digit keypad on a phone; the first box
 *   carries `autoComplete="one-time-code"`, which is what lets iOS and Android
 *   offer the code straight from the notification.
 * - Every box takes the last character typed rather than appending, so typing
 *   over a filled box replaces it instead of silently ignoring the keystroke.
 *
 * It holds no reset logic of its own: the caller empties the boxes by changing
 * this component's `key`, which is React's own way of saying "that was a
 * different attempt, start again".
 */
export function OtpInput({
  name,
  errors,
  disabled,
  onComplete,
}: {
  name: string;
  errors?: string[];
  disabled?: boolean;
  /** Called once all boxes are full — used to submit without a button press. */
  onComplete?: (code: string) => void;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const invalid = Boolean(errors?.length);

  const [digits, setDigits] = useState<string[]>(() => SLOTS.map(() => ""));
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  const code = digits.join("");

  function commit(nextDigits: string[], focusIndex: number) {
    setDigits(nextDigits);
    inputs.current[Math.min(focusIndex, SLOTS.length - 1)]?.focus();

    const joined = nextDigits.join("");
    if (joined.length === VERIFICATION_CODE_LENGTH) onComplete?.(joined);
  }

  function handleChange(index: number, raw: string) {
    const typed = raw.replace(/[^0-9]/g, "");
    if (!typed) {
      // Deleting the contents of a box with Delete, or the keyboard's own clear.
      const next = [...digits];
      next[index] = "";
      setDigits(next);
      return;
    }

    // More than one digit means a paste, or an autofill — spread it forward.
    if (typed.length > 1) {
      const next = [...digits];
      for (let offset = 0; index + offset < SLOTS.length && offset < typed.length; offset += 1) {
        next[index + offset] = typed[offset];
      }
      commit(next, index + typed.length);
      return;
    }

    const next = [...digits];
    // The last character, not the first: typing into a full box should replace
    // what is there rather than be swallowed.
    next[index] = typed[typed.length - 1];
    commit(next, index + 1);
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace") {
      if (digits[index]) return; // The change handler clears this box.
      event.preventDefault();
      if (index === 0) return;
      const next = [...digits];
      next[index - 1] = "";
      setDigits(next);
      inputs.current[index - 1]?.focus();
      return;
    }

    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      inputs.current[index - 1]?.focus();
      return;
    }

    if (event.key === "ArrowRight" && index < SLOTS.length - 1) {
      event.preventDefault();
      inputs.current[index + 1]?.focus();
    }
  }

  function handlePaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text").replace(/[^0-9]/g, "");
    if (!pasted) return;
    event.preventDefault();

    const next = [...digits];
    for (let offset = 0; index + offset < SLOTS.length && offset < pasted.length; offset += 1) {
      next[index + offset] = pasted[offset];
    }
    commit(next, index + pasted.length);
  }

  return (
    <div>
      {/* What actually gets submitted. The boxes above are the interface; this
          is the field, so the action reads one value and not six. */}
      <input type="hidden" name={name} value={code} />

      <div
        role="group"
        aria-label={`Verification code, ${VERIFICATION_CODE_LENGTH} digits`}
        aria-describedby={invalid ? errorId : undefined}
        className="grid grid-cols-6 gap-2 sm:gap-2.5"
      >
        {SLOTS.map((index) => (
          <input
            key={index}
            ref={(element) => {
              inputs.current[index] = element;
            }}
            // `type="text"` with a numeric inputMode, not `type="number"`:
            // number inputs bring spinners, accept "e" and "-", and silently
            // drop leading zeros — all wrong for a code.
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            // Entering the code is the only thing this screen asks for, so the
            // caret belongs here on arrival — and back here after a refusal,
            // which the remount takes care of.
            autoFocus={index === 0}
            // A single-character maxLength still lets a paste through, which
            // the paste handler above is what deals with.
            maxLength={1}
            value={digits[index]}
            disabled={disabled}
            aria-label={`Digit ${index + 1}`}
            aria-invalid={invalid || undefined}
            onChange={(event) => handleChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={(event) => handlePaste(index, event)}
            onFocus={(event) => event.target.select()}
            className={`${BOX} ${invalid ? BOX_INVALID : BOX_IDLE}`}
          />
        ))}
      </div>

      <FieldError id={errorId} messages={errors} />
    </div>
  );
}
