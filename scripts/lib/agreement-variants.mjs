// Shared variant factories for shareholder/operating agreement QA.
// Used by scripts/verify-all-variants.mjs and scripts/qa-pipeline.mjs.
// DO NOT edit directly — regenerate from verify-all-variants.mjs when matrix changes.

const NAMES = [
  'Roberto Mendez', 'Ana Garcia', 'Carlos Lopez',
  'Maria Torres', 'Pedro Ramirez', 'Sofia Flores',
];


// ─── Payload builders ───────────────────────────────────────────────

function votingProfile(v) {
  const map = {
    unanimous: { sale: 'Decisión Unánime', major: 'Decisión Unánime', newMember: 'Decisión Unánime', dissolution: 'Decisión Unánime', removal: 'Decisión Unánime', loans: 'Decisión Unánime', capital: 'Decisión Unánime' },
    majority:  { sale: 'Mayoría',          major: 'Mayoría',          newMember: 'Mayoría',          dissolution: 'Mayoría',          removal: 'Mayoría',          loans: 'Mayoría',          capital: 'Mayoría' },
    mixed:     { sale: 'Supermayoría',     major: 'Mayoría',          newMember: 'Decisión Unánime', dissolution: 'Mayoría',          removal: 'Supermayoría',     loans: 'Mayoría',          capital: 'Supermayoría' },
  };
  return map[v];
}

function ownerArray(n) {
  const pctEach = Math.floor(100 / n);
  return Array.from({ length: n }, (_, i) => ({
    fullName: NAMES[i],
    ownership: i === n - 1 ? 100 - pctEach * (n - 1) : pctEach,
  }));
}

function baseFormData({
  entity, voting = 'majority', ownerCount = 2,
  rofr = true, dragTag = true, bank = 'two',
  majorityThreshold = 50.01, supermajorityThreshold = 75,
  // extended toggles (defaults preserve existing 180 behavior)
  nonCompete = 'No',
  nonSolicitation = 'Yes',
  confidentiality = 'Yes',
  distributionFrequency = 'Trimestral',
  transferToRelatives = 'free', // 'free' | 'unanimous' | 'majority'
  incapacityHeirs = true,
  divorceBuyout = true,
  moreCapital = 'Pro-Rata', // 'Pro-Rata' | 'No'
  loans = true,
  label,
}) {
  const isCorp = entity === 'C-Corp';
  const suffix = isCorp ? 'Corp' : 'LLC';
  const v = votingProfile(voting);
  const owners = ownerArray(ownerCount);

  const TRANSFER_OPTS = {
    free: 'Sí, podrán transferir libremente sus acciones.',
    unanimous: 'Sí, podrán transferir sus acciones si la decisión de los accionistas es unánime.',
    majority: 'Sí, podrán transferir sus acciones si la decisión de la mayoría los accionistas.',
  };
  const MORE_CAPITAL_OPTS = { 'Pro-Rata': 'Sí, Pro-Rata', 'No': 'No' };

  const agreement = {
    wants: 'Yes',
    majorityThreshold,
    supermajorityThreshold,
    distributionFrequency,
  };

  if (isCorp) {
    Object.assign(agreement, {
      corp_saleDecisionThreshold: v.sale,
      corp_bankSigners: bank === 'two' ? 'Dos firmantes' : 'Un firmante',
      corp_majorDecisionThreshold: v.major,
      corp_majorSpendingThreshold: '7500',
      corp_officerRemovalVoting: v.removal,
      corp_nonCompete: nonCompete,
      corp_nonSolicitation: nonSolicitation,
      corp_confidentiality: confidentiality,
      corp_taxOwner: NAMES[0],
      corp_rofr: rofr ? 'Yes' : 'No', corp_rofrOfferPeriod: 90,
      corp_transferToRelatives: TRANSFER_OPTS[transferToRelatives],
      corp_incapacityHeirsPolicy: incapacityHeirs ? 'Yes' : 'No',
      corp_divorceBuyoutPolicy: divorceBuyout ? 'Yes' : 'No',
      corp_tagDragRights: dragTag ? 'Yes' : 'No',
      corp_newShareholdersAdmission: v.newMember,
      corp_moreCapitalProcess: MORE_CAPITAL_OPTS[moreCapital],
      corp_shareholderLoans: loans ? 'Yes' : 'No',
      corp_shareholderLoansVoting: v.loans,
    });
    for (let i = 0; i < ownerCount; i++) agreement[`corp_capitalPerOwner_${i}`] = '50000';
  } else {
    Object.assign(agreement, {
      llc_companySaleDecision: v.sale,
      llc_bankSigners: bank === 'two' ? 'Dos firmantes' : 'Un firmante',
      llc_majorDecisions: v.major,
      llc_majorSpendingThreshold: '15000',
      llc_officerRemovalVoting: v.removal,
      llc_nonCompete: nonCompete,
      llc_nonSolicitation: nonSolicitation,
      llc_confidentiality: confidentiality,
      llc_nonDisparagement: 'Yes',
      llc_taxPartner: NAMES[0],
      llc_minTaxDistribution: 30,
      llc_rofr: rofr ? 'Yes' : 'No', llc_rofrOfferPeriod: 180,
      llc_incapacityHeirsPolicy: incapacityHeirs ? 'Yes' : 'No',
      llc_dissolutionDecision: v.dissolution,
      llc_newMembersAdmission: v.newMember,
      llc_newPartnersAdmission: v.newMember,
      llc_managingMembers: 'Yes',
      llc_additionalContributions: MORE_CAPITAL_OPTS[moreCapital],
      llc_memberLoans: loans ? 'Yes' : 'No',
      llc_memberLoansVoting: v.loans,
    });
    for (let i = 0; i < ownerCount; i++) agreement[`llc_capitalContributions_${i}`] = '50000';
  }

  return {
    label,
    formData: {
      company: {
        entityType: entity, companyNameBase: label.slice(0, 20), entitySuffix: suffix,
        formationState: 'Florida', companyName: label.slice(0, 20) + ' ' + suffix,
        hasUsaAddress: 'No', hasUsPhone: 'No', numberOfShares: 1000,
      },
      ownersCount: ownerCount,
      owners: Object.fromEntries(owners.map((o, i) => [String(i), o])),
      admin: isCorp
        ? { directorsAllOwners: 'Yes', officersAllOwners: 'Yes' }
        : { managersAllOwners: 'Yes' },
      agreement,
    },
    meta: {
      entity, voting, rofr, dragTag, bank, ownerCount,
      majorityThreshold, supermajorityThreshold,
      nonCompete, nonSolicitation, confidentiality, distributionFrequency,
      transferToRelatives, incapacityHeirs, divorceBuyout, moreCapital, loans,
    },
  };
}

function withResponsibilities(variant, titles, descs) {
  const isCorp = variant.meta.entity === 'C-Corp';
  const a = variant.formData.agreement;
  if (isCorp) {
    a.corp_hasSpecificResponsibilities = 'Yes';
    for (let i = 0; i < variant.meta.ownerCount; i++) {
      a[`corp_specificResponsibilities_${i}`] = titles[i];
      a[`corp_responsibilityDesc_${i}`] = descs[i];
    }
  } else {
    a.llc_hasSpecificRoles = 'Yes';
    for (let i = 0; i < variant.meta.ownerCount; i++) {
      a[`llc_specificRoles_${i}`] = titles[i];
      a[`llc_roleDesc_${i}`] = descs[i];
    }
  }
  variant.meta.responsibilities = true;
  return variant;
}

// ─── Per-group assertions ────────────────────────────────────────────

function assertMatrixBase(text, meta) {
  const errs = [];
  const { entity, voting, rofr, dragTag, bank, ownerCount } = meta;
  const isCorp = entity === 'C-Corp';

  if (rofr && !text.includes('Right of First Refusal')) errs.push('ROFR missing');
  if (!rofr && text.includes('Right of First Refusal')) errs.push('ROFR not removed');

  if (isCorp) {
    if (dragTag && !text.includes('Drag Along')) errs.push('Drag Along missing');
    if (!dragTag && text.includes('Drag Along')) errs.push('Drag Along not removed');
  }

  if (isCorp) {
    if (bank === 'two' && !text.includes('two of the Officers')) errs.push('Bank two missing');
    if (bank === 'one' && !text.includes('one of the Officers')) errs.push('Bank one missing');
  } else {
    if (bank === 'two' && !text.includes('any two Members or Managers')) errs.push('Bank two missing');
    if (bank === 'one' && !text.includes('the signature of any Member or Manager')) errs.push('Bank one missing');
  }

  const maxNameCheck = isCorp ? ownerCount : Math.min(ownerCount, 2);
  for (let i = 0; i < maxNameCheck; i++) {
    if (!text.includes(NAMES[i])) errs.push(`owner ${NAMES[i]} missing`);
  }

  const expect = {
    unanimous: isCorp ? 'Unanimous consent or approval' : 'Unanimous consent of the Members',
    majority:  isCorp ? 'Majority consent or approval'  : 'Majority consent of the Members',
    mixed:     isCorp ? 'Super Majority consent or approval' : 'Super Majority consent of the Members',
  };
  if (!text.includes(expect[voting])) errs.push(`sale voting "${expect[voting]}" missing`);
  return errs;
}

function assertResponsibilities(text, meta, titles, descs) {
  const errs = [];
  const isCorp = meta.entity === 'C-Corp';
  const heading = isCorp
    ? 'Specific Responsibilities of Shareholders.'
    : 'Specific Responsibilities of Members.';
  if (!text.includes(heading)) errs.push(`missing "${heading}"`);
  const max = isCorp ? meta.ownerCount : Math.min(meta.ownerCount, 2);
  for (let i = 0; i < max; i++) {
    if (!text.includes(titles[i])) errs.push(`missing title ${titles[i]}`);
    if (!text.includes(descs[i])) errs.push(`missing desc for owner ${i}`);
  }
  return errs;
}

function assertThresholds(text, meta) {
  const errs = [];
  const majPct = meta.majorityThreshold.toFixed(2);
  const supPct = meta.supermajorityThreshold.toFixed(2);
  if (!text.includes(majPct) && !text.includes(`${meta.majorityThreshold}%`)) {
    errs.push(`missing majority ${meta.majorityThreshold}`);
  }
  if (!text.includes(supPct) && !text.includes(`${meta.supermajorityThreshold}%`)) {
    errs.push(`missing supermajority ${meta.supermajorityThreshold}`);
  }
  return errs;
}

// ─── Variant factories ──────────────────────────────────────────────

function buildGroupM() {
  const out = [];
  const entities = ['C-Corp', 'LLC'];
  const votings = ['unanimous', 'majority', 'mixed'];
  const rofrs = [true, false];
  const drags = [true, false];
  const banks = ['two', 'one'];
  const owners = [1, 2, 3];
  for (const entity of entities)
    for (const voting of votings)
      for (const rofr of rofrs)
        for (const dragTag of drags)
          for (const bank of banks)
            for (const ownerCount of owners) {
              const label = `M_${entity}_${voting}_rofr${rofr ? 'Y' : 'N'}_dt${dragTag ? 'Y' : 'N'}_bank${bank}_${ownerCount}own`;
              const v = baseFormData({ entity, voting, ownerCount, rofr, dragTag, bank, label });
              v.run = (text) => assertMatrixBase(text, v.meta);
              out.push(v);
            }
  return out;
}

function buildGroupA() {
  const out = [];
  for (const entity of ['C-Corp', 'LLC']) {
    for (const ownerCount of [1, 2, 3, 4, 5, 6]) {
      const titles = [], descs = [];
      for (let i = 0; i < ownerCount; i++) {
        titles.push(`Role-${i}-Title-Sentinel-${ownerCount}own`);
        descs.push(`UniqueDesc${i}#${ownerCount} — marker text for owner ${i}.`);
      }
      const label = `A_${entity}_${ownerCount}own_RESP`;
      const v = withResponsibilities(
        baseFormData({ entity, ownerCount, label }),
        titles, descs,
      );
      v.run = (text) => assertResponsibilities(text, v.meta, titles, descs);
      out.push(v);
    }
  }
  return out;
}

function buildGroupB() {
  const out = [];
  const pairs = [
    { maj: 50.01, sup: 75 },
    { maj: 51, sup: 67 },
    { maj: 60, sup: 80 },
    { maj: 65, sup: 90 },
  ];
  for (const entity of ['C-Corp', 'LLC']) {
    for (const { maj, sup } of pairs) {
      const label = `B_${entity}_MAJ${maj}_SUP${sup}`;
      const v = baseFormData({
        entity, voting: 'mixed', ownerCount: 2,
        majorityThreshold: maj, supermajorityThreshold: sup, label,
      });
      v.run = (text) => assertThresholds(text, v.meta);
      out.push(v);
    }
  }
  return out;
}

function buildGroupC() {
  // Cross-feature stress: Responsibilities + mixed voting + custom thresholds
  // intersected with feature-flag corners (rofr/drag) × owner-count corners.
  const out = [];
  const entities = ['C-Corp', 'LLC'];
  const ownerCorners = [2, 6];
  const rofrs = [true, false];
  const drags = [true, false];
  for (const entity of entities)
    for (const ownerCount of ownerCorners)
      for (const rofr of rofrs)
        for (const dragTag of drags) {
          const titles = Array.from({ length: ownerCount }, (_, i) => `CrossTitle${i}`);
          const descs  = Array.from({ length: ownerCount }, (_, i) => `CrossDesc${i}-marker`);
          const label = `C_${entity}_${ownerCount}own_rofr${rofr ? 'Y' : 'N'}_dt${dragTag ? 'Y' : 'N'}_SUP80`;
          const v = withResponsibilities(
            baseFormData({
              entity, voting: 'mixed', ownerCount, rofr, dragTag, bank: 'two',
              majorityThreshold: 60, supermajorityThreshold: 80, label,
            }),
            titles, descs,
          );
          v.run = (text) => ([
            ...assertMatrixBase(text, v.meta),
            ...assertResponsibilities(text, v.meta, titles, descs),
            ...assertThresholds(text, v.meta),
          ]);
          out.push(v);
        }
  return out;
}

// Group D — Restrictive covenants: nonCompete × nonSolicitation × confidentiality
// Pairwise (8 combinations) × 2 entities = 16 variants. Exercises all 8 toggle
// states so any branch that was never rendered gets hit.
function buildGroupD() {
  const out = [];
  const triplets = [
    ['Yes', 'Yes', 'Yes'], ['Yes', 'Yes', 'No'], ['Yes', 'No', 'Yes'], ['Yes', 'No', 'No'],
    ['No',  'Yes', 'Yes'], ['No',  'Yes', 'No'], ['No',  'No', 'Yes'], ['No',  'No', 'No'],
  ];
  for (const entity of ['C-Corp', 'LLC']) {
    for (const [nc, ns, cf] of triplets) {
      const label = `D_${entity}_nc${nc[0]}_ns${ns[0]}_cf${cf[0]}`;
      const v = baseFormData({
        entity, ownerCount: 2,
        nonCompete: nc, nonSolicitation: ns, confidentiality: cf, label,
      });
      v.run = (text) => {
        const errs = assertMatrixBase(text, v.meta);
        // Core covenant-presence checks: if the user ticked the toggle, the
        // corresponding section MUST be in the document. Without this, silent
        // "injection did nothing" bugs (like the one that just shipped) are
        // invisible — numbering remains sequential because nothing was
        // inserted, but the clause the customer paid for is missing.
        if (nc === 'Yes' && !text.includes('Covenant Against Competition')) {
          errs.push('non-compete=Yes but "Covenant Against Competition" missing');
        }
        if (nc === 'No' && text.includes('Covenant Against Competition')) {
          errs.push('non-compete=No but "Covenant Against Competition" present');
        }
        return errs;
      };
      out.push(v);
    }
  }
  return out;
}

// Group E — distributionFrequency × moreCapital × loans. Previously pinned to
// Trimestral + Pro-Rata + Yes; this exercises every branch.
function buildGroupE() {
  const out = [];
  const freqs = ['Trimestral', 'Semestral', 'Anual', 'Discreción de la Junta'];
  for (const entity of ['C-Corp', 'LLC']) {
    for (const freq of freqs) {
      for (const moreCapital of ['Pro-Rata', 'No']) {
        for (const loans of [true, false]) {
          if (freq === 'Semestral' && moreCapital === 'No' && !loans) continue; // trim
          const label = `E_${entity}_${freq.slice(0, 4)}_mc${moreCapital === 'Pro-Rata' ? 'P' : 'N'}_ln${loans ? 'Y' : 'N'}`;
          const v = baseFormData({
            entity, ownerCount: 2,
            distributionFrequency: freq, moreCapital, loans, label,
          });
          v.run = (text) => assertMatrixBase(text, v.meta);
          out.push(v);
        }
      }
    }
  }
  return out;
}

// Group F — transferToRelatives (3 values) × incapacityHeirs × divorceBuyout.
function buildGroupF() {
  const out = [];
  const transfers = ['free', 'unanimous', 'majority'];
  for (const entity of ['C-Corp', 'LLC']) {
    for (const transfer of transfers) {
      for (const heirs of [true, false]) {
        for (const divorce of [true, false]) {
          const label = `F_${entity}_xfer${transfer[0]}_heirs${heirs ? 'Y' : 'N'}_div${divorce ? 'Y' : 'N'}`;
          const v = baseFormData({
            entity, ownerCount: 2,
            transferToRelatives: transfer,
            incapacityHeirs: heirs, divorceBuyout: divorce,
            label,
          });
          v.run = (text) => assertMatrixBase(text, v.meta);
          out.push(v);
        }
      }
    }
  }
  return out;
}


export { NAMES, buildGroupM, buildGroupA, buildGroupB, buildGroupC, buildGroupD, buildGroupE, buildGroupF, baseFormData, withResponsibilities, assertMatrixBase, assertResponsibilities, assertThresholds };
