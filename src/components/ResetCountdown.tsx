import React, { useState, useEffect } from 'react';

const ResetCountdown: React.FC = () => {
  const [timeLeft, setTimeLeft] = useState<{ minutes: number; seconds: number }>({
    minutes: 0,
    seconds: 0
  });

  // Calculate time until next hour
  const calculateTimeUntilNextHour = (): { minutes: number; seconds: number } => {
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(now.getHours() + 1);
    nextHour.setMinutes(0);
    nextHour.setSeconds(0);
    nextHour.setMilliseconds(0);
    
    const diffMs = nextHour.getTime() - now.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffSeconds = Math.floor((diffMs % 60000) / 1000);
    
    return { minutes: diffMinutes, seconds: diffSeconds };
  };

  useEffect(() => {
    // Set initial time
    setTimeLeft(calculateTimeUntilNextHour());
    
    const interval = setInterval(() => {
      setTimeLeft(calculateTimeUntilNextHour());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-red-100 text-red-700 text-xs py-1 px-2 text-center font-medium">
      This demo will reset in {timeLeft.minutes}m {timeLeft.seconds}s
    </div>
  );
};

export default ResetCountdown;
