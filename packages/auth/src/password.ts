import { hash, verify } from '@node-rs/argon2';

/** Hash a plaintext password with argon2id (library defaults). */
export function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

/** Verify a plaintext password against a stored hash; false on any mismatch or malformed hash. */
export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}
