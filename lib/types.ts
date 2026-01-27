
import { Concert } from '@/lib/damai-crawler';

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  resource: Concert; // 原始数据
}
