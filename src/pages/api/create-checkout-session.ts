import type { APIRoute } from 'astro';
import Stripe from 'stripe';

export const prerender = false;

// Use process.env rather than import.meta.env because Vite would inline
// import.meta.env at build time — if the var isn't in the build env it
// becomes `undefined` in the bundle even when set at runtime. process.env
// reads from the serverless function's runtime env directly.
const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  throw new Error('STRIPE_SECRET_KEY is not set in the runtime environment.');
}
const stripe = new Stripe(secretKey);

const TIERS: Record<string, { cents: number; name: string }> = {
  small:  { cents: 299,  name: 'LockPact — Spark' },
  medium: { cents: 699,  name: 'LockPact — Steady' },
  large:  { cents: 1499, name: 'LockPact — Torch' },
};

export const POST: APIRoute = async ({ request }) => {
  // Vercel SSR is happy with formData(); URLSearchParams fallback reserved for escalation.
  const data = await request.formData();
  const tier = String(data.get('tier') ?? '');

  let cents: number;
  let productName: string;

  if (tier === 'custom') {
    const raw = parseFloat(String(data.get('amount') ?? '0'));
    if (!Number.isFinite(raw) || raw < 5 || raw > 500) {
      return new Response('Invalid amount. Must be between $5 and $500.', { status: 400 });
    }
    cents = Math.round(raw * 100);
    productName = 'LockPact — Custom Tip';
  } else if (tier in TIERS) {
    cents = TIERS[tier].cents;
    productName = TIERS[tier].name;
  } else {
    return new Response('Invalid tier.', { status: 400 });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: cents,
          product_data: {
            name: productName,
            description: 'One-time tip to support LockPact. Tips unlock no features — they are pure support.',
          },
        },
      }],
      success_url: 'https://lockpact.app/tip/thanks?session_id={CHECKOUT_SESSION_ID}',
      cancel_url:  'https://lockpact.app/tip',
    });

    return new Response(null, {
      status: 303,
      headers: { Location: session.url! },
    });
  } catch (err) {
    console.error('Stripe Checkout session creation failed:', err);
    return new Response('Payment system temporarily unavailable. Please try again.', { status: 500 });
  }
};
