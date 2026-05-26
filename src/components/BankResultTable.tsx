import { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Download,
  CheckCircle,
  AlertTriangle,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Link2,
  Info,
  Zap,
  ChevronDown,
  ChevronRight,
  Bug,
} from 'lucide-react';
import type { BankReconResult, BankTransaction, EnterpriseTransaction, MNMatchGroup, ReconDebugInfo } from '../engine/bankReconciliation';

interface Props {
  result: BankReconResult;
  bankFileName: string;
  enterpriseFileName: string;
}

/** 格式化金额 */
function fmt(n: number): string {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 格式化日期 */
function fmtDate(d: Date): string {
  return d.toLocaleDateString('zh-CN');
}

/** 提取原始行中有效的显示列 */
function getDisplayColumns(
  items: (BankTransaction | EnterpriseTransaction)[]
): string[] {
  const keySet = new Set<string>();
  // 优先出现的列
  const priority = ['日期', '交易日期', '摘要', '交易摘要', '用途', '对方户名', '对方账号', '凭证号', '凭证编号', '备注'];
  for (const item of items) {
    for (const k of Object.keys(item.rawRow)) {
      keySet.add(k);
    }
  }
  const allKeys = Array.from(keySet);
  // 优先列排前面
  const ordered = priority.filter((k) => allKeys.includes(k));
  const rest = allKeys.filter((k) => !ordered.includes(k));
  return [...ordered, ...rest];
}

/** 单组 M:N 匹配卡片 */
function MNMatchCard({ group }: { group: MNMatchGroup }) {
  const bankSum = group.bankItems.reduce((s, t) => s + Math.abs(t.amount), 0);
  const entSum = group.enterpriseItems.reduce((s, t) => s + Math.abs(t.amount), 0);

  const bankDisplayCols = getDisplayColumns(group.bankItems);
  const entDisplayCols = getDisplayColumns(group.enterpriseItems);

  return (
    <div className="border border-purple-200 rounded-lg overflow-hidden bg-white">
      <div className="px-4 py-2 bg-purple-50 border-b flex items-center gap-2 text-sm">
        <Link2 className="w-4 h-4 text-purple-600" />
        <span className="font-medium text-purple-800">
          {group.bankItems.length} 笔银行流水 ↔ {group.enterpriseItems.length} 笔企业账
        </span>
        <span className="text-purple-500 text-xs ml-auto">
          合计: ¥{fmt(bankSum)} = ¥{fmt(entSum)}
        </span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-purple-100">
        {/* 银行流水 */}
        <div className="overflow-auto max-h-[250px]">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-green-50">
              <tr>
                <th className="border px-2 py-1 text-left text-green-700">银行流水</th>
                <th className="border px-2 py-1 text-left">日期</th>
                <th className="border px-2 py-1 text-right">金额</th>
                {bankDisplayCols.slice(0, 3).map((c) => (
                  <th key={c} className="border px-2 py-1 text-left text-gray-500">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.bankItems.map((t, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="border px-2 py-1">
                    {t.direction === '收入' ? (
                      <span className="inline-flex items-center gap-0.5 text-green-600">
                        <ArrowUpRight className="w-3 h-3" />收入
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-red-600">
                        <ArrowDownRight className="w-3 h-3" />支出
                      </span>
                    )}
                  </td>
                  <td className="border px-2 py-1 whitespace-nowrap">{fmtDate(t.date)}</td>
                  <td className="border px-2 py-1 text-right font-mono whitespace-nowrap">
                    {fmt(Math.abs(t.amount))}
                  </td>
                  {bankDisplayCols.slice(0, 3).map((c) => (
                    <td key={c} className="border px-2 py-1 whitespace-nowrap max-w-[120px] truncate">
                      {t.rawRow[c] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="bg-green-50 font-medium">
                <td className="border px-2 py-1 text-green-700" colSpan={2}>合计</td>
                <td className="border px-2 py-1 text-right font-mono text-green-700">
                  ¥{fmt(bankSum)}
                </td>
                <td className="border px-2 py-1" colSpan={bankDisplayCols.slice(0, 3).length} />
              </tr>
            </tbody>
          </table>
        </div>

        {/* 企业账 */}
        <div className="overflow-auto max-h-[250px]">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-blue-50">
              <tr>
                <th className="border px-2 py-1 text-left text-blue-700">企业账</th>
                <th className="border px-2 py-1 text-left">日期</th>
                <th className="border px-2 py-1 text-right">金额</th>
                {entDisplayCols.slice(0, 3).map((c) => (
                  <th key={c} className="border px-2 py-1 text-left text-gray-500">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.enterpriseItems.map((t, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="border px-2 py-1">
                    {t.direction === '借方' ? (
                      <span className="inline-flex items-center gap-0.5 text-green-600">
                        <ArrowUpRight className="w-3 h-3" />借方
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-red-600">
                        <ArrowDownRight className="w-3 h-3" />贷方
                      </span>
                    )}
                  </td>
                  <td className="border px-2 py-1 whitespace-nowrap">{fmtDate(t.date)}</td>
                  <td className="border px-2 py-1 text-right font-mono whitespace-nowrap">
                    {fmt(Math.abs(t.amount))}
                  </td>
                  {entDisplayCols.slice(0, 3).map((c) => (
                    <td key={c} className="border px-2 py-1 whitespace-nowrap max-w-[120px] truncate">
                      {t.rawRow[c] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="bg-blue-50 font-medium">
                <td className="border px-2 py-1 text-blue-700" colSpan={2}>合计</td>
                <td className="border px-2 py-1 text-right font-mono text-blue-700">
                  ¥{fmt(entSum)}
                </td>
                <td className="border px-2 py-1" colSpan={entDisplayCols.slice(0, 3).length} />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** 诊断面板：显示各阶段中间值，帮助排查为什么对符失败 */
function DiagnosticsPanel({ debug }: { debug: ReconDebugInfo }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-amber-300 rounded-lg overflow-hidden bg-amber-50/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2.5 flex items-center gap-2 text-sm font-medium text-amber-800 hover:bg-amber-100 transition-colors"
      >
        <Bug className="w-4 h-4" />
        对符诊断
        {expanded ? (
          <ChevronDown className="w-4 h-4 ml-auto" />
        ) : (
          <ChevronRight className="w-4 h-4 ml-auto" />
        )}
        <span className="text-xs text-amber-600 font-normal ml-2">
          {!debug.fastTrackIncomeTriggered && !debug.fastTrackExpenseTriggered
            ? '快速通道未触发'
            : debug.fastTrackIncomeTriggered && debug.fastTrackExpenseTriggered
            ? '快速通道全部触发'
            : '快速通道部分触发'}
        </span>
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-amber-200">
          {/* 银行侧 */}
          <div>
            <h4 className="text-xs font-semibold text-gray-600 mt-3 mb-1.5">银行流水</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white border rounded px-2 py-1.5">
                <span className="text-green-600 font-medium">收入</span>
                <span className="text-gray-400 ml-1">({debug.bankIncomeCount}笔)</span>
                <div className="font-mono text-gray-800 mt-0.5">
                  ¥{debug.bankIncomeSum.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="bg-white border rounded px-2 py-1.5">
                <span className="text-red-600 font-medium">支出</span>
                <span className="text-gray-400 ml-1">({debug.bankExpenseCount}笔)</span>
                <div className="font-mono text-gray-800 mt-0.5">
                  ¥{Math.abs(debug.bankExpenseSum).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>

          {/* 企业侧 */}
          <div>
            <h4 className="text-xs font-semibold text-gray-600 mb-1.5">企业账（Phase 0 冲销预处理后）</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white border rounded px-2 py-1.5">
                <span className="text-green-600 font-medium">借方</span>
                <span className="text-gray-400 ml-1">({debug.entDebitCount}笔)</span>
                <div className="font-mono text-gray-800 mt-0.5">
                  ¥{debug.entDebitSum.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="bg-white border rounded px-2 py-1.5">
                <span className="text-red-600 font-medium">贷方</span>
                <span className="text-gray-400 ml-1">({debug.entCreditCount}笔)</span>
                <div className="font-mono text-gray-800 mt-0.5">
                  ¥{Math.abs(debug.entCreditSum).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>

          {/* 快速通道判定 */}
          <div>
            <h4 className="text-xs font-semibold text-gray-600 mb-1.5">快速通道判定</h4>
            <div className="space-y-1.5 text-xs">
              <div className={`flex items-center gap-2 px-2 py-1.5 rounded border ${debug.fastTrackIncomeTriggered ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                {debug.fastTrackIncomeTriggered ? (
                  <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                )}
                <span className="font-medium">
                  收入 ↔ 借方: {debug.fastTrackIncomeTriggered ? '已触发' : '未触发'}
                </span>
                {!debug.fastTrackIncomeTriggered && (
                  <span className="text-red-600 ml-auto font-mono">
                    差额 {debug.incomeDiffCents > 0 ? '+' : ''}{(debug.incomeDiffCents / 100).toFixed(2)} 元
                    {debug.bankIncomeCount === 0 && ' (银行无收入)'}
                    {debug.entDebitCount === 0 && ' (企业无借方)'}
                  </span>
                )}
              </div>
              <div className={`flex items-center gap-2 px-2 py-1.5 rounded border ${debug.fastTrackExpenseTriggered ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                {debug.fastTrackExpenseTriggered ? (
                  <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                )}
                <span className="font-medium">
                  支出 ↔ 贷方: {debug.fastTrackExpenseTriggered ? '已触发' : '未触发'}
                </span>
                {!debug.fastTrackExpenseTriggered && (
                  <span className="text-red-600 ml-auto font-mono">
                    差额 {debug.expenseDiffCents > 0 ? '+' : ''}{(debug.expenseDiffCents / 100).toFixed(2)} 元
                    {debug.bankExpenseCount === 0 && ' (银行无支出)'}
                    {debug.entCreditCount === 0 && ' (企业无贷方)'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 匹配统计 */}
          <div>
            <h4 className="text-xs font-semibold text-gray-600 mb-1.5">匹配统计</h4>
            <div className="grid grid-cols-4 gap-2 text-xs text-center">
              <div className="bg-white border rounded px-2 py-1.5">
                <div className="font-bold text-teal-700">{debug.fastTrackIncomeTriggered ? debug.bankIncomeCount : 0}</div>
                <div className="text-gray-500">快速通道(收↔借)</div>
              </div>
              <div className="bg-white border rounded px-2 py-1.5">
                <div className="font-bold text-teal-700">{debug.fastTrackExpenseTriggered ? debug.bankExpenseCount : 0}</div>
                <div className="text-gray-500">快速通道(支↔贷)</div>
              </div>
              <div className="bg-white border rounded px-2 py-1.5">
                <div className="font-bold text-blue-700">{debug.oneToOneMatched}</div>
                <div className="text-gray-500">1:1逐笔匹配</div>
              </div>
              <div className="bg-white border rounded px-2 py-1.5">
                <div className="font-bold text-purple-700">{debug.mnGroupsFound}</div>
                <div className="text-gray-500">M:N合并匹配</div>
              </div>
            </div>
          </div>

          {/* 剩余未对符 signed sum */}
          <div>
            <h4 className="text-xs font-semibold text-gray-600 mb-1.5">剩余未对符 signed sum</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white border rounded px-2 py-1.5">
                <span className="text-gray-500">银行</span>
                <div className={`font-mono mt-0.5 ${Math.abs(debug.bankUnmatchedSignedSum) < 0.01 ? 'text-green-600' : 'text-amber-600'}`}>
                  ¥{debug.bankUnmatchedSignedSum.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div className="bg-white border rounded px-2 py-1.5">
                <span className="text-gray-500">企业</span>
                <div className={`font-mono mt-0.5 ${Math.abs(debug.entUnmatchedSignedSum) < 0.01 ? 'text-green-600' : 'text-amber-600'}`}>
                  ¥{debug.entUnmatchedSignedSum.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BankResultTable({ result, bankFileName, enterpriseFileName }: Props) {
  const { accounts, summary } = result;
  const [activeAccount, setActiveAccount] = useState(accounts[0]?.account ?? '');

  const current = accounts.find((a) => a.account === activeAccount);

  const hasData = summary.totalAccounts > 0;

  // 导出 Excel
  const handleExport = () => {
    const wb = XLSX.utils.book_new();

    // 汇总 Sheet
    const summarySheet = XLSX.utils.aoa_to_sheet([
      ['银行流水文件', bankFileName],
      ['企业账文件', enterpriseFileName],
      [''],
      ['总账户数', summary.totalAccounts],
      ['完全对符', summary.fullyMatched],
      ['有未对符', summary.hasUnmatched],
      ['银行流水未对符笔数', summary.totalUnmatchedBank],
      ['企业账未对符笔数', summary.totalUnmatchedEnterprise],
    ]);
    XLSX.utils.book_append_sheet(wb, summarySheet, '汇总');

    // 每账户一个 Sheet
    for (const acc of accounts) {
      const sheetName = acc.account.length > 28 ? acc.account.slice(0, 28) : acc.account;
      const data: string[][] = [];
      data.push([`账号: ${acc.account}`]);
      data.push([`已匹配: ${acc.matched.length} 对`, `M:N匹配: ${acc.mnMatched.length} 组`, `银行未对符: ${acc.unmatchedBank.length}`, `企业未对符: ${acc.unmatchedEnterprise.length}`]);
      data.push(['']);

      // M:N 匹配
      if (acc.mnMatched.length > 0) {
        data.push(['--- 可能合并处理 (M:N) ---']);
        for (let gi = 0; gi < acc.mnMatched.length; gi++) {
          const g = acc.mnMatched[gi];
          const bSum = g.bankItems.reduce((s, t) => s + Math.abs(t.amount), 0);
          const eSum = g.enterpriseItems.reduce((s, t) => s + Math.abs(t.amount), 0);
          data.push([`【合并组 ${gi + 1}】${g.bankItems.length}笔银行流水 ↔ ${g.enterpriseItems.length}笔企业账，合计: ¥${fmt(bSum)} = ¥${fmt(eSum)}`]);
          data.push(['--- 银行流水 ---']);
          const bCols = getDisplayColumns(g.bankItems);
          data.push(['日期', '方向', '金额', ...bCols]);
          for (const t of g.bankItems) {
            data.push([fmtDate(t.date), t.direction, fmt(Math.abs(t.amount)), ...bCols.map((c) => t.rawRow[c] ?? '')]);
          }
          data.push(['--- 企业账 ---']);
          const eCols = getDisplayColumns(g.enterpriseItems);
          data.push(['日期', '方向', '金额', ...eCols]);
          for (const t of g.enterpriseItems) {
            data.push([fmtDate(t.date), t.direction, fmt(Math.abs(t.amount)), ...eCols.map((c) => t.rawRow[c] ?? '')]);
          }
          data.push(['']);
        }
      }

      // 银行流水未对符
      if (acc.unmatchedBank.length > 0) {
        data.push(['--- 银行流水未对符 ---']);
        const dispCols = getDisplayColumns(acc.unmatchedBank);
        data.push(['日期', '方向', '金额', ...dispCols]);
        for (const t of acc.unmatchedBank) {
          data.push([
            fmtDate(t.date),
            t.direction,
            fmt(Math.abs(t.amount)),
            ...dispCols.map((c) => t.rawRow[c] ?? ''),
          ]);
        }
        data.push(['']);
      }

      // 企业账未对符
      if (acc.unmatchedEnterprise.length > 0) {
        data.push(['--- 企业账未对符 ---']);
        const dispCols = getDisplayColumns(acc.unmatchedEnterprise);
        data.push(['日期', '方向', '金额', ...dispCols]);
        for (const t of acc.unmatchedEnterprise) {
          data.push([
            fmtDate(t.date),
            t.direction,
            fmt(Math.abs(t.amount)),
            ...dispCols.map((c) => t.rawRow[c] ?? ''),
          ]);
        }
      }

      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(data),
        sheetName
      );
    }

    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `银企对账结果_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 渲染交易表格
  const renderTransactionTable = (
    title: string,
    items: (BankTransaction | EnterpriseTransaction)[]
  ) => {
    if (items.length === 0) {
      return (
        <div className="p-4 text-center text-green-600 text-sm bg-green-50 rounded-lg border border-green-200">
          <CheckCircle className="w-4 h-4 inline mr-1" />
          无未对符项
        </div>
      );
    }

    const displayCols = getDisplayColumns(items);

    return (
      <div className="border rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b text-sm font-medium text-gray-700">
          {title}（{items.length} 笔）
        </div>
        <div className="overflow-auto max-h-[400px]">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-gray-100">
              <tr>
                <th className="border px-2 py-1.5 text-left">日期</th>
                <th className="border px-2 py-1.5 text-center w-12">方向</th>
                <th className="border px-2 py-1.5 text-right">金额</th>
                {displayCols.map((c) => (
                  <th key={c} className="border px-2 py-1.5 text-left">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((t, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="border px-2 py-1 whitespace-nowrap">
                    {fmtDate(t.date)}
                  </td>
                  <td className="border px-2 py-1 text-center">
                    {t.direction === '收入' || t.direction === '借方' ? (
                      <span className="inline-flex items-center gap-0.5 text-green-600">
                        <ArrowUpRight className="w-3 h-3" />
                        {t.direction}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-red-600">
                        <ArrowDownRight className="w-3 h-3" />
                        {t.direction}
                      </span>
                    )}
                  </td>
                  <td className="border px-2 py-1 text-right font-mono whitespace-nowrap">
                    {fmt(Math.abs(t.amount))}
                  </td>
                  {displayCols.map((c) => (
                    <td key={c} className="border px-2 py-1 whitespace-nowrap max-w-[150px] truncate">
                      {t.rawRow[c] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">核对结果</h2>
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm transition-colors"
        >
          <Download className="w-4 h-4" />
          导出 Excel
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="bg-white border rounded-xl p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-gray-800">{summary.totalAccounts}</p>
          <p className="text-xs text-gray-500 mt-1">总账户数</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-green-700">{summary.fullyMatched}</p>
          <p className="text-xs text-green-600 mt-1">
            <CheckCircle className="w-3 h-3 inline mr-0.5" />
            完全对符
          </p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-amber-700">{summary.hasUnmatched}</p>
          <p className="text-xs text-amber-600 mt-1">
            <AlertTriangle className="w-3 h-3 inline mr-0.5" />
            有未对符
          </p>
        </div>
        {summary.totalMNMatched > 0 && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold text-purple-700">{summary.totalMNMatched}</p>
            <p className="text-xs text-purple-600 mt-1">
              <Link2 className="w-3 h-3 inline mr-0.5" />
              可能合并
            </p>
          </div>
        )}
        {summary.quickMatchedAccounts > 0 && (
          <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 shadow-sm text-center">
            <p className="text-2xl font-bold text-teal-700">{summary.quickMatchedAccounts}</p>
            <p className="text-xs text-teal-600 mt-1">
              <Zap className="w-3 h-3 inline mr-0.5" />
              快速对符
            </p>
          </div>
        )}
        <div className="bg-white border rounded-xl p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-green-700">{summary.totalUnmatchedBank}</p>
          <p className="text-xs text-gray-500 mt-1">银行未对符</p>
        </div>
        <div className="bg-white border rounded-xl p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-blue-700">{summary.totalUnmatchedEnterprise}</p>
          <p className="text-xs text-gray-500 mt-1">企业未对符</p>
        </div>
      </div>

      {/* 数据来源 */}
      <div className="flex gap-4 text-xs text-gray-500">
        <span>银行流水: {bankFileName}（{summary.bankTxCount} 笔）</span>
        <span>企业账: {enterpriseFileName}（{summary.enterpriseTxCount} 笔）</span>
      </div>

      {/* 诊断警告 */}
      {summary.warning && (
        <div className="p-4 bg-red-50 border-2 border-red-300 rounded-xl space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-red-800 text-sm">对账异常警告</p>
              <p className="text-red-700 text-sm mt-1">{summary.warning}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-2 pt-3 border-t border-red-200">
            <div>
              <p className="text-xs font-medium text-red-600 mb-1">银行流水账号（{summary.bankAccounts.length} 个）</p>
              <div className="flex flex-wrap gap-1">
                {summary.bankAccounts.map((a) => (
                  <span key={a} className="px-2 py-0.5 bg-white border border-red-200 rounded text-xs font-mono text-red-700">{a}</span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-red-600 mb-1">企业账账号（{summary.enterpriseAccounts.length} 个）</p>
              <div className="flex flex-wrap gap-1">
                {summary.enterpriseAccounts.map((a) => (
                  <span key={a} className="px-2 py-0.5 bg-white border border-red-200 rounded text-xs font-mono text-red-700">{a}</span>
                ))}
              </div>
            </div>
          </div>
          {summary.overlapAccounts.length > 0 && (
            <p className="text-xs text-green-600 pt-1 border-t border-red-200">
              共同账号（{summary.overlapAccounts.length} 个）: {summary.overlapAccounts.join('、')}
            </p>
          )}
        </div>
      )}

      {/* 无警告但账号完全匹配时的简洁提示 */}
      {!summary.warning && summary.overlapAccounts.length > 0 && summary.bankAccounts.length > 0 && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          <CheckCircle className="w-4 h-4 inline mr-1" />
          银行流水与企业账共 {summary.overlapAccounts.length} 个账号匹配: {summary.overlapAccounts.join('、')}
        </div>
      )}

      {/* 银行独有账户提示（已跳过） */}
      {summary.skippedBankOnly && summary.skippedBankOnly.length > 0 && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
          <Info className="w-4 h-4 inline mr-1" />
          以下 {summary.skippedBankOnly.length} 个银行流水账号未在企业账中找到，已跳过核对：
          <span className="font-mono ml-1">{summary.skippedBankOnly.join('、')}</span>
        </div>
      )}

      {/* 企业独有账户提示（已跳过） */}
      {summary.skippedEntOnly && summary.skippedEntOnly.length > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          <Info className="w-4 h-4 inline mr-1" />
          以下 {summary.skippedEntOnly.length} 个企业账账号未在银行流水中找到，已跳过核对：
          <span className="font-mono ml-1">{summary.skippedEntOnly.join('、')}</span>
        </div>
      )}

      {/* 账户 Tab */}
      {hasData && (
        <>
          <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-lg">
            {accounts.map((acc) => {
              const isActive = acc.account === activeAccount;
              const hasIssue = acc.unmatchedBank.length > 0 || acc.unmatchedEnterprise.length > 0;
              return (
                <button
                  key={acc.account}
                  onClick={() => setActiveAccount(acc.account)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-white text-gray-800 shadow-sm'
                      : 'text-gray-600 hover:text-gray-800 hover:bg-gray-200'
                  }`}
                >
                  {!hasIssue ? (
                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  )}
                  {acc.account}
                </button>
              );
            })}
          </div>

          {/* 当前账户结果 */}
          {current && (
            <div className="space-y-4">
              {/* 对符统计 */}
              <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg text-sm flex-wrap">
                <span className="text-gray-600">
                  账号: <span className="font-mono font-medium text-gray-800">{current.account}</span>
                </span>
                <span className="text-gray-400">|</span>
                <span className="text-green-600">
                  已匹配: <strong>{current.matched.length}</strong> 对
                </span>
                {current.quickMatched > 0 && (
                  <>
                    <span className="text-gray-400">|</span>
                    <span className="text-teal-600">
                      <Zap className="w-3 h-3 inline mr-0.5" />
                      快速对符: <strong>{current.quickMatched}</strong> 对
                    </span>
                  </>
                )}
                {current.mnMatched.length > 0 && (
                  <>
                    <span className="text-gray-400">|</span>
                    <span className="text-purple-600">
                      可能合并: <strong>{current.mnMatched.length}</strong> 组
                    </span>
                  </>
                )}
                <span className="text-gray-400">|</span>
                <span className="text-amber-600">
                  银行未对符: <strong>{current.unmatchedBank.length}</strong>
                </span>
                <span className="text-gray-400">|</span>
                <span className="text-blue-600">
                  企业未对符: <strong>{current.unmatchedEnterprise.length}</strong>
                </span>
              </div>

              {/* 诊断面板：显示为什么快速通道未触发 */}
              {(current.unmatchedBank.length > 0 || current.unmatchedEnterprise.length > 0) && (
                <DiagnosticsPanel debug={current.debugInfo} />
              )}

              {/* M:N 匹配（可能合并处理） */}
              {current.mnMatched.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-500" />
                    可能合并处理（M:N 匹配）
                  </h3>
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-800 mb-2 flex items-start gap-2">
                    <Info className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>
                      以下明细组经金额合计匹配后能对上，可能是银行或企业做了合并处理。
                      请人工确认是否为同一笔业务。
                    </span>
                  </div>
                  <div className="space-y-3">
                    {current.mnMatched.map((group, gi) => (
                      <MNMatchCard key={gi} group={group} />
                    ))}
                  </div>
                </div>
              )}

              {/* 快速对符说明 */}
              {current.quickMatched > 0 && (
                <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg text-sm text-teal-800 flex items-start gap-2">
                  <Zap className="w-4 h-4 mt-0.5 shrink-0 text-teal-600" />
                  <span>
                    该账户 {current.quickMatched} 对明细通过<strong>快速对符</strong>通道匹配（银行收入合计 = 企业借方合计，或银行支出合计 = 企业贷方合计），不再逐笔比对。
                  </span>
                </div>
              )}

              {/* 银行流水未对符 */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  银行流水未对符
                </h3>
                {renderTransactionTable(
                  '银行流水',
                  current.unmatchedBank
                )}
              </div>

              {/* 企业账未对符 */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  企业银行存款明细账未对符
                </h3>
                {renderTransactionTable(
                  '企业账',
                  current.unmatchedEnterprise
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* 无数据 */}
      {!hasData && (
        <div className="text-center py-12 text-gray-400">
          <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>未找到银行账户数据</p>
        </div>
      )}
    </div>
  );
}
