import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, signToken, verifyToken } from './auth';

describe('password hashing', () => {
  it('verifies a correct password', () => {
    const hash = hashPassword('secret123');
    expect(verifyPassword('secret123', hash)).toBe(true);
  });

  it('rejects a wrong password', () => {
    const hash = hashPassword('secret123');
    expect(verifyPassword('wrong', hash)).toBe(false);
  });
});

describe('jwt tokens', () => {
  it('round-trips a valid payload', () => {
    const token = signToken({ sub: 1, username: 'admin', role: 'planner' });
    const payload = verifyToken(token);
    expect(payload).toEqual({ sub: 1, username: 'admin', role: 'planner' });
  });

  it('returns null for a garbage token', () => {
    expect(verifyToken('not-a-real-token')).toBeNull();
  });
});
