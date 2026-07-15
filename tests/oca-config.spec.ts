import { test } from '@playwright/test';
import { specs } from '../src/models';
import { launchOcaContext } from '../src/core/browser';
import { OcaConfigPage } from '../src/pages/OcaConfigPage';
import { newResult, updateEndBomWorkbook } from '../src/core/excel';

for (const spec of specs) {
  test(spec.name, async ({ playwright }) => {
    test.setTimeout(15 * 60_000);
    const context = await launchOcaContext(playwright);
    const result = newResult(spec);
    const oca = new OcaConfigPage(context, spec, result);
    try {
      await oca.openOca();
      await spec.run(oca, result);
      result.status = 'Pass';
      updateEndBomWorkbook(result);
    } catch (error) {
      result.status = 'Fail';
      updateEndBomWorkbook({ ...result, status: 'Fail' });
      throw error;
    } finally {
      await context.close().catch(() => undefined);
    }
  });
}
