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

  const currentIdx = steps.findIndex((s) => s.key === step);

  const canNavigateTo = (target: AppStep): boolean => {
    const idx = steps.findIndex((s) => s.key === step);
    const targetIdx = steps.findIndex((s) => s.key === target);
    if (targetIdx === idx) return true;
    if (targetIdx < idx) return true;

    if (target === '映射') return rawData.length > 0;
    if (target === '核对') return rawData.length > 0 && (subjectMappings.length > 0 || entityMappings.length > 0);
    if (target === '结果') return reconResult !== null;
    return false;
  };

  const progressPercent = Math.round((currentIdx / (steps.length - 1)) * 100);

  return (
    <div className="w-full py-4 px-6">
      {/* 顶部进度条 */}
      <div className="w-full max-w-md mx-auto mb-3">
        <div className="h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-amber-400 rounded-full transition-spring-slow"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
      <div className="flex items-center justify-center space-x-2">
        {steps.map((s, i) => {
          const isActive = step === s.key;
          const isCompleted = currentIdx > i;
          const canClick = canNavigateTo(s.key);

          return (
            <div key={s.key} className="flex items-center">
              <button
                onClick={() => canClick && setStep(s.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  isActive
                    ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/25 scale-[1.03]'
                    : isCompleted
                    ? 'bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 hover:scale-[1.02]'
                    : canClick
                    ? 'bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200 hover:scale-[1.02]'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                }`}
                disabled={!canClick}
              >
                <span className={isActive ? 'text-white' : isCompleted ? 'text-primary' : ''}>
                  {s.icon}
                </span>
                {s.label}
              </button>
              {i < steps.length - 1 && (
                <div className={`w-8 h-0.5 mx-1 rounded-full transition-all ${
                  isCompleted ? 'bg-amber-300' : 'bg-gray-200'
                }`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
