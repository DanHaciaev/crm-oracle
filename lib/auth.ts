import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

const JWT_SECRET = process.env.JWT_SECRET!;

export interface TokenPayload {
  id:       number;
  username: string;
  role:     "admin" | "manager";
}

const SALT_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function hashPassword(password: string): string {
  const N = 32768, r = 8, p = 1;
  const saltBytes = randomBytes(16);
  const salt = Array.from(saltBytes).map(b => SALT_CHARS[b % SALT_CHARS.length]).join("");
  const hash = scryptSync(
    Buffer.from(password, "utf8"),
    Buffer.from(salt, "utf8"),
    64,
    { N, r, p, maxmem: 128 * 1024 * 1024 }
  );
  return `scrypt:${N}:${r}:${p}$${salt}$${hash.toString("hex")}`;
}

function compareScrypt(password: string, hash: string): boolean {
  // format: scrypt:N:r:p$salt$hexhash
  try {
    const [method, salt, hexHash] = hash.split("$");
    if (!method.startsWith("scrypt:")) return false;
    const [, N, r, p] = method.split(":");
    const keylen  = hexHash.length / 2;
    const derived = scryptSync(
      Buffer.from(password, "utf8"),
      Buffer.from(salt, "utf8"),
      keylen,
      { N: Number(N), r: Number(r), p: Number(p), maxmem: 128 * 1024 * 1024 }
    );
    return timingSafeEqual(derived, Buffer.from(hexHash, "hex"));
  } catch {
    return false;
  }
}

export function comparePassword(password: string, hash: string): boolean {
  if (hash.startsWith("scrypt:")) return compareScrypt(password, hash);
  return bcrypt.compareSync(password, hash);
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}
