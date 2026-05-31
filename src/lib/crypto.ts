import crypto from "node:crypto";

export function hashPassword(password: string) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

export function createRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}
