import { useState } from 'react';
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
import { Shield } from 'lucide-react';

// 内部往来核对工具包装器
function IntercoReconcileTool() {
  const { step } = useAppStore();

  return (
    <div className="min-h-full bg-gray-50">
      {/* 步骤导航 */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-40">
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

  const currentToolConfig = tools.find((t) => t.id === currentTool);

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
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
        <header className="bg-white border-b border-gray-200 shrink-0">
          <div className="px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-bold text-gray-900">
                {currentToolConfig?.name || '工具'}
              </h2>
              <span className="text-xs text-gray-400">
                {currentToolConfig?.description}
              </span>
            </div>
            <div className="text-xs text-gray-400 flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-green-500" />
              <span className="w-2 h-2 rounded-full bg-green-400"></span>
              纯客户端处理 · 数据零上传
            </div>
          </div>
        </header>

        {/* 工具内容 */}
        <div className="flex-1 overflow-y-auto">
          {currentTool === 'interco-reconcile' && <IntercoReconcileTool />}
          {currentTool === 'pdf-merge' && <PdfMergeTool />}
          {currentTool === 'pdf-2to1' && <PdfTwoToOneTool />}
          {currentTool === 'batch-excel' && <BatchExcelExtractor />}
          {currentTool === 'data-cleaner' && <DataCleaner />}
          {currentTool === 'bank-recon' && <BankReconciliationTool />}
        </div>

        {/* 底部 */}
        <footer className="border-t border-gray-200 bg-white py-3 shrink-0">
          <div className="px-6 text-center text-xs text-gray-400">
            财务工具集 v1.0 · 所有数据仅在浏览器本地处理 · 不会上传到任何服务器
          </div>
        </footer>
      </div>
    </div>
  );
}
