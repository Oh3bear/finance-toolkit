import { useAppStore } from '@/store/useAppStore';
import type { AppStep } from '@/types';
import { Upload, Map, Calculator, FileText, Check } from 'lucide-react';

const steps: { key: AppStep; label: string; icon: React.ReactNode }[] = [
  { key: '导入', label: '数据导入', icon: <Upload className="w-3.5 h-3.5" /> },
  { key: '映射', label: '映射维护', icon: <Map className="w-3.5 h-3.5" /> },
  { key: '核对', label: '执行核对', icon: <Calculator className="w-3.5 h-3.5" /> },
  { key: '结果', label: '核对结果', icon: <FileText className="w-3.5 h-3.5" /> },
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
      {/* 顶部进度条 — 铜金渐变轨道 */}
      <div className="w-full max-w-sm mx-auto mb-5">
        <div className="step-track">
          <div
            className="step-track-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* 步骤节点行 — 细线轨道+光点 */}
      <div className="flex items-start justify-center max-w-lg mx-auto">
        {steps.map((s, i) => {
          const isActive = step === s.key;
          const isCompleted = currentIdx > i;
          const canClick = canNavigateTo(s.key);

          return (
            <div key={s.key} className="flex items-start flex-1 last:flex-none">
              {/* 步骤节点 */}
              <button
                onClick={() => canClick && setStep(s.key)}
                disabled={!canClick}
                className={`
                  flex flex-col items-center gap-2 cursor-pointer
                  ${!canClick ? 'cursor-not-allowed' : ''}
                `}
                aria-current={isActive ? 'step' : undefined}
              >
                {/* 光点圆 */}
                <div className={`
                  w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300
                  ${isActive
                    ? 'animate-dot-pulse border-2 border-primary bg-primary text-white shadow-lg'
                    : isCompleted
                    ? 'border-2 border-primary bg-primary text-white'
                    : canClick
                    ? 'border-2 border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
                    : 'border-2 border-border bg-background text-muted-foreground/50'
                  }
                `}
                style={isActive ? {
                  borderColor: 'hsl(210,90%,56%)',
                  backgroundColor: 'hsl(210,90%,56%)',
                  boxShadow: '0 0 12px 2px hsl(210,90%,56%,0.3)',
                } : isCompleted ? {
                  borderColor: 'hsl(210,90%,56%)',
                  backgroundColor: 'hsl(210,90%,56%)',
                } : undefined}
                >
                  {isCompleted ? (
                    <Check className="w-4 h-4 text-white" />
                  ) : (
                    <span className={isActive ? 'text-white' : ''}>{s.icon}</span>
                  )}
                </div>
                {/* 步骤标签 */}
                <span className={`
                  text-xs font-medium transition-colors duration-200 whitespace-nowrap
                  ${isActive
                    ? 'text-foreground'
                    : isCompleted
                    ? 'text-foreground/70'
                    : canClick
                    ? 'text-muted-foreground hover:text-foreground/60'
                    : 'text-muted-foreground/40'
                  }
                `}>
                  {s.label}
                </span>
              </button>

              {/* 连接线段 */}
              {i < steps.length - 1 && (
                <div className="flex-1 pt-[17px] px-1">
                  <div className="h-[2px] w-full rounded-full transition-all duration-500"
                    style={{
                      background: isCompleted
                        ? 'linear-gradient(90deg, hsl(210,90%,56%), hsl(210,90%,70%))'
                        : 'hsl(var(--border))',
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
