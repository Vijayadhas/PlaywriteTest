import type { ModelSpec } from './model.types';
import type { OcaConfigPage } from '../pages/OcaConfigPage';
import type { EndBomResult } from '../core/excel';

export const secondCto: ModelSpec = {
  name: 'configure OCA Config 2 second CTO model with Lite service and End BOM association',
  modelNumber: 'P72297-B21',
  ctoCardName: 'P72297-B21',
  smartChassisConfigLabel: 'Config 65',
  selectedProcessor: 'P74506-B21 Intel Xeon 6515P 2.3GHz 16-core 150W Processor for HPE',
  selectedMemory:
    'P69727-F21 HPE 32GB (1x32GB) Dual Rank x8 DDR5-6400 CAS-52-52-52 EC8 Registered Smart FIO Memory Kit',
  networkCard: 'P72203-B21',
  service: 'Lite',
  async run(oca: OcaConfigPage, _result: EndBomResult): Promise<void> {
    await oca.searchAndOpenModel(this.modelNumber);
    await oca.selectSmartChassis('Select Defaults for Smart Chassis', this.smartChassisConfigLabel);
    await oca.selectRecommendedOnly(true);
    console.log(`[STEP] Configure Networking card reference: ${this.networkCard}`);
    await oca.configureNetworkingCard(this.networkCard!);
    await oca.selectService(this.service!);
    await oca.runBillingTierSetup();
    await oca.saveOcaConfig();
    await oca.generateAndAssociateEndBom();
  },
};
