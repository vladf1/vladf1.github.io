import {
  APPLE_BITE_PERCENT_PER_SECOND,
  DEFAULT_CRAZINESS,
  DEFAULT_SPEED,
  createWebgpuComputeRenderer
} from "./swarm-3-webgpu";

type BenchmarkScenario = {
  name: string;
  wormCount: number;
  appleCount: number;
};

type BenchmarkResult = BenchmarkScenario & {
  batchCount: number;
  batchSize: number;
  warmupFrameCount: number;
  medianMsPerFrame: number;
  minMsPerFrame: number;
  p95MsPerFrame: number;
};

const WIDTH = 800;
const HEIGHT = 600;
const FIXED_ELAPSED_MS = 1000 / 60;
const BATCH_SIZE = 50;
const BATCH_COUNT = 10;
const WARMUP_FRAME_COUNT = 30;
const SCENARIOS: BenchmarkScenario[] = [
  { name: "motion only", wormCount: 2500, appleCount: 0 },
  { name: "one apple", wormCount: 10000, appleCount: 1 },
  { name: "four apples", wormCount: 10000, appleCount: 4 },
  { name: "sixteen apples", wormCount: 10000, appleCount: 16 },
  { name: "one apple, large swarm", wormCount: 50000, appleCount: 1 },
  { name: "thirty-two apples", wormCount: 10000, appleCount: 32 },
  { name: "large motion only", wormCount: 250000, appleCount: 0 },
  { name: "large four apples", wormCount: 250000, appleCount: 4 }
];

const canvas = document.querySelector<HTMLCanvasElement>("#swarm")!;
const runButton = document.querySelector<HTMLButtonElement>("#runButton")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const results = document.querySelector<HTMLTableSectionElement>("#results")!;
const jsonOutput = document.querySelector<HTMLPreElement>("#jsonOutput")!;

runButton.addEventListener("click", () => {
  runBenchmark();
});

runBenchmark();

async function runBenchmark() {
  runButton.disabled = true;
  results.textContent = "";
  jsonOutput.textContent = "";
  const benchmarkResults: BenchmarkResult[] = [];

  for (const scenario of SCENARIOS) {
    status.textContent = `Running ${scenario.name}...`;
    const result = await runScenario(scenario);
    benchmarkResults.push(result);
    addResultRow(result);
  }

  status.textContent = "Done.";
  jsonOutput.textContent = JSON.stringify(benchmarkResults, null, 2);
  Object.assign(window, { swarm3BenchmarkResults: benchmarkResults });
  runButton.disabled = false;
}

async function runScenario(scenario: BenchmarkScenario): Promise<BenchmarkResult> {
  const renderer = await createWebgpuComputeRenderer(canvas, WIDTH, HEIGHT, WIDTH, HEIGHT, scenario.wormCount);
  try {
    renderer.resetApples();

    for (let index = 0; index < scenario.appleCount; index++) {
      const column = index % 4;
      const row = Math.floor(index / 4);
      renderer.queueApplePlacement(160 + column * 160, 150 + row * 100);
    }

    const hasApples = scenario.appleCount > 0;
    for (let frame = 0; frame < WARMUP_FRAME_COUNT; frame++) {
      renderer.drawFrame(FIXED_ELAPSED_MS, 0.994, APPLE_BITE_PERCENT_PER_SECOND, DEFAULT_CRAZINESS, DEFAULT_SPEED, hasApples, 0, 0, 0);
    }
    await renderer.finish();

    const frameTimes: number[] = [];
    for (let batch = 0; batch < BATCH_COUNT; batch++) {
      const started = performance.now();
      for (let frame = 0; frame < BATCH_SIZE; frame++) {
        renderer.drawFrame(FIXED_ELAPSED_MS, 0.994, APPLE_BITE_PERCENT_PER_SECOND, DEFAULT_CRAZINESS, DEFAULT_SPEED, hasApples, 0, 0, 0);
      }
      await renderer.finish();
      frameTimes.push((performance.now() - started) / BATCH_SIZE);
    }

    frameTimes.sort((left, right) => left - right);
    return {
      ...scenario,
      batchCount: BATCH_COUNT,
      batchSize: BATCH_SIZE,
      warmupFrameCount: WARMUP_FRAME_COUNT,
      medianMsPerFrame: percentile(frameTimes, 0.5),
      minMsPerFrame: frameTimes[0]!,
      p95MsPerFrame: percentile(frameTimes, 0.95)
    };
  } finally {
    renderer.destroy();
  }
}

function percentile(sortedValues: number[], value: number) {
  return sortedValues[Math.min(sortedValues.length - 1, Math.floor((sortedValues.length - 1) * value))]!;
}

function addResultRow(result: BenchmarkResult) {
  const row = document.createElement("tr");
  row.innerHTML = `
    <td>${result.name}</td>
    <td>${result.wormCount.toLocaleString()}</td>
    <td>${result.appleCount.toLocaleString()}</td>
    <td>${formatNumber(result.medianMsPerFrame)}</td>
    <td>${formatNumber(result.minMsPerFrame)}</td>
    <td>${formatNumber(result.p95MsPerFrame)}</td>
  `;
  results.append(row);
}

function formatNumber(value: number) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 3
  });
}
