import { CheckCircle } from 'lucide-react';

/**
 * 现代 SaaS 风格通用步骤指示器
 * - 蓝色渐变进度轨道 + 光点滑块
 * - 可替换各工具页面中内联的步骤导航
 */

export interface ForgeStepDef {
  id: string | number;
  label: string;
  icon: React.ReactNode;
}

interface ForgeStepIndicatorProps {
  steps: ForgeStepDef[];
  currentStep: string | number;
  /** 判断某步是否可点击导航，不传则只允许回退 */
  canNavigateTo?: (stepId: string | number) => boolean;
  /** 点击步骤回调 */
  onStepClick?: (stepId: string | number) => void;
  /** 是否紧凑模式（适用于 sticky header 内） */
  compact?: boolean;
}

export function ForgeStepIndicator({
  steps,
  currentStep,
  canNavigateTo,
  onStepClick,
  compact = false,
}: ForgeStepIndicatorProps) {
  const currentIndex = steps.findIndex((s) => s.id === currentStep);
  const progressPercent = steps.length > 1
    ? (currentIndex / (steps.length - 1)) * 100
    : 0;

  const dotSize = compact ? 'w-7 h-7' : 'w-8 h-8';
  const iconSize = compact ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const labelSize = compact ? 'text-[10px]' : 'text-[11px]';
  const trackMb = compact ? 'mb-2' : 'mb-3';

  return (
    <div className="w-full">
      {/* 蓝色渐变进度轨道 */}
      <div className={`w-full max-w-sm mx-auto ${trackMb}`}>
        <div className="step-track">
          <div
            className="step-track-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* 步骤节点行 */}
      <div className="flex items-start justify-center max-w-lg mx-auto">
        {steps.map((s, i) => {
          const isActive = s.id === currentStep;
          const isCompleted = currentIndex > i;
          const canClick = canNavigateTo
            ? canNavigateTo(s.id)
            : i <= currentIndex;

          return (
            <div key={s.id} className="flex items-start flex-1 last:flex-none">
              {/* 步骤节点 */}
              <button
                onClick={() => canClick && onStepClick?.(s.id)}
                disabled={!canClick}
                className={`
                  flex flex-col items-center gap-1.5
                  ${canClick ? 'cursor-pointer' : 'cursor-default'}
                `}
                aria-current={isActive ? 'step' : undefined}
              >
                {/* 光点圆 */}
                <div
                  className={`
                    ${dotSize} rounded-full flex items-center justify-center
                    transition-all duration-300 border-2
                    ${isActive
                      ? 'animate-dot-pulse'
                      : isCompleted
                      ? ''
                      : canClick
                      ? 'hover:border-primary/40 hover:text-foreground'
                      : 'opacity-50'
                    }
                  `}
                  style={
                    isActive
                      ? {
                          borderColor: 'hsl(210,90%,56%)',
                          backgroundColor: 'hsl(210,90%,56%)',
                          boxShadow: '0 0 10px 2px hsl(210,90%,56%,0.25)',
                          color: 'white',
                        }
                      : isCompleted
                      ? {
                          borderColor: 'hsl(210,90%,56%)',
                          backgroundColor: 'hsl(210,90%,56%)',
                          color: 'white',
                        }
                      : {
                          borderColor: 'hsl(var(--border))',
                          backgroundColor: 'hsl(var(--card))',
                          color: 'hsl(var(--muted-foreground))',
                        }
                  }
                >
                  {isCompleted && !isActive ? (
                    <CheckCircle className={iconSize} style={{ color: 'white' }} />
                  ) : (
                    <span className={isActive || isCompleted ? 'text-white' : ''}>{s.icon}</span>
                  )}
                </div>

                {/* 步骤标签 */}
                <span
                  className={`
                    ${labelSize} font-medium transition-colors duration-200 whitespace-nowrap
                    ${isActive
                      ? 'text-foreground font-semibold'
                      : isCompleted
                      ? 'text-foreground/70'
                      : canClick
                      ? 'text-muted-foreground'
                      : 'text-muted-foreground/40'
                    }
                  `}
                >
                  {s.label}
                </span>
              </button>

              {/* 连接线段 */}
              {i < steps.length - 1 && (
                <div className="flex-1 pt-[14px] px-0.5">
                  <div
                    className="h-[2px] w-full rounded-full transition-all duration-500"
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
