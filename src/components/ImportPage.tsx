import { useState, useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { parseLedgerExcel, parseMappingExcel } from '@/utils/excelParser';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function ImportPage() {
  const { setRawData, setSubjectMappings, setEntityMappings, setStep } = useAppStore();
  const [ledgerFile, setLedgerFile] = useState<File | null>(null);
  const [mappingFile, setMappingFile] = useState<File | null>(null);
  const [ledgerPreview, setLedgerPreview] = useState<number>(0);
  const [mappingPreview, setMappingPreview] = useState<{ subjects: number; entities: number }>({ subjects: 0, entities: 0 });
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  const handleLedgerDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      handleLedgerFile(file);
    }
  }, []);

  const handleLedgerFile = async (file: File) => {
    setLedgerFile(file);
    setError('');
    try {
      const buffer = await file.arrayBuffer();
      const data = parseLedgerExcel(buffer);
      setRawData(data);
      setLedgerPreview(data.length);
      setSuccess(`成功导入明细账：${data.length} 行记录`);
    } catch (err: any) {
      setError(`明细账解析失败：${err.message}`);
      setLedgerFile(null);
    }
  };

  const handleMappingDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      handleMappingFile(file);
    }
  }, []);

  const handleMappingFile = async (file: File) => {
    setMappingFile(file);
    setError('');
    try {
      const buffer = await file.arrayBuffer();
      const { subjects, entities } = parseMappingExcel(buffer);
      setSubjectMappings(subjects);
      setEntityMappings(entities);
      setMappingPreview({ subjects: subjects.length, entities: entities.length });
      setSuccess((prev) => `${prev}；映射表导入成功：${subjects.length} 个科目，${entities.length} 个内部客商`);
    } catch (err: any) {
      setError(`映射表解析失败：${err.message}`);
      setMappingFile(null);
    }
  };

  const handleContinue = () => {
    if (ledgerPreview === 0) {
      setError('请先导入明细账');
      return;
    }
    setStep('映射');
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">数据导入</h1>
      <p className="text-gray-500 mb-6">请先导入明细账和映射表，数据仅在浏览器本地处理，不会上传到任何服务器。</p>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="mb-4 bg-green-50 border-green-200">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-700">{success}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* 明细账导入 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-blue-600" />
              导入明细账
              <span className="text-red-500 text-sm">*</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              onDrop={handleLedgerDrop}
              onDragOver={(e) => e.preventDefault()}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                ledgerFile
                  ? 'border-green-400 bg-green-50'
                  : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
              }`}
            >
              {ledgerFile ? (
                <div className="space-y-2">
                  <CheckCircle className="w-10 h-10 text-green-500 mx-auto" />
                  <p className="font-medium text-gray-900">{ledgerFile.name}</p>
                  <p className="text-sm text-green-600">{ledgerPreview.toLocaleString()} 行记录</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setLedgerFile(null);
                      setLedgerPreview(0);
                      setRawData([]);
                    }}
                  >
                    重新导入
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Upload className="w-10 h-10 text-gray-400 mx-auto" />
                  <div>
                    <p className="text-gray-600">拖拽文件到此处，或</p>
                    <label className="text-blue-600 hover:text-blue-800 cursor-pointer font-medium">
                      点击选择文件
                      <input
                        type="file"
                        accept=".xlsx,.xls"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleLedgerFile(file);
                        }}
                      />
                    </label>
                  </div>
                  <p className="text-xs text-gray-400">支持 .xlsx, .xls 格式</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 映射表导入 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-purple-600" />
              导入映射表
              <span className="text-gray-400 text-sm font-normal ml-auto">（可选，可手动维护）</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              onDrop={handleMappingDrop}
              onDragOver={(e) => e.preventDefault()}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                mappingFile
                  ? 'border-green-400 bg-green-50'
                  : 'border-gray-300 hover:border-purple-400 hover:bg-purple-50'
              }`}
            >
              {mappingFile ? (
                <div className="space-y-2">
                  <CheckCircle className="w-10 h-10 text-green-500 mx-auto" />
                  <p className="font-medium text-gray-900">{mappingFile.name}</p>
                  <p className="text-sm text-green-600">
                    {mappingPreview.subjects} 个科目 / {mappingPreview.entities} 个客商
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setMappingFile(null);
                      setMappingPreview({ subjects: 0, entities: 0 });
                      setSubjectMappings([]);
                      setEntityMappings([]);
                    }}
                  >
                    重新导入
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Upload className="w-10 h-10 text-gray-400 mx-auto" />
                  <div>
                    <p className="text-gray-600">拖拽文件到此处，或</p>
                    <label className="text-purple-600 hover:text-purple-800 cursor-pointer font-medium">
                      点击选择文件
                      <input
                        type="file"
                        accept=".xlsx,.xls"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleMappingFile(file);
                        }}
                      />
                    </label>
                  </div>
                  <p className="text-xs text-gray-400">支持 .xlsx, .xls 格式</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button
          size="lg"
          onClick={handleContinue}
          disabled={ledgerPreview === 0}
          className="min-w-[160px]"
        >
          下一步：维护映射
          <Upload className="w-4 h-4 ml-2 rotate-90" />
        </Button>
      </div>
    </div>
  );
}
