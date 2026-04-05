import bcrypt from "bcrypt";
// 6-digit numeric code
export function generateOtp() {
    return String(Math.floor(100000 + Math.random() * 900000));
}
export async function hashOtp(code) {
    return bcrypt.hash(code, 12);
}
export async function verifyOtp(code, codeHash) {
    return bcrypt.compare(code, codeHash);
}
