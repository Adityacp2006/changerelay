import { describe, expect, it } from 'vitest';
import { assertOwns, AuthzError } from '@/lib/server/authz';

describe('10. cross-user access', () => {
  it('allows the owner and rejects everyone else, including missing sessions', () => {
    expect(() => assertOwns('user-a', { owner_id: 'user-a' })).not.toThrow();
    expect(() => assertOwns('user-b', { owner_id: 'user-a' })).toThrow(AuthzError);
    expect(() => assertOwns(null, { owner_id: 'user-a' })).toThrow(AuthzError);
    expect(() => assertOwns('user-a', null)).toThrow(AuthzError);          // missing and forbidden look identical (no existence leak)
  });
});
