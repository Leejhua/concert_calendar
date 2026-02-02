import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Settings, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useSync } from "@/contexts/SyncContext";

export function CookieConfigDialog() {
  const [open, setOpen] = useState(false);
  const [curlCommand, setCurlCommand] = useState('');
  const { status, startSync } = useSync();
  
  const isSyncing = status.status === 'running';

  const handleSync = async () => {
    if (!curlCommand.trim()) {
      toast.error("请输入 cURL 命令");
      return;
    }

    try {
      await startSync(curlCommand);
    } catch (error) {
      // Error is already toasted by context
    }
  };

  const handleAutoSync = async () => {
    try {
      await startSync();
    } catch (error) {
      // Error is already toasted by context
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" title="配置 Cookie 并同步">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>更新数据</DialogTitle>
          <DialogDescription>
            {!isSyncing && (
                <div className="space-y-2 mt-2">
                  <p>您可以使用自动同步功能，无需手动输入 cURL 命令。</p>
                  <p>如果自动同步失败，请尝试手动同步：</p>
                  <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground">
                    <li>在浏览器 (推荐 Chrome/Edge) 打开 <a href="https://m.damai.cn" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">大麦网 H5 首页 (m.damai.cn)</a></li>
                    <li>按 <code className="bg-muted px-1 rounded">F12</code> 打开开发者工具，切换到 <strong>Network (网络)</strong> 面板</li>
                    <li>在页面上点击“演唱会”分类，或刷新页面</li>
                    <li>在 Network 面板的搜索框输入 <code className="bg-muted px-1 rounded">mtop.damai.mec.aristotle.get</code></li>
                    <li>右键点击第一个匹配的请求 -&gt; <strong>Copy</strong> -&gt; <strong>Copy as cURL (bash)</strong></li>
                    <li>将复制的内容粘贴到下方文本框中</li>
                  </ol>
                </div>
            )}
          </DialogDescription>
        </DialogHeader>
        
        {isSyncing ? (
             <div className="space-y-6 py-6">
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm font-medium">
                        <span>{status.message || '正在初始化...'}</span>
                        <span>{status.progress}%</span>
                    </div>
                    <Progress value={status.progress} className="w-full h-2" />
                </div>
                
                <div className="bg-muted/30 p-4 rounded-lg text-sm text-muted-foreground border">
                    <p className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        同步正在后台运行...
                    </p>
                    <p className="mt-2 text-xs">
                        您可以安全地关闭此窗口，同步过程不会中断。
                        <br/>
                        任务完成后，您将收到系统通知。
                    </p>
                </div>
            </div>
        ) : (
            <div className="grid gap-4 py-2">
              <textarea
                className="flex min-h-[150px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                placeholder="curl 'https://mtop.damai.cn/...' -H 'cookie: ...'"
                value={curlCommand}
                onChange={(e) => setCurlCommand(e.target.value)}
              />
            </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {isSyncing ? (
             <Button variant="outline" onClick={() => setOpen(false)}>
                后台运行 (关闭窗口)
             </Button>
          ) : (
              <>
                  <Button variant="secondary" onClick={handleAutoSync}>
                    自动同步 (免登录)
                  </Button>
                  <Button type="submit" onClick={handleSync}>
                    手动同步
                  </Button>
              </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
