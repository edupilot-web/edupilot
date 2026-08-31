/**
 * The shape of the emailed verification code.
 *
 * Its own module, with no imports, because both sides of the wire need it: the
 * OTP screen is a client component and sizes its boxes from this, while
 * `email-verification.ts` generates and checks against the same number. Keeping
 * it out of `validation.ts` keeps that module's Mongoose imports — and so the
 * whole database layer — out of the browser bundle.
 */
export const VERIFICATION_CODE_LENGTH = 6;
