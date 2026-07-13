import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Read-only web tier (docs/phase-1.5/14-unified-dashboard-spec.md, architecture
// revised 2026-07-09): this is the ONLY secret this repo holds. The service
// account behind it carries roles/datastore.viewer only — IAM denies writes,
// so there is no code-level guard needed against accidental writes here; the
// credential itself can't perform them.
//
// process.env (not import.meta.env) — see create-checkout-session.ts's comment:
// Vite inlines import.meta.env at build time, so a runtime-only env var would
// bake in as undefined. process.env reads the serverless function's actual
// runtime environment.
function getReadonlyServiceAccount() {
  const raw = process.env.FIREBASE_READONLY_SA;
  if (!raw) {
    throw new Error('FIREBASE_READONLY_SA is not set in the runtime environment.');
  }
  const parsed = JSON.parse(raw);
  // Downloaded service-account JSON escapes newlines in private_key as literal
  // "\n" — Firestore's cert() needs real newlines.
  if (typeof parsed.private_key === 'string') {
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }
  return parsed;
}

// Guard against re-init — Vercel's serverless runtime can reuse the module
// scope across invocations on a warm lambda.
if (getApps().length === 0) {
  initializeApp({ credential: cert(getReadonlyServiceAccount()) });
}

const auth = getAuth();
const db = getFirestore();

export class AdminAuthError extends Error {
  constructor(public status: 401 | 403, message: string) {
    super(message);
  }
}

/**
 * Verifies the bearer ID token and requires users/{uid}.isAdmin === true
 * (a Firestore field, NOT a Firebase Auth custom claim — admin.ts's
 * setAdminClaim is misnamed; decoded.token never has an isAdmin field).
 * Throws AdminAuthError(401) for a missing/invalid token, (403) if the
 * signed-in user isn't an admin. Callers should catch and respond with no
 * detail beyond the status code.
 */
export async function requireAdmin(request: Request): Promise<string> {
  const authHeader = request.headers.get('authorization') ?? '';
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) {
    throw new AdminAuthError(401, 'Missing bearer token');
  }

  let uid: string;
  try {
    const decoded = await auth.verifyIdToken(match[1]);
    uid = decoded.uid;
  } catch {
    throw new AdminAuthError(401, 'Invalid token');
  }

  const userDoc = await db.collection('users').doc(uid).get();
  if (userDoc.data()?.isAdmin !== true) {
    throw new AdminAuthError(403, 'Not authorized');
  }

  return uid;
}

export function adminAuthErrorResponse(err: unknown): Response {
  if (err instanceof AdminAuthError) {
    return new Response(null, { status: err.status });
  }
  console.error('[adminAuth] Unexpected error:', err);
  return new Response(null, { status: 401 });
}

export { db as adminDb };
