import { useState, useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { reconcile } from '@/engine/reconciliation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Calculator, ArrowRight, ArrowLeft, CheckCircle, RefreshCw } from 'lucide-react';

export function ReconcilePage() {
  const rawData = useAppStore(s => s.rawData);
  const subjectMappings = useAppStore(s => s.subjectMappings);
  const entityMappings = useAppStore(s => s.entityMappings);
  const setReconResult = useAppStore(s => s.setReconResult);
  const setStep = useAppStore(s => s.setStep);
  const setIsProcessing = useAppStore(s => s.setIsProcessing);
  const isProcessing = useAppStore(s => s.isProcessing);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [done, setDone] = useState(false);

  const handleReconcile = useCallback(async () => {
    setIsProcessing(true);
    setProgress(5);
    setStatusText('正在清洗数据...');
    setDone(false);

    try {
      // reconcile 已改为异步，每处理一个利润中心对就让渡主线程
      // onProgress 回调实时更新进度条（10% ~ 90%）
      const result = await reconcile(
        rawData,
        subjectMappings,
        entityMappings,
        (done, total) => {
          const pct = total > 0 ? Math.round(10 + (done / total) * 80) : 10;
          setProgress(pct);
          setStatusText(`核对中… ${done} / ${total} 组`);
        }
      );

      setProgress(100);
      setStatusText(`核对完成！共 ${result.统计.总组数} 组，${result.统计.对符组数} 组对符，${result.统计.未对符组数} 组未对符`);
      setReconResult(result);
      setDone(true);
    } catch (err: any) {
      setStatusText(`核对失败：${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [rawData, subjectMappings, entityMappings]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-foreground mb-2">执行核对</h1>
      <p className="text-muted-foreground mb-6">
        系统将自动完成：数据清洗 → 映射过滤 → 利润中心配对分组 → 零值核对 → M:N 明细核对
      </p>

      <div className="space-y-6">
        {/* 核对参数确认 */}
        <Card>
          <CardHeader>
            <CardTitle>核对参数确认</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-primary/5 rounded-lg">
                <div className="text-sm text-primary mb-1">明细账记录数</div>
                <div className="text-2xl font-bold text-primary/90">{rawData.length.toLocaleString()}</div>
              </div>
              <div className="p-4 bg-primary/5 rounded-lg">
                <div className="text-sm text-primary mb-1">参与核对的科目数</div>
                <div className="text-2xl font-bold text-primary/90">{subjectMappings.length}</div>
              </div>
              <div className="p-4 bg-secondary rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">参与核对的内部客商数</div>
                <div className="text-2xl font-bold text-foreground">{entityMappings.length}</div>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">预计核对组数</div>
                <div className="text-2xl font-bold text-foreground">
                  ~{Math.min(entityMappings.length * (entityMappings.length - 1) / 2, rawData.length)}
                </div>
              </div>
            </div>

            <Separator className="my-4" />

            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-primary/70" />
                数据安全：所有计算在浏览器本地完成，数据不会离开本机
              </p>
              <p className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-primary/70" />
                核对逻辑：先尝试整组零值对符，再进行 M:N 子集匹配
              </p>
              <p className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-primary/70" />
                浮点精度：使用 0.01 容差处理货币计算
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 执行按钮和进度 */}
        <Card>
          <CardContent className="pt-6">
            {!done ? (
              <div className="text-center py-6">
                <Button
                  size="lg"
                  onClick={handleReconcile}
                  disabled={isProcessing}
                  className="min-w-[200px] h-14 text-lg"
                >
                  {isProcessing ? (
                    <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                  ) : (
                    <Calculator className="w-5 h-5 mr-2" />
                  )}
                  {isProcessing ? '核对中...' : '开始核对'}
                </Button>

                {isProcessing && (
                  <div className="mt-6 space-y-3">
                    <Progress value={progress} className="w-full" />
                    <p className="text-sm text-muted-foreground">{statusText}</p>
                    <p className="text-xs text-muted-foreground">
                      M:N 子集匹配算法时间复杂度较高，大数据量请耐心等待...
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-6">
                <Alert className="mb-4 bg-primary/5 border-primary/20">
                  <CheckCircle className="h-4 w-4 text-primary" />
                  <AlertDescription className="text-primary">{statusText}</AlertDescription>
                </Alert>
                <div className="flex gap-3 justify-center">
                  <Button
                    size="lg"
                    onClick={() => setStep('结果')}
                    className="min-w-[160px]"
                  >
                    查看核对结果
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => {
                      setDone(false);
                      setProgress(0);
                      setStatusText('');
                    }}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    重新核对
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-between mt-8">
        <Button variant="outline" size="lg" onClick={() => setStep('映射')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          上一步
        </Button>
      </div>
    </div>
  );
}
