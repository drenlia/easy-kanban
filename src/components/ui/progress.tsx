import React from 'react';

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className = '', value = 0, max = 100, ...props }, ref) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

    return (
      <div
        ref={ref}
        className={`relative h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700 ${className}`}
        {...props}
      >
        <div
          className="h-full w-full flex-1 bg-blue-600 transition-all duration-300 ease-in-out"
          style={{ transform: `translateX(-${100 - percentage}%)` }}
        />
      </div>
    );
  }
);

Progress.displayName = 'Progress';

export { Progress };
