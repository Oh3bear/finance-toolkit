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
        'h-screen bg-white border-r border-gray-200 flex flex-col transition-all duration-200 shrink-0',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-3 h-14 border-b border-gray-200">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-bold">工</span>
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900 leading-tight">财务工具集</h1>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 ml-auto"
          onClick={onToggleCollapse}
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
                <div className="px-3 py-1.5 text-xs font-medium text-gray-400 uppercase tracking-wider">
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
                          className={cn(
                            'w-full flex items-center justify-center py-2.5 px-2 transition-colors',
                            isActive
                              ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600'
                              : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
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
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors',
                        isActive
                          ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      )}
                    >
                      <Icon className="w-4.5 h-4.5 shrink-0" />
                      <div className="text-left">
                        <div className="font-medium">{tool.name}</div>
                        <div className="text-xs text-gray-400 leading-tight">{tool.description}</div>
                      </div>
                    </button>
                  );
                })}
            </div>
          ))}

          {/* 预留工具 */}
          {!collapsed && (
            <div className="px-3 py-1.5 text-xs font-medium text-gray-400 uppercase tracking-wider mt-2">
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
                    className="w-full flex items-center justify-center py-2.5 px-2 text-gray-300 cursor-not-allowed"
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
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-300 cursor-not-allowed"
              >
                <Icon className="w-4.5 h-4.5 shrink-0" />
                <div className="text-left">
                  <div className="font-medium">{tool.name}</div>
                  <div className="text-xs text-gray-300 leading-tight">即将上线</div>
                </div>
              </button>
            );
          })}
        </TooltipProvider>
      </ScrollArea>

      {/* 底部 */}
      <div className="px-3 py-3 border-t border-gray-200 text-xs text-gray-400 text-center">
        {!collapsed && (
          <div>
            <div>财务工具集 v1.0</div>
          </div>
        )}
      </div>
    </aside>
  );
}
