// Global state for disabling drag and drop operations
let _isDndGloballyDisabled = false;

export const setDndGloballyDisabled = (disabled: boolean) => {
  _isDndGloballyDisabled = disabled;
};

export const isDndGloballyDisabled = () => {
  return _isDndGloballyDisabled;
};
