import type { ModelSpec } from './model.types';
import type { OcaConfigPage } from '../pages/OcaConfigPage';
import type { EndBomResult } from '../core/excel';

const PROCESSOR_ROW = '#item_tr_P73829-B21_ProcessorSection_ProcessorChoice';
const MEMORY_ROW = '#item_tr_P69727-B21_memory_memorySlotsChoice';
const POWER_ROW = '#item_tr_P44712-B21_power_powerSlots';

export const dl360Gen12: ModelSpec = {
  name: 'load OCA Config 2 for HPE ProLiant Compute DL360 Gen12 CTO product',
  modelNumber: process.env.OCA_MODEL_NUMBER ?? 'P72176-B21',
  ctoCardName: 'HPE ProLiant Compute DL360 Gen12',
  navPath: [
    /^aaS$/i,
    /^Compute$/i,
    /^Servers$/i,
    /^Rack Servers$/i,
    /^ProLiant DL300 Servers$/i,
    /^ProLiant DL300 Servers Gen 12$/i,
    /^HPE ProLiant Compute DL360 Gen12$/i,
  ],
  smartChassisConfigLabel: 'Config # 3-38',
  selectedProcessor: 'P73829-B21 Intel Xeon 6740P 2.1GHz 48-core 270W Processor for HPE',
  selectedMemory: 'P69727-B21',
  components: [
    { rowId: PROCESSOR_ROW, quantity: '2' },
    { rowId: MEMORY_ROW, quantity: '4' },
    { rowId: POWER_ROW, quantity: '1' },
  ],
  async run(oca: OcaConfigPage, _result: EndBomResult): Promise<void> {
    await oca.searchAndOpenModel(this.modelNumber);
    await oca.waitForSmartChassisMenuReady();

    console.log('[STEP] Selecting Smart Chassis default and configuration quantities');
    await oca.selectSmartChassis('Select Defaults for Smart Chassis', this.smartChassisConfigLabel);

    console.log('[STEP] Running recorded Processor and Memory selections');
    const page = oca.activePage;
    await oca.clickText('Processor Processor 0 0');
    await oca.setRowQuantity(PROCESSOR_ROW, '2');
    await page.waitForTimeout(3_000);
    await oca.dismissAutoUpdatesWidget();
    await oca.selectRecommendedOnly();

    await oca.clickText('Memory Memory Capacity 0 0');
    await oca.setRowQuantity(MEMORY_ROW, '4');
    await page.waitForTimeout(3_000);

    await oca.selectComponentSection('Power Supplies', '#section_header_power');
    await oca.setRowQuantity(POWER_ROW, '1');
    await oca.dismissOcaProblemDialogs();
    await oca.waitForPowerSupplyRowToSettle(POWER_ROW);
    await oca.dismissAutoUpdatesWidget();

    await oca.clickText('SaveQuoteExportAdd');
    await oca.selectService('Default');
    await oca.openBomAndSetBillingTier();
    await oca.saveOcaConfig();
    await oca.generateAndAssociateEndBom();
  },
};
