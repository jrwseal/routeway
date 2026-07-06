import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.warn('JWT_SECRET not set — using an insecure dev default. Set JWT_SECRET in production.');
  return 'dev-secret-change-me';
})();

export const COOKIE_NAME = 'rw_token';

export interface JwtPayload {
  sub: number;
  username: string;
  role: 'planner' | 'driver';
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload & { iat: number; exp: number };
    return {
      sub: payload.sub,
      username: payload.username,
      role: payload.role,
    };
  } catch {
    return null;
  }
}
