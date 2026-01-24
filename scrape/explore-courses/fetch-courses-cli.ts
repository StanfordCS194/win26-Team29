import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { Cause, Effect, Exit, Layer } from "effect";
import { FileSystem } from "@effect/platform";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import * as cliProgress from "cli-progress";
import {
  exponentialRetrySchedule,
  makeThrottledHttpClientLayer,
} from "@scrape/shared/throttled-http-client.ts";
import { fetchCourseTasks } from "./fetch-courses.js";

// CLI execution
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      year: {
        type: "string",
        short: "y",
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
      "Usage: tsx fetch-courses-cli.ts --year 20232024 --output ./data [--concurrency 5] [--ratelimit 10] [--retries 3] [--backoff 100]"
    );
    process.exit(1);
  }

  if (!values.output) {
    console.error("Error: --output is required");
    console.error(
      "Usage: tsx fetch-courses-cli.ts --year 20232024 --output ./data [--concurrency 5] [--ratelimit 10] [--retries 3] [--backoff 100]"
    );
    process.exit(1);
  }

  const academicYear = values.year;
  const outputDir = values.output;
  const concurrency = parseInt(values.concurrency, 10);
  const rateLimit = parseInt(values.ratelimit, 10);
  const retries = parseInt(values.retries, 10);
  const backoffMs = parseInt(values.backoff, 10);

  const program = Effect.gen(function* (_) {
    console.log(`Fetching courses for academic year ${academicYear}`);
    console.log(`Output directory: ${outputDir}`);
    console.log(
      `Configuration: concurrency=${concurrency}, ratelimit=${rateLimit} req/s, retries=${retries}, backoff=${backoffMs}ms`
    );

    const tasks = yield* _(fetchCourseTasks(academicYear));
    console.log(`Found ${tasks.length} subjects to fetch\n`);

    const fs = yield* _(FileSystem.FileSystem);

    // Create output directory
    yield* _(fs.makeDirectory(outputDir, { recursive: true }));

    // Create progress bar
    const progressBar = new cliProgress.SingleBar({
      format:
        "Progress |{bar}| {percentage}% | {value}/{total} subjects | Success: {success} | Failed: {failed}",
      barCompleteChar: "\u2588",
      barIncompleteChar: "\u2591",
      hideCursor: true,
      noTTYOutput: true,
      notTTYSchedule: 1000,
    });

    let successCount = 0;
    let failureCount = 0;

    progressBar.start(tasks.length, 0, {
      success: 0,
      failed: 0,
    });

    const results = yield* _(
      Effect.forEach(
        tasks,
        (task) =>
          Effect.gen(function* (_) {
            const exit = yield* _(Effect.exit(task.execute()));

            yield* _(
              Exit.match(exit, {
                onFailure: (cause) =>
                  Effect.sync(() => {
                    console.warn(
                      `\nFailed to fetch subject ${task.subject.name}: ${[
                        ...Cause.failures(cause),
                        ...Cause.defects(cause),
                      ].join(", ")}`
                    );
                    failureCount++;
                    progressBar.update(successCount + failureCount, {
                      success: successCount,
                      failed: failureCount,
                    });
                  }),
                onSuccess: (data) =>
                  Effect.gen(function* (_) {
                    const filePath = `${outputDir}/${task.subject.name}.xml`;
                    yield* _(fs.writeFileString(filePath, data.content));
                    successCount++;
                    progressBar.update(successCount + failureCount, {
                      success: successCount,
                      failed: failureCount,
                    });
                  }),
              })
            );

            return exit;
          }),
        { concurrency: "unbounded" }
      )
    );

    progressBar.stop();
    console.log(
      `\nComplete: ${successCount} succeeded, ${failureCount} failed`
    );
    return results;
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
