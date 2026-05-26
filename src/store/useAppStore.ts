import { create } from 'zustand';
import type { AppState, AppStep, RawLedgerRow, CleanedRow, SubjectMapping, EntityMapping, ReconResult } from '@/types';

export const useAppStore = create<AppState>((set) => ({
  step: '导入',
  rawData: [],
  cleanedData: [],
  subjectMappings: [],
  entityMappings: [],
  reconResult: null,
  isProcessing: false,
  progress: 0,

  setStep: (step: AppStep) => set({ step }),
  setRawData: (data: RawLedgerRow[]) => set({ rawData: data }),
  setCleanedData: (data: CleanedRow[]) => set({ cleanedData: data }),
  setSubjectMappings: (data: SubjectMapping[]) => set({ subjectMappings: data }),
  setEntityMappings: (data: EntityMapping[]) => set({ entityMappings: data }),
  setReconResult: (result: ReconResult | null) => set({ reconResult: result }),
  setIsProcessing: (v: boolean) => set({ isProcessing: v }),
  setProgress: (p: number) => set({ progress: p }),
  reset: () => set({
    step: '导入',
    rawData: [],
    cleanedData: [],
    subjectMappings: [],
    entityMappings: [],
    reconResult: null,
    isProcessing: false,
    progress: 0,
  }),
}));
