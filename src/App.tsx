import { useState, useEffect, useMemo } from 'react';
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

// 渐变值 — 现代 SaaS 风格：明亮蓝底色 + 点缀色微光
const gradients = {
  light: {
    sidebar: 'linear-gradient(to bottom, hsl(0,0%,100%), hsl(210,20%,99%) 50%, hsl(210,16%,97%))',
    header: 'linear-gradient(to right, hsla(210,90%,56%,0.04), hsl(0,0%,100%) 40%, hsla(210,90%,70%,0.05))',
    stepHeader: 'linear-gradient(to right, hsla(210,90%,56%,0.03), hsl(0,0%,100%) 50%, hsla(210,90%,70%,0.04))',
    footer: 'linear-gradient(to right, hsla(210,90%,56%,0.02), hsla(210,90%,70%,0.03))',
  },
  dark: {
    sidebar: 'linear-gradient(to bottom, hsl(224,22%,8%), hsl(224,18%,9%) 50%, hsl(224,20%,7%))',
    header: 'linear-gradient(to right, hsla(210,85%,60%,0.06), hsl(224,18%,10%) 40%, hsla(210,85%,70%,0.08))',
    stepHeader: 'linear-gradient(to right, hsla(210,85%,60%,0.04), hsl(224,18%,10%) 50%, hsla(210,85%,70%,0.06))',
    footer: 'linear-gradient(to right, hsla(210,85%,60%,0.03), hsla(210,85%,70%,0.04))',
  },
};

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

  const isDark = theme === 'dark';
  const g = useMemo(() => (isDark ? gradients.dark : gradients.light), [isDark]);

  return { theme, g, toggle: () => setTheme(t => t === 'dark' ? 'light' : 'dark') };
}

// 内部往来核对工具包装器
function IntercoReconcileTool({ g }: { g: typeof gradients.light }) {
  const step = useAppStore(s => s.step);

  return (
    <div className="min-h-full bg-background">
      {/* 步骤导航 */}
      <div className="bg-card border-b border-border/60 sticky top-0 z-40" style={{ backgroundImage: g.stepHeader }}>
        <StepIndicator />
      </div>
      {/* 主内容区 — 交错入场动画 */}
      <main className="pb-12">
        <div className="animate-stagger-enter" style={{ animationDelay: '0.05s' }}>
        {step === '导入' && <ImportPage />}
        {step === '映射' && <MappingPage />}
        {step === '核对' && <ReconcilePage />}
        {step === '结果' && <ResultPage />}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const [currentTool, setCurrentTool] = useState('interco-reconcile');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { theme, g, toggle: toggleTheme } = useTheme();

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
        <header className="bg-card border-b border-border/60 shrink-0" style={{ backgroundImage: g.header }}>
          <div className="px-4 md:px-6 h-14 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-1 h-5 rounded-full shrink-0 animate-spring-bounce"
                  style={{ background: 'linear-gradient(to bottom, hsl(var(--primary)), hsl(var(--primary) / 0.75))' }}
                />
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
                  className="btn-lift theme-spin-icon h-7 w-7 p-0 hover:bg-primary/10"
                  onClick={toggleTheme}
                  aria-label={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </Button>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground px-2.5 py-1 rounded-full border border-border/60 transition-transform hover:scale-105 cursor-default"
                  style={{ background: 'hsl(var(--primary) / 0.06)' }}
                >
                  <Shield className="w-3 h-3 shrink-0" style={{ color: 'hsl(var(--primary))' }} />
                  数据本地处理
                </span>
            </div>
          </div>
        </header>

        {/* 工具内容 — key 驱动切换时重新触发入场动画 */}
        <div className="flex-1 overflow-y-auto" key={currentTool}>
          <div className="animate-page-enter">
          {currentTool === 'interco-reconcile' && <IntercoReconcileTool g={g} />}
          {currentTool === 'pdf-merge' && <PdfMergeTool sidebarCollapsed={sidebarCollapsed} />}
          {currentTool === 'pdf-2to1' && <PdfTwoToOneTool sidebarCollapsed={sidebarCollapsed} />}
          {currentTool === 'batch-excel' && <BatchExcelExtractor />}
          {currentTool === 'data-cleaner' && <DataCleaner />}
          {currentTool === 'bank-recon' && <BankReconciliationTool />}
          {currentTool === 'pivot-reconcile' && <PivotReconcileTool />}
          </div>
        </div>

        {/* 底部 */}
        <footer className="border-t border-border/60 bg-card py-2.5 shrink-0" style={{ backgroundImage: g.footer }}>
          <div className="px-4 md:px-6 text-center text-xs text-muted-foreground/60">
            所有数据仅在浏览器本地处理，不会上传至任何服务器
          </div>
        </footer>
      </div>
    </div>
  );
}
