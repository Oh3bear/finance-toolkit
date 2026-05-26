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
  const { step, setStep, rawData, subjectMappings, entityMappings, reconResult } = useAppStore();

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
                    ? 'bg-blue-600 text-white shadow-md'
                    : isCompleted
                    ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
                    : canClick
                    ? 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                    : 'bg-gray-50 text-gray-400 cursor-not-allowed border border-gray-100'
                }`}
                disabled={!canClick}
              >
                <span className={`${isActive ? 'text-white' : isCompleted ? 'text-green-600' : ''}`}>
                  {s.icon}
                </span>
                {s.label}
              </button>
              {i < steps.length - 1 && (
                <div className={`w-8 h-0.5 mx-1 ${isCompleted ? 'bg-green-400' : 'bg-gray-200'}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
