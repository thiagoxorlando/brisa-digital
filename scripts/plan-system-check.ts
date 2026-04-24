import {
  calculateCommission,
  calculateNetAmount,
  getPlanDefinition,
  resolvePlanInfo,
} from "../lib/plans";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function run() {
  const free = resolvePlanInfo({ plan: "free" });
  const pro = resolvePlanInfo({ plan: "pro" });
  const premium = resolvePlanInfo({ plan: "premium" });

  assert(free.maxActiveJobs === 1, "FREE should allow only 1 active job");
  assert(free.maxHiresPerJob === 3, "FREE should allow only 3 hires per job");
  assert(pro.maxActiveJobs === null, "PRO should allow unlimited active jobs");
  assert(pro.maxHiresPerJob === null, "PRO should allow unlimited hires");
  assert(premium.maxActiveJobs === null, "PREMIUM should allow unlimited active jobs");
  assert(premium.maxHiresPerJob === null, "PREMIUM should allow unlimited hires");

  assert(getPlanDefinition("free").commissionRate === 0.2, "FREE commission must be 20%");
  assert(getPlanDefinition("pro").commissionRate === 0.1, "PRO commission must be 10%");
  assert(getPlanDefinition("premium").commissionRate === 0.1, "PREMIUM commission must default to 10%");

  assert(calculateCommission(1000, "free") === 200, "FREE commission on 1000 should be 200");
  assert(calculateCommission(1000, "pro") === 100, "PRO commission on 1000 should be 100");
  assert(calculateCommission(1000, "premium") === 100, "PREMIUM commission on 1000 should be 100");

  assert(calculateNetAmount(1000, "free") === 800, "FREE net on 1000 should be 800");
  assert(calculateNetAmount(1000, "pro") === 900, "PRO net on 1000 should be 900");
  assert(calculateNetAmount(1000, "premium") === 900, "PREMIUM net on 1000 should be 900");

  console.log("plan-system-check: all assertions passed");
}

run();
