const DELETED = /^0+$/;
const BRANCH_REF = "refs/heads/";

/**
 * Reads the lines git gives a pre-push hook (`<local ref> <local sha> <remote ref> <remote sha>`) and returns the remote
 * branch names being pushed, in order and without repeats. Deletes, tags and other refs are left out.
 */
export function pushedBranches(input: string): string[] {
  const names = new Set<string>();
  for (const line of input.split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 4) continue;
    const [, localSha, remoteRef] = fields;
    if (DELETED.test(localSha) || !remoteRef.startsWith(BRANCH_REF)) continue;
    names.add(remoteRef.slice(BRANCH_REF.length));
  }
  return [...names];
}
