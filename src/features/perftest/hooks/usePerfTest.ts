import { useState, useCallback } from 'react';
import { PerformanceTimer } from '../utils/performanceTimer';

export interface TestResult {
  testName: string;
  duration: number;
  success: boolean;
  message?: string;
  details?: any;
}

export interface UsePerfTestReturn {
  results: TestResult[];
  isRunning: boolean;
  currentTest: string | null;
  runTest: (testName: string, testFn: () => Promise<any>) => Promise<void>;
  clearResults: () => void;
}

export function usePerfTest(): UsePerfTestReturn {
  const [results, setResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentTest, setCurrentTest] = useState<string | null>(null);

  const runTest = useCallback(async (testName: string, testFn: () => Promise<any>) => {
    setIsRunning(true);
    setCurrentTest(testName);
    const timer = new PerformanceTimer();
    timer.start();

    try {
      const result = await testFn();
      const duration = timer.stop();

      setResults(prev => [...prev, {
        testName,
        duration,
        success: true,
        message: result.message || 'Test completed successfully',
        details: result
      }]);
    } catch (error: any) {
      const duration = timer.stop();

      setResults(prev => [...prev, {
        testName,
        duration,
        success: false,
        message: error.message || 'Test failed',
        details: error
      }]);
    } finally {
      setIsRunning(false);
      setCurrentTest(null);
    }
  }, []);

  const clearResults = useCallback(() => {
    setResults([]);
  }, []);

  return {
    results,
    isRunning,
    currentTest,
    runTest,
    clearResults
  };
}

