// Global state for disabling drag and drop operations
let _isDndGloballyDisabled = false;

export const setDndGloballyDisabled = (disabled: boolean) => {
  console.log(`🔒 Global DND state: ${_isDndGloballyDisabled} → ${disabled}`);
  _isDndGloballyDisabled = disabled;
};

export const isDndGloballyDisabled = () => {
  return _isDndGloballyDisabled;
};

// Safety function to force reset DND state
export const resetDndGlobalState = () => {
  // console.log('🔓 Force resetting global DND state to enabled');
  _isDndGloballyDisabled = false;
};
