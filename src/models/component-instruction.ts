export const selectionTypes = ['radio', 'quantity', 'checkbox', 'configuration', 'automatic', 'default'] as const;

export type SelectionType = (typeof selectionTypes)[number];

export interface ComponentInstruction {
  jobId: string;
  section: string;
  productNumber?: string;
  description?: string;
  quantity?: number;
  selectionType: SelectionType;
  configurationText?: string;
  sequence: number;
}

export function isSelectionType(value: string): value is SelectionType {
  return selectionTypes.includes(value as SelectionType);
}
