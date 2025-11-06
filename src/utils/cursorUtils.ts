/**
 * Utility functions for managing custom cursor during drag operations
 */

import React from 'react';

/**
 * Sets a custom cursor with a blue square and white arrow pointer
 * @param dragStartedRef - Ref to track if drag has started
 */
export const setCustomTaskCursor = (dragStartedRef: React.MutableRefObject<boolean>): void => {
  // Create a 32x32 SVG with a blue square and a white arrow pointer in the center
  const svg = `
    <svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
      <!-- Blue square background -->
      <rect width="24" height="24" x="4" y="4" fill="#3B82F6" stroke="#FFFFFF" stroke-width="2" rx="3"/>
      <!-- White mouse pointer arrow in the exact center -->
      <path d="M 16 12 L 16 20 L 18 18 L 20 20 L 22 18 L 18 16 L 20 16 Z" fill="#FFFFFF" stroke="#000000" stroke-width="0.5"/>
    </svg>
  `;
  
  // Convert SVG to data URL
  const dataURL = `data:image/svg+xml;base64,${btoa(svg)}`;
  
  // Set cursor with hotspot at exact center (16,16) where the arrow tip is
  document.body.style.setProperty('cursor', `url("${dataURL}") 16 16, grab`, 'important');
  document.documentElement.style.setProperty('cursor', `url("${dataURL}") 16 16, grab`, 'important');
  
  dragStartedRef.current = true;
};

/**
 * Clears the custom cursor and resets the drag started flag
 * @param dragStartedRef - Ref to track if drag has started
 */
export const clearCustomCursor = (dragStartedRef: React.MutableRefObject<boolean>): void => {
  if (dragStartedRef.current) {
    // Remove direct styles
    document.body.style.removeProperty('cursor');
    document.documentElement.style.removeProperty('cursor');
    
    dragStartedRef.current = false;
  }
};

