import { format, parse, startOfWeek, getDay } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { dateFnsLocalizer } from 'react-big-calendar';

const locales = {
  'zh-CN': zhCN,
};

export const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});
