import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
  {
    id: 'interco-reconcile',
    name: '内部往来核对',
    description: '利润中心间往来款项自动核对，支持M:N匹配',
    icon: FileSpreadsheet,
    category: '财务',
  },
  {
    id: 'pdf-merge',
    name: 'PDF合并',
    description: '多PDF文件合并，支持分组、分隔页、页码',
    icon: FileText,
    category: '文档',
  },
  {
    id: 'pdf-2to1',
    name: 'PDF 2合1',
    description: '每2页合并为1页，保留原文件名',
    icon: FileStack,
    category: '文档',
  },
  {
    id: 'batch-excel',
    name: '批量提取Excel',
    description: '上传样本配置规则，批量提取Excel中的关键数据',
    icon: Table2,
    category: '财务',
  },
  {
    id: 'data-cleaner',
    name: '数据清洗',
    description: 'Excel数据清洗，支持去空格、提取数字、查找替换等',
    icon: Sparkles,
    category: '财务',
  },
  {
    id: 'bank-recon',
    name: '银企对账',
    description: '银行流水与企业银行明细账逐笔核对',
    icon: Building2,
    category: '财务',
  },
  {
    id: 'pivot-reconcile',
    name: '逆透视核对',
    description: '二维交叉表逆透视转一维表，支持与流水账核对差异',
    icon: ArrowLeftRight,
    category: '财务',
  },
];

// 预留的工具槽位
export const reservedTools: ToolConfig[] = [
  { id: 'calculator', name: '财务计算器', description: '预留', icon: Calculator, category: '财务' },
  { id: 'settings', name: '系统设置', description: '预留', icon: Settings, category: '系统' },
];

interface SidebarProps {
  currentTool: string;
  onSelectTool: (id: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ currentTool, onSelectTool, collapsed, onToggleCollapse }: SidebarProps) {
  const categories = [...new Set(tools.map((t) => t.category))];

  return (
    <aside
      className={cn(
        'h-screen bg-gradient-to-b from-[hsl(152,40%,95%)] via-[hsl(152,35%,96%)] to-[hsl(174,30%,95%)] border-r border-border flex flex-col transition-all duration-200 shrink-0 hidden md:flex',
        collapsed ? 'w-16' : 'w-64'
      )}
      role="navigation"
      aria-label="工具导航"
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-3 h-14 border-b border-border/60">
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center shrink-0 shadow-md shadow-emerald-200">
              <span className="text-white text-xs font-bold">工</span>
            </div>
            <h1 className="text-sm font-semibold text-foreground leading-tight">财务工具集</h1>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 ml-auto shrink-0"
          onClick={onToggleCollapse}
          aria-label={collapsed ? '展开侧边栏' : '折叠侧边栏'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>
      </div>

      {/* 工具列表 */}
      <ScrollArea className="flex-1 py-2">
        <TooltipProvider delayDuration={100}>
          {categories.map((cat) => (
            <div key={cat} className="mb-2">
              {!collapsed && (
                <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {cat}
                </div>
              )}
              {tools
                .filter((t) => t.category === cat)
                .map((tool) => {
                  const isActive = currentTool === tool.id;
                  const Icon = tool.icon;
                  return collapsed ? (
                    <Tooltip key={tool.id}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => onSelectTool(tool.id)}
                          aria-label={tool.name}
                          aria-current={isActive ? 'page' : undefined}
                          className={cn(
                            'w-full flex items-center justify-center py-2.5 px-2 transition-colors',
                            isActive
                              ? 'bg-gradient-to-r from-primary/15 to-accent text-primary border-r-2 border-primary'
                              : 'text-muted-foreground hover:bg-primary/8 hover:text-foreground'
                          )}
                        >
                          <Icon className="w-5 h-5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right">{tool.name}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <button
                      key={tool.id}
                      onClick={() => onSelectTool(tool.id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'w-full flex items-start gap-3 px-3 py-2 text-sm transition-colors text-left',
                        isActive
                          ? 'bg-gradient-to-r from-primary/15 to-accent/60 text-primary border-r-2 border-primary'
                          : 'text-muted-foreground hover:bg-primary/8 hover:text-foreground'
                      )}
                    >
                      <Icon className="w-4 h-4 shrink-0 mt-0.5" />
                      <div className="min-w-0 leading-snug">
                        <div className="font-medium">{tool.name}</div>
                        <div className="text-xs text-muted-foreground/70 mt-0.5 break-words">{tool.description}</div>
                      </div>
                    </button>
                  );
                })}
            </div>
          ))}

          {/* 预留工具 */}
          {!collapsed && (
            <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider mt-2">
              即将上线
            </div>
          )}
          {reservedTools.map((tool) => {
            const Icon = tool.icon;
            return collapsed ? (
              <Tooltip key={tool.id}>
                <TooltipTrigger asChild>
                  <button
                    disabled
                    aria-label={`${tool.name}（即将上线）`}
                    className="w-full flex items-center justify-center py-2.5 px-2 text-muted-foreground/40 cursor-not-allowed"
                  >
                    <Icon className="w-5 h-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{tool.name}（即将上线）</TooltipContent>
              </Tooltip>
            ) : (
              <button
                key={tool.id}
                disabled
                className="w-full flex items-start gap-3 px-3 py-2 text-sm text-muted-foreground/40 cursor-not-allowed text-left"
              >
                <Icon className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="min-w-0 leading-snug">
                  <div className="font-medium">{tool.name}</div>
                  <div className="text-xs text-muted-foreground/40 mt-0.5 break-words">即将上线</div>
                </div>
              </button>
            );
          })}
        </TooltipProvider>
      </ScrollArea>

      {/* 底部版本号 */}
      <div className="px-3 py-3 border-t border-border/60">
        {!collapsed && (
          <p className="text-xs text-muted-foreground/60 text-center">v1.0</p>
        )}
      </div>
    </aside>
  );
}
