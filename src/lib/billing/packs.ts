export interface ManagedCreditPack {
  id: string;
  credits: number;
  priceAmount: number;
  priceCurrency: 'usd';
  label: string;
  description: string;
}

export const MANAGED_CREDIT_PACKS: ManagedCreditPack[] = [
  {
    id: 'starter',
    credits: 500,
    priceAmount: 10,
    priceCurrency: 'usd',
    label: 'Starter',
    description: 'Good for light managed extraction and agent chat.',
  },
  {
    id: 'growth',
    credits: 2500,
    priceAmount: 39,
    priceCurrency: 'usd',
    label: 'Growth',
    description: 'Balanced pack for active individual usage.',
  },
  {
    id: 'team',
    credits: 8000,
    priceAmount: 99,
    priceCurrency: 'usd',
    label: 'Team',
    description: 'Best for shared workspaces with frequent managed runs.',
  },
];

export function getManagedCreditPack(packId: string): ManagedCreditPack | null {
  return MANAGED_CREDIT_PACKS.find((pack) => pack.id === packId) || null;
}
