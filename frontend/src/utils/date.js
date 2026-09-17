// Formal Thai Date and Time Formatting Utility Functions (รูปแบบทางการภาษาไทย)

const THAI_MONTHS_FORMAL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

/**
 * Formats a date string (YYYY-MM-DD) into formal Thai date: "16 กันยายน พ.ศ. 2569"
 */
export function formatFormalDate(dateStr) {
  if (!dateStr) return 'ไม่ระบุวันที่';
  try {
    const cleanStr = String(dateStr).split('T')[0];
    const parts = cleanStr.split('-');
    if (parts.length !== 3) return dateStr;
    const year = parseInt(parts[0], 10) + 543; // Convert AD to BE
    const month = THAI_MONTHS_FORMAL[parseInt(parts[1], 10) - 1] || parts[1];
    const day = parseInt(parts[2], 10);
    return `${day} ${month} พ.ศ. ${year}`;
  } catch (e) {
    return dateStr;
  }
}

/**
 * Formats a date range into formal Thai: "16 กันยายน พ.ศ. 2569 ถึง 18 กันยายน พ.ศ. 2569"
 */
export function formatFormalDateRange(startDateStr, endDateStr) {
  if (!startDateStr) return 'ไม่ระบุวันที่';
  const startFormal = formatFormalDate(startDateStr);
  if (!endDateStr || endDateStr === startDateStr) return startFormal;
  const endFormal = formatFormalDate(endDateStr);
  return `${startFormal} ถึง ${endFormal}`;
}

/**
 * Formats time string (HH:MM or HH:MM:SS) into formal Thai: "เวลา 09:00 - 16:00 น."
 */
export function formatFormalTime(startTime, endTime) {
  if (!startTime && !endTime) return 'ไม่ระบุเวลา';
  const cleanStart = startTime ? String(startTime).slice(0, 5) : '';
  const cleanEnd = endTime ? String(endTime).slice(0, 5) : '';
  if (cleanStart && cleanEnd) return `เวลา ${cleanStart} - ${cleanEnd} น.`;
  if (cleanStart) return `เวลา ${cleanStart} น.`;
  return `ถึงเวลา ${cleanEnd} น.`;
}

/**
 * Formats full datetime string into formal Thai: "16 กันยายน พ.ศ. 2569 เวลา 21:30 น."
 */
export function formatFormalDateTime(dateTimeStr) {
  if (!dateTimeStr) return '-';
  try {
    const str = String(dateTimeStr).replace(' ', 'T');
    const [datePart, timePart] = str.split('T');
    const dateFormatted = formatFormalDate(datePart);
    if (!timePart) return dateFormatted;
    const timeFormatted = timePart.slice(0, 5);
    return `${dateFormatted} เวลา ${timeFormatted} น.`;
  } catch (e) {
    return dateTimeStr;
  }
}
