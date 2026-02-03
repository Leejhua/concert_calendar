import { Concert } from '@/lib/damai-crawler';
import { CalendarEvent } from '@/lib/types';
import { parse, isValid, addMinutes, format } from 'date-fns';

export function transformConcertsToEvents(concerts: Concert[]): CalendarEvent[] {
  return concerts.map(concert => {
    // 1. 提取日期部分
    // 支持 "2026-04-11", "2026.04.11", "2026/04/11", "2026.04.11-04.12" 等格式
    // 优先使用正则提取 YYYY-MM-DD 或 YYYY.MM.DD 或 YYYY/MM/DD
    const dateMatch = concert.date.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    
    let startDate = new Date();
    let isValidDate = false;

    if (dateMatch) {
        const year = parseInt(dateMatch[1]);
        const month = parseInt(dateMatch[2]) - 1; // JS months are 0-indexed
        const day = parseInt(dateMatch[3]);
        startDate = new Date(year, month, day);
        isValidDate = isValid(startDate);
    } else {
        console.warn(`[DataTransformer] Failed to parse date: "${concert.date}" (ID: ${concert.id}). Defaulting to NOW.`);
    }

    if (!isValidDate) {
        // Fallback: 如果正则匹配失败，尝试原有的解析逻辑 (虽然已知有 bug，但在非标准格式下可能有用)
        // 但为了安全，如果正则挂了，可能直接 fallback 到今天比较好，或者 logging
        startDate = new Date(); 
    }
    
    // 2. 尝试提取时间部分 (HH:mm)
    const timeMatch = concert.date.match(/(\d{2}:\d{2})/);
    const timePart = timeMatch ? timeMatch[1] : null;

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
