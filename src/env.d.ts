/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly STRIPE_SECRET_KEY: string;
  // Read server-side via process.env (see create-checkout-session.ts's comment on
  // why) — declared here for documentation/completeness, same as STRIPE_SECRET_KEY.
  readonly FIREBASE_READONLY_SA: string;
  // Public Firebase web client config — safe to expose, read via import.meta.env
  // in the /admin sign-in client script.
  readonly PUBLIC_FIREBASE_API_KEY: string;
  readonly PUBLIC_FIREBASE_AUTH_DOMAIN: string;
  readonly PUBLIC_FIREBASE_PROJECT_ID: string;
  readonly PUBLIC_FIREBASE_STORAGE_BUCKET: string;
  readonly PUBLIC_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly PUBLIC_FIREBASE_APP_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
