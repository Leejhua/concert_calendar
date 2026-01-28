export type HolidayType = 'holiday' | 'workday';

export interface HolidayInfo {
  date: string; // YYYY-MM-DD
  type: HolidayType;
  name: string;
}

export interface DateStatus {
  type: HolidayType;
  name?: string; // Specific holiday name like "元旦", or undefined for regular days
  isSpecial: boolean; // true if it's from the official adjustment list
}

// 2026 Holidays (Derived from State Council Notice)
// https://www.gov.cn/zhengce/content/202511/content_7047090.htm (Simulated Ref)
const HOLIDAYS_2026: HolidayInfo[] = [
  // New Year (元旦)
  { date: '2026-01-01', type: 'holiday', name: '元旦' },
  { date: '2026-01-02', type: 'holiday', name: '元旦' },
  { date: '2026-01-03', type: 'holiday', name: '元旦' },
  { date: '2026-01-04', type: 'workday', name: '补班' }, // Sunday work

  // Spring Festival (春节)
  { date: '2026-02-14', type: 'workday', name: '补班' }, // Saturday work
  { date: '2026-02-15', type: 'holiday', name: '春节' },
  { date: '2026-02-16', type: 'holiday', name: '春节' },
  { date: '2026-02-17', type: 'holiday', name: '春节' },
  { date: '2026-02-18', type: 'holiday', name: '春节' },
  { date: '2026-02-19', type: 'holiday', name: '春节' },
  { date: '2026-02-20', type: 'holiday', name: '春节' },
  { date: '2026-02-21', type: 'holiday', name: '春节' },
  { date: '2026-02-22', type: 'holiday', name: '春节' },
  { date: '2026-02-23', type: 'holiday', name: '春节' },
  { date: '2026-02-28', type: 'workday', name: '补班' }, // Saturday work

  // Qingming (清明节)
  { date: '2026-04-04', type: 'holiday', name: '清明' },
  { date: '2026-04-05', type: 'holiday', name: '清明' },
  { date: '2026-04-06', type: 'holiday', name: '清明' },

  // Labor Day (劳动节)
  { date: '2026-05-01', type: 'holiday', name: '劳动节' },
  { date: '2026-05-02', type: 'holiday', name: '劳动节' },
  { date: '2026-05-03', type: 'holiday', name: '劳动节' },
  { date: '2026-05-04', type: 'holiday', name: '劳动节' },
  { date: '2026-05-05', type: 'holiday', name: '劳动节' },
  { date: '2026-05-09', type: 'workday', name: '补班' }, // Saturday work

  // Dragon Boat Festival (端午节)
  { date: '2026-06-19', type: 'holiday', name: '端午' },
  { date: '2026-06-20', type: 'holiday', name: '端午' },
  { date: '2026-06-21', type: 'holiday', name: '端午' },

  // Mid-Autumn Festival (中秋节)
  { date: '2026-09-25', type: 'holiday', name: '中秋' },
  { date: '2026-09-26', type: 'holiday', name: '中秋' },
  { date: '2026-09-27', type: 'holiday', name: '中秋' },

  // National Day (国庆节)
  { date: '2026-09-20', type: 'workday', name: '补班' }, // Sunday work
  { date: '2026-10-01', type: 'holiday', name: '国庆' },
  { date: '2026-10-02', type: 'holiday', name: '国庆' },
  { date: '2026-10-03', type: 'holiday', name: '国庆' },
  { date: '2026-10-04', type: 'holiday', name: '国庆' },
  { date: '2026-10-05', type: 'holiday', name: '国庆' },
  { date: '2026-10-06', type: 'holiday', name: '国庆' },
  { date: '2026-10-07', type: 'holiday', name: '国庆' },
  { date: '2026-10-10', type: 'workday', name: '补班' }, // Saturday work
];

// Map for O(1) lookup
const HOLIDAY_MAP = new Map<string, HolidayInfo>();
HOLIDAYS_2026.forEach(h => HOLIDAY_MAP.set(h.date, h));

export function getDateStatus(date: Date): DateStatus {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;
  
  const specialHoliday = HOLIDAY_MAP.get(dateStr);
  
  // 1. If it is a special holiday/workday adjustment
  if (specialHoliday) {
    return {
      type: specialHoliday.type,
      name: specialHoliday.name,
      isSpecial: true
    };
  }

  // 2. Regular Weekends (Saturday=6, Sunday=0)
  const day = date.getDay();
  if (day === 0 || day === 6) {
    return {
      type: 'holiday',
      name: undefined, // Ordinary weekend has no special name
      isSpecial: false
    };
  }

  // 3. Regular Workdays
  return {
    type: 'workday',
    name: undefined,
    isSpecial: false
  };
}

// Deprecated: kept for backward compatibility if needed, but better use getDateStatus
export function getHolidayInfo(date: Date): HolidayInfo | undefined {
  const status = getDateStatus(date);
  if (status.isSpecial) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return {
      date: `${yyyy}-${mm}-${dd}`,
      type: status.type,
      name: status.name || ''
    };
  }
  return undefined;
}

