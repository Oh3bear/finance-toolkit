import { useAppStore } from '@/store/useAppStore';
import type { AppStep } from '@/types';
import { Upload, Map, Calculator, FileText } from 'lucide-react';

const steps: { key: AppStep; label: string; icon: React.ReactNode }[] = [
  { key: '导入', label: '数据导入', icon: <Upload className="w-4 h-4" /> },
  { key: '映射', label: '映射维护', icon: <Map className="w-4 h-4" /> },
  { key: '核对', label: '执行核对', icon: <Calculator className="w-4 h-4" /> },
  { key: '结果', label: '核对结果', icon: <FileText className="w-4 h-4" /> },
];

export function StepIndicator() {
  const step = useAppStore(s => s.step);
  const setStep = useAppStore(s => s.setStep);
  const rawData = useAppStore(s => s.rawData);
  const subjectMappings = useAppStore(s => s.subjectMappings);
  const entityMappings = useAppStore(s => s.entityMappings);
  const reconResult = useAppStore(s => s.reconResult);

  const canNavigateTo = (target: AppStep): boolean => {
    const idx = steps.findIndex((s) => s.key === step);
    const targetIdx = steps.findIndex((s) => s.key === target);
    if (targetIdx === idx) return true;
    if (targetIdx < idx) return true; // 可以回退

    // 向前导航需要满足条件
    if (target === '映射') return rawData.length > 0;
    if (target === '核对') return rawData.length > 0 && (subjectMappings.length > 0 || entityMappings.length > 0);
    if (target === '结果') return reconResult !== null;
    return false;
  };

  return (
    <div className="w-full py-4 px-6">
      <div className="flex items-center justify-center space-x-2">
        {steps.map((s, i) => {
          const isActive = step === s.key;
          const isCompleted = steps.findIndex((x) => x.key === step) > i;
          const canClick = canNavigateTo(s.key);

          return (
            <div key={s.key} className="flex items-center">
              <button
                onClick={() => canClick && setStep(s.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-primary to-emerald-500 text-white shadow-md shadow-primary/20'
                    : isCompleted
                    ? 'bg-primary/10 text-primary border border-primary/30 hover:bg-primary/15'
                    : canClick
                    ? 'bg-background text-muted-foreground border border-border hover:bg-muted'
                    : 'bg-background text-muted-foreground/50 cursor-not-allowed border border-border'
                }`}
                disabled={!canClick}
              >
                <span className={isActive ? 'text-white' : isCompleted ? 'text-primary' : ''}>
                  {s.icon}
                </span>
                {s.label}
              </button>
              {i < steps.length - 1 && (
                <div className={`w-8 h-0.5 mx-1 ${isCompleted ? 'bg-primary/40' : 'bg-muted'}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
