import { useState } from 'react';
import { Upload, FileSearch, BarChart3, CheckCircle, ArrowRight } from 'lucide-react';
import BankUploadStep from './BankUploadStep';
import BankResultTable from './BankResultTable';
import {
  reconcileStream,
  extractBankTransactions,
  extractEnterpriseTransactions,
} from '../engine/bankReconciliation';
import type { ColumnConfig, BankReconResult, BankReconSummary, AccountResult } from '../engine/bankReconciliation';

type Step = 1 | 2 | 3;

interface ParsedData {
  rows: string[][];
  config: ColumnConfig;
  fileName: string;
}

interface StepDef {
  key: Step;
  label: string;
  icon: React.ReactNode;
}

const steps: StepDef[] = [
  { key: 1, label: '上传银行流水', icon: <Upload className="w-4 h-4" /> },
  { key: 2, label: '上传企业账', icon: <FileSearch className="w-4 h-4" /> },
  { key: 3, label: '核对结果', icon: <BarChart3 className="w-4 h-4" /> },
];

export default function BankReconciliationTool() {
  const [step, setStep] = useState<Step>(1);
  const [bankData, setBankData] = useState<ParsedData | null>(null);
  const [enterpriseData, setEnterpriseData] = useState<ParsedData | null>(null);
  const [result, setResult] = useState<BankReconResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');

  const canGoStep2 = bankData !== null;
  const canGoStep3 = bankData !== null && enterpriseData !== null;

  const handleBankConfirm = (data: ParsedData) => {
    setBankData(data);
  };

  const handleEnterpriseConfirm = (data: ParsedData) => {
    setEnterpriseData(data);
  };

  const handleReconcile = async () => {
    if (!bankData || !enterpriseData) return;

    setProcessing(true);
    setProgress(0);
    setProgressText('正在提取银行流水交易...');

    await delay(50);

    // 提取交易
    const bankTxns = extractBankTransactions(bankData.rows, bankData.config);
    setProgress(15);
    setProgressText(`已提取 ${bankTxns.length} 笔银行流水`);

    await delay(30);

    const entTxns = extractEnterpriseTransactions(enterpriseData.rows, enterpriseData.config);
    setProgress(30);
    setProgressText(`已提取 ${entTxns.length} 笔企业账，开始逐账户核对...`);

    await delay(30);

    // 静态汇总字段（在整个核对过程中不变）
    const allBankAccounts = [...new Set(bankTxns.map((t) => t.account))].sort();
    const allEntAccounts = [...new Set(entTxns.map((t) => t.account))].sort();
    const overlap = allBankAccounts.filter((a) => allEntAccounts.includes(a));
    const skippedBank = allBankAccounts.filter((a) => !allEntAccounts.includes(a));
    const skippedEnt = allEntAccounts.filter((a) => !allBankAccounts.includes(a));
    const baseProgress = 30; // 提取阶段占 30%，核对阶段占 70%

    // 辅助：构建临时 summary
    function buildInterimSummary(
      accResults: AccountResult[],
    ): BankReconSummary {
      return {
        totalAccounts: accResults.length,
        fullyMatched: accResults.filter((r) => r.unmatchedBank.length === 0 && r.unmatchedEnterprise.length === 0 && r.totalBank > 0).length,
        hasUnmatched: accResults.filter((r) => r.unmatchedBank.length > 0 || r.unmatchedEnterprise.length > 0).length,
        totalUnmatchedBank: accResults.reduce((s, r) => s + r.unmatchedBank.length, 0),
        totalUnmatchedEnterprise: accResults.reduce((s, r) => s + r.unmatchedEnterprise.length, 0),
        totalMNMatched: accResults.reduce((s, r) => s + r.mnMatched.length, 0),
        quickMatchedAccounts: accResults.filter((r) => r.quickMatched > 0 && r.unmatchedBank.length === 0 && r.unmatchedEnterprise.length === 0).length,
        bankTxCount: bankTxns.length,
        enterpriseTxCount: entTxns.length,
        bankAccounts: allBankAccounts,
        enterpriseAccounts: allEntAccounts,
        overlapAccounts: overlap,
        skippedBankOnly: skippedBank,
        skippedEntOnly: skippedEnt,
        warning: null,
      };
    }

    // 流式核对（手动迭代生成器，setTimeout 跳出 React 18 批处理）
    let totalAccounts = 0;
    const assembledAccounts: BankReconResult['accounts'] = [];
    const stream = reconcileStream(bankTxns, entTxns);

    await new Promise<void>((resolve) => {
      const pump = async () => {
        const { value: event, done } = await stream.next();
        if (done) {
          resolve();
          return;
        }

        if (event.type === 'account') {
          totalAccounts = event.totalAccounts;
          assembledAccounts.push(event.result);

          const pct = baseProgress + Math.round((assembledAccounts.length / totalAccounts) * 70);
          setProgress(pct);
          setProgressText(`核对中 ${assembledAccounts.length}/${totalAccounts} · ${event.result.account}`);

          // 第一个账户结果到达时切换到结果页
          if (assembledAccounts.length === 1) {
            setStep(3);
          }

          // 实时更新部分结果
          setResult({
            accounts: [...assembledAccounts],
            summary: buildInterimSummary(assembledAccounts),
          });
        } else if (event.type === 'summary') {
          setProgress(100);
          const statusParts: string[] = [];
          if (event.result.summary.warning) {
            statusParts.push(`⚠ ${event.result.summary.warning.split('。')[0]}`);
          } else {
            statusParts.push(`${event.result.summary.totalAccounts} 个账户`);
            statusParts.push(`${event.result.summary.hasUnmatched} 个有未对符`);
          }
          setProgressText(`核对完成：${statusParts.join('，')}`);
          setResult(event.result);
          resolve();
          return;
        }

        // 用 setTimeout 跳出 React 18 批处理上下文，强制渲染提交
        setTimeout(pump, 0);
      };
      pump();
    });

    setProcessing(false);
  };

  const handleReset = () => {
    setBankData(null);
    setEnterpriseData(null);
    setResult(null);
    setStep(1);
    setProcessing(false);
    setProgress(0);
    setProgressText('');
  };

  return (
    <div className="min-h-full bg-gray-50">
      {/* 步骤指示器 */}
      <div className="sticky top-0 z-40 bg-white border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-lg font-bold text-gray-800">银企对账</h1>
            <button
              onClick={handleReset}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              重新开始
            </button>
          </div>
          <div className="flex items-center">
            {steps.map((s, i) => {
              const isActive = step === s.key;
              const isDone = step > s.key;
              const isDisabled =
                (s.key === 2 && !canGoStep2) ||
                (s.key === 3 && !canGoStep3);

              return (
                <div key={s.key} className="flex items-center flex-1">
                  {/* 步骤按钮 */}
                  <button
                    onClick={() => {
                      if (!isDisabled) setStep(s.key);
                    }}
                    disabled={isDisabled}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white shadow'
                        : isDone
                        ? 'bg-green-100 text-green-700 border border-green-300'
                        : isDisabled
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      s.icon
                    )}
                    <span className="hidden sm:inline">{s.label}</span>
                  </button>

                  {/* 连接线 */}
                  {i < steps.length - 1 && (
                    <div
                      className={`flex-1 h-0.5 mx-2 ${
                        isDone ? 'bg-green-400' : 'bg-gray-200'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 主内容 */}
      <main className="max-w-6xl mx-auto px-6 py-8 pb-12">
        {/* 步骤 1: 上传银行流水 */}
        {step === 1 && (
          <>
            <BankUploadStep
              type="bank"
              onConfirm={handleBankConfirm}
            />
            {bankData && (
              <div className="flex justify-center pt-6">
                <button
                  onClick={() => setStep(2)}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 shadow-md transition-colors flex items-center gap-2"
                >
                  下一步：上传企业账
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        )}

        {/* 步骤 2: 上传企业账 OR 执行核对 */}
        {step === 2 && (
          <div className="space-y-8">
            {/* 显示步骤1完成状态 */}
            {bankData && (
              <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
                <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                <span className="text-green-700">
                  银行流水已配置: {bankData.fileName}
                </span>
              </div>
            )}

            <BankUploadStep
              type="enterprise"
              onConfirm={handleEnterpriseConfirm}
            />

            {/* 核对按钮 */}
            {enterpriseData && !processing && (
              <div className="flex justify-center pt-4">
                <button
                  onClick={handleReconcile}
                  className="px-8 py-3 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 shadow-md transition-colors"
                >
                  开始核对
                </button>
              </div>
            )}

            {/* 处理进度 */}
            {processing && (
              <div className="space-y-3 p-6 bg-white border rounded-xl shadow-sm">
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-sm text-center text-gray-600">{progressText}</p>
              </div>
            )}
          </div>
        )}

        {/* 步骤 3: 核对结果 */}
        {step === 3 && result && (
          <BankResultTable
            result={result}
            bankFileName={bankData?.fileName ?? ''}
            enterpriseFileName={enterpriseData?.fileName ?? ''}
          />
        )}
      </main>
    </div>
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
