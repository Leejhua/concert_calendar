'use client';

import { useState } from 'react';
import { format, isValid } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Project, ProjectStage, ProjectPriority, Contact } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Phone,
  Mail,
  MessageCircle,
  Building2,
  StickyNote,
  Plus,
  Trash2,
  CalendarDays,
  Clock,
  DollarSign,
} from 'lucide-react';

interface ProjectDetailPanelProps {
  project: Project | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (projectId: string, updates: Record<string, string | number | null>) => Promise<void>;
  onAddFollowUp: (projectId: string, content: string, followUpDate: string | null) => Promise<void>;
  onAddContact: (data: { name: string; role?: string; phone?: string; email?: string; wechat?: string; company?: string }) => Promise<Contact | null>;
  onDeleteContact: (id: string) => Promise<void>;
  contacts: Contact[];
  updating: boolean;
}

const STAGE_OPTIONS: { value: ProjectStage; label: string }[] = [
  { value: 'planning', label: '规划中' },
  { value: 'outreach', label: '接洽中' },
  { value: 'quoted', label: '已报价' },
  { value: 'confirmed', label: '已确认' },
  { value: 'execution', label: '执行中' },
  { value: 'review', label: '复盘中' },
];

const PRIORITY_OPTIONS: { value: ProjectPriority; label: string }[] = [
  { value: 'low', label: '低' },
  { value: 'normal', label: '普通' },
  { value: 'high', label: '高' },
];

export function ProjectDetailPanel({
  project,
  open,
  onClose,
  onUpdate,
  onAddFollowUp,
  onAddContact,
  onDeleteContact,
  contacts,
  updating,
}: ProjectDetailPanelProps) {
  const [followUpContent, setFollowUpContent] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [addingFollowUp, setAddingFollowUp] = useState(false);
  const [showContactDialog, setShowContactDialog] = useState(false);

  if (!project) return null;

  async function handleAddFollowUp() {
    if (!followUpContent.trim()) return;
    setAddingFollowUp(true);
    try {
      await onAddFollowUp(project!.id, followUpContent.trim(), followUpDate || null);
      setFollowUpContent('');
      setFollowUpDate('');
    } finally {
      setAddingFollowUp(false);
    }
  }

  function handleStageChange(stage: string) {
    onUpdate(project!.id, { stage });
  }

  function handlePriorityChange(priority: string) {
    onUpdate(project!.id, { priority });
  }

  function handleOwnerBlur(e: React.FocusEvent<HTMLInputElement>) {
    const value = e.target.value.trim();
    if (value !== project!.owner) {
      onUpdate(project!.id, { owner: value });
    }
  }

  return (
    <Sheet open={open} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="space-y-4">
          <SheetTitle className="text-lg">{project.title}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Stage & Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">阶段</label>
              <Select value={project.stage} onValueChange={handleStageChange} disabled={updating}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">优先级</label>
              <Select value={project.priority} onValueChange={handlePriorityChange} disabled={updating}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Owner */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">负责人</label>
            <Input
              className="h-9"
              defaultValue={project.owner}
              placeholder="输入负责人姓名"
              onBlur={handleOwnerBlur}
              disabled={updating}
            />
          </div>

          {/* Quote */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <DollarSign className="h-3 w-3" /> 报价信息
            </label>
            <div className="flex gap-2">
              <Input
                className="h-9 flex-1"
                placeholder="报价金额"
                defaultValue={project.quoteAmount != null ? String(project.quoteAmount) : ''}
                onBlur={(e) => {
                  const val = e.target.value.trim();
                  const num = val ? parseFloat(val) : null;
                  if ((num != null ? num : null) !== (project!.quoteAmount != null ? project!.quoteAmount : null)) {
                    onUpdate(project!.id, { quoteAmount: num });
                  }
                }}
                disabled={updating}
              />
              <Select
                value={project.quoteStatus || ''}
                onValueChange={(v) => onUpdate(project!.id, { quoteStatus: v || null })}
                disabled={updating}
              >
                <SelectTrigger className="h-9 w-28">
                  <SelectValue placeholder="状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">草稿</SelectItem>
                  <SelectItem value="sent">已发送</SelectItem>
                  <SelectItem value="negotiating">洽谈中</SelectItem>
                  <SelectItem value="accepted">已接受</SelectItem>
                  <SelectItem value="rejected">已拒绝</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <StickyNote className="h-3 w-3" /> 备注
            </label>
            <Textarea
              className="min-h-[80px]"
              defaultValue={project.notes}
              placeholder="项目备注..."
              onBlur={(e) => {
                if (e.target.value !== project!.notes) {
                  onUpdate(project!.id, { notes: e.target.value });
                }
              }}
              disabled={updating}
            />
          </div>

          {/* Follow-ups */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">跟进记录</label>
              <span className="text-[10px] text-muted-foreground">{project.followUps?.length || 0} 条</span>
            </div>

            <div className="space-y-2">
              {project.followUps?.length === 0 && (
                <p className="text-xs text-muted-foreground">暂无跟进记录</p>
              )}
              {project.followUps?.map((fu) => (
                <div key={fu.id} className="rounded-lg border bg-muted/20 px-3 py-2">
                  <p className="text-sm">{fu.content}</p>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                    {fu.followUpDate && <span className="flex items-center gap-1"><CalendarDays className="h-2.5 w-2.5" />{fu.followUpDate}</span>}
                    <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" />{formatFollowUpTime(fu.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <Textarea
                className="min-h-[60px] text-sm"
                placeholder="添加跟进记录..."
                value={followUpContent}
                onChange={(e) => setFollowUpContent(e.target.value)}
                disabled={addingFollowUp}
              />
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  className="h-8 w-36 text-xs"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                />
                <Button size="sm" className="h-8" onClick={handleAddFollowUp} disabled={addingFollowUp || !followUpContent.trim()}>
                  {addingFollowUp ? '添加中...' : '添加'}
                </Button>
              </div>
            </div>
          </div>

          {/* Contacts */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">联系人</label>
              <Dialog open={showContactDialog} onOpenChange={setShowContactDialog}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="h-7 text-xs">
                    <Plus className="mr-1 h-3 w-3" /> 添加
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>添加联系人</DialogTitle>
                  </DialogHeader>
                  <ContactForm
                    onSubmit={async (data) => {
                      const contact = await onAddContact(data);
                      if (contact) setShowContactDialog(false);
                    }}
                  />
                </DialogContent>
              </Dialog>
            </div>

            <div className="space-y-2">
              {contacts.length === 0 && (
                <p className="text-xs text-muted-foreground">暂无联系人，点击上方按钮添加</p>
              )}
              {contacts.map((contact) => (
                <div key={contact.id} className="flex items-start justify-between rounded-lg border bg-muted/20 px-3 py-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{contact.name}</span>
                      {contact.role && <Badge variant="secondary" className="text-[10px]">{contact.role}</Badge>}
                    </div>
                    {contact.company && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Building2 className="h-2.5 w-2.5" /> {contact.company}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                      {contact.phone && (
                        <span className="flex items-center gap-1"><Phone className="h-2.5 w-2.5" />{contact.phone}</span>
                      )}
                      {contact.email && (
                        <span className="flex items-center gap-1"><Mail className="h-2.5 w-2.5" />{contact.email}</span>
                      )}
                      {contact.wechat && (
                        <span className="flex items-center gap-1"><MessageCircle className="h-2.5 w-2.5" />{contact.wechat}</span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => onDeleteContact(contact.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ContactForm({ onSubmit }: { onSubmit: (data: { name: string; role?: string; phone?: string; email?: string; wechat?: string; company?: string }) => Promise<void> }) {
  const [formData, setFormData] = useState({ name: '', role: '', phone: '', email: '', wechat: '', company: '' });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.name.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        name: formData.name.trim(),
        role: formData.role.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        email: formData.email.trim() || undefined,
        wechat: formData.wechat.trim() || undefined,
        company: formData.company.trim() || undefined,
      });
    } finally {
      setSubmitting(false);
    }
  }

  const fields = [
    { key: 'name', label: '姓名 *', placeholder: '联系人姓名' },
    { key: 'role', label: '角色', placeholder: '如：经纪人、主办方' },
    { key: 'company', label: '公司', placeholder: '公司名称' },
    { key: 'phone', label: '电话', placeholder: '手机号' },
    { key: 'email', label: '邮箱', placeholder: 'email@example.com' },
    { key: 'wechat', label: '微信', placeholder: '微信号' },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {fields.map((f) => (
        <div key={f.key} className="space-y-1">
          <label className="text-xs text-muted-foreground">{f.label}</label>
          <Input
            className="h-9"
            placeholder={f.placeholder}
            value={(formData as Record<string, string>)[f.key]}
            onChange={(e) => setFormData((prev) => ({ ...prev, [f.key]: e.target.value }))}
          />
        </div>
      ))}
      <Button type="submit" className="w-full" disabled={submitting || !formData.name.trim()}>
        {submitting ? '添加中...' : '添加联系人'}
      </Button>
    </form>
  );
}

function formatFollowUpTime(ts: number) {
  if (!ts) return '';
  const date = new Date(ts);
  if (!isValid(date)) return '';
  return format(date, 'MM-dd HH:mm', { locale: zhCN });
}
