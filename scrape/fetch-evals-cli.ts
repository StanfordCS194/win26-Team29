import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { Cause, Effect, Exit, Layer } from "effect";
import { FileSystem } from "@effect/platform";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import {
  exponentialRetrySchedule,
  makeThrottledHttpClientLayer,
} from "./throttled-http-client.js";
import { Quarter, fetchCourseEvalInfos } from "./fetch-evals.js";

// Helper to parse quarters from comma-separated string
const parseQuarters = (quartersStr: string): Array<Quarter> => {
  const parts = quartersStr.split(",").map((s) => s.trim());
  const quarters: Array<Quarter> = [];

  for (const part of parts) {
    const normalized = part.toLowerCase();
    switch (normalized) {
      case "winter":
        quarters.push(Quarter.WINTER);
        break;
      case "spring":
        quarters.push(Quarter.SPRING);
        break;
      case "summer":
        quarters.push(Quarter.SUMMER);
        break;
      case "fall":
      case "autumn":
        quarters.push(Quarter.FALL);
        break;
      default:
        throw new Error(
          `Invalid quarter: ${part}. Must be one of: Winter, Spring, Summer, Fall/Autumn`
        );
    }
  }

  if (quarters.length === 0) {
    throw new Error("At least one quarter must be specified");
  }

  return quarters;
};

// CLI execution
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      year: {
        type: "string",
        short: "y",
      },
      quarters: {
        type: "string",
        short: "q",
      },
      subject: {
        type: "string",
        short: "s",
      },
      output: {
        type: "string",
        short: "o",
      },
      concurrency: {
        type: "string",
        short: "c",
        default: "5",
      },
      ratelimit: {
        type: "string",
        short: "l",
        default: "10",
      },
      retries: {
        type: "string",
        short: "r",
        default: "3",
      },
      backoff: {
        type: "string",
        short: "b",
        default: "100",
      },
    },
  });

  if (!values.year) {
    console.error("Error: --year is required");
    console.error(
      "Usage: tsx fetch-evals-cli.ts --year 2024 --quarters Winter,Spring --subject CS --output ./data/evals.json [--concurrency 5] [--ratelimit 10] [--retries 3] [--backoff 100]"
    );
    process.exit(1);
  }

  if (!values.quarters) {
    console.error("Error: --quarters is required");
    console.error(
      "Usage: tsx fetch-evals-cli.ts --year 2024 --quarters Winter,Spring --subject CS --output ./data/evals.json [--concurrency 5] [--ratelimit 10] [--retries 3] [--backoff 100]"
    );
    process.exit(1);
  }

  if (!values.subject) {
    console.error("Error: --subject is required");
    console.error(
      "Usage: tsx fetch-evals-cli.ts --year 2024 --quarters Winter,Spring --subject CS --output ./data/evals.json [--concurrency 5] [--ratelimit 10] [--retries 3] [--backoff 100]"
    );
    process.exit(1);
  }

  if (!values.output) {
    console.error("Error: --output is required");
    console.error(
      "Usage: tsx fetch-evals-cli.ts --year 2024 --quarters Winter,Spring --subject CS --output ./data/evals.json [--concurrency 5] [--ratelimit 10] [--retries 3] [--backoff 100]"
    );
    process.exit(1);
  }

  const year = parseInt(values.year, 10);
  const quartersStr = values.quarters;
  const subject = values.subject;
  const outputPath = values.output;
  const concurrency = parseInt(values.concurrency, 10);
  const rateLimit = parseInt(values.ratelimit, 10);
  const retries = parseInt(values.retries, 10);
  const backoffMs = parseInt(values.backoff, 10);

  if (isNaN(year)) {
    console.error("Error: --year must be a valid number");
    process.exit(1);
  }

  let quarters: Array<Quarter>;
  try {
    quarters = parseQuarters(quartersStr);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  const program = Effect.gen(function* (_) {
    console.log(`Fetching course evaluations for year ${year}`);
    console.log(`Subject: ${subject}`);
    console.log(`Quarters: ${quarters.join(", ")}`);
    console.log(`Output: ${outputPath}`);
    console.log(
      `Configuration: concurrency=${concurrency}, ratelimit=${rateLimit} req/s, retries=${retries}, backoff=${backoffMs}ms`
    );
    console.log("");

    const fs = yield* _(FileSystem.FileSystem);

    // Create output directory if needed
    const lastSlashIndex = outputPath.lastIndexOf("/");
    if (lastSlashIndex !== -1) {
      const outputDir = outputPath.substring(0, lastSlashIndex);
      yield* _(fs.makeDirectory(outputDir, { recursive: true }));
    }

    console.log("Fetching evaluations...");

    const entries = yield* _(
      fetchCourseEvalInfos(year, quarters, subject).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            console.error(`\nFailed to fetch evaluations: ${error.message || String(error)}`);
            return yield* Effect.fail(error);
          })
        )
      )
    );

    const jsonContent = JSON.stringify(entries, null, 2);
    yield* _(fs.writeFileString(outputPath, jsonContent));
    console.log(
      `\nComplete: Found ${entries.length} evaluation entries`
    );
    console.log(`Results written to: ${outputPath}`);
    return entries;
  });

  // Use throttled HTTP client layer with CLI parameters
  const MainLayer = Layer.mergeAll(
    NodeContext.layer,
    makeThrottledHttpClientLayer({
      defaultConfig: {
        requestsPerSecond: rateLimit,
        maxConcurrent: concurrency,
        retrySchedule: exponentialRetrySchedule(retries, backoffMs),
      },
    })
  );

  NodeRuntime.runMain(program.pipe(Effect.provide(MainLayer)));
}
