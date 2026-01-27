import { Concert } from '@/lib/damai-crawler';
import { CalendarEvent } from '@/lib/types';
import { parse, isValid, addMinutes, format } from 'date-fns';

export function transformConcertsToEvents(concerts: Concert[]): CalendarEvent[] {
  return concerts.map(concert => {
    // 1. 提取日期部分 "2024.05.17"
    const datePart = concert.date.split(' ')[0].split('-')[0];
    
    // 2. 尝试提取时间部分 (HH:mm)
    const timeMatch = concert.date.match(/(\d{2}:\d{2})/);
    const timePart = timeMatch ? timeMatch[1] : null;

    // 3. 解析基础日期
    let startDate = parse(datePart, 'yyyy.MM.dd', new Date());
    
    if (!isValid(startDate)) {
       startDate = new Date(); 
    }

    // 4. 如果有时间，设置具体时间
    if (timePart) {
        const [hours, minutes] = timePart.split(':').map(Number);
        startDate.setHours(hours, minutes, 0, 0);
    } else {
        // 如果没有时间，默认设为 19:30
        startDate.setHours(19, 30, 0, 0);
    }

    // 默认时长 3 小时 (不影响显示高度，只影响时间段逻辑)
    // 注意：CSS 会强制最小高度
    const endDate = addMinutes(startDate, 180);

    return {
      id: concert.id,
      title: concert.title,
      start: startDate,
      end: endDate,
      allDay: false,
      resource: concert
    };
  }).filter(event => isValid(event.start));
}
