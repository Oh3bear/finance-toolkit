import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { getUnmatchedRows, formatAmount } from '@/engine/reconciliation';
import { exportReconResult } from '@/utils/excelParser';
import { fmtExportDate } from '@/utils/dateUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FileDown, ArrowLeft, CheckCircle, XCircle, Layers, DollarSign, Eye, Building2 } from 'lucide-react';
import type { ReconGroup } from '@/types';

export function ResultPage() {
  const reconResult = useAppStore(s => s.reconResult);
  const setStep = useAppStore(s => s.setStep);
  const [, setSelectedGroup] = useState<ReconGroup | null>(null);
  const [activeTab, setActiveTab] = useState('summary');

  if (!reconResult) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8 text-center">
        <p className="text-muted-foreground">暂无核对结果，请先执行核对</p>
        <Button className="mt-4" onClick={() => setStep('核对')}>
          去核对
        </Button>
      </div>
    );
  }

  const { 统计 } = reconResult;

  const handleExport = () => {
    const buffer = exportReconResult(reconResult);
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `内部往来核对结果_${fmtExportDate()}.xlsx`;
    a.click();
  };

  const matchTypeColor = (type: string) => {
    switch (type) {
      case '汇总零值': return 'bg-primary/10 text-primary/80';
      case '1:1': return 'bg-primary/10 text-primary/80';
      case '1:N': return 'bg-secondary text-foreground';
      case 'M:N': return 'bg-orange-100 text-orange-800';
      default: return 'bg-muted text-foreground';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">核对结果</h1>
          <p className="text-muted-foreground mt-1">
            共 {统计.总组数} 组，
            <span className="text-primary font-medium">{统计.对符组数} 组对符</span>，
            <span className="text-red-600 font-medium">{统计.未对符组数} 组未对符</span>
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setStep('核对')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回核对
          </Button>
          <Button onClick={handleExport}>
            <FileDown className="w-4 h-4 mr-2" />
            导出结果
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Layers className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">总组数</div>
                <div className="text-xl font-bold">{统计.总组数}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">对符组数</div>
                <div className="text-xl font-bold text-primary">{统计.对符组数}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">未对符组数</div>
                <div className="text-xl font-bold text-red-600">{统计.未对符组数}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">总差异金额</div>
                <div className="text-xl font-bold text-orange-600">{formatAmount(统计.总差异金额)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="byPC">
            <Building2 className="w-4 h-4 mr-1" />
            按利润中心汇总
          </TabsTrigger>
          <TabsTrigger value="summary">
            <CheckCircle className="w-4 h-4 mr-1" />
            对符明细 ({reconResult.对符明细.length})
          </TabsTrigger>
          <TabsTrigger value="unmatched">
            <XCircle className="w-4 h-4 mr-1" />
            未对符明细 ({reconResult.未对符明细.length})
          </TabsTrigger>
        </TabsList>

        {/* 按利润中心汇总 */}
        <TabsContent value="byPC">
          <ProfitCenterSummary reconResult={reconResult} matchTypeColor={matchTypeColor} setSelectedGroup={setSelectedGroup} />
        </TabsContent>

        {/* 对符明细 */}
        <TabsContent value="summary">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-primary" />
                对符明细
                <Badge variant="outline" className="ml-2 bg-primary/5 text-primary">
                  {reconResult.对符明细.length} 组
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>分组ID</TableHead>
                      <TableHead>利润中心A</TableHead>
                      <TableHead>利润中心B</TableHead>
                      <TableHead className="text-right">交易笔数</TableHead>
                      <TableHead className="text-right">借方合计</TableHead>
                      <TableHead className="text-right">贷方合计</TableHead>
                      <TableHead>匹配类型</TableHead>
                      <TableHead className="text-center">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reconResult.对符明细.map((group) => {
                      const matchType = group.匹配链[0]?.匹配类型 || '-';
                      return (
                        <TableRow key={group.id}>
                          <TableCell className="font-mono text-xs">{group.id}</TableCell>
                          <TableCell>{group.利润中心A名称}</TableCell>
                          <TableCell>{group.利润中心B名称}</TableCell>
                          <TableCell className="text-right">{group.行.length}</TableCell>
                          <TableCell className="text-right text-primary">
                            {formatAmount(
                              group.行.filter((r) => r.净额 > 0).reduce((s, r) => s + r.净额, 0)
                            )}
                          </TableCell>
                          <TableCell className="text-right text-red-600">
                            {formatAmount(
                              Math.abs(group.行.filter((r) => r.净额 < 0).reduce((s, r) => s + r.净额, 0))
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={matchTypeColor(matchType)}>{matchType}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="sm" onClick={() => setSelectedGroup(group)}>
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-[95vw] h-[95vh] max-h-[95vh] overflow-hidden p-0 gap-0 flex flex-col">
                                <DialogHeader className="shrink-0 bg-card px-6 pt-6 pb-4 border-b">
                                  <DialogTitle>
                                    对符明细 - {group.利润中心A名称} ↔ {group.利润中心B名称}
                                  </DialogTitle>
                                </DialogHeader>
                                <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
                                  <GroupDetailDialog group={group} matchTypeColor={matchTypeColor} />
                                </div>
                              </DialogContent>
                            </Dialog>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 未对符明细 */}
        <TabsContent value="unmatched">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-600" />
                未对符明细
                <Badge variant="outline" className="ml-2 bg-red-50 text-red-700">
                  {reconResult.未对符明细.length} 组
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>分组ID</TableHead>
                      <TableHead>利润中心A</TableHead>
                      <TableHead>利润中心B</TableHead>
                      <TableHead className="text-right">总笔数</TableHead>
                      <TableHead className="text-right">已匹配</TableHead>
                      <TableHead className="text-right">未匹配</TableHead>
                      <TableHead className="text-right">差异金额</TableHead>
                      <TableHead className="text-center">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reconResult.未对符明细.map((group) => {
                      const matchedCount = group.匹配链.reduce(
                        (s, c) => s + c.借方行.length + c.贷方行.length,
                        0
                      );
                      const unmatchedCount = group.行.length - matchedCount;
                      return (
                        <TableRow key={group.id}>
                          <TableCell className="font-mono text-xs">{group.id}</TableCell>
                          <TableCell>{group.利润中心A名称}</TableCell>
                          <TableCell>{group.利润中心B名称}</TableCell>
                          <TableCell className="text-right">{group.行.length}</TableCell>
                          <TableCell className="text-right text-primary">{matchedCount}</TableCell>
                          <TableCell className="text-right text-red-600 font-medium">{unmatchedCount}</TableCell>
                          <TableCell className="text-right text-red-600 font-bold">
                            {formatAmount(Math.abs(group.合计净额))}
                          </TableCell>
                          <TableCell className="text-center">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="sm" onClick={() => setSelectedGroup(group)}>
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-[95vw] h-[95vh] max-h-[95vh] overflow-hidden p-0 gap-0 flex flex-col">
                                <DialogHeader className="shrink-0 bg-card px-6 pt-6 pb-4 border-b">
                                  <DialogTitle>
                                    未对符明细 - {group.利润中心A名称} ↔ {group.利润中心B名称}
                                    <span className="ml-2 text-sm font-normal text-red-600">
                                      差异：{formatAmount(Math.abs(group.合计净额))}
                                    </span>
                                  </DialogTitle>
                                </DialogHeader>
                                <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
                                  <UnmatchedGroupDialog group={group} matchTypeColor={matchTypeColor} />
                                </div>
                              </DialogContent>
                            </Dialog>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// 对符组详情弹窗
function GroupDetailDialog({ group, matchTypeColor }: { group: ReconGroup; matchTypeColor: (t: string) => string }) {
  return (
    <div className="space-y-4">
      {group.匹配链.map((chain) => (
        <div key={chain.id} className="border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Badge className={matchTypeColor(chain.匹配类型)}>{chain.匹配类型}</Badge>
            <span className="text-sm text-muted-foreground">
              借方：{formatAmount(chain.借方合计)} | 贷方：{formatAmount(chain.贷方合计)} | 差异：{formatAmount(chain.差异)}
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>方向</TableHead>
                <TableHead>凭证编号</TableHead>
                <TableHead>日期</TableHead>
                <TableHead>利润中心</TableHead>
                <TableHead>科目</TableHead>
                <TableHead>客商</TableHead>
                <TableHead className="min-w-[200px]">摘要(文本)</TableHead>
                <TableHead className="text-right">净额</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {chain.借方行.map((row, i) => (
                <TableRow key={`d_${row.id}_${i}`}>
                  <TableCell><Badge className="bg-primary/10 text-primary/80">借</Badge></TableCell>
                  <TableCell>{row.凭证编号}</TableCell>
                  <TableCell className="text-xs">{row.过帐日期}</TableCell>
                  <TableCell className="text-xs">{row.利润中心名称}</TableCell>
                  <TableCell className="text-xs max-w-[150px] truncate" title={row.科目名称}>{row.科目名称}</TableCell>
                  <TableCell className="text-xs max-w-[120px] truncate">{row.客商}</TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate" title={row.文本}>{row.文本}</TableCell>
                  <TableCell className="text-right text-primary">{formatAmount(row.净额)}</TableCell>
                </TableRow>
              ))}
              {chain.贷方行.map((row, i) => (
                <TableRow key={`c_${row.id}_${i}`}>
                  <TableCell><Badge className="bg-red-100 text-red-800">贷</Badge></TableCell>
                  <TableCell>{row.凭证编号}</TableCell>
                  <TableCell className="text-xs">{row.过帐日期}</TableCell>
                  <TableCell className="text-xs">{row.利润中心名称}</TableCell>
                  <TableCell className="text-xs max-w-[150px] truncate" title={row.科目名称}>{row.科目名称}</TableCell>
                  <TableCell className="text-xs max-w-[120px] truncate">{row.客商}</TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate" title={row.文本}>{row.文本}</TableCell>
                  <TableCell className="text-right text-red-600">{formatAmount(row.净额)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  );
}

// 未对符组详情弹窗（包含已匹配和未匹配）
function UnmatchedGroupDialog({ group, matchTypeColor }: { group: ReconGroup; matchTypeColor: (t: string) => string }) {
  const unmatchedRows = getUnmatchedRows(group);

  return (
    <div className="space-y-4 overflow-auto">
      {/* 已匹配部分 */}
      {group.匹配链.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-primary mb-2 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            已匹配明细
          </h3>
          {group.匹配链.map((chain) => (
            <div key={chain.id} className="border border-primary/20 rounded-lg p-4 mb-3 bg-primary/5/30">
              <div className="flex items-center gap-2 mb-3">
                <Badge className={matchTypeColor(chain.匹配类型)}>{chain.匹配类型}</Badge>
                <span className="text-sm text-muted-foreground">
                  借方：{formatAmount(chain.借方合计)} | 贷方：{formatAmount(chain.贷方合计)}
                </span>
              </div>
              <div className="space-y-1 max-h-[200px] overflow-auto">
                {[...chain.借方行, ...chain.贷方行].map((row, i) => (
                  <div key={`m_${row.id}_${i}`} className="flex items-center gap-3 py-1 px-2 bg-card rounded text-sm">
                    <Badge className={row.净额 > 0 ? 'bg-primary/10 text-primary/80' : 'bg-red-100 text-red-800'}>
                      {row.净额 > 0 ? '借' : '贷'}
                    </Badge>
                    <span className="w-28 font-mono text-xs">{row.凭证编号}</span>
                    <span className="flex-1 text-xs truncate">{row.客商}</span>
                    <span className={`w-24 text-right ${row.净额 > 0 ? 'text-primary' : 'text-red-600'}`}>
                      {formatAmount(row.净额)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 未匹配部分 */}
      {unmatchedRows.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-red-700 mb-2 flex items-center gap-2">
            <XCircle className="w-4 h-4" />
            未匹配明细（需人工核对）
          </h3>
          <div className="border border-red-200 rounded-lg p-4 bg-red-50/30">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-red-600 font-medium">
                共 {unmatchedRows.length} 笔未匹配，差异合计：{formatAmount(unmatchedRows.reduce((s, r) => s + r.净额, 0))}
              </span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>方向</TableHead>
                  <TableHead>凭证编号</TableHead>
                  <TableHead>过帐日期</TableHead>
                  <TableHead>利润中心</TableHead>
                  <TableHead>科目</TableHead>
                  <TableHead>客商</TableHead>
                  <TableHead className="min-w-[200px]">摘要(文本)</TableHead>
                  <TableHead className="text-right">净额</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unmatchedRows.map((row, i) => (
                  <TableRow key={`um_${row.id}_${i}`}>
                    <TableCell>
                      <Badge className={row.净额 > 0 ? 'bg-primary/10 text-primary/80' : 'bg-red-100 text-red-800'}>
                        {row.净额 > 0 ? '借' : '贷'}
                      </Badge>
                    </TableCell>
                    <TableCell>{row.凭证编号}</TableCell>
                    <TableCell className="text-xs">{row.过帐日期}</TableCell>
                    <TableCell className="text-xs">{row.利润中心名称}</TableCell>
                    <TableCell className="text-xs max-w-[150px] truncate" title={row.科目名称}>
                      {row.科目名称}
                    </TableCell>
                    <TableCell className="text-xs max-w-[120px] truncate">{row.客商}</TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate" title={row.文本}>{row.文本}</TableCell>
                    <TableCell className={`text-right font-medium ${row.净额 > 0 ? 'text-primary' : 'text-red-600'}`}>
                      {formatAmount(row.净额)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}


// ==================== 按利润中心汇总 ====================
interface ProfitCenterSummaryProps {
  reconResult: {
    groups: ReconGroup[];
    对符明细: ReconGroup[];
    未对符明细: ReconGroup[];
    统计: any;
  };
  matchTypeColor: (t: string) => string;
  setSelectedGroup: (g: ReconGroup) => void;
}

interface PCGroupInfo {
  利润中心编码: string;
  利润中心名称: string;
  对方编码: string;
  对方名称: string;
  交易笔数: number;
  借方合计: number;
  贷方合计: number;
  净额合计: number;
  状态: '对符' | '未对符';
  匹配类型: string;
  group: ReconGroup;
}

function ProfitCenterSummary({ reconResult, matchTypeColor, setSelectedGroup }: ProfitCenterSummaryProps) {
  // 按利润中心汇总
  const pcMap = new Map<string, { 名称: string; 对方列表: PCGroupInfo[] }>();

  for (const group of reconResult.groups) {
    // 利润中心A 视角
    const keyA = group.利润中心A;
    if (!pcMap.has(keyA)) {
      pcMap.set(keyA, { 名称: group.利润中心A名称, 对方列表: [] });
    }
    const debitSum = group.行.filter((r) => r.净额 > 0).reduce((s, r) => s + r.净额, 0);
    const creditSum = Math.abs(group.行.filter((r) => r.净额 < 0).reduce((s, r) => s + r.净额, 0));
    const netSum = group.行.reduce((s, r) => s + r.净额, 0);
    pcMap.get(keyA)!.对方列表.push({
      利润中心编码: group.利润中心A,
      利润中心名称: group.利润中心A名称,
      对方编码: group.利润中心B,
      对方名称: group.利润中心B名称,
      交易笔数: group.行.length,
      借方合计: debitSum,
      贷方合计: creditSum,
      净额合计: netSum,
      状态: group.状态 as '对符' | '未对符',
      匹配类型: group.匹配链[0]?.匹配类型 || '-',
      group,
    });

    // 利润中心B 视角
    const keyB = group.利润中心B;
    if (!pcMap.has(keyB)) {
      pcMap.set(keyB, { 名称: group.利润中心B名称, 对方列表: [] });
    }
    // B视角：A是对方
    pcMap.get(keyB)!.对方列表.push({
      利润中心编码: group.利润中心B,
      利润中心名称: group.利润中心B名称,
      对方编码: group.利润中心A,
      对方名称: group.利润中心A名称,
      交易笔数: group.行.length,
      借方合计: creditSum,
      贷方合计: debitSum,
      净额合计: -netSum,
      状态: group.状态 as '对符' | '未对符',
      匹配类型: group.匹配链[0]?.匹配类型 || '-',
      group,
    });
  }

  // 展开为扁平列表
  const flatList: PCGroupInfo[] = [];
  for (const [, info] of pcMap) {
    for (const item of info.对方列表) {
      flatList.push(item);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" />
          按利润中心汇总
          <Badge variant="outline" className="ml-2 bg-primary/5 text-primary">
            {pcMap.size} 家单位
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[600px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>本单位</TableHead>
                <TableHead>对方单位</TableHead>
                <TableHead className="text-right">交易笔数</TableHead>
                <TableHead className="text-right">借方合计</TableHead>
                <TableHead className="text-right">贷方合计</TableHead>
                <TableHead className="text-right">净额差异</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-center">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flatList.map((item, i) => (
                <TableRow key={`${item.利润中心编码}_${item.对方编码}_${i}`}>
                  <TableCell className="font-medium">{item.利润中心名称}</TableCell>
                  <TableCell>{item.对方名称}</TableCell>
                  <TableCell className="text-right">{item.交易笔数}</TableCell>
                  <TableCell className="text-right text-primary">{formatAmount(item.借方合计)}</TableCell>
                  <TableCell className="text-right text-red-600">{formatAmount(item.贷方合计)}</TableCell>
                  <TableCell className={`text-right font-bold ${Math.abs(item.净额合计) < 0.01 ? 'text-primary' : 'text-red-600'}`}>
                    {Math.abs(item.净额合计) < 0.01 ? '0.00' : formatAmount(Math.abs(item.净额合计))}
                  </TableCell>
                  <TableCell>
                    <Badge className={item.状态 === '对符' ? 'bg-primary/10 text-primary/80' : 'bg-red-100 text-red-800'}>
                      {item.状态}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedGroup(item.group)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-[95vw] h-[95vh] max-h-[95vh] overflow-hidden p-0 gap-0 flex flex-col">
                        <DialogHeader className="shrink-0 bg-card px-6 pt-6 pb-4 border-b">
                          <DialogTitle>
                            {item.利润中心名称} ↔ {item.对方名称}
                            <span className="ml-2 text-sm font-normal text-muted-foreground">
                              净额差异：{formatAmount(Math.abs(item.净额合计))}
                            </span>
                          </DialogTitle>
                        </DialogHeader>
                        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
                          {item.状态 === '对符' ? (
                            <GroupDetailDialog group={item.group} matchTypeColor={matchTypeColor} />
                          ) : (
                            <UnmatchedGroupDialog group={item.group} matchTypeColor={matchTypeColor} />
                          )}
                        </div>
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
