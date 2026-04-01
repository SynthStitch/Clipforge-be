import { prisma } from "../lib/prisma";
import { randomUUID } from "crypto";

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

type Tolerances = Record<string, { min?: number; max?: number }>;

type SampleScores = Record<
  string,
  { expected: unknown; actual: unknown; passed: boolean }
>;

// -----------------------------------------------------------------------
// Save a golden sample
// -----------------------------------------------------------------------

export async function createGoldenSample(data: {
  workflowType: string;
  label: string;
  difficulty?: string;
  tags?: string[];
  inputData: Record<string, unknown>;
  expectedOutput: Record<string, unknown>;
  tolerances?: Tolerances;
  sourceRunId?: string;
  addedBy?: string;
}) {
  return prisma.goldenSample.create({
    data: {
      workflowType: data.workflowType,
      label: data.label,
      difficulty: data.difficulty ?? "medium",
      tags: data.tags ?? [],
      inputData: data.inputData,
      expectedOutput: data.expectedOutput,
      tolerances: data.tolerances ?? undefined,
      sourceRunId: data.sourceRunId ?? null,
      addedBy: data.addedBy ?? "system",
    },
  });
}

// -----------------------------------------------------------------------
// List golden samples (optionally filter by workflowType / difficulty)
// -----------------------------------------------------------------------

export async function listGoldenSamples(filters: {
  workflowType?: string;
  difficulty?: string;
  activeOnly?: boolean;
}) {
  return prisma.goldenSample.findMany({
    where: {
      ...(filters.workflowType ? { workflowType: filters.workflowType } : {}),
      ...(filters.difficulty ? { difficulty: filters.difficulty } : {}),
      ...(filters.activeOnly !== false ? { active: true } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      workflowType: true,
      label: true,
      difficulty: true,
      tags: true,
      inputData: true,
      expectedOutput: true,
      tolerances: true,
      sourceRunId: true,
      addedBy: true,
      active: true,
      createdAt: true,
    },
  });
}

// -----------------------------------------------------------------------
// Run eval: score actual outputs against stored goldens
// -----------------------------------------------------------------------

export async function runEval(
  samples: { goldenSampleId: string; actualOutput: Record<string, unknown> }[]
) {
  const runId = randomUUID();
  const results: {
    goldenSampleId: string;
    label: string;
    passed: boolean;
    scores: SampleScores;
    failReasons: string[];
  }[] = [];

  for (const sample of samples) {
    const golden = await prisma.goldenSample.findUnique({
      where: { id: sample.goldenSampleId },
    });

    if (!golden) {
      results.push({
        goldenSampleId: sample.goldenSampleId,
        label: "not found",
        passed: false,
        scores: {},
        failReasons: [`Golden sample ${sample.goldenSampleId} not found`],
      });
      continue;
    }

    const expected = golden.expectedOutput as Record<string, unknown>;
    const tolerances = (golden.tolerances ?? {}) as Tolerances;
    const actual = sample.actualOutput;

    const scores: SampleScores = {};
    const failReasons: string[] = [];

    for (const [field, expectedVal] of Object.entries(expected)) {
      const actualVal = actual[field];
      const tol = tolerances[field];

      let passed = false;

      if (tol && typeof actualVal === "number") {
        // Numeric range check
        const inMin = tol.min === undefined || actualVal >= tol.min;
        const inMax = tol.max === undefined || actualVal <= tol.max;
        passed = inMin && inMax;
        if (!passed) {
          failReasons.push(
            `${field}: ${actualVal} outside range [${tol.min ?? "-∞"}, ${tol.max ?? "∞"}]`
          );
        }
      } else {
        // Exact match (works for strings, booleans, null)
        passed = actualVal === expectedVal;
        if (!passed) {
          failReasons.push(`${field}: expected ${String(expectedVal)}, got ${String(actualVal)}`);
        }
      }

      scores[field] = { expected: expectedVal, actual: actualVal, passed };
    }

    const overallPassed = failReasons.length === 0;

    await prisma.evalResult.create({
      data: {
        goldenSampleId: sample.goldenSampleId,
        runId,
        actualOutput: sample.actualOutput,
        passed: overallPassed,
        scores,
        failReasons,
      },
    });

    results.push({
      goldenSampleId: sample.goldenSampleId,
      label: golden.label,
      passed: overallPassed,
      scores,
      failReasons,
    });
  }

  const passCount = results.filter((r) => r.passed).length;
  const failCount = results.length - passCount;

  return { runId, passCount, failCount, total: results.length, results };
}

// -----------------------------------------------------------------------
// Get results for a specific eval run
// -----------------------------------------------------------------------

export async function getEvalRun(runId: string) {
  return prisma.evalResult.findMany({
    where: { runId },
    include: {
      goldenSample: {
        select: { label: true, workflowType: true, difficulty: true, tags: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}
