export type ToyStatus = 'available' | 'made-to-order' | 'sold';

export interface StatusMetadata {
  label: string;
  kind: ToyStatus;
}

export const statusMeta: Record<ToyStatus, StatusMetadata> = {
  available: { label: 'В наявності', kind: 'available' },
  'made-to-order': { label: 'Під замовлення', kind: 'made-to-order' },
  sold: { label: 'Продано', kind: 'sold' },
} as const;
