// Smoke test: end-to-end mapper + county resolution from form data.
// Simulates the Stripe webhook calling mapFormToDocgenAnswers with no
// explicit litigation county — the resolver should derive it from the address.
import { mapFormToDocgenAnswers } from "../src/lib/agreement-mapper";

async function main() {
  const formData: any = {
    ownersCount: 2,
    company: {
      entityType: "C-Corp",
      companyNameBase: "VANILLA ICE CREAM",
      entitySuffix: "Corp",
      formationState: "Florida",
      addressLine1: "200 S Biscayne Blvd",
      addressLine2: "Suite 2790",
      city: "Miami",
      state: "FL",
      postalCode: "33131",
      numberOfShares: 10000,
      businessPurpose: "Ice cream manufacturing",
    },
    owners: [
      { firstName: "Ben", lastName: "Jerry", ownership: 60 },
      { firstName: "Jelly", lastName: "Bean", ownership: 40 },
    ],
    admin: {
      directorsCount: 2,
      directorsAllOwners: "Yes",
      officersCount: 2,
      officersAllOwners: "Yes",
    },
    agreement: {
      // NO litigationCounty — should be derived from company address
      majorityThreshold: 50.01,
      supermajorityThreshold: 75,
      corp_capitalPerOwner_0: "60000",
      corp_capitalPerOwner_1: "40000",
      corp_moreCapitalDecision: "Mayoría",
      corp_shareholderLoansVoting: "Mayoría",
      corp_saleDecisionThreshold: "Decisión Unánime",
      corp_majorDecisionThreshold: "Mayoría",
      corp_majorSpendingThreshold: "5000",
      corp_bankSigners: "Dos firmantes",
      corp_newShareholdersAdmission: "Supermayoría",
      corp_officerRemovalVoting: "Supermayoría",
      corp_transferToRelatives: "libremente",
      corp_rofr: "Yes",
      corp_rofrOfferPeriod: 90,
      corp_nonCompete: "No",
      corp_nonSolicitation: "Yes",
      corp_confidentiality: "Yes",
    },
  };

  // Case A: user provided a US address
  const answersA = await mapFormToDocgenAnswers(formData);
  console.log("\n--- Case A: user-provided address ---");
  console.log("principal_address:", answersA.principal_address);
  console.log("county:", answersA.county);
  const okA = answersA.county === "Miami-Dade";

  // Case B: user selected "No US address" (hasUsaAddress="No") — no city/state
  const formDataB: any = {
    ...formData,
    company: {
      entityType: "C-Corp",
      companyNameBase: "PLAYWRIGHT QA",
      entitySuffix: "Corp",
      formationState: "Florida",
      hasUsaAddress: "No",
      numberOfShares: 5000,
    },
  };
  const answersB = await mapFormToDocgenAnswers(formDataB);
  console.log("\n--- Case B: no US address (Avenida Legal fallback) ---");
  console.log("principal_address:", answersB.principal_address);
  console.log("county:", answersB.county);
  const okB =
    answersB.county === "Miami-Dade" &&
    answersB.principal_address === "12550 Biscayne Blvd Ste 110, North Miami, FL 33181";

  const allOk = okA && okB;
  console.log(`\n${allOk ? "ALL PASS" : "FAIL"} — A=${okA} B=${okB}`);
  process.exit(allOk ? 0 : 1);
}
main().catch((err) => { console.error(err); process.exit(1); });
