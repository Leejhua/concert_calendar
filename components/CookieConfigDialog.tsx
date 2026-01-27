import { useState } from 'react';
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
import { Settings } from "lucide-react";

export function CookieConfigDialog() {
  const [open, setOpen] = useState(false);
  const [curlCommand, setCurlCommand] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSync = async () => {
    if (!curlCommand.trim()) {
      toast.error("请输入 cURL 命令");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ curlCommand }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setOpen(false);
        toast.success("同步成功", {
          description: data.message,
          duration: Infinity, // Does not auto close
          action: {
            label: "关闭",
            onClick: () => console.log("Dismissed"),
          },
        });
        // Optional: Trigger a refresh of the calendar data?
        // The calendar page might need to re-fetch. 
        // For now, we just show the toast. The user can refresh the page manually or we can trigger a reload.
        setTimeout(() => {
           window.location.reload();
        }, 1500);
      } else {
        toast.error("同步失败", {
          description: data.message || "发生未知错误",
          duration: 5000,
        });
      }
    } catch (error) {
      toast.error("同步错误", {
        description: "网络或服务器错误",
        duration: 5000,
      });
    } finally {
      setLoading(false);
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
            <div className="space-y-2 mt-2">
              <p>请按照以下步骤获取 cURL 命令：</p>
              <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground">
                <li>在浏览器 (推荐 Chrome/Edge) 打开 <a href="https://m.damai.cn" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">大麦网 H5 首页 (m.damai.cn)</a></li>
                <li>按 <code className="bg-muted px-1 rounded">F12</code> 打开开发者工具，切换到 <strong>Network (网络)</strong> 面板</li>
                <li>在页面上点击“演唱会”分类，或刷新页面</li>
                <li>在 Network 面板的搜索框输入 <code className="bg-muted px-1 rounded">mtop.damai.mec.aristotle.get</code></li>
                <li>右键点击第一个匹配的请求 -&gt; <strong>Copy</strong> -&gt; <strong>Copy as cURL (bash)</strong></li>
                <li>将复制的内容粘贴到下方文本框中</li>
              </ol>
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <textarea
            className="flex min-h-[150px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
            placeholder="curl 'https://mtop.damai.cn/...' -H 'cookie: ...'"
            value={curlCommand}
            onChange={(e) => setCurlCommand(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button type="submit" onClick={handleSync} disabled={loading}>
            {loading ? "同步中..." : "开始同步"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
