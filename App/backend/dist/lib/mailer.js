import nodemailer from "nodemailer";
import "@/lib/env";
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});
export async function sendVerificationEmail({ to, code, purpose, }) {
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    const ttl = Number(process.env.OTP_TTL_MIN || 10);
    if (!from)
        throw new Error("SMTP_FROM or SMTP_USER missing in env");
    await transporter.sendMail({
        from,
        to,
        subject: "Your CivicVoice verification code",
        text: `Your verification code is: ${code}\n\nIt expires in ${ttl} minutes.`,
    });
}
