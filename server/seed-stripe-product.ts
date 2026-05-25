import { getUncachableStripeClient } from './stripeClient';

async function createSubscriptionProduct() {
  const stripe = await getUncachableStripeClient();

  const existing = await stripe.products.search({ query: "name:'CallCatch Pro'" });
  if (existing.data.length > 0) {
    console.log('CallCatch Pro product already exists:', existing.data[0].id);
    const prices = await stripe.prices.list({ product: existing.data[0].id, active: true });
    prices.data.forEach(p => {
      console.log(`  Price: ${p.id} - $${(p.unit_amount || 0) / 100}/${p.recurring?.interval}`);
    });
    return;
  }

  const product = await stripe.products.create({
    name: 'CallCatch Pro',
    description: 'Never miss a job again. Automated SMS follow-ups, job booking, and full call management for tradespeople.',
    metadata: {
      type: 'subscription',
    },
  });

  console.log('Created product:', product.id);

  const monthlyPrice = await stripe.prices.create({
    product: product.id,
    unit_amount: 9900,
    currency: 'aud',
    recurring: { interval: 'month' },
  });

  console.log('Created monthly price:', monthlyPrice.id, '- $99/month AUD');
  console.log('Done! The webhook will sync this to your database automatically.');
}

createSubscriptionProduct().catch(console.error);
