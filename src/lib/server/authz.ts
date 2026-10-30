export class AuthzError extends Error { status = 404; constructor() { super('Not found'); } }

/** Every private record carries owner_id. Missing and foreign records are indistinguishable (404) so ids can't be probed. */
export function assertOwns<T extends { owner_id: string }>(userId: string | null | undefined, row: T | null | undefined): asserts row is T {
  if (!userId || !row || row.owner_id !== userId) throw new AuthzError();
}
