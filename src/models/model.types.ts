import type { OcaConfigPage } from '../pages/OcaConfigPage';
import type { EndBomResult } from '../core/excel';

export interface ModelComponent {
  /** CSS id selector for the component row (e.g. '#item_tr_P73829-B21_ProcessorSection_ProcessorChoice') */
  rowId: string;
  /** target quantity */
  quantity: string;
}

export interface ModelSpec {
  /** Playwright test title */
  name: string;
  /** base part number searched/selected */
  modelNumber: string;
  /** CTO card display name */
  ctoCardName: string;
  /** optional left-menu navigation path (model 1). If omitted, use search-based open (model 2). */
  navPath?: RegExp[];
  /** Smart Chassis configuration row label, e.g. 'Config # 3-38' or 'Config 65' */
  smartChassisConfigLabel: string;
  /** known data recorded into the workbook up front */
  selectedProcessor: string;
  selectedMemory: string;
  networkCard?: string;
  service?: string;
  /** row-id/quantity pairs driven through setRowQuantity (model 1) */
  components?: ModelComponent[];
  /** the model-specific orchestration */
  run(oca: OcaConfigPage, result: EndBomResult): Promise<void>;
}
