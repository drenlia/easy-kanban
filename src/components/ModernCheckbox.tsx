import React, { forwardRef, useEffect, useRef } from 'react';
import { Check, Minus } from 'lucide-react';

export type ModernCheckboxProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'size'
> & {
  /** Visual size of the control. */
  size?: 'sm' | 'md';
  /** Partial-selection state (select-all headers). */
  indeterminate?: boolean;
  /** Extra classes on the outer wrapper. */
  wrapperClassName?: string;
};

const sizeClass = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
} as const;

const iconSize = {
  sm: 11,
  md: 12,
} as const;

/**
 * Shared modern checkbox: light border, soft fill, blue checked state.
 * Drop-in replacement for native `type="checkbox"` visuals (not toggle switches).
 */
export const ModernCheckbox = forwardRef<HTMLInputElement, ModernCheckboxProps>(
  function ModernCheckbox(
    {
      checked = false,
      indeterminate = false,
      disabled = false,
      size = 'md',
      className = '',
      wrapperClassName = '',
      onChange,
      ...rest
    },
    ref
  ) {
    const localRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
      const node =
        (typeof ref === 'function' ? null : ref?.current) || localRef.current;
      if (node) node.indeterminate = !!indeterminate;
    }, [indeterminate, ref]);

    const setRefs = (node: HTMLInputElement | null) => {
      localRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
    };

    const isOn = !!checked || !!indeterminate;

    return (
      <span
        className={`relative inline-flex shrink-0 items-center justify-center ${wrapperClassName} ${className}`}
      >
        <input
          {...rest}
          ref={setRefs}
          type="checkbox"
          checked={!!checked}
          disabled={disabled}
          onChange={onChange}
          className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <span
          aria-hidden="true"
          className={`pointer-events-none flex items-center justify-center rounded-[5px] border shadow-sm transition-all duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500/25 ${
            sizeClass[size]
          } ${
            disabled
              ? 'opacity-40'
              : ''
          } ${
            isOn
              ? 'border-blue-500 bg-blue-500 text-white'
              : 'border-slate-300/80 bg-white/80 text-transparent hover:border-blue-400 dark:border-slate-500/70 dark:bg-gray-800/80'
          }`}
        >
          {indeterminate && !checked ? (
            <Minus size={iconSize[size]} strokeWidth={3} className="opacity-100" />
          ) : (
            <Check
              size={iconSize[size]}
              strokeWidth={3}
              className={checked ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}
            />
          )}
        </span>
      </span>
    );
  }
);

export default ModernCheckbox;
