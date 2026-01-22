import {
  FetchHttpClient,
  HttpClient
} from "@effect/platform";
import {
  Duration,
  Effect,
  HashMap,
  Layer,
  RateLimiter,
  Ref,
  Schedule,
  Scope,
} from "effect";
import type {
  HttpClientError} from "@effect/platform";

/**
 * Configuration options for throttling a specific domain
 */
export interface DomainThrottleConfig {
  /**
   * Maximum number of requests per second
   */
  readonly requestsPerSecond: number;

  /**
   * Maximum number of concurrent requests
   */
  readonly maxConcurrent: number;

  /**
   * Optional retry schedule for failed requests
   * If not provided, requests will not be automatically retried
   */
  readonly retrySchedule?: Schedule.Schedule<
    unknown,
    HttpClientError.HttpClientError,
    never
  >;
}

/**
 * Configuration options for the throttled HTTP client
 */
export interface ThrottleConfig {
  /**
   * Per-domain throttle configurations (optional)
   * Key: domain (e.g., "api.example.com")
   * Value: throttle configuration for that domain
   */
  readonly domains?: Record<string, DomainThrottleConfig>;

  /**
   * Default configuration for domains not explicitly configured
   */
  readonly defaultConfig: DomainThrottleConfig;
}

/**
 * Domain resources including rate limiter and semaphore
 */
interface DomainResources {
  readonly limiter: RateLimiter.RateLimiter;
  readonly semaphore: Effect.Semaphore;
  readonly config: DomainThrottleConfig;
}

/**
 * Extract domain from URL
 */
const extractDomain = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
};

/**
 * Creates a throttled HTTP client with per-domain rate limiting and concurrency control
 *
 * @param config - Configuration for throttling behavior
 * @returns Effect that yields a throttled HttpClient
 */
export const makeThrottledClient = (config: ThrottleConfig) => {
  return Effect.gen(function* () {
    // Get the current scope to use for dynamically created resources
    const scope = yield* Effect.scope;

    // Create rate limiters and semaphores for each configured domain
    const domainLimiters = yield* Effect.forEach(
      Object.entries(config.domains ?? {}),
      ([domain, domainConfig]) =>
        Effect.gen(function* () {
          const limiter = yield* RateLimiter.make({
            limit: domainConfig.requestsPerSecond,
            interval: Duration.seconds(1),
          });
          const semaphore = yield* Effect.makeSemaphore(
            domainConfig.maxConcurrent
          );
          return [
            domain,
            { limiter, semaphore, config: domainConfig },
          ] as const;
        }),
      { concurrency: "unbounded" }
    );

    // Convert to HashMap for efficient lookup
    const limitersMap = HashMap.fromIterable(domainLimiters);

    // Create a Ref to store dynamically created domain resources
    const dynamicLimitersRef = yield* Ref.make(limitersMap);

    // Helper to get or create domain resources
    const getDomainResources = (domain: string) =>
      Effect.gen(function* () {
        const currentMap = yield* Ref.get(dynamicLimitersRef);
        const existing = HashMap.get(currentMap, domain);

        if (existing._tag === "Some") {
          return existing.value;
        }

        // Create new resources for this domain using default config
        // Use Scope.extend to ensure resources live as long as the client
        const limiter = yield* Scope.extend(
          RateLimiter.make({
            limit: config.defaultConfig.requestsPerSecond,
            interval: Duration.seconds(1),
          }),
          scope
        );
        const semaphore = yield* Scope.extend(
          Effect.makeSemaphore(config.defaultConfig.maxConcurrent),
          scope
        );
        const resources: DomainResources = {
          limiter,
          semaphore,
          config: config.defaultConfig,
        };

        // Store in ref for future requests to this domain
        yield* Ref.update(dynamicLimitersRef, (map) =>
          HashMap.set(map, domain, resources)
        );

        return resources;
      });

    // Get the base HTTP client
    const baseClient = yield* HttpClient.HttpClient;

    const wrappedClient = HttpClient.make((request) =>
      Effect.gen(function* () {
        const domain = extractDomain(request.url);
        const { limiter, semaphore } = yield* getDomainResources(domain);

        return yield* limiter(
          semaphore.withPermits(1)(baseClient.execute(request))
        );
      })
    );

    // Apply retry at the client level if default retry is configured
    const finalClient = config.defaultConfig.retrySchedule
      ? HttpClient.retry(wrappedClient, config.defaultConfig.retrySchedule)
      : wrappedClient;

    return finalClient;
  });
};

/**
 * Creates a Layer that provides a throttled HTTP client
 *
 * @param config - Configuration for throttling behavior
 * @returns Layer that provides HttpClient.HttpClient service
 *
 * @example
 * ```ts
 * // With specific domain configurations
 * const program = Effect.gen(function* () {
 *   const client = yield* HttpClient.HttpClient
 *   const response = yield* client.get("https://api.example.com/data")
 *   return yield* response.json
 * }).pipe(
 *   Effect.provide(makeThrottledHttpClientLayer({
 *     domains: {
 *       "api.example.com": {
 *         requestsPerSecond: 10,
 *         maxConcurrent: 5,
 *         retrySchedule: exponentialRetrySchedule(3, 100)
 *       }
 *     },
 *     defaultConfig: {
 *       requestsPerSecond: 5,
 *       maxConcurrent: 3,
 *       retrySchedule: exponentialRetrySchedule(3, 100)
 *     }
 *   }))
 * )
 *
 * // Without specific domain configurations (all domains use defaultConfig)
 * const program2 = Effect.gen(function* () {
 *   const client = yield* HttpClient.HttpClient
 *   const response = yield* client.get("https://api.example.com/data")
 *   return yield* response.json
 * }).pipe(
 *   Effect.provide(makeThrottledHttpClientLayer({
 *     defaultConfig: {
 *       requestsPerSecond: 5,
 *       maxConcurrent: 3,
 *       retrySchedule: exponentialRetrySchedule(3, 100)
 *     }
 *   }))
 * )
 * ```
 */
export const makeThrottledHttpClientLayer = (config: ThrottleConfig) =>
  Layer.scoped(HttpClient.HttpClient, makeThrottledClient(config)).pipe(
    Layer.provide(FetchHttpClient.layer)
  );

/**
 * Helper function to create a common exponential backoff retry schedule
 *
 * @param retries - Number of retry attempts
 * @param initialDelay - Initial delay in milliseconds (default: 100)
 * @returns A Schedule that retries with exponential backoff
 */
export const exponentialRetrySchedule = (
  retries: number,
  initialDelay: number = 100
): Schedule.Schedule<number, HttpClientError.HttpClientError, never> =>
  Schedule.exponential(Duration.millis(initialDelay)).pipe(
    Schedule.compose(Schedule.recurs(retries))
  );
