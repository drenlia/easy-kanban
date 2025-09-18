import { Tag } from '../types';

/**
 * Merges task tags with live tag data to ensure colors and other properties are up-to-date
 * @param taskTags - The tags associated with a task (may have stale data)
 * @param availableTags - The live tag data from the global state
 * @returns Updated tags with current color and other properties
 */
export function mergeTaskTagsWithLiveData(taskTags: Tag[], availableTags: Tag[]): Tag[] {
  if (!taskTags || !Array.isArray(taskTags)) {
    return [];
  }

  return taskTags.map(taskTag => {
    // Find the corresponding live tag data
    const liveTag = availableTags.find(availableTag => availableTag.id === taskTag.id);
    
    if (liveTag) {
      // Return the live tag data, which has the most up-to-date color and properties
      return liveTag;
    }
    
    // If no live tag found, return the original task tag as fallback
    return taskTag;
  });
}

/**
 * Gets the display color for a tag, with fallback to default
 * @param tag - The tag object
 * @returns The color to display
 */
export function getTagDisplayColor(tag: Tag): string {
  return tag.color || '#6b7280';
}

/**
 * Calculates the appropriate text color for a background color
 * @param backgroundColor - The background color (hex format)
 * @returns The text color (hex format)
 */
export function getTextColorForBackground(backgroundColor: string): string {
  if (!backgroundColor) {
    return '#ffffff';
  }
  
  const hex = backgroundColor.replace('#', '');
  if (hex.length === 6) {
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    // Calculate relative luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    
    // Use dark text for light backgrounds, white text for dark backgrounds
    return luminance > 0.6 ? '#374151' : '#ffffff';
  }
  
  return '#ffffff';
}

/**
 * Gets the complete style object for a tag display
 * @param tag - The tag object
 * @returns Style object with background color, text color, and border
 */
export function getTagDisplayStyle(tag: Tag): React.CSSProperties {
  const backgroundColor = getTagDisplayColor(tag);
  const textColor = getTextColorForBackground(backgroundColor);
  const borderStyle = textColor === '#374151' ? { border: '1px solid #d1d5db' } : {};
  
  return {
    backgroundColor,
    color: textColor,
    ...borderStyle
  };
}
