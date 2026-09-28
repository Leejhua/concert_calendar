import { differenceInCalendarDays, format, isValid, parseISO, startOfDay } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getConcertDisplayTitle } from '@/lib/concert-identity';
import { Project, ProjectTask, ProjectTaskStatus } from '@/lib/types';
import { CalendarDays, CheckCircle2, Clock, MapPin, Pencil, User } from 'lucide-react';

interface ProjectListProps {
  projects: Project[];
  updatingTaskId: string | null;
  onTaskStatusChange: (projectId: string, taskId: string, nextStatus: ProjectTaskStatus) => void;
  onProjectClick: (project: Project) => void;
}

const TASK_STATUS_LABEL: Record<ProjectTaskStatus, string> = {
  todo: '待办',
  in_progress: '进行中',
  done: '已完成',
  skipped: '跳过',
};

export function ProjectList({ projects, updatingTaskId, onTaskStatusChange, onProjectClick }: ProjectListProps) {
  if (projects.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-background p-8 text-center text-muted-foreground">
        还没有项目。先在商机看板里选择高潜演出并点击“转项目”。
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {projects.map((project) => {
        const nextTask = getNextTask(project.tasks);
        const doneCount = project.tasks.filter((task) => task.status === 'done').length;

        return (
          <Card key={project.id} className="overflow-hidden">
            <CardHeader className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary">{getStageLabel(project.stage)}</Badge>
                    <Badge variant="outline">{doneCount}/{project.tasks.length} 节点完成</Badge>
                    {project.nextFollowUpAt && isFollowUpOverdue(project.nextFollowUpAt) && (
                      <Badge variant="destructive" className="text-[10px]">跟进逾期</Badge>
                    )}
                  </div>
                  <CardTitle className="line-clamp-2 text-lg">{getConcertDisplayTitle({ title: project.title, artist: project.artist, artistPrimary: project.artist, artistAll: project.artist ? [project.artist] : [] })}</CardTitle>
                </div>
                <div className="flex items-center gap-1">
                  {nextTask && <TaskTimingBadge task={nextTask} />}
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onProjectClick(project)} title="项目详情">
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" />
                  <span>{project.concertDate || '未识别日期'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  <span className="truncate">{project.city}{project.venue ? ` · ${project.venue}` : ''}</span>
                </div>
                {project.artist && (
                  <div className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    <span>{project.artist}</span>
                  </div>
                )}
                {project.owner && (
                  <div className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    <span>{project.owner}</span>
                  </div>
                )}
                {project.nextFollowUpAt && (
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    <span className={isFollowUpOverdue(project.nextFollowUpAt) ? 'text-destructive font-medium' : ''}>
                      下次跟进: {project.nextFollowUpAt}
                    </span>
                  </div>
                )}
              </div>
            </CardHeader>

            <CardContent>
              <div className="space-y-2">
                {project.tasks.map((task) => {
                  const isUpdating = updatingTaskId === task.id;
                  return (
                    <div key={task.id} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/10 px-3 py-2">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <TaskStatusDot status={task.status} />
                          <span className="truncate text-sm font-medium">{task.title}</span>
                          <Badge variant="outline" className="text-[10px]">{TASK_STATUS_LABEL[task.status]}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {task.dueDate ? formatTaskDate(task.dueDate) : '未设置日期'}
                        </div>
                      </div>

                      <div className="flex shrink-0 gap-1">
                        {task.status !== 'done' ? (
                          <Button size="sm" variant="outline" disabled={isUpdating} onClick={() => onTaskStatusChange(project.id, task.id, 'done')}>
                            完成
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" disabled={isUpdating} onClick={() => onTaskStatusChange(project.id, task.id, 'todo')}>
                            撤回
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function getNextTask(tasks: ProjectTask[]) {
  return tasks.find((task) => task.status !== 'done' && task.status !== 'skipped') || null;
}

function TaskTimingBadge({ task }: { task: ProjectTask }) {
  if (!task.dueDate) {
    return <Badge variant="outline">待排期</Badge>;
  }

  const date = parseISO(task.dueDate);
  if (!isValid(date)) {
    return <Badge variant="outline">待排期</Badge>;
  }

  const diff = differenceInCalendarDays(startOfDay(date), startOfDay(new Date()));
  if (diff < 0) {
    return <Badge variant="destructive">逾期 {Math.abs(diff)} 天</Badge>;
  }

  if (diff === 0) {
    return <Badge className="bg-amber-500 text-white hover:bg-amber-500">今天到期</Badge>;
  }

  if (diff <= 7) {
    return <Badge className="bg-blue-500 text-white hover:bg-blue-500">{diff} 天后</Badge>;
  }

  return <Badge variant="outline">{diff} 天后</Badge>;
}

function TaskStatusDot({ status }: { status: ProjectTaskStatus }) {
  if (status === 'done') {
    return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  }

  if (status === 'in_progress') {
    return <Clock className="h-4 w-4 text-blue-600" />;
  }

  return <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />;
}

function formatTaskDate(value: string) {
  const date = parseISO(value);
  if (!isValid(date)) return value;
  return format(date, 'yyyy年M月d日 EEEE', { locale: zhCN });
}

function getStageLabel(stage: Project['stage']) {
  switch (stage) {
    case 'planning':
      return '规划中';
    case 'outreach':
      return '接洽中';
    case 'quoted':
      return '已报价';
    case 'confirmed':
      return '已确认';
    case 'execution':
      return '执行中';
    case 'review':
      return '复盘中';
  }
}

function isFollowUpOverdue(dateStr: string | null) {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dateStr) < today;
}
