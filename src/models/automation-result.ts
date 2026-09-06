export type ExecutionStatus = 'Success' | 'Failed' | 'Skipped' | 'Unsupported';

export interface AutomationResult {
  jobId: string;
  modelNumber: string;
  executionStatus: ExecutionStatus;
  ucid: string;
  quotationMode: string;
  serviceExperience: string;
  serviceTerm: string;
  dataPrivacy: string;
  ocaConfigStatus: string;
  endBomStatus: string;
  startBomId: string;
  endBomId: string;
  endBomAssociated: string;
  startBillingTier: string;
  startBillingTierCustomName: string;
  startAllocatedMemory: string;
  startServerCount: string;
  startUsedCpuCore: string;
  endBillingTier: string;
  endBillingTierCustomName: string;
  endAllocatedMemory: string;
  endServerCount: string;
  endUsedCpuCore: string;
  selectedComponents: string;
  startTime: string;
  endTime: string;
  duration: number;
  retryCount: number;
  errorStep: string;
  errorMessage: string;
  screenshotPath: string;
  tracePath: string;
}

export function createPendingResult(jobId: string, modelNumber: string, retryCount = 0): AutomationResult {
  return {
    jobId,
    modelNumber,
    executionStatus: 'Failed',
    ucid: '',
    quotationMode: '',
    serviceExperience: '',
    serviceTerm: '',
    dataPrivacy: '',
    ocaConfigStatus: '',
    endBomStatus: 'Not requested',
    startBomId: '',
    endBomId: '',
    endBomAssociated: 'No',
    startBillingTier: '',
    startBillingTierCustomName: '',
    startAllocatedMemory: '',
    startServerCount: '',
    startUsedCpuCore: '',
    endBillingTier: '',
    endBillingTierCustomName: '',
    endAllocatedMemory: '',
    endServerCount: '',
    endUsedCpuCore: '',
    selectedComponents: '',
    startTime: new Date().toISOString(),
    endTime: '',
    duration: 0,
    retryCount,
    errorStep: '',
    errorMessage: '',
    screenshotPath: '',
    tracePath: '',
  };
}
