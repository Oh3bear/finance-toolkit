import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertCircle, Trash2, Plus, ArrowRight, FileDown, Lightbulb, Wand2, Check, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { SubjectMapping, EntityMapping } from '@/types';
import * as XLSX from 'xlsx';

export function MappingPage() {
  const { subjectMappings, entityMappings, setSubjectMappings, setEntityMappings, setStep, rawData } = useAppStore();
  const [activeTab, setActiveTab] = useState('subjects');
  const [subjectSearch, setSubjectSearch] = useState('');
  const [entitySearch, setEntitySearch] = useState('');
  const [warning, setWarning] = useState('');
  
  // 智能推断弹窗
  const [inferModalOpen, setInferModalOpen] = useState(false);
  const [inferConfirmed, setInferConfirmed] = useState<EntityMapping[]>([]);
  const [inferUnmatched, setInferUnmatched] = useState<EntityMapping[]>([]);
  const [inferCheckedConfirmed, setInferCheckedConfirmed] = useState<Set<number>>(new Set());
  const [inferCheckedUnmatched, setInferCheckedUnmatched] = useState<Set<number>>(new Set());
  
  // 新增科目
  const [newSubject, setNewSubject] = useState<SubjectMapping>({ 科目编码: '', 科目名称: '' });
  // 新增客商
  const [newEntity, setNewEntity] = useState<EntityMapping>({ 客商名称: '', 利润中心编码: '', 利润中心名称: '', 标准化名称: '' });

  // 过滤科目
  const filteredSubjects = subjectMappings.filter(
    (s) =>
      s.科目编码.includes(subjectSearch) ||
      s.科目名称.includes(subjectSearch)
  );

  // 过滤客商
  const filteredEntities = entityMappings.filter(
    (e) =>
      e.客商名称.includes(entitySearch) ||
      e.利润中心编码.includes(entitySearch) ||
      e.利润中心名称.includes(entitySearch)
  );

  // 从数据中自动提取科目
  const autoExtractSubjects = () => {
    const subjectMap = new Map<string, string>();
    for (const row of rawData) {
      if (row.科目号 && !subjectMap.has(row.科目号)) {
        subjectMap.set(row.科目号, row.总账科目长文本);
      }
    }
    const extracted: SubjectMapping[] = [];
    for (const [编码, 名称] of subjectMap) {
      if (!subjectMappings.some((s) => s.科目编码 === 编码)) {
        extracted.push({ 科目编码: 编码, 科目名称: 名称 });
      }
    }
    setSubjectMappings([...subjectMappings, ...extracted]);
    setWarning(`已自动提取 ${extracted.length} 个科目`);
  };

  // 从数据中自动提取客商
  const autoExtractEntities = () => {
    const entitySet = new Set<string>();
    for (const row of rawData) {
      if (row.客户名称) entitySet.add(row.客户名称);
      if (row.供应商名称) entitySet.add(row.供应商名称);
    }
    const extracted: EntityMapping[] = [];
    for (const name of entitySet) {
      if (!entityMappings.some((e) => e.客商名称 === name)) {
        extracted.push({
          客商名称: name,
          利润中心编码: '',
          利润中心名称: name,
          标准化名称: name,
        });
      }
    }
    setEntityMappings([...entityMappings, ...extracted]);
    setWarning(`已自动提取 ${extracted.length} 个客商`);
  };

  // 自动推断利润中心编码（严格精确匹配）
  // 分部和本部是不同的利润中心，编码不同，只能按名称完全一致匹配
  const inferProfitCenterCodes = () => {
    if (rawData.length === 0) {
      setWarning('请先导入明细账');
      return;
    }

    // 从明细账中收集：利润中心文本描述 → 利润中心编码（严格一对一）
    // 如果同一名称对应多个编码，说明数据有问题，取第一个
    const pcNameToCode = new Map<string, string>();
    for (const row of rawData) {
      if (row.利润中心 && row.利润中心文本描述) {
        if (!pcNameToCode.has(row.利润中心文本描述)) {
          pcNameToCode.set(row.利润中心文本描述, row.利润中心);
        }
      }
    }

    let filled = 0;
    const updated = entityMappings.map((em) => {
      if (em.利润中心编码 && em.利润中心编码.trim() !== '') return em;

      const 客商 = em.客商名称.trim();
      let inferredCode = '';

      // 严格精确匹配：客商名称 必须和 明细账中的利润中心文本描述 完全一致
      if (pcNameToCode.has(客商)) {
        inferredCode = pcNameToCode.get(客商)!;
      }

      if (inferredCode) {
        filled++;
        return { ...em, 利润中心编码: inferredCode };
      }
      return em;
    });

    setEntityMappings(updated);
    setWarning(`已自动为 ${filled} 个客商推断出利润中心编码（严格精确匹配），剩余 ${updated.length - filled} 个名称不一致需手动填写`);
  };

  // 智能推断内部客商：先以利润中心名称为锚匹配，编码7位仅作备选
  const smartInferEntities = () => {
    if (rawData.length === 0) {
      setWarning('请先导入明细账');
      return;
    }

    // Step 1: 收集利润中心字典（名称 → {编码, 名称}）
    const pcNameToInfo = new Map<string, { 编码: string; 名称: string }>();
    for (const row of rawData) {
      if (row.利润中心 && row.利润中心文本描述) {
        if (!pcNameToInfo.has(row.利润中心文本描述)) {
          pcNameToInfo.set(row.利润中心文本描述, {
            编码: row.利润中心,
            名称: row.利润中心文本描述,
          });
        }
      }
    }

    // Step 2: 收集所有客户/供应商的 (编码, 名称) 对（全量，不做编码长度筛选）
    type VendorEntry = { 编码: string; 名称: string };
    const vendorList: VendorEntry[] = [];
    const seenVendors = new Set<string>();
    for (const row of rawData) {
      if (row.客户 && row.客户名称) {
        const key = `C:${row.客户}`;
        if (!seenVendors.has(key)) {
          seenVendors.add(key);
          vendorList.push({ 编码: row.客户, 名称: row.客户名称 });
        }
      }
      if (row.供应商 && row.供应商名称) {
        const key = `S:${row.供应商}`;
        if (!seenVendors.has(key)) {
          seenVendors.add(key);
          vendorList.push({ 编码: row.供应商, 名称: row.供应商名称 });
        }
      }
    }

    // Step 3: 以利润中心名称为锚，匹配客户/供应商名称
    const confirmedSet = new Set<string>(); // 已确认的客商名称
    const confirmed: EntityMapping[] = [];

    for (const [pcName, pcInfo] of pcNameToInfo) {
      // 检查是否已在现有映射中
      if (entityMappings.some(e => e.利润中心编码 === pcInfo.编码)) continue;

      // 在 vendorList 中找匹配
      for (const v of vendorList) {
        if (confirmedSet.has(v.名称)) continue;

        // L1: 精确匹配
        if (v.名称 === pcName) {
          confirmed.push({
            客商名称: v.名称,
            利润中心编码: pcInfo.编码,
            利润中心名称: pcName,
            标准化名称: pcName,
          });
          confirmedSet.add(v.名称);
          break;
        }

        // L2: 利润中心名称去"-本部"
        const pcNameClean = pcName.replace(/-本部$/, '');
        if (pcNameClean !== pcName && v.名称 === pcNameClean) {
          confirmed.push({
            客商名称: v.名称,
            利润中心编码: pcInfo.编码,
            利润中心名称: pcName,
            标准化名称: pcNameClean,
          });
          confirmedSet.add(v.名称);
          break;
        }
      }
    }

    // Step 4: 编码7位但未被匹配的 → 备选手动核实
    const unmatched: EntityMapping[] = [];
    for (const v of vendorList) {
      if (confirmedSet.has(v.名称)) continue;
      if (entityMappings.some(e => e.客商名称 === v.名称 && e.利润中心编码)) continue;
      if (v.编码.length !== 7) continue; // 只收集7位编码的

      unmatched.push({
        客商名称: v.名称,
        利润中心编码: '',
        利润中心名称: '',
        标准化名称: v.名称,
      });
    }

    // Step 4: 打开弹窗显示结果
    setInferConfirmed(confirmed);
    setInferUnmatched(unmatched);
    // 默认全选已确认的
    setInferCheckedConfirmed(new Set(confirmed.map((_, i) => i)));
    setInferCheckedUnmatched(new Set());
    setInferModalOpen(true);
  };

  // 导出映射模板
  const exportTemplate = () => {
    const wb = XLSX.utils.book_new();
    
    const subjectData = subjectMappings.map((s) => ({
      科目编码: s.科目编码,
      科目名称: s.科目名称,
    }));
    const wsSubjects = XLSX.utils.json_to_sheet(subjectData);
    XLSX.utils.book_append_sheet(wb, wsSubjects, '科目映射');
    
    const entityData = entityMappings.map((e) => ({
      客商名称: e.客商名称,
      利润中心编码: e.利润中心编码,
      利润中心名称: e.利润中心名称,
      标准化名称: e.标准化名称,
    }));
    const wsEntities = XLSX.utils.json_to_sheet(entityData);
    XLSX.utils.book_append_sheet(wb, wsEntities, '客商映射');
    
    const blob = new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], {
      type: 'application/octet-stream',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '映射表模板.xlsx';
    a.click();
  };

  const handleContinue = () => {
    if (subjectMappings.length === 0) {
      setWarning('请至少维护一个科目映射');
      return;
    }
    if (entityMappings.length === 0) {
      setWarning('请至少维护一个内部客商映射');
      return;
    }
    setStep('核对');
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">映射表维护</h1>
      <p className="text-gray-500 mb-6">
        维护参与抵消核对的科目和内部客商映射。只有这里配置的科目和客商才会参与核对。
        <Badge variant="outline" className="ml-2">
          {subjectMappings.length} 科目
        </Badge>
        <Badge variant="outline" className="ml-1">
          {entityMappings.length} 客商
        </Badge>
      </p>

      {warning && (
        <Alert className="mb-4 bg-yellow-50 border-yellow-200">
          <AlertCircle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-700">{warning}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-3 mb-4 flex-wrap">
        <Button variant="outline" size="sm" onClick={autoExtractSubjects}>
          <Plus className="w-4 h-4 mr-1" />
          从数据提取科目
        </Button>
        <Button variant="outline" size="sm" onClick={autoExtractEntities}>
          <Plus className="w-4 h-4 mr-1" />
          从数据提取客商
        </Button>
        <Button variant="outline" size="sm" onClick={inferProfitCenterCodes} disabled={rawData.length === 0}>
          <Lightbulb className="w-4 h-4 mr-1" />
          推断利润中心编码
        </Button>
        <Button variant="outline" size="sm" onClick={smartInferEntities} disabled={rawData.length === 0}>
          <Wand2 className="w-4 h-4 mr-1" />
          智能推断内部客商
        </Button>
        <Button variant="outline" size="sm" onClick={exportTemplate}>
          <FileDown className="w-4 h-4 mr-1" />
          导出映射表
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="subjects">
            科目映射 ({subjectMappings.length})
          </TabsTrigger>
          <TabsTrigger value="entities">
            客商映射 ({entityMappings.length})
          </TabsTrigger>
        </TabsList>

        {/* 科目映射 */}
        <TabsContent value="subjects">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>科目映射表</span>
                <div className="flex gap-2">
                  <Input
                    placeholder="搜索科目编码或名称..."
                    value={subjectSearch}
                    onChange={(e) => setSubjectSearch(e.target.value)}
                    className="w-64"
                  />
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* 新增科目 */}
              <div className="flex gap-2 mb-4 p-3 bg-gray-50 rounded-lg">
                <Input
                  placeholder="科目编码"
                  value={newSubject.科目编码}
                  onChange={(e) => setNewSubject({ ...newSubject, 科目编码: e.target.value })}
                  className="w-48"
                />
                <Input
                  placeholder="科目名称"
                  value={newSubject.科目名称}
                  onChange={(e) => setNewSubject({ ...newSubject, 科目名称: e.target.value })}
                  className="flex-1"
                />
                <Button
                  size="sm"
                  onClick={() => {
                    if (newSubject.科目编码 && newSubject.科目名称) {
                      setSubjectMappings([...subjectMappings, { ...newSubject }]);
                      setNewSubject({ 科目编码: '', 科目名称: '' });
                    }
                  }}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-48">科目编码</TableHead>
                      <TableHead>科目名称</TableHead>
                      <TableHead className="w-20">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSubjects.map((s, i) => (
                      <TableRow key={`${s.科目编码}_${i}`}>
                        <TableCell className="font-mono text-sm">{s.科目编码}</TableCell>
                        <TableCell>{s.科目名称}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setSubjectMappings(subjectMappings.filter((_, idx) => idx !== subjectMappings.indexOf(s)))
                            }
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredSubjects.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-gray-400 py-8">
                          暂无科目映射，请导入或手动添加
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 客商映射 */}
        <TabsContent value="entities">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>内部客商映射表</span>
                <div className="flex gap-2">
                  <Input
                    placeholder="搜索客商名称..."
                    value={entitySearch}
                    onChange={(e) => setEntitySearch(e.target.value)}
                    className="w-64"
                  />
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* 新增客商 */}
              <div className="flex gap-2 mb-4 p-3 bg-gray-50 rounded-lg flex-wrap">
                <Input
                  placeholder="客商名称（来自明细账）"
                  value={newEntity.客商名称}
                  onChange={(e) => setNewEntity({ ...newEntity, 客商名称: e.target.value })}
                  className="flex-1 min-w-[200px]"
                />
                <Input
                  placeholder="利润中心编码"
                  value={newEntity.利润中心编码}
                  onChange={(e) => setNewEntity({ ...newEntity, 利润中心编码: e.target.value })}
                  className="w-40"
                />
                <Input
                  placeholder="标准化名称"
                  value={newEntity.标准化名称}
                  onChange={(e) => setNewEntity({ ...newEntity, 标准化名称: e.target.value })}
                  className="w-40"
                />
                <Button
                  size="sm"
                  onClick={() => {
                    if (newEntity.客商名称) {
                      setEntityMappings([
                        ...entityMappings,
                        {
                          ...newEntity,
                          利润中心名称: newEntity.标准化名称 || newEntity.客商名称,
                        },
                      ]);
                      setNewEntity({ 客商名称: '', 利润中心编码: '', 利润中心名称: '', 标准化名称: '' });
                    }
                  }}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>客商名称</TableHead>
                      <TableHead className="w-40">利润中心编码</TableHead>
                      <TableHead className="w-48">标准化名称</TableHead>
                      <TableHead className="w-20">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEntities.map((e, i) => (
                      <TableRow key={`${e.客商名称}_${i}`}>
                        <TableCell>{e.客商名称}</TableCell>
                        <TableCell className="font-mono text-sm">{e.利润中心编码 || '-'}</TableCell>
                        <TableCell>{e.标准化名称 || e.利润中心名称 || '-'}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setEntityMappings(entityMappings.filter((_, idx) => idx !== entityMappings.indexOf(e)))
                            }
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredEntities.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-gray-400 py-8">
                          暂无客商映射，请导入或手动添加
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-between mt-8">
        <Button variant="outline" size="lg" onClick={() => setStep('导入')}>
          上一步
        </Button>
        <Button size="lg" onClick={handleContinue} className="min-w-[160px]">
          下一步：执行核对
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>

      {/* ============ 智能推断弹窗 ============ */}
      {inferModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[85vh] flex flex-col">
            {/* 弹窗标题 */}
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h2 className="text-lg font-bold text-gray-900">智能推断内部客商</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  以利润中心名称为锚，匹配客户/供应商名称（L1精确/L2去本部）+ 编码7位备选
                </p>
              </div>
              <button
                onClick={() => setInferModalOpen(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* 弹窗内容 */}
            <div className="flex-1 overflow-auto p-5 space-y-5">
              {/* 已确认组 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-green-700 flex items-center gap-1.5">
                    <Check className="w-4 h-4" />
                    已自动匹配（{inferConfirmed.length} 条）
                  </h3>
                  <button
                    onClick={() => {
                      if (inferCheckedConfirmed.size === inferConfirmed.length) {
                        setInferCheckedConfirmed(new Set());
                      } else {
                        setInferCheckedConfirmed(new Set(inferConfirmed.map((_, i) => i)));
                      }
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    {inferCheckedConfirmed.size === inferConfirmed.length ? '取消全选' : '全选'}
                  </button>
                </div>
                {inferConfirmed.length === 0 ? (
                  <p className="text-xs text-gray-400 py-3">无自动匹配结果</p>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="text-xs w-full">
                      <thead>
                        <tr className="bg-green-50">
                          <th className="w-10 p-2 text-center">选择</th>
                          <th className="text-left p-2">客商名称</th>
                          <th className="text-left p-2">利润中心名称</th>
                          <th className="text-left p-2">匹配方式</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inferConfirmed.map((e, i) => {
                          const isL1 = e.利润中心名称 === e.客商名称;
                          return (
                            <tr key={i} className={`border-t ${inferCheckedConfirmed.has(i) ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
                              <td className="p-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={inferCheckedConfirmed.has(i)}
                                  onChange={() => {
                                    const next = new Set(inferCheckedConfirmed);
                                    if (next.has(i)) next.delete(i);
                                    else next.add(i);
                                    setInferCheckedConfirmed(next);
                                  }}
                                  className="rounded"
                                />
                              </td>
                              <td className="p-2 font-medium">{e.客商名称}</td>
                              <td className="p-2 text-gray-600 font-mono">{e.利润中心编码} / {e.利润中心名称}</td>
                              <td className="p-2">
                                <Badge variant="outline" className="text-xs">
                                  {isL1 ? 'L1 精确' : 'L2 去本部'}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* 未匹配组 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-orange-700 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" />
                    备选手动核实（{inferUnmatched.length} 条）
                  </h3>
                  {inferUnmatched.length > 0 && (
                    <button
                      onClick={() => {
                        if (inferCheckedUnmatched.size === inferUnmatched.length) {
                          setInferCheckedUnmatched(new Set());
                        } else {
                          setInferCheckedUnmatched(new Set(inferUnmatched.map((_, i) => i)));
                        }
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      {inferCheckedUnmatched.size === inferUnmatched.length ? '取消全选' : '全选'}
                    </button>
                  )}
                </div>
                {inferUnmatched.length === 0 ? (
                  <p className="text-xs text-gray-400 py-3">所有编码7位的客商均已自动匹配</p>
                ) : (
                  <div>
                    <p className="text-xs text-gray-400 mb-2">
                      以下客商编码为7位，但未在利润中心名称中找到匹配。可手动核实后添加。
                    </p>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="text-xs w-full">
                        <thead>
                          <tr className="bg-orange-50">
                            <th className="w-10 p-2 text-center">选择</th>
                            <th className="text-left p-2">客商名称</th>
                            <th className="text-left p-2">说明</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inferUnmatched.map((e, i) => (
                            <tr key={i} className={`border-t ${inferCheckedUnmatched.has(i) ? 'bg-orange-50' : 'hover:bg-gray-50'}`}>
                              <td className="p-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={inferCheckedUnmatched.has(i)}
                                  onChange={() => {
                                    const next = new Set(inferCheckedUnmatched);
                                    if (next.has(i)) next.delete(i);
                                    else next.add(i);
                                    setInferCheckedUnmatched(next);
                                  }}
                                  className="rounded"
                                />
                              </td>
                              <td className="p-2 font-medium">{e.客商名称}</td>
                              <td className="p-2 text-gray-400">需手动指定利润中心编码和标准化名称</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 弹窗底部 */}
            <div className="flex items-center justify-between p-5 border-t bg-gray-50 rounded-b-xl">
              <p className="text-xs text-gray-500">
                确认添加 <span className="font-medium text-green-600">{inferCheckedConfirmed.size}</span> 条已匹配 + <span className="font-medium text-orange-600">{inferCheckedUnmatched.size}</span> 条待手动
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setInferModalOpen(false)}>
                  取消
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    const toAdd: EntityMapping[] = [];
                    inferConfirmed.forEach((e, i) => {
                      if (inferCheckedConfirmed.has(i)) toAdd.push(e);
                    });
                    inferUnmatched.forEach((e, i) => {
                      if (inferCheckedUnmatched.has(i)) toAdd.push(e);
                    });
                    if (toAdd.length > 0) {
                      setEntityMappings([...entityMappings, ...toAdd]);
                    }
                    setInferModalOpen(false);
                    setWarning(`已添加 ${toAdd.length} 个客商（${inferCheckedConfirmed.size} 自动匹配 + ${inferCheckedUnmatched.size} 待手动）`);
                  }}
                >
                  确认添加
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
