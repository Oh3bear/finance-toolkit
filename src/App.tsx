import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { StepIndicator } from '@/components/StepIndicator';
import { ImportPage } from '@/components/ImportPage';
import { MappingPage } from '@/components/MappingPage';
import { ReconcilePage } from '@/components/ReconcilePage';
import { ResultPage } from '@/components/ResultPage';
import { Sidebar, tools } from '@/components/Sidebar';
import PdfMergeTool from '@/components/PdfMergeTool';
import PdfTwoToOneTool from '@/components/PdfTwoToOneTool';
import BatchExcelExtractor from '@/components/BatchExcelExtractor';
import DataCleaner from '@/components/DataCleaner';
import BankReconciliationTool from '@/components/BankReconciliationTool';
import PivotReconcileTool from '@/components/PivotReconcileTool';
import { Shield, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';

// 简单的主题管理 hook（替代 next-themes）
function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    const stored = localStorage.getItem('theme');
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  return { theme, toggle: () => setTheme(t => t === 'dark' ? 'light' : 'dark') };
}

// 内部往来核对工具包装器
function IntercoReconcileTool() {
  const step = useAppStore(s => s.step);

  return (
    <div className="min-h-full bg-background">
      {/* 步骤导航 */}
      <div className="bg-gradient-to-r from-emerald-50/60 via-card to-teal-50/30 border-b border-border/60 sticky top-0 z-40">
        <StepIndicator />
      </div>
      {/* 主内容区 */}
      <main className="pb-12">
        {step === '导入' && <ImportPage />}
        {step === '映射' && <MappingPage />}
        {step === '核对' && <ReconcilePage />}
        {step === '结果' && <ResultPage />}
      </main>
    </div>
  );
}

export default function App() {
  const [currentTool, setCurrentTool] = useState('interco-reconcile');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();

  const currentToolConfig = tools.find((t) => t.id === currentTool);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* 侧边栏 */}
      <Sidebar
        currentTool={currentTool}
        onSelectTool={setCurrentTool}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
      />

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* 顶部标题栏 */}
        <header className="bg-gradient-to-r from-emerald-50/80 via-card to-teal-50/40 border-b border-border/60 shrink-0">
          <div className="px-4 md:px-6 h-14 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-1 h-5 rounded-full bg-gradient-to-b from-emerald-500 to-teal-500 shrink-0" />
              <h2 className="text-sm font-semibold text-foreground truncate">
                {currentToolConfig?.name || '工具'}
              </h2>
              <span className="hidden sm:block text-xs text-muted-foreground truncate">
                {currentToolConfig?.description}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 hover:bg-primary/10"
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground px-2.5 py-1 rounded-full bg-primary/8 border border-primary/20">
                <Shield className="w-3 h-3 text-primary shrink-0" />
                数据本地处理
              </span>
            </div>
          </div>
        </header>

        {/* 工具内容 — key 驱动切换时重新触发入场动画 */}
        <div className="flex-1 overflow-y-auto" key={currentTool}>
          <div className="animate-page-enter">
          {currentTool === 'interco-reconcile' && <IntercoReconcileTool />}
          {currentTool === 'pdf-merge' && <PdfMergeTool sidebarCollapsed={sidebarCollapsed} />}
          {currentTool === 'pdf-2to1' && <PdfTwoToOneTool sidebarCollapsed={sidebarCollapsed} />}
          {currentTool === 'batch-excel' && <BatchExcelExtractor />}
          {currentTool === 'data-cleaner' && <DataCleaner />}
          {currentTool === 'bank-recon' && <BankReconciliationTool />}
          {currentTool === 'pivot-reconcile' && <PivotReconcileTool />}
          </div>
        </div>

        {/* 底部 */}
        <footer className="border-t border-border/60 bg-gradient-to-r from-emerald-50/50 to-teal-50/30 py-2.5 shrink-0">
          <div className="px-4 md:px-6 text-center text-xs text-muted-foreground/60">
            所有数据仅在浏览器本地处理，不会上传至任何服务器
          </div>
        </footer>
      </div>
    </div>
  );
}
