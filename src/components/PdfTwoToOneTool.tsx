import { useState, useRef, useCallback } from 'react';
import { PDFDocument } from 'pdf-lib';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Upload, Trash2, FileText, ArrowDown } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

interface PdfFile {
  id: string;
  file: File;
  name: string;
  size: number;
  pages: number;
  arrayBuffer: ArrayBuffer;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

type LayoutMode = 'side-by-side' | 'stacked';

export default function PdfTwoToOneTool({ sidebarCollapsed = false }: { sidebarCollapsed?: boolean }) {
  const [files, setFiles] = useState<PdfFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [layout, setLayout] = useState<LayoutMode>('side-by-side');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [toast, setToast] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(''), 2500);
  }, []);

  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList) return;
    const pdfFiles = Array.from(fileList).filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    if (!pdfFiles.length) { showToast('请选择 PDF 文件'); return; }

    const newFiles: PdfFile[] = [];
    for (const file of pdfFiles) {
      const id = 'f_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      const ab = await file.arrayBuffer();
      let pages = 0;
      try {
        const tmp = await PDFDocument.load(ab);
        pages = tmp.getPageCount();
      } catch (e) {
        console.warn('读取页数失败', e);
      }
      newFiles.push({
        id, file, name: file.name, size: file.size, pages,
        arrayBuffer: ab,
      });
    }
    setFiles((prev) => [...prev, ...newFiles]);
    showToast(`已添加 ${pdfFiles.length} 个文件`);
  }, [showToast]);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    if (!files.length) return;
    if (!confirm('确定清除所有文件？')) return;
    setFiles([]);
    showToast('已清除全部文件');
  }, [files.length, showToast]);

  const sortByName = useCallback(() => {
    setFiles((prev) => [...prev].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })));
    showToast('已按文件名排序');
  }, [showToast]);

  const processFiles = useCallback(async () => {
    if (files.length === 0) { showToast('请至少添加一个文件'); return; }
    setProcessing(true);
    setProgress({ current: 0, total: files.length });

    try {
      for (let fi = 0; fi < files.length; fi++) {
        const item = files[fi];
        const srcPdf = await PDFDocument.load(item.arrayBuffer.slice(0));
        const outPdf = await PDFDocument.create();
        const srcPages = srcPdf.getPages();
        const totalPages = srcPages.length;

        for (let i = 0; i < totalPages; i += 2) {
          const page1 = srcPages[i];
          const page2 = srcPages[i + 1];

          const { width: w1, height: h1 } = page1.getSize();
          const w2 = page2 ? page2.getSize().width : 0;
          const h2 = page2 ? page2.getSize().height : 0;

          let newPage: any;

          if (layout === 'side-by-side') {
            // 左右并排
            const newWidth = w1 + w2;
            const newHeight = Math.max(h1, h2);
            newPage = outPdf.addPage([newWidth, newHeight]);

            const embedded1 = await outPdf.embedPage(page1);
            newPage.drawPage(embedded1, {
              x: 0, y: 0, width: w1, height: h1,
            });

            if (page2) {
              const embedded2 = await outPdf.embedPage(page2);
              newPage.drawPage(embedded2, {
                x: w1, y: 0, width: w2, height: h2,
              });
            }
          } else {
            // 上下堆叠
            const newWidth = Math.max(w1, w2);
            const newHeight = h1 + h2;
            newPage = outPdf.addPage([newWidth, newHeight]);

            const embedded1 = await outPdf.embedPage(page1);
            newPage.drawPage(embedded1, {
              x: 0, y: h2, width: w1, height: h1,
            });

            if (page2) {
              const embedded2 = await outPdf.embedPage(page2);
              newPage.drawPage(embedded2, {
                x: 0, y: 0, width: w2, height: h2,
              });
            }
          }
        }

        // 输出：保留原文件名，加 _2to1 后缀
        const baseName = item.name.replace(/\.pdf$/i, '');
        const outName = `${baseName}_2to1.pdf`;
        const bytes = await outPdf.save();
        const blob = new Blob([bytes as unknown as ArrayBuffer], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = outName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);

        setProgress({ current: fi + 1, total: files.length });
      }

      showToast(`已完成 ${files.length} 个文件处理`);
    } catch (err: any) {
      console.error(err);
      showToast('处理失败：' + err.message);
    } finally {
      setProcessing(false);
    }
  }, [files, layout, showToast]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6 pb-24">
      {/* 上传区域 */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
          dragOver ? 'border-primary/60 bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-background'
        }`}
      >
        <Upload className={`w-12 h-12 mx-auto mb-3 animate-float ${dragOver ? 'text-primary/70' : 'text-muted-foreground'}`} />
        <h3 className="text-base font-medium text-foreground mb-1">拖放 PDF 文件至此，或点击选择</h3>
        <p className="text-sm text-muted-foreground">每2页合并为1页，保留原文件名输出。所有处理均在浏览器本地完成。</p>
        <input ref={fileInputRef} type="file" accept=".pdf" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
      </div>

      {files.length > 0 && (
        <>
          {/* 工具栏 */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-card rounded-lg border">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={sortByName}>
                <ArrowDown className="w-3.5 h-3.5 mr-1" />
                按名称排序
              </Button>
              <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={clearAll}>
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                清除全部
              </Button>
            </div>
            <div className="flex items-center gap-6">
              {/* 布局模式选择 + 预览 */}
              <RadioGroup
                value={layout}
                onValueChange={(v) => setLayout(v as LayoutMode)}
                className="flex items-center gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="side-by-side" id="side" />
                  <Label htmlFor="side" className="text-sm cursor-pointer">左右并排</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="stacked" id="stack" />
                  <Label htmlFor="stack" className="text-sm cursor-pointer">上下堆叠</Label>
                </div>
              </RadioGroup>

              {/* 实时预览小图 */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">预览：</span>
                {layout === 'side-by-side' ? (
                  <div className="w-16 h-10 bg-muted rounded border flex gap-0.5 p-0.5" title="左右并排">
                    <div className="flex-1 bg-card border shadow-sm" />
                    <div className="flex-1 bg-card border shadow-sm" />
                  </div>
                ) : (
                  <div className="w-10 h-14 bg-muted rounded border flex flex-col gap-0.5 p-0.5" title="上下堆叠">
                    <div className="flex-1 bg-card border shadow-sm" />
                    <div className="flex-1 bg-card border shadow-sm" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 文件列表 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {files.map((item) => (
              <Card key={item.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <FileText className="w-4 h-4 text-primary/70 mt-0.5 shrink-0" />
                    <span className="text-sm font-medium truncate flex-1" title={item.name}>{item.name}</span>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeFile(item.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-500" />
                    </Button>
                  </div>
                  {/* 布局预览 */}
                  <div className="aspect-[1/1.414] bg-muted rounded border overflow-hidden p-2">
                    {layout === 'side-by-side' ? (
                      /* 左右并排预览 */
                      <div className="w-full h-full flex gap-1">
                        <div className="flex-1 bg-card rounded-sm border shadow-sm flex flex-col items-center justify-center p-1">
                          <div className="w-full h-2/3 bg-gradient-to-b from-gray-100 to-gray-200 rounded-sm" />
                          <span className="text-[8px] text-muted-foreground mt-1">第1页</span>
                        </div>
                        <div className="flex-1 bg-card rounded-sm border shadow-sm flex flex-col items-center justify-center p-1">
                          <div className="w-full h-2/3 bg-gradient-to-b from-gray-200 to-gray-300 rounded-sm" />
                          <span className="text-[8px] text-muted-foreground mt-1">第2页</span>
                        </div>
                      </div>
                    ) : (
                      /* 上下堆叠预览 */
                      <div className="w-full h-full flex flex-col gap-1">
                        <div className="flex-1 bg-card rounded-sm border shadow-sm flex flex-col items-center justify-center p-1">
                          <div className="w-full h-2/3 bg-gradient-to-b from-gray-100 to-gray-200 rounded-sm" />
                          <span className="text-[8px] text-muted-foreground mt-0.5">第1页</span>
                        </div>
                        <div className="flex-1 bg-card rounded-sm border shadow-sm flex flex-col items-center justify-center p-1">
                          <div className="w-full h-2/3 bg-gradient-to-b from-gray-200 to-gray-300 rounded-sm" />
                          <span className="text-[8px] text-muted-foreground mt-0.5">第2页</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{formatSize(item.size)}</span>
                    <Badge variant="outline" className="text-xs">
                      {item.pages % 2 === 1 ? '奇数页' : '偶数页'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {files.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground/60 animate-float" />
          <p className="text-sm">暂无文件，请拖放或选择 PDF</p>
        </div>
      )}

      {/* 底部操作栏 */}
      {files.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50">
          <div className={`flex items-center justify-between gap-4 p-4 bg-card border-t shadow-[0_-4px_20px_rgba(0,0,0,0.08)] ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
            <span className="text-sm text-muted-foreground">
              已选 <strong className="text-foreground">{files.length}</strong> 个文件
              {processing && (
                <span className="ml-2">（{progress.current}/{progress.total}）</span>
              )}
            </span>
            {processing && (
              <div className="flex items-center gap-3 flex-1 max-w-md">
                <Progress value={(progress.current / progress.total) * 100} className="flex-1" />
              </div>
            )}
            <Button size="lg" onClick={processFiles} disabled={processing || files.length === 0}>
              {processing ? '处理中...' : '开始处理并下载'}
            </Button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-5 py-2.5 rounded-lg text-sm shadow-lg z-[60]">
          {toast}
        </div>
      )}
    </div>
  );
}
