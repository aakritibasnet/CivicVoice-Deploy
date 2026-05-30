import "@/lib/env";
import { AppError } from "@/lib/errors";

/**
 * Twilio is the most common choice.
 * Install: npm i twilio
 */
import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
const authToken = process.env.TWILIO_AUTH_TOKEN || "";
const fromNumber = process.env.TWILIO_FROM_NUMBER || "";

const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

export async function sendSmsOtp(opts: { to: string; message: string }) {
  if (!client) {
    throw new AppError("SMS provider not configured (Twilio).", 500);
  }
  if (!fromNumber) {
    throw new AppError("TWILIO_FROM_NUMBER is missing.", 500);
  }

  await client.messages.create({
    to: opts.to,
    from: fromNumber,
    body: opts.message,
  });
}
