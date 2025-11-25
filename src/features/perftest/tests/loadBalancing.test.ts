import api from '../../../api';

/**
 * Load Balancing Performance Test
 * 
 * This test measures the performance impact of load balancing by making
 * concurrent requests to the backend. With more replicas, requests are
 * distributed across pods, resulting in better performance. With fewer
 * replicas, requests are concentrated, resulting in worse performance.
 * 
 * Metrics measured:
 * - Throughput (requests per second)
 * - Latency percentiles (p50, p95, p99)
 * - Average, min, max response times
 * - Success/failure rates
 */

interface RequestResult {
  success: boolean;
  duration: number;
  error?: string;
}

interface LoadBalancingTestResult {
  totalRequests: number;
  concurrentRequests: number;
  totalDuration: number;
  throughput: number; // requests per second
  successRate: number; // percentage
  latency: {
    average: number;
    min: number;
    max: number;
    p50: number; // median
    p95: number;
    p99: number;
  };
  requests: RequestResult[];
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sortedArray: number[], p: number): number {
  if (sortedArray.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedArray.length) - 1;
  return sortedArray[Math.max(0, index)];
}

/**
 * Make a single request and measure its duration
 */
async function makeRequest(endpoint: string): Promise<RequestResult> {
  const startTime = performance.now();
  try {
    await api.get(endpoint);
    const duration = performance.now() - startTime;
    return { success: true, duration };
  } catch (error: any) {
    const duration = performance.now() - startTime;
    return {
      success: false,
      duration,
      error: error.message || 'Unknown error'
    };
  }
}

/**
 * Run load balancing performance test
 * 
 * @param concurrentRequests - Number of concurrent requests to make (default: 50)
 * @param totalRequests - Total number of requests to make (default: 100)
 * @param endpoint - API endpoint to test (default: '/boards')
 * @param warmupRequests - Number of warmup requests before the actual test (default: 5)
 */
export async function runLoadBalancingTest(
  concurrentRequests: number = 50,
  totalRequests: number = 100,
  endpoint: string = '/boards',
  warmupRequests: number = 5
): Promise<LoadBalancingTestResult> {
  const testStartTime = performance.now();
  const results: RequestResult[] = [];

  // Warmup phase - make a few requests to warm up the connection pool and backend
  if (warmupRequests > 0) {
    const warmupPromises: Promise<RequestResult>[] = [];
    for (let i = 0; i < warmupRequests; i++) {
      warmupPromises.push(makeRequest(endpoint));
    }
    await Promise.all(warmupPromises);
    // Small delay after warmup
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Main test phase - make concurrent requests
  const batches = Math.ceil(totalRequests / concurrentRequests);
  const remainingRequests = totalRequests;

  for (let batch = 0; batch < batches; batch++) {
    const batchSize = Math.min(
      concurrentRequests,
      remainingRequests - (batch * concurrentRequests)
    );

    // Create batch of concurrent requests
    const batchPromises: Promise<RequestResult>[] = [];
    for (let i = 0; i < batchSize; i++) {
      batchPromises.push(makeRequest(endpoint));
    }

    // Execute batch and collect results
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Small delay between batches to avoid overwhelming the system
    if (batch < batches - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  const testEndTime = performance.now();
  const totalDuration = testEndTime - testStartTime;

  // Calculate statistics
  const successfulRequests = results.filter(r => r.success);
  const failedRequests = results.filter(r => !r.success);
  const successRate = (successfulRequests.length / results.length) * 100;

  // Extract durations and sort for percentile calculation
  const durations = results.map(r => r.duration).sort((a, b) => a - b);
  const successfulDurations = successfulRequests.map(r => r.duration).sort((a, b) => a - b);

  const avgLatency = durations.reduce((sum, d) => sum + d, 0) / durations.length;
  const minLatency = durations[0] || 0;
  const maxLatency = durations[durations.length - 1] || 0;

  // Calculate percentiles from successful requests only
  const p50 = percentile(successfulDurations, 50);
  const p95 = percentile(successfulDurations, 95);
  const p99 = percentile(successfulDurations, 99);

  // Calculate throughput (requests per second)
  const throughput = (results.length / totalDuration) * 1000;

  return {
    totalRequests: results.length,
    concurrentRequests,
    totalDuration,
    throughput: Math.round(throughput * 100) / 100,
    successRate: Math.round(successRate * 100) / 100,
    latency: {
      average: Math.round(avgLatency * 100) / 100,
      min: Math.round(minLatency * 100) / 100,
      max: Math.round(maxLatency * 100) / 100,
      p50: Math.round(p50 * 100) / 100,
      p95: Math.round(p95 * 100) / 100,
      p99: Math.round(p99 * 100) / 100,
    },
    requests: results,
  };
}

/**
 * Run load balancing test with default parameters
 * This is the main entry point for the performance test console
 */
export async function runLoadBalancingTestDefault() {
  const result = await runLoadBalancingTest(50, 100, '/boards', 5);

  // Format error summary if there are failures
  let errorSummary = '';
  if (result.requests.some(r => !r.success)) {
    const errors = result.requests
      .filter(r => !r.success)
      .reduce((acc, r) => {
        const key = r.error || 'Unknown error';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    errorSummary = Object.entries(errors)
      .map(([error, count]) => `${error}: ${count}`)
      .join(', ');
  }

  const message = errorSummary
    ? `Completed ${result.totalRequests} requests (${result.successRate}% success). Errors: ${errorSummary}`
    : `Completed ${result.totalRequests} requests (${result.successRate}% success)`;

  return {
    duration: result.totalDuration,
    message,
    details: {
      throughput: `${result.throughput} req/s`,
      successRate: `${result.successRate}%`,
      latency: {
        average: `${result.latency.average}ms`,
        min: `${result.latency.min}ms`,
        max: `${result.latency.max}ms`,
        p50: `${result.latency.p50}ms`,
        p95: `${result.latency.p95}ms`,
        p99: `${result.latency.p99}ms`,
      },
      concurrentRequests: result.concurrentRequests,
      totalRequests: result.totalRequests,
      failedRequests: result.totalRequests - result.requests.filter(r => r.success).length,
    }
  };
}

