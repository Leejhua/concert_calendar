import { addDays, format, isValid, parseISO } from 'date-fns';

export const DEFAULT_PROJECT_TASKS = [
  { title: '初步接洽', offsetDays: -60 },
  { title: '需求确认', offsetDays: -45 },
  { title: '方案内部确认', offsetDays: -30 },
  { title: '物料与执行准备', offsetDays: -14 },
  { title: '执行复核', offsetDays: -7 },
  { title: '最终确认', offsetDays: -1 },
  { title: '演出执行', offsetDays: 0 },
  { title: '复盘跟进', offsetDays: 1 },
];

export function buildProjectTasks(concertDate: string | null) {
  const baseDate = concertDate ? parseISO(concertDate) : null;

  return DEFAULT_PROJECT_TASKS.map((item, index) => ({
    title: item.title,
    relativeOffsetDays: item.offsetDays,
    sortOrder: index,
    dueDate: baseDate && isValid(baseDate) ? format(addDays(baseDate, item.offsetDays), 'yyyy-MM-dd') : null,
  }));
}
