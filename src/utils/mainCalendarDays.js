export const getMainCalendarDays = (year, month) => {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  return Array.from({ length: cellCount }, (_, index) => {
    const date = new Date(year, month, index - firstWeekday + 1);
    return {
      year: date.getFullYear(), month: date.getMonth(), day: date.getDate(),
      inMonth: date.getFullYear() === year && date.getMonth() === month,
    };
  });
};
