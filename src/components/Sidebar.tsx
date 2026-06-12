import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PixelDino } from './PixelDino';
import { useRef, useLayoutEffect } from 'react';
import {
  FileSpreadsheet,
  FileText,
  FileStack,
  Calculator,
  Settings,
  Table2,
  Sparkles,
  Building2,
  ChevronLeft,
  ChevronRight,
  ArrowLeftRight,
  type LucideIcon,
} from 'lucide-react';

export interface ToolConfig {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  category: string;
}
export const tools: ToolConfig[] = [
  { id: 'interco-reconcile',  name: '内部往来核对', description: '利润中心间往来款项自动核对，支持M:N匹配', icon: FileSpreadsheet, category: '财务' },
  { id: 'pdf-merge',        name: 'PDF合并',       description: '多PDF文件合并，支持分组、分隔页、页码',     icon: FileText,     category: '文档' },
  { id: 'pdf-2to1',        name: 'PDF 2合1',     description: '每2页合并为1页，保留原文件名',              icon: FileStack,    category: '文档' },
  { id: 'batch-excel',     name: '批量提取Excel', description: '上传样本配置规则，批量提取Excel中的关键数据', icon: Table2,      category: '财务' },
  { id: 'data-cleaner',    name: '数据清洗',       description: 'Excel数据清洗，支持去空格、提取数字、查找替换等', icon: Sparkles,    category: '财务' },
  { id: 'bank-recon',      name: '银企对账',       description: '银行流水与企业银行明细账逐笔核对',          icon: Building2,   category: '财务' },
  { id: 'pivot-reconcile', name: '逆透视核对',     description: '二维交叉表逆透视转一维表，支持与流水账核对差异', icon: ArrowLeftRight, category: '财务' },
];
export const reservedTools: ToolConfig[] = [
  { id: 'calculator', name: '财务计算器', description: '预留', icon: Calculator, category: '财务' },
  { id: 'settings',   name: '系统设置',   description: '预留', icon: Settings,   category: '系统' },
];

interface SidebarProps {
  currentTool: string;
  onSelectTool: (id: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ currentTool, onSelectTool, collapsed, onToggleCollapse }: SidebarProps) {
  const categories = [...new Set(tools.map((t) => t.category))];
  const listRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (collapsed || !listRef.current || !indicatorRef.current) {
      if (indicatorRef.current) indicatorRef.current.style.opacity = '0';
      return;
    }
    const btn = listRef.current.querySelector<HTMLButtonElement>(`[data-tool-id="${currentTool}"]`);
    if (!btn) return;
    const top = btn.offsetTop;
    const height = btn.offsetHeight;
    indicatorRef.current.style.top = `${top + (height - 36) / 2}px`;
    indicatorRef.current.style.height = `${Math.min(height, 36)}px`;
    indicatorRef.current.style.opacity = '1';
  }, [currentTool, collapsed]);

  return (
    <aside
      className={cn(
        'h-screen border-r flex flex-col transition-all duration-200 shrink-0 hidden md:flex relative overflow-hidden',
        collapsed ? 'w-16' : 'w-64'
      )}
      style={{ background: 'hsl(var(--sidebar-background))', borderRightColor: 'hsl(var(--sidebar-border))' }}
      role="navigation"
      aria-label="工具导航"
    >
      {/* 背景氛围 — 亮色：极淡蓝渐变 / 暗色：深蓝黑底 */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {/* 亮色渐变 */}
        <div className="absolute inset-0 dark:hidden" style={{ background: 'linear-gradient(180deg, hsl(210,60%,97%) 0%, hsl(0,0%,100%) 60%, hsl(210,40%,98%) 100%)' }} />
        {/* 暗色渐变 */}
        <div className="absolute inset-0 hidden dark:block" style={{ background: 'linear-gradient(180deg, hsl(224,22%,10%) 0%, hsl(224,18%,8%) 50%, hsl(220,20%,7%) 100%)' }} />
        {/* 顶部高光线条 — 亮色蓝色 / 暗色蓝色微光 */}
        <div className="absolute top-0 left-0 right-0 dark:hidden" style={{ height: '1px', background: 'linear-gradient(90deg, transparent 0%, hsl(210,90%,56%,0.3) 30%, hsl(210,90%,70%,0.5) 50%, hsl(210,90%,56%,0.3) 70%, transparent 100%)' }} />
        <div className="absolute top-0 left-0 right-0 hidden dark:block" style={{ height: '1px', background: 'linear-gradient(90deg, transparent 0%, hsl(210,85%,60%,0.15) 30%, hsl(210,85%,70%,0.25) 50%, hsl(210,85%,60%,0.15) 70%, transparent 100%)' }} />
      </div>

      {/* Logo */}
      <div className="relative flex items-center justify-between px-3 h-14 border-b" style={{ borderColor: 'hsl(var(--sidebar-border))' }}>
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0 animate-logo-breathe" aria-hidden="true">
              <defs>
                <linearGradient id="ftk-logo-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="50%" stopColor="#60a5fa" />
                  <stop offset="100%" stopColor="#2563eb" />
                </linearGradient>
              </defs>
              <rect width="32" height="32" rx="8" fill="url(#ftk-logo-grad)" />
              <rect x="8"  y="17" width="3.5" height="7"  rx="1" fill="white" fillOpacity="0.5" />
              <rect x="14" y="13" width="3.5" height="11" rx="1" fill="white" fillOpacity="0.7" />
              <rect x="20" y="8"  width="3.5" height="16" rx="1" fill="white" fillOpacity="0.9" />
              <path d="M9.75 15 L22 7" stroke="white" strokeOpacity="0.3" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="22" cy="7" r="1.5" fill="white" fillOpacity="0.4" />
            </svg>
            <h1 className="text-sm font-semibold leading-tight tracking-wide text-sidebar-foreground">财务工具集</h1>
          </div>
        )}
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 ml-auto shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted" onClick={onToggleCollapse} aria-label={collapsed ? '展开侧边栏' : '折叠侧边栏'}>
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>
      </div>

      {/* 工具列表 */}
      <ScrollArea className="flex-1 py-2">
        <div ref={listRef} className="relative">
          {/* 滑动活跃指示器 — 蓝色竖条（仅展开模式） */}
          {!collapsed && (
            <div ref={indicatorRef} className="absolute left-0 w-[3px] rounded-r-full pointer-events-none"
              style={{ top: 0, height: '36px', opacity: 0, background: 'linear-gradient(to bottom, hsl(var(--sidebar-primary)), hsl(210 90% 70%))', boxShadow: '0 0 8px 1px hsl(var(--sidebar-primary) / 0.3)', transition: 'top 500ms cubic-bezier(0.22,1,0.36,1), height 500ms cubic-bezier(0.22,1,0.36,1), opacity 300ms ease' }}
              aria-hidden="true"
            />
          )}
          <TooltipProvider delayDuration={100}>
            {categories.map((cat) => (
              <div key={cat} className="mb-2">
                {!collapsed && (
                  <div className="px-3 py-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
                    {cat}
                  </div>
                )}
                {tools.filter((t) => t.category === cat).map((tool) => {
                  const isActive = currentTool === tool.id;
                  const Icon = tool.icon;
                  return collapsed ? (
                    <Tooltip key={tool.id}>
                      <TooltipTrigger asChild>
                        <button data-tool-id={tool.id} onClick={() => onSelectTool(tool.id)} aria-label={tool.name} aria-current={isActive ? 'page' : undefined}
                          className={cn('w-full flex items-center justify-center py-2.5 px-2 transition-all duration-200',
                            isActive
                              ? 'text-primary bg-primary/10'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          )}>
                          <Icon className="w-5 h-5" />
                          {isActive && (
                            <div className="absolute left-0 w-[3px] h-6 rounded-r-full" style={{ background: 'linear-gradient(to bottom, hsl(var(--sidebar-primary)), hsl(210 90% 70%))', boxShadow: '0 0 6px 1px hsl(var(--sidebar-primary) / 0.3)' }} />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right">{tool.name}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <button key={tool.id} data-tool-id={tool.id} onClick={() => onSelectTool(tool.id)} aria-current={isActive ? 'page' : undefined}
                      className={cn('w-full flex items-start gap-3 px-3 py-2.5 text-sm transition-all duration-200 text-left group',
                        isActive
                          ? 'bg-primary/8 text-primary'
                          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                      )}>
                      <Icon className={cn('w-4 h-4 shrink-0 mt-0.5 transition-colors duration-200', isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                      <div className="min-w-0 leading-snug">
                        <div className={cn('font-medium transition-colors duration-200', isActive ? 'text-foreground' : 'text-foreground/80')}>{tool.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 break-words group-hover:text-muted-foreground/80 transition-colors duration-200">{tool.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}

            {/* 预留工具 */}
            {!collapsed && (
              <div className="px-3 py-1.5 text-xs font-medium uppercase tracking-widest mt-2 text-muted-foreground/40">即将上线</div>
            )}
            {reservedTools.map((tool) => {
              const Icon = tool.icon;
              return collapsed ? (
                <Tooltip key={tool.id}>
                  <TooltipTrigger asChild>
                    <button disabled aria-label={`${tool.name}（即将上线）`} className="w-full flex items-center justify-center py-2.5 px-2 text-muted-foreground/30 cursor-not-allowed">
                      <Icon className="w-5 h-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{tool.name}（即将上线）</TooltipContent>
                </Tooltip>
              ) : (
                <button key={tool.id} disabled className="w-full flex items-start gap-3 px-3 py-2 text-sm text-muted-foreground/30 cursor-not-allowed text-left">
                  <Icon className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="min-w-0 leading-snug">
                    <div className="font-medium">{tool.name}</div>
                    <div className="text-xs text-muted-foreground/30 mt-0.5 break-words">即将上线</div>
                  </div>
                </button>
              );
            })}
          </TooltipProvider>
        </div>
      </ScrollArea>

      {/* 底部像素恐龙场景 — 双模式适配 */}
      <div className="border-t relative overflow-hidden" style={{ height: collapsed ? 56 : 140, borderColor: 'hsl(var(--sidebar-border))' }}>
        {/* 亮色场景背景 */}
        <div className="absolute inset-0 dark:hidden" style={{ background: 'linear-gradient(180deg, hsl(210,20%,97%) 0%, hsl(0,0%,100%) 60%, hsl(210,40%,96%) 100%)' }} />
        {/* 暗色场景背景 */}
        <div className="absolute inset-0 hidden dark:block" style={{ background: 'linear-gradient(180deg, hsl(224,20%,10%) 0%, hsl(224,18%,8%) 60%, hsl(220,22%,7%) 100%)' }} />

        {/* 云朵 — 亮色蓝色调 / 暗色深蓝微光 */}
        {!collapsed && (
          <>
            <div className="absolute dark:hidden" style={{ top: 16, left: 20, width: 24, height: 8, background: 'hsl(210,60%,80%,0.2)', borderRadius: 2, animation: 'ftk-cloud1 10s linear infinite' }} />
            <div className="absolute dark:hidden" style={{ top: 28, left: 140, width: 18, height: 6, background: 'hsl(210,50%,75%,0.15)', borderRadius: 2, animation: 'ftk-cloud2 14s linear infinite' }} />
            <div className="absolute hidden dark:block" style={{ top: 16, left: 20, width: 24, height: 8, background: 'hsl(210,40%,40%,0.12)', borderRadius: 2, animation: 'ftk-cloud1 10s linear infinite' }} />
            <div className="absolute hidden dark:block" style={{ top: 28, left: 140, width: 18, height: 6, background: 'hsl(210,35%,35%,0.08)', borderRadius: 2, animation: 'ftk-cloud2 14s linear infinite' }} />
          </>
        )}
        {/* 地面 — 亮色蓝底 / 暗色深蓝底 */}
        <div className="absolute bottom-0 left-0 right-0 dark:hidden" style={{ height: collapsed ? 12 : 20, background: 'linear-gradient(180deg, transparent, hsl(210,90%,56%,0.04))', borderTop: '1px solid hsl(210,90%,56%,0.1)' }} />
        <div className="absolute bottom-0 left-0 right-0 hidden dark:block" style={{ height: collapsed ? 12 : 20, background: 'linear-gradient(180deg, transparent, hsl(210,85%,60%,0.06))', borderTop: '1px solid hsl(210,85%,60%,0.12)' }} />

        {/* 像素山（远景）— 亮色蓝山 / 暗色深蓝山 */}
        {!collapsed && (
          <>
            <div className="absolute dark:hidden" style={{ bottom: 18, left: 10, width: 0, height: 0, borderLeft: '16px solid transparent', borderRight: '16px solid transparent', borderBottom: '24px solid hsl(210,40%,80%,0.15)' }} />
            <div className="absolute dark:hidden" style={{ bottom: 18, right: 16, width: 0, height: 0, borderLeft: '12px solid transparent', borderRight: '12px solid transparent', borderBottom: '18px solid hsl(210,35%,75%,0.12)' }} />
            <div className="absolute hidden dark:block" style={{ bottom: 18, left: 10, width: 0, height: 0, borderLeft: '16px solid transparent', borderRight: '16px solid transparent', borderBottom: '24px solid hsl(210,30%,25%,0.2)' }} />
            <div className="absolute hidden dark:block" style={{ bottom: 18, right: 16, width: 0, height: 0, borderLeft: '12px solid transparent', borderRight: '12px solid transparent', borderBottom: '18px solid hsl(210,25%,20%,0.15)' }} />
          </>
        )}
        {/* 恐龙 */}
        <div className="absolute flex items-end justify-center" style={{ bottom: collapsed ? 4 : 14, left: 0, right: 0 }}>
          {collapsed ? <PixelDino size={40} /> : <PixelDino size={72} />}
        </div>
        {/* 版本号 */}
        {!collapsed && (
          <p className="absolute bottom-1 left-0 right-0 text-center text-[10px] text-muted-foreground/40">v1.0</p>
        )}
      </div>
    </aside>
  );
}
