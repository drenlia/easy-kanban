// Safe local date parsing - avoids timezone issues
export const parseLocalDate = (dateInput: string | Date): Date => {
  if (!dateInput) return new Date();
  
  // If it's already a Date object, return it
  if (dateInput instanceof Date) {
    return dateInput;
  }
  
  // If it's a string, parse it safely
  if (typeof dateInput === 'string') {
    const dateOnly = dateInput.split('T')[0]; // Get just the date part
    const [year, month, day] = dateOnly.split('-').map(Number);
    return new Date(year, month - 1, day); // month is 0-indexed
  }
  
  // Fallback
  return new Date();
};

export const formatToYYYYMMDD = (dateString: string) => {
  const date = parseLocalDate(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatToYYYYMMDDHHmm = (dateString: string) => {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

export const formatToYYYYMMDDHHmmss = (dateString: string) => {
  if (!dateString) return '';
  
  // SQLite datetime strings are typically in format "YYYY-MM-DD HH:MM:SS" without timezone
  // If the string doesn't have a timezone indicator, treat it as UTC
  let date: Date;
  
  // Check if it already has timezone info (ISO format with Z, or offset like +05:00)
  const hasTimezone = dateString.includes('Z') || 
                      dateString.includes('+') || 
                      (dateString.includes('-') && dateString.length > 19 && dateString[19] !== ' '); // Timezone offset after time
  
  if (hasTimezone || dateString.includes('T')) {
    // Already has timezone info or ISO format
    date = new Date(dateString);
  } else {
    // SQLite datetime format without timezone - treat as UTC
    // Format: "YYYY-MM-DD HH:MM:SS" -> convert to "YYYY-MM-DDTHH:MM:SSZ"
    const utcString = dateString.replace(' ', 'T') + 'Z';
    date = new Date(utcString);
  }
  
  // Use local time methods to ensure we display in user's timezone
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

// Alias for consistency with backend
export const formatDateTimeLocal = formatToYYYYMMDDHHmmss;

export const getLocalISOString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
  const offset = -date.getTimezoneOffset();
  const offsetHours = String(Math.abs(Math.floor(offset / 60))).padStart(2, '0');
  const offsetMinutes = String(Math.abs(offset % 60)).padStart(2, '0');
  const offsetSign = offset >= 0 ? '+' : '-';
  
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}${offsetSign}${offsetHours}:${offsetMinutes}`;
}; 