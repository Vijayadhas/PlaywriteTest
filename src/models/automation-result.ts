export type ExecutionStatus = 'Success' | 'Failed' | 'Skipped' | 'Unsupported';

export interface AutomationResult {
  jobId: string;
  modelNumber: string;
  executionStatus: ExecutionStatus;
  ucid: string;
  quotationMode: string;
  ocaConfigStatus: string;
  endBomStatus: string;
  endBomId: string;
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
    ocaConfigStatus: '',
    endBomStatus: 'Not requested',
    endBomId: '',
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
