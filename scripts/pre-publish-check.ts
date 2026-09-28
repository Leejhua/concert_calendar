#!/usr/bin/env npx tsx
/**
 * Pre-publish gate: runs every regression suite + lint + build in sequence.
 * Any single step failing (non-zero exit) blocks publication immediately.
 *
 * Steps (6 total):
 *   1. test:dedup
 *   2. test:artist-identity
 *   3. test:score
 *   4. test:location
 *   5. lint
 *   6. build
 *
 * Usage: npm run pre-publish-check
 */
import { execSync } from 'node:child_process';

type CheckStep = {
  label: string;
  command: string;
};

const STEPS: CheckStep[] = [
  { label: 'test:dedup', command: 'npm run test:dedup' },
  { label: 'test:artist-identity', command: 'npm run test:artist-identity' },
  { label: 'test:score', command: 'npm run test:score' },
  { label: 'test:location', command: 'npm run test:location' },
  { label: 'lint', command: 'npm run lint' },
  { label: 'build', command: 'npm run build' },
];

function main() {
  const total = STEPS.length;

  for (let index = 0; index < STEPS.length; index += 1) {
    const step = STEPS[index];
    const progress = `${index + 1}/${total}`;
    console.log(`\n▶ [${progress}] Running ${step.label} ...`);

    try {
      execSync(step.command, {
        stdio: 'inherit',
        cwd: process.cwd(),
        env: process.env,
      });
      console.log(`✔ [${progress}] ${step.label} passed`);
    } catch (error) {
      const code = error instanceof Error && 'status' in error ? (error as { status: number }).status : 1;
      console.error(`\n❌ Pre-publish check failed at: ${step.label}`);
      console.error(`   command: ${step.command}`);
      console.error(`   exit code: ${code}`);
      process.exit(1);
    }
  }

  console.log(`\n✅ All pre-publish checks passed (${total}/${total})`);
  process.exit(0);
}

main();