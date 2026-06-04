/* ============================================================
   app.js — Décision Immo : moteur d'analyse temps réel
   ============================================================ */

const FRAIS_NOTAIRE_PCT = 0.075;
const MEUBLE_BONUS = 0.12;        // +12% loyer en meublé
const ABATTEMENT_LMNP = 0.50;     // micro-BIC
const ABATTEMENT_VIDE = 0.30;     // micro-foncier

// Bonus annexes : impact sur loyer estimé et sur la valeur projetée
const ANNEX_BONUS = {
  cave:           { rent: 0.03, value: 0.03 },
  parkingPrivate: { rent: 0.05, value: 0.06 },
  parkingBox:     { rent: 0.07, value: 0.10 },
};

const fmtEUR  = n => isFinite(n) ? new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(n) : "—";
const fmtEUR2 = n => isFinite(n) ? new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR",maximumFractionDigits:2}).format(n) : "—";
const fmtPct  = (n,d=2) => isFinite(n) ? new Intl.NumberFormat("fr-FR",{style:"percent",minimumFractionDigits:d,maximumFractionDigits:d}).format(n/100) : "—";

const $ = id => document.getElementById(id);
const num = id => +$(id).value || 0;
const val = id => $(id).value;

/* ============================================================
   ÉTAT GLOBAL — commune sélectionnée
   ============================================================ */

let SELECTED_COMMUNE = null; // { nom, code, codeDepartement, population, centre }

/* ============================================================
   LECTURE DES INPUTS
   ============================================================ */

function readInputs() {
  return {
    bien: {
      city: val("b-city"),
      district: val("b-district"),
      type: val("b-type"),
      surface: num("b-surface"),
      floor: num("b-floor"),
      price: num("b-price"),
      works: num("b-works"),
      rent: num("b-rent"),
      rentMode: val("b-rent-mode"),
      charges: num("b-charges"),
      taxe: num("b-taxe"),
      elevator: val("b-elevator") === "true",
      cave: val("b-cave") === "true",
      parking: val("b-parking"), // "none" | "private" | "box"
      dpe: val("b-dpe"),
      ges: val("b-ges"),
      coproLots: num("b-copro-lots"),
      condition: val("b-condition"),
    },
    loan: {
      apport: num("l-apport"),
      borrowNotaire: val("l-borrow-notaire") === "true",
      rate: num("l-rate"),
      insurance: num("l-insurance"),
      duration: num("l-duration"),
      deferred: $("l-deferred").checked,
    },
    assumptions: {
      gestion:  num("a-gestion"),
      vacance:  num("a-vacance"),
      entretien: num("a-entretien"),
      pno:       num("a-pno"),
      chargesPct:num("a-charges-pct"),
      tmi:       num("a-tmi"),
      amortBatiPct:    num("a-amort-bati-pct"),
      amortBatiDuree:  num("a-amort-bati-duree"),
      amortMobPct:     num("a-amort-mob-pct"),
      amortMobDuree:   num("a-amort-mob-duree"),
    }
  };
}

/* ============================================================
   ESTIMATION LOYER / PRIX MARCHÉ
   ============================================================ */

function annexBonus(bien, kind) {
  // kind = "rent" | "value" — retourne le multiplicateur (ex: 1.08)
  let mult = 1;
  if (bien.cave) mult *= 1 + ANNEX_BONUS.cave[kind];
  if (bien.parking === "private") mult *= 1 + ANNEX_BONUS.parkingPrivate[kind];
  else if (bien.parking === "box") mult *= 1 + ANNEX_BONUS.parkingBox[kind];
  return mult;
}

function estimateMarketRent(bien) {
  const m = getMarket(bien.city, SELECTED_COMMUNE);
  if (!m || !bien.surface) return 0;
  // surface impacte le €/m² : petites surfaces louent + cher au m²
  let factor = 1;
  if (bien.surface < 25) factor = 1.10;
  else if (bien.surface < 35) factor = 1.05;
  else if (bien.surface > 70) factor = 0.92;
  // état impacte aussi
  if (bien.condition === "neuf") factor *= 1.05;
  else if (bien.condition === "rafraichir") factor *= 0.95;
  else if (bien.condition === "travaux") factor *= 0.85;
  // étage haut sans ascenseur
  if (bien.floor >= 3 && !bien.elevator) factor *= 0.97;
  // bonus cave / parking
  factor *= annexBonus(bien, "rent");
  const median = (m.rentM2[0] + m.rentM2[1]) / 2;
  return Math.round(median * factor * bien.surface);
}

/* ============================================================
   PRÊT
   ============================================================ */

function monthlyPayment(principal, annualRate, years) {
  if (principal <= 0 || years <= 0) return 0;
  const r = annualRate / 100 / 12;
  const n = years * 12;
  if (r === 0) return principal / n;
  return principal * r / (1 - Math.pow(1 + r, -n));
}

function loanComputation(amount, rate, insurance, duration, deferred) {
  const r = rate / 100 / 12;
  const insMonthly = (amount * insurance / 100) / 12;
  const totalMonths = duration * 12;
  let monthly, totalInterest, deferredMonthly = 0;

  if (deferred) {
    const remaining = totalMonths - 24;
    const interestOnly = amount * r;
    deferredMonthly = interestOnly + insMonthly;
    monthly = monthlyPayment(amount, rate, remaining / 12);
    totalInterest = (interestOnly * 24) + (monthly * remaining - amount);
  } else {
    monthly = monthlyPayment(amount, rate, duration);
    totalInterest = monthly * totalMonths - amount;
  }
  const totalInsurance = insMonthly * totalMonths;
  return {
    monthly,
    insMonthly,
    monthlyTotal: monthly + insMonthly,
    totalInterest,
    totalInsurance,
    totalCost: amount + totalInterest + totalInsurance,
    deferredMonthly,
  };
}

function buildAmort(amount, rate, duration, comp, deferred) {
  const rows = [];
  const r = rate / 100 / 12;
  let balance = amount;
  for (let y = 1; y <= duration; y++) {
    const startBal = balance;
    let yInt = 0, yPrin = 0;
    for (let m = 1; m <= 12; m++) {
      const i = (y - 1) * 12 + m;
      const interest = balance * r;
      let principal;
      if (deferred && i <= 24) {
        principal = 0;
      } else {
        principal = comp.monthly - interest;
        if (principal > balance) principal = balance;
      }
      yInt += interest;
      yPrin += principal;
      balance -= principal;
      if (balance < 0.01) balance = 0;
    }
    rows.push({ y, startBal, interest: yInt, principal: yPrin, ins: comp.insMonthly * 12 });
    if (balance <= 0.01) break;
  }
  return rows;
}

/* ============================================================
   PROJECTION PATRIMONIALE — helpers
   ============================================================ */

function paymentForYear(y, comp, loan) {
  if (y > loan.duration) return 0;
  if (loan.deferred && y <= 2) return comp.deferredMonthly;
  return comp.monthlyTotal;
}

function remainingBalance(amort, N) {
  if (N <= 0) return amort[0]?.startBal ?? 0;
  if (N >= amort.length) return 0;
  const row = amort[N - 1];
  return row ? Math.max(0, row.startBal - row.principal) : 0;
}

function npv(rate, flows) {
  let s = 0;
  for (let t = 0; t < flows.length; t++) s += flows[t] / Math.pow(1 + rate, t);
  return s;
}
function npvDeriv(rate, flows) {
  let s = 0;
  for (let t = 1; t < flows.length; t++) s += -t * flows[t] / Math.pow(1 + rate, t + 1);
  return s;
}

function irr(flows) {
  const positives = flows.some(f => f > 0);
  const negatives = flows.some(f => f < 0);
  if (!positives || !negatives) return null;

  let r = 0.05;
  for (let i = 0; i < 50; i++) {
    const f = npv(r, flows);
    const fp = npvDeriv(r, flows);
    if (!isFinite(f) || !isFinite(fp) || fp === 0) break;
    const step = f / fp;
    if (Math.abs(step) > 0.5) break;
    const next = r - step;
    if (next <= -0.999) break;
    if (Math.abs(step) < 1e-7) return next * 100;
    r = next;
  }
  const probes = [-0.95, -0.5, -0.1, 0, 0.05, 0.20, 0.50, 1.0, 3.0];
  let lo = null, hi = null;
  for (let i = 0; i < probes.length - 1; i++) {
    const a = npv(probes[i], flows), b = npv(probes[i + 1], flows);
    if (isFinite(a) && isFinite(b) && a * b < 0) { lo = probes[i]; hi = probes[i + 1]; break; }
  }
  if (lo === null) return null;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid, flows);
    if (Math.abs(fm) < 1e-7) return mid * 100;
    if (npv(lo, flows) * fm < 0) hi = mid; else lo = mid;
  }
  return ((lo + hi) / 2) * 100;
}

function buildProjection(a, horizonYears, growthPct) {
  const g = growthPct / 100;
  const N = horizonYears;
  const amort = buildAmort(a.toBorrow, a.loan.rate, a.loan.duration, a.loanComp, a.loan.deferred);

  const initialOutflow = a.loan.apport + (a.loan.borrowNotaire ? 0 : a.fraisNotaire);
  const flows = [-initialOutflow];

  let cumCF = 0;
  for (let y = 1; y <= N; y++) {
    const monthlyPay = paymentForYear(y, a.loanComp, a.loan);
    const annualCF = (a.rentNetMonthly - monthlyPay) * 12;
    cumCF += annualCF;
    flows.push(annualCF);
  }

  // Base de valorisation : prix d'achat + bonus annexes (cave/parking)
  // Les annexes augmentent la valeur intrinsèque du bien sans changer le prix payé.
  const valueBase = a.bien.price * annexBonus(a.bien, "value");
  const projectedValue = valueBase * Math.pow(1 + g, N);
  const balance = remainingBalance(amort, N);
  const sale = projectedValue - balance;
  flows[flows.length - 1] += sale;

  const netWealth = projectedValue - balance;
  const grossGain = projectedValue - a.bien.price;
  const tri = irr(flows);

  return { growthPct, projectedValue, balance, netWealth, grossGain, cumCF, tri };
}

/* TRI(N) pour chaque N entre 1 et maxYears, à taux de croissance fixé.
   Utilisé pour identifier l'année de revente optimale. */
function buildTriSeries(a, growthPct, maxYears = 30) {
  const g = growthPct / 100;
  const amort = buildAmort(a.toBorrow, a.loan.rate, a.loan.duration, a.loanComp, a.loan.deferred);
  const initialOutflow = a.loan.apport + (a.loan.borrowNotaire ? 0 : a.fraisNotaire);
  const valueBase = a.bien.price * annexBonus(a.bien, "value");

  // Pré-calcul des cash-flows annuels (sans la vente terminale)
  const baseFlows = [-initialOutflow];
  for (let y = 1; y <= maxYears; y++) {
    const monthlyPay = paymentForYear(y, a.loanComp, a.loan);
    baseFlows.push((a.rentNetMonthly - monthlyPay) * 12);
  }

  // Pour chaque N, ajouter la vente terminale au flow de l'année N et calculer le TRI
  const series = [];
  for (let N = 1; N <= maxYears; N++) {
    const flows = baseFlows.slice(0, N + 1);
    const projectedValue = valueBase * Math.pow(1 + g, N);
    const balance = remainingBalance(amort, N);
    flows[N] += projectedValue - balance;
    series.push({ year: N, tri: irr(flows) });
  }
  return series;
}

/* ============================================================
   ANALYSE FINANCIÈRE
   ============================================================ */

function analyze({ bien, loan, assumptions }) {
  if (!bien.price || !bien.surface) return null;

  // Loyer effectif (auto-estimé si vide)
  const marketRent = estimateMarketRent(bien);
  const isMeuble = bien.rentMode === "meuble" || bien.rentMode === "lmnp-reel";
  let baseRent = bien.rent || marketRent;
  if (isMeuble) baseRent = Math.round(baseRent * (1 + MEUBLE_BONUS));

  const rentAnnual = baseRent * 12;

  // Coût acquisition
  const fraisNotaire = bien.price * FRAIS_NOTAIRE_PCT;
  const totalAcq = bien.price + bien.works + fraisNotaire;

  // Emprunt : base = prix + travaux ; +notaire si demandé ; -apport
  let toBorrow = bien.price + bien.works;
  if (loan.borrowNotaire) toBorrow += fraisNotaire;
  toBorrow = Math.max(0, toBorrow - loan.apport);

  const loanComp = loanComputation(toBorrow, loan.rate, loan.insurance, loan.duration, loan.deferred);

  // Charges annuelles
  const taxeF = bien.taxe || 0;
  const chargesNonRecup = bien.charges * 12 * (assumptions.chargesPct / 100);
  const gestion   = rentAnnual * (assumptions.gestion / 100);
  const pno       = assumptions.pno;
  const vacance   = rentAnnual * (assumptions.vacance / 100);
  const entretien = rentAnnual * (assumptions.entretien / 100);
  const chargesTot = taxeF + chargesNonRecup + gestion + pno + vacance + entretien;

  const rentNet = rentAnnual - chargesTot;
  const rentNetMonthly = rentNet / 12;

  const yieldGross = (rentAnnual / bien.price) * 100;
  const yieldNet   = (rentNet / totalAcq) * 100;

  const cashflowPre = rentNetMonthly - loanComp.monthlyTotal;

  // Cash-flow après impôts (selon régime fiscal)
  const taxRate = (assumptions.tmi + 17.2) / 100; // TMI + prélèvements sociaux
  let taxAnnual = 0;
  let taxDetails = null;

  if (bien.rentMode === "lmnp-reel") {
    // LMNP régime réel : on déduit charges réelles + intérêts d'emprunt + amortissements
    // L'amortissement bâti et mobilier sont calculés en linéaire.
    // Les intérêts varient chaque année → on prend la moyenne sur durée du prêt
    //   (ou sur l'horizon stable des 10 premières années si durée > 10).
    const amortBati = (bien.price * (assumptions.amortBatiPct / 100)) / Math.max(1, assumptions.amortBatiDuree);
    const amortMob  = (bien.price * (assumptions.amortMobPct  / 100)) / Math.max(1, assumptions.amortMobDuree);
    const amortAnnual = amortBati + amortMob;

    // Intérêts moyens sur la durée du prêt (intérêts totaux / durée)
    const interestsTotal = (loanComp.monthly * 12 * loan.duration) - toBorrow;
    const interestsAvg = loan.duration > 0 ? Math.max(0, interestsTotal / loan.duration) : 0;
    const insuranceAnnual = loanComp.monthlyInsurance * 12;

    // Charges déductibles : tout sauf vacance (la vacance = manque à gagner, déjà reflété dans les revenus réels)
    const chargesDeductibles = taxeF + chargesNonRecup + gestion + pno + entretien;

    const resultatBic = rentAnnual - chargesDeductibles - interestsAvg - insuranceAnnual - amortAnnual;
    // En LMNP, l'amortissement ne peut pas créer de déficit : il est plafonné au résultat avant amortissement.
    const resultatAvantAmort = rentAnnual - chargesDeductibles - interestsAvg - insuranceAnnual;
    const amortDeductible = Math.min(amortAnnual, Math.max(0, resultatAvantAmort));
    const resultatFiscal = Math.max(0, resultatAvantAmort - amortDeductible);
    taxAnnual = resultatFiscal * taxRate;

    taxDetails = {
      regime: "lmnp-reel",
      amortBati, amortMob, amortAnnual, amortDeductible,
      interestsAvg, insuranceAnnual,
      chargesDeductibles,
      resultatAvantAmort,
      resultatFiscal,
    };
  } else {
    // Vide : micro-foncier abattement 30% sur loyer brut
    // Meublé : micro-BIC abattement 50%
    const ab = isMeuble ? ABATTEMENT_LMNP : ABATTEMENT_VIDE;
    const taxableAnnual = Math.max(0, rentAnnual * (1 - ab));
    taxAnnual = taxableAnnual * taxRate;
    taxDetails = { regime: bien.rentMode, abattement: ab, taxableAnnual };
  }
  const cashflowPost = cashflowPre - taxAnnual / 12;

  // Loyer d'équilibre (avant impôts, sur cash-flow nul)
  // R*(1 - pctVar) - fixe = monthlyLoan ⇒ R = (monthlyLoan + fixe) / (1 - pctVar)
  const pctVar = (assumptions.gestion + assumptions.vacance + assumptions.entretien) / 100;
  const fixedMonthly = (taxeF + chargesNonRecup + pno) / 12;
  const breakEvenRent = (loanComp.monthlyTotal + fixedMonthly) / (1 - pctVar);

  // Effort total cumulé sur la durée du prêt
  const effortTotal = cashflowPre < 0 ? cashflowPre * loan.duration * 12 : 0;

  return {
    bien, loan, assumptions,
    marketRent,
    baseRent,
    rentAnnual,
    fraisNotaire,
    totalAcq,
    toBorrow,
    loanComp,
    chargesTot,
    rentNet, rentNetMonthly,
    yieldGross, yieldNet,
    cashflowPre, cashflowPost,
    breakEvenRent,
    effortTotal,
    taxAnnual,
    taxDetails,
  };
}

/* ============================================================
   COMPARAISON MARCHÉ
   ============================================================ */

function compareToMarket(a) {
  const m = getMarket(a.bien.city, SELECTED_COMMUNE);
  if (!m) return [];

  const pricem2 = a.bien.price / a.bien.surface;
  const rentm2  = a.baseRent / a.bien.surface;

  return [
    {
      label: "Prix au m²",
      value: pricem2,
      range: m.priceM2,
      unit: "€/m²",
      lowerIsBetter: true,
      comment: pricem2 < m.priceM2[0]
        ? "Prix sous la fourchette — bonne affaire ou défaut caché ?"
        : pricem2 > m.priceM2[1]
        ? "Prix au-dessus du marché — marge de négociation possible"
        : "Prix dans la fourchette de marché"
    },
    {
      label: "Loyer atteignable au m²",
      value: rentm2,
      range: m.rentM2,
      unit: "€/m²",
      lowerIsBetter: false,
      comment: rentm2 < m.rentM2[0]
        ? "Loyer estimé bas — potentiel d'augmentation"
        : rentm2 > m.rentM2[1]
        ? "Loyer estimé haut — risque de vacance / négociation locataire"
        : "Loyer cohérent avec le marché"
    },
  ];
}

/* ============================================================
   RISQUES & OPTIMISATIONS
   ============================================================ */

function buildRisks(a) {
  const risks = [];
  const b = a.bien;
  const m = getMarket(b.city, SELECTED_COMMUNE);

  // DPE
  if (b.dpe === "G") risks.push({ level: "high", title: "DPE G — Interdit à la location",
    text: "Logement classé passoire thermique. Location interdite depuis 2025. Audit énergétique obligatoire à la vente. Travaux de rénovation chiffrés à 15 000–40 000 € souvent nécessaires." });
  else if (b.dpe === "F") risks.push({ level: "high", title: "DPE F — Interdit en 2028",
    text: "Location interdite à compter du 1er janvier 2028. Prévoir une rénovation énergétique avant cette date pour pouvoir louer." });
  else if (b.dpe === "E") risks.push({ level: "med", title: "DPE E — Interdit en 2034",
    text: "Location possible mais interdite dès 2034. Anticiper les travaux pour maintenir la valeur locative." });

  // GES
  if (b.ges === "F" || b.ges === "G") risks.push({ level: "high", title: `GES ${b.ges} — Empreinte carbone élevée`,
    text: "Pénalisant à la revente, surcoût pour le locataire, exposition à de futures contraintes réglementaires." });

  // Cash-flow
  if (a.cashflowPre < -300) risks.push({ level: "high", title: `Effort d'épargne lourd (${fmtEUR(a.cashflowPre)}/mois)`,
    text: `Sur ${a.loan.duration} ans, vous décaisserez ${fmtEUR(a.effortTotal)} cumulés de votre poche, hors fiscalité. Vérifiez la soutenabilité dans votre budget.` });
  else if (a.cashflowPre < 0) risks.push({ level: "med", title: `Cash-flow négatif (${fmtEUR(a.cashflowPre)}/mois)`,
    text: "Investissement non auto-financé. À compenser par la valorisation du bien et l'effet de levier fiscal." });

  // Prix vs marché
  if (m) {
    const pm = a.bien.price / a.bien.surface;
    if (pm > m.priceM2[1] * 1.05) risks.push({ level: "med", title: "Prix supérieur au marché",
      text: `Prix au m² (${fmtEUR(pm)}) au-dessus de la fourchette haute (${fmtEUR(m.priceM2[1])}). Marge de négociation possible.` });
    if (pm < m.priceM2[0] * 0.92) risks.push({ level: "med", title: "Prix anormalement bas",
      text: "Vigilance : peut cacher un défaut (RDC, vis-à-vis, copro fragile, secteur peu attractif). Demander explication à l'agent." });
  }

  // Étage
  if (b.floor === 0) risks.push({ level: "med", title: "Rez-de-chaussée",
    text: "Sécurité, vis-à-vis, luminosité — décote ~10-15% à la revente. Vérifier les protections (barreaux, volets)." });
  if (b.floor >= 3 && !b.elevator) risks.push({ level: "low", title: "Étage élevé sans ascenseur",
    text: "Limite la cible locataire (seniors, familles avec poussette). Décote possible." });

  // Copropriété
  if (b.coproLots > 0 && b.coproLots <= 4) risks.push({ level: "med", title: "Très petite copropriété",
    text: `${b.coproLots} lots seulement. Si un copropriétaire ne paie pas, votre quote-part de charges explose. Vérifier sa solvabilité et le règlement de copro.` });

  // État
  if (b.condition === "travaux" && b.works < 15000) risks.push({ level: "med", title: "Travaux probablement sous-estimés",
    text: `Bien marqué \"gros travaux\" mais budget renseigné de ${fmtEUR(b.works)}. Faire chiffrer 2-3 devis avant offre.` });

  // Charges copro
  if (b.charges > 0 && b.surface > 0) {
    const chargesAnnuel = b.charges * 12;
    const ratio = chargesAnnuel / b.surface;
    if (ratio > 50) risks.push({ level: "med", title: `Charges copro élevées (${fmtEUR(ratio)}/m²/an)`,
      text: "Au-dessus de 50€/m²/an : souvent chauffage collectif, ascenseur, gardien, espaces verts. Impacte directement la rentabilité." });
  }

  // Loyer estimé incohérent
  if (b.rent > 0 && a.marketRent > 0) {
    const gap = (b.rent - a.marketRent) / a.marketRent;
    if (gap > 0.15) risks.push({ level: "med", title: "Loyer saisi optimiste",
      text: `Vous tablez sur ${fmtEUR(b.rent)}/mois alors que le marché médian est à ${fmtEUR(a.marketRent)}/mois. Risque de vacance ou rotation.` });
  }

  if (risks.length === 0) risks.push({ level: "low", title: "Aucun risque majeur identifié",
    text: "Aucun signal d'alerte sur les critères automatisés. Vérifiez quand même les PV d'AG, diagnostics et état réel en visite." });

  return risks;
}

function buildOptimisations(a) {
  const opti = [];
  const b = a.bien;

  // Meublé / LMNP
  if (b.rentMode === "vide") {
    const rentMeuble = Math.round(a.baseRent * (1 + MEUBLE_BONUS));
    const gainAnnuel = (rentMeuble - a.baseRent) * 12;
    opti.push({
      title: "Passer en location meublée (LMNP)",
      text: `Loyer +${fmtPct(MEUBLE_BONUS * 100, 0)} → ${fmtEUR(rentMeuble)}/mois (+${fmtEUR(gainAnnuel)}/an). Micro-BIC : abattement 50% (vs 30% en vide). Régime réel : amortissement du bien qui neutralise l'IR pendant 8-15 ans — testez les 3 modes via le sélecteur "Mode location".`
    });
  } else if (b.rentMode === "meuble") {
    // Estimer le gain en passant en LMNP réel : impôt micro-BIC actuel vs ~0 en réel pendant des années
    const tmiTotal = a.assumptions.tmi + 17.2;
    const taxMicroBic = a.taxAnnual;
    if (taxMicroBic > 200) {
      opti.push({
        title: "Passer au régime réel LMNP",
        text: `Vous économiseriez environ ${fmtEUR(taxMicroBic)}/an d'impôts (TMI ${tmiTotal.toFixed(1)}%) tant que les amortissements absorbent le résultat — typiquement 10-15 ans. Bascule via "Mode location → LMNP régime réel" pour simuler.`
      });
    }
  }

  // Apport supplémentaire
  if (a.cashflowPre < -100) {
    const gainPerK = a.loanComp.monthlyTotal / a.toBorrow * 1000; // mensualité par 1000€ empruntés
    const apportNeeded = Math.ceil(Math.abs(a.cashflowPre) / gainPerK / 5) * 5000;
    opti.push({
      title: `Renforcer l'apport (~${fmtEUR(apportNeeded)} supplémentaires)`,
      text: `Pour ramener le cash-flow à l'équilibre, environ ${fmtEUR(apportNeeded)} d'apport en plus suffiraient (calcul indicatif). Réduit la mensualité et les intérêts totaux.`
    });
  }

  // Allonger durée
  if (a.loan.duration < 25 && a.cashflowPre < 0) {
    const longer = loanComputation(a.toBorrow, a.loan.rate, a.loan.insurance, 25, a.loan.deferred);
    const saving = a.loanComp.monthlyTotal - longer.monthlyTotal;
    if (saving > 30) {
      opti.push({
        title: `Allonger la durée à 25 ans`,
        text: `Mensualité : ${fmtEUR(longer.monthlyTotal)} (gain ${fmtEUR(saving)}/mois). Coût total du crédit plus élevé (+${fmtEUR(longer.totalCost - a.loanComp.totalCost)}) mais cash-flow amélioré.`
      });
    }
  }

  // Travaux énergétiques
  if (b.dpe === "F" || b.dpe === "G" || b.dpe === "E") {
    opti.push({
      title: "Travaux de rénovation énergétique",
      text: `Faire passer le DPE à D minimum sécurise la location long terme. Aides disponibles : MaPrimeRénov', éco-PTZ, CEE. Le surcoût peut être déductible des revenus fonciers (régime réel) ou amortissable (LMNP).`
    });
  }

  // Parking absent en zone tendue
  const mForOpti = getMarket(b.city, SELECTED_COMMUNE);
  if (b.parking === "none" && mForOpti && mForOpti.tension >= 4) {
    opti.push({
      title: "Acquérir une place de parking annexe",
      text: `Pas de parking sur ce bien alors que ${b.city} est en forte tension. Une place louée séparément se vend 8 000–25 000 € selon secteur et génère 60–120 €/mois. Améliore l'attractivité locative et la revente.`
    });
  }
  if (b.parking === "private") {
    opti.push({
      title: "Louer la place de parking séparément",
      text: "En zone tendue, dissocier le bail logement et le bail parking peut être plus rentable (jusqu'à +30% sur le tarif parking). Vérifier le règlement de copro avant."
    });
  }

  // Négociation
  const m = getMarket(b.city, SELECTED_COMMUNE);
  if (m && b.surface > 0) {
    const pm = b.price / b.surface;
    if (pm > m.priceM2[0] && (b.condition === "rafraichir" || b.condition === "travaux" || b.dpe === "E" || b.dpe === "F")) {
      const target = Math.round(b.price * 0.92 / 1000) * 1000;
      opti.push({
        title: `Négocier le prix (cible ~${fmtEUR(target)})`,
        text: "État à rafraîchir / DPE moyen = leviers solides pour viser -8% sur le prix affiché. Préparer la négociation avec devis travaux et 2-3 comparables récents (DVF)."
      });
    }
  }

  // Réduction durée
  if (a.cashflowPre > 200 && a.loan.duration > 15) {
    const shorter = loanComputation(a.toBorrow, a.loan.rate, a.loan.insurance, 15, a.loan.deferred);
    if (shorter.monthlyTotal - a.loanComp.monthlyTotal < a.cashflowPre) {
      opti.push({
        title: "Raccourcir la durée à 15 ans",
        text: `Cash-flow positif suffisant pour absorber une mensualité plus élevée (${fmtEUR(shorter.monthlyTotal)}). Économie sur le coût total du crédit : ~${fmtEUR(a.loanComp.totalCost - shorter.totalCost)}.`
      });
    }
  }

  if (opti.length === 0) opti.push({
    title: "Configuration déjà optimisée",
    text: "Aucune piste évidente d'optimisation détectée. Vous pouvez explorer le régime LMNP au réel pour neutraliser fiscalement les revenus locatifs."
  });

  return opti;
}

/* ============================================================
   SCORING & VERDICT
   ============================================================ */

function buildVerdict(a) {
  const b = a.bien;
  const m = getMarket(b.city, SELECTED_COMMUNE);

  let score = 50;
  const pos = [], neg = [], neu = [];

  // Rendement net
  if (a.yieldNet >= 6) { score += 18; pos.push(`Excellent rendement net (${fmtPct(a.yieldNet)})`); }
  else if (a.yieldNet >= 4.5) { score += 10; pos.push(`Bon rendement net (${fmtPct(a.yieldNet)})`); }
  else if (a.yieldNet >= 3.5) { score += 3; neu.push(`Rendement net moyen (${fmtPct(a.yieldNet)})`); }
  else { score -= 8; neg.push(`Rendement net faible (${fmtPct(a.yieldNet)})`); }

  // Cash-flow
  if (a.cashflowPre >= 0) { score += 15; pos.push(`Cash-flow positif (${fmtEUR(a.cashflowPre)}/mois)`); }
  else if (a.cashflowPre >= -200) { score += 0; neu.push(`Effort d'épargne modéré (${fmtEUR(a.cashflowPre)}/mois)`); }
  else if (a.cashflowPre >= -500) { score -= 8; neg.push(`Effort d'épargne important (${fmtEUR(a.cashflowPre)}/mois)`); }
  else { score -= 18; neg.push(`Effort d'épargne très élevé (${fmtEUR(a.cashflowPre)}/mois)`); }

  // DPE
  if (b.dpe === "A" || b.dpe === "B") { score += 8; pos.push("DPE excellent"); }
  else if (b.dpe === "C") { score += 5; pos.push("DPE C — performance énergétique satisfaisante"); }
  else if (b.dpe === "D") { score += 2; }
  else if (b.dpe === "E") { score -= 5; neg.push("DPE E — interdit en 2034"); }
  else if (b.dpe === "F") { score -= 15; neg.push("DPE F — interdit en 2028"); }
  else if (b.dpe === "G") { score -= 25; neg.push("DPE G — déjà interdit"); }

  // GES
  if (b.ges === "A" || b.ges === "B") { score += 4; pos.push("GES faible — bien décarboné"); }
  else if (b.ges === "F" || b.ges === "G") { score -= 6; neg.push(`GES ${b.ges} élevé`); }

  // Marché
  if (m) {
    const pm = b.price / b.surface;
    if (pm < m.priceM2[0] * 0.95) { score += 6; pos.push("Prix sous le marché"); }
    else if (pm > m.priceM2[1] * 1.05) { score -= 6; neg.push("Prix au-dessus du marché"); }
    score += (m.tension - 3) * 3; // tension 5 = +6, tension 1 = -6
    if (m.tension >= 5) pos.push(`Forte tension locative à ${b.city}`);
    else if (m.tension <= 2) neg.push(`Tension locative faible à ${b.city}`);
  }

  // Travaux
  if (b.condition === "neuf") { score += 5; pos.push("Bien refait à neuf — pas de travaux"); }
  else if (b.condition === "travaux") { score -= 5; neg.push("Gros travaux à prévoir"); }

  // Étage
  if (b.floor === 0) { score -= 4; neg.push("Rez-de-chaussée — décote revente"); }
  if (b.floor >= 3 && !b.elevator) { score -= 3; neu.push("Étage élevé sans ascenseur"); }

  // Annexes (cave / parking) — valorisent à la revente et au loyer
  if (b.cave) { score += 2; pos.push("Cave — bonus loyer et revente"); }
  if (b.parking === "private") { score += 3; pos.push("Place de parking privative"); }
  else if (b.parking === "box") { score += 5; pos.push("Box fermé — fort atout en zone tendue"); }
  else if (b.parking === "none" && m && m.tension >= 4) { score -= 2; neu.push("Pas de parking en zone tendue"); }

  score = Math.max(0, Math.min(100, score));

  let verdict, tag, title, summary;
  if (score >= 70) {
    verdict = "go";
    tag = "À considérer sérieusement";
    title = "Investissement potentiellement intéressant";
    summary = `Avec un rendement net de ${fmtPct(a.yieldNet)}, un cash-flow de ${fmtEUR(a.cashflowPre)}/mois et un score de ${score}/100, ce bien présente un profil favorable. Procédez aux vérifications terrain (PV d'AG, diagnostics, visite).`;
  } else if (score >= 50) {
    verdict = "warn";
    tag = "À analyser avec prudence";
    title = "Investissement mitigé — points à arbitrer";
    summary = `Le bien combine atouts et faiblesses (score ${score}/100). Rendement net ${fmtPct(a.yieldNet)}, cash-flow ${fmtEUR(a.cashflowPre)}/mois. Une négociation ou un changement de stratégie locative (LMNP, durée prêt) peuvent améliorer le profil.`;
  } else {
    verdict = "no-go";
    tag = "Plutôt à éviter";
    title = "Investissement déconseillé en l'état";
    summary = `Score ${score}/100. Le profil financier ou réglementaire pose problème (rendement faible, effort d'épargne élevé, DPE pénalisant…). Soit négocier fortement, soit chercher un autre bien.`;
  }

  return { score, verdict, tag, title, summary, pos, neg, neu };
}

/* ============================================================
   RENDU
   ============================================================ */

function render() {
  const inp = readInputs();
  const a = analyze(inp);

  // Pré-remplissage du loyer estimé
  const marketRent = estimateMarketRent(inp.bien);
  if (marketRent && !inp.bien.rent) {
    $("rent-hint").textContent = `· marché ~${fmtEUR(marketRent)}`;
  } else {
    $("rent-hint").textContent = "";
  }

  if (!a) {
    showEmpty();
    return;
  }

  showAll();

  // VERDICT
  const v = buildVerdict(a);
  const vCard = $("verdict");
  vCard.className = `verdict-card ${v.verdict}`;
  vCard.innerHTML = `
    <div class="verdict-head">
      <div>
        <div class="verdict-tag">${v.tag}</div>
        <h3 class="verdict-title">${v.title}</h3>
      </div>
      <div class="verdict-score">${v.score}<span style="font-size:18px;color:var(--text-muted);font-weight:500">/100</span></div>
    </div>
    <p class="verdict-summary">${v.summary}</p>
    <ul class="verdict-bullets">
      ${v.pos.map(x => `<li class="pos">${x}</li>`).join("")}
      ${v.neu.map(x => `<li class="neu">${x}</li>`).join("")}
      ${v.neg.map(x => `<li class="neg">${x}</li>`).join("")}
    </ul>
  `;

  // KPI
  $("kpi-yield-gross").textContent = fmtPct(a.yieldGross);
  $("kpi-yield-gross").className = "kpi-value " + (a.yieldGross >= 6 ? "pos" : a.yieldGross >= 4 ? "warn" : "neg");
  $("kpi-yield-net").textContent = fmtPct(a.yieldNet);
  $("kpi-yield-net").className = "kpi-value " + (a.yieldNet >= 5 ? "pos" : a.yieldNet >= 3.5 ? "warn" : "neg");
  $("kpi-cashflow").textContent = fmtEUR(a.cashflowPre);
  $("kpi-cashflow").className = "kpi-value " + (a.cashflowPre >= 0 ? "pos" : a.cashflowPre >= -200 ? "warn" : "neg");
  $("kpi-effort").textContent = fmtEUR(a.effortTotal);
  $("kpi-effort").className = "kpi-value " + (a.effortTotal === 0 ? "pos" : a.effortTotal > -50000 ? "warn" : "neg");

  // FINANCE DETAIL
  $("d-price-works").textContent = fmtEUR(inp.bien.price + inp.bien.works);
  $("d-notaire").textContent = fmtEUR(a.fraisNotaire);
  $("d-total-acq").textContent = fmtEUR(a.totalAcq);
  $("d-apport").textContent = fmtEUR(inp.loan.apport);
  $("d-borrow").textContent = fmtEUR(a.toBorrow);
  $("d-monthly").textContent = fmtEUR2(a.loanComp.monthly);
  $("d-monthly-ins").textContent = fmtEUR2(a.loanComp.insMonthly);
  $("d-monthly-total").textContent = fmtEUR2(a.loanComp.monthlyTotal);
  $("d-rent").textContent = fmtEUR(a.baseRent);
  $("d-rent-net").textContent = fmtEUR(a.rentNetMonthly);
  $("d-cf-pre").textContent = fmtEUR(a.cashflowPre);
  $("d-cf-post").textContent = fmtEUR(a.cashflowPost);
  $("d-be").textContent = fmtEUR(a.breakEvenRent);

  // DÉTAIL FISCAL
  const td = a.taxDetails;
  const regimeLabel = {
    "vide":      { name: "Micro-foncier (vide)", cls: "neu" },
    "meuble":    { name: "Micro-BIC (meublé)",   cls: "neu" },
    "lmnp-reel": { name: "LMNP régime réel",     cls: "good" },
  }[td.regime] || { name: "—", cls: "neu" };
  $("tax-badge").textContent = regimeLabel.name;
  $("tax-badge").className = `tax-badge ${regimeLabel.cls}`;

  const tmiTotal = a.assumptions.tmi + 17.2;
  if (td.regime === "lmnp-reel") {
    $("tax-grid").innerHTML = `
      <div class="detail-row"><span>Loyer annuel</span><strong>${fmtEUR(a.rentAnnual)}</strong></div>
      <div class="detail-row"><span>− Charges déductibles (gestion, taxe, copro, PNO, entretien)</span><strong>− ${fmtEUR(td.chargesDeductibles)}</strong></div>
      <div class="detail-row"><span>− Intérêts d'emprunt (moyenne sur ${a.loan.duration} ans)</span><strong>− ${fmtEUR(td.interestsAvg)}</strong></div>
      <div class="detail-row"><span>− Assurance emprunteur</span><strong>− ${fmtEUR(td.insuranceAnnual)}</strong></div>
      <div class="detail-row"><span>= Résultat avant amortissements</span><strong>${fmtEUR(td.resultatAvantAmort)}</strong></div>
      <div class="detail-row"><span>− Amortissement bâti (${a.assumptions.amortBatiPct}% × prix / ${a.assumptions.amortBatiDuree} ans)</span><strong>− ${fmtEUR(td.amortBati)}</strong></div>
      <div class="detail-row"><span>− Amortissement mobilier (${a.assumptions.amortMobPct}% × prix / ${a.assumptions.amortMobDuree} ans)</span><strong>− ${fmtEUR(td.amortMob)}</strong></div>
      <div class="detail-row"><span>Amortissement réellement déduit (plafonné au résultat)</span><strong>− ${fmtEUR(td.amortDeductible)}</strong></div>
      <div class="detail-row sep strong"><span>Résultat fiscal imposable</span><strong>${fmtEUR(td.resultatFiscal)}</strong></div>
      <div class="detail-row"><span>Impôt + prélèvements sociaux (${tmiTotal.toFixed(1)}%)</span><strong>${fmtEUR(a.taxAnnual)} / an</strong></div>
      ${td.amortDeductible < td.amortAnnual ? `<div class="detail-row"><span class="muted small">Excédent d'amortissement reporté : ${fmtEUR(td.amortAnnual - td.amortDeductible)}/an (utilisable les années suivantes)</span></div>` : ""}
    `;
  } else {
    const ab = td.abattement || 0;
    $("tax-grid").innerHTML = `
      <div class="detail-row"><span>Loyer annuel imposable</span><strong>${fmtEUR(a.rentAnnual)}</strong></div>
      <div class="detail-row"><span>Abattement forfaitaire</span><strong>− ${(ab * 100).toFixed(0)}%</strong></div>
      <div class="detail-row sep strong"><span>Base imposable</span><strong>${fmtEUR(td.taxableAnnual)}</strong></div>
      <div class="detail-row"><span>Impôt + prélèvements sociaux (${tmiTotal.toFixed(1)}%)</span><strong>${fmtEUR(a.taxAnnual)} / an</strong></div>
    `;
  }

  // MARKET
  const market = getMarket(inp.bien.city, SELECTED_COMMUNE);
  if (market) {
    const badge = market.estimated
      ? `<span class="market-source-badge estimated">Estimation</span>`
      : `<span class="market-source-badge precise">Données précises</span>`;
    const popInfo = market.estimated && SELECTED_COMMUNE
      ? `Population ${SELECTED_COMMUNE.population.toLocaleString("fr-FR")} hab. · Dépt ${SELECTED_COMMUNE.codeDepartement}${market.zone ? ` · Zone ${market.zone}` : ""}<br>`
      : "";
    $("market-city").innerHTML =
      `${inp.bien.city} ${badge}<br>${popInfo}` +
      `Tension locative ${"●".repeat(market.tension)}${"○".repeat(5-market.tension)} · ${market.profile}<br>` +
      `<strong>Transports :</strong> ${market.transports} · <strong>Risque :</strong> ${market.risk}`;
    const bars = compareToMarket(a);
    $("market-bars").innerHTML = bars.map(bar => {
      const [lo, hi] = bar.range;
      const pad = (hi - lo) * 0.3;
      const min = lo - pad;
      const max = hi + pad;
      const pct = v => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
      const inRange = bar.value >= lo && bar.value <= hi;
      const cls = inRange ? "good" : (bar.lowerIsBetter ? (bar.value < lo ? "warn" : "bad") : (bar.value > hi ? "warn" : "bad"));
      return `
        <div class="market-bar">
          <div class="market-bar-head">
            <span>${bar.label}</span>
            <strong>${fmtEUR(bar.value)} ${bar.unit}</strong>
          </div>
          <div class="market-bar-track">
            <div class="market-bar-range" style="left:${pct(lo)}%;width:${pct(hi)-pct(lo)}%"></div>
            <div class="market-bar-marker ${cls}" style="left:${pct(bar.value)}%"></div>
          </div>
          <div class="market-bar-foot">
            <span>${fmtEUR(lo)}</span>
            <span>marché ${inp.bien.city}</span>
            <span>${fmtEUR(hi)}</span>
          </div>
          <div class="market-bar-comment">${bar.comment}</div>
        </div>
      `;
    }).join("");
  } else {
    $("market-city").textContent = inp.bien.city ? `Pas de données pour ${inp.bien.city}` : "Sélectionnez une ville";
    $("market-bars").innerHTML = "";
  }

  // DVF — Comparables réels
  const dvf = getDVF(inp.bien.city);
  if (dvf) {
    $("dvf-block").hidden = false;
    const lastDateFmt = dvf.lastDate
      ? new Date(dvf.lastDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
      : "—";
    $("dvf-tag").textContent = `${dvf.n.toLocaleString("fr-FR")} ventes`;
    $("dvf-sub").textContent = `Appartements vendus en ${inp.bien.city} (DVF 2024-2025) · dernière transaction : ${lastDateFmt}`;
    $("dvf-stats").innerHTML = `
      <div class="dvf-kpi"><div class="dvf-kpi-label">Prix médian</div><div class="dvf-kpi-value">${fmtEUR(dvf.prixMed)}</div></div>
      <div class="dvf-kpi"><div class="dvf-kpi-label">€/m² médian</div><div class="dvf-kpi-value">${fmtEUR(dvf.m2Med)}</div></div>
      <div class="dvf-kpi"><div class="dvf-kpi-label">€/m² 25%–75%</div><div class="dvf-kpi-value">${fmtEUR(dvf.m2P25)} – ${fmtEUR(dvf.m2P75)}</div></div>
    `;
    // Positionnement du bien analysé
    if (a.bien.surface > 0 && a.bien.price > 0) {
      const pricePm2 = a.bien.price / a.bien.surface;
      let pos, cls;
      if (pricePm2 < dvf.m2P25)      { pos = "sous le marché (1er quartile)"; cls = "good"; }
      else if (pricePm2 <= dvf.m2Med){ pos = "dans la moitié basse";           cls = "good"; }
      else if (pricePm2 <= dvf.m2P75){ pos = "dans la moitié haute";           cls = "warn"; }
      else                           { pos = "au-dessus du marché (4e quartile)"; cls = "bad"; }
      const ecart = ((pricePm2 / dvf.m2Med - 1) * 100);
      const ecartTxt = (ecart >= 0 ? "+" : "") + ecart.toFixed(1) + "% vs médiane";
      $("dvf-position").innerHTML = `
        <div class="dvf-pos-row ${cls}">
          <span class="dvf-pos-label">Votre bien à ${fmtEUR(Math.round(pricePm2))} €/m²</span>
          <span class="dvf-pos-value">${pos} · ${ecartTxt}</span>
        </div>
      `;
    } else {
      $("dvf-position").innerHTML = "";
    }
  } else {
    $("dvf-block").hidden = true;
  }

  // RISQUES
  const risks = buildRisks(a);
  $("risks-list").innerHTML = risks.map(r => `
    <div class="risk-item ${r.level}">
      <strong>${r.title}</strong>${r.text}
    </div>
  `).join("");

  // OPTIMISATIONS
  const opti = buildOptimisations(a);
  $("opti-list").innerHTML = opti.map(o => `
    <div class="opti-item">
      <strong>${o.title}</strong>${o.text}
    </div>
  `).join("");

  // PROJECTION PATRIMONIALE
  const horizon = +$("p-horizon").value || 15;
  $("p-horizon-val").textContent = horizon;
  const scenarios = [
    { key: "pess", label: "Pessimiste", g: 0 },
    { key: "med",  label: "Médian",     g: 2 },
    { key: "opt",  label: "Optimiste",  g: 4 },
  ];
  $("proj-grid").innerHTML = scenarios.map(s => {
    const p = buildProjection(a, horizon, s.g);
    const triTxt = p.tri === null ? "—" : fmtPct(p.tri);
    const triCls = p.tri === null ? "" : (p.tri >= 5 ? "pos" : p.tri >= 0 ? "" : "neg");
    return `
      <div class="proj-scenario ${s.key}">
        <div class="proj-scenario-head">
          <span class="proj-scenario-name">${s.label}</span>
          <span class="proj-scenario-rate">+${s.g}% / an</span>
        </div>
        <div class="proj-kpi"><span class="proj-kpi-label">Patrimoine net</span>
          <span class="proj-kpi-value ${p.netWealth >= 0 ? "pos" : "neg"}">${fmtEUR(p.netWealth)}</span></div>
        <div class="proj-kpi"><span class="proj-kpi-label">Plus-value brute</span>
          <span class="proj-kpi-value ${p.grossGain >= 0 ? "pos" : "neg"}">${fmtEUR(p.grossGain)}</span></div>
        <div class="proj-kpi"><span class="proj-kpi-label">Cash-flow cumulé</span>
          <span class="proj-kpi-value ${p.cumCF >= 0 ? "pos" : "neg"}">${fmtEUR(p.cumCF)}</span></div>
        <div class="proj-kpi"><span class="proj-kpi-label">TRI annualisé</span>
          <span class="proj-kpi-value ${triCls}">${triTxt}</span></div>
      </div>
    `;
  }).join("");

  // ANNÉE DE REVENTE OPTIMALE
  $("optsell-grid").innerHTML = scenarios.map(s => {
    const series = buildTriSeries(a, s.g, 30);
    const valid = series.filter(x => x.tri !== null && isFinite(x.tri));
    if (!valid.length) {
      return `
        <div class="optsell-scenario ${s.key}">
          <div class="optsell-head">
            <span class="optsell-name">${s.label}</span>
            <span class="optsell-rate">+${s.g}% / an</span>
          </div>
          <div class="optsell-empty">TRI indéterminé sur la période</div>
        </div>
      `;
    }
    const best = valid.reduce((acc, x) => (x.tri > acc.tri ? x : acc));
    const tris = valid.map(x => x.tri);
    const triMin = Math.min(...tris, 0);
    const triMax = Math.max(...tris, best.tri);
    const range = (triMax - triMin) || 1;

    // SVG sparkline 240x60, marge 4px en haut/bas
    const W = 240, H = 60, M = 4;
    const xAt = y => ((y - 1) / 29) * W;
    const yAt = tri => H - M - ((tri - triMin) / range) * (H - 2 * M);
    const points = series.map(s2 => {
      if (s2.tri === null || !isFinite(s2.tri)) return null;
      return `${xAt(s2.year).toFixed(1)},${yAt(s2.tri).toFixed(1)}`;
    }).filter(Boolean).join(" ");
    const zeroY = triMin <= 0 && triMax >= 0 ? yAt(0).toFixed(1) : null;
    const bestX = xAt(best.year).toFixed(1);
    const bestY = yAt(best.tri).toFixed(1);

    return `
      <div class="optsell-scenario ${s.key}">
        <div class="optsell-head">
          <span class="optsell-name">${s.label}</span>
          <span class="optsell-rate">+${s.g}% / an</span>
        </div>
        <div class="optsell-best">
          <div>
            <div class="optsell-best-label">Année optimale</div>
            <div class="optsell-best-year">An ${best.year}</div>
          </div>
          <div class="optsell-best-tri">
            <div class="optsell-best-label">TRI maximal</div>
            <div class="optsell-best-value ${best.tri >= 5 ? "pos" : best.tri >= 0 ? "" : "neg"}">${fmtPct(best.tri)}</div>
          </div>
        </div>
        <svg class="optsell-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
          ${zeroY !== null ? `<line x1="0" y1="${zeroY}" x2="${W}" y2="${zeroY}" stroke="var(--border-strong)" stroke-dasharray="3,3" stroke-width="1"/>` : ""}
          <polyline fill="none" stroke="currentColor" stroke-width="1.5" points="${points}"/>
          <circle cx="${bestX}" cy="${bestY}" r="3.5" fill="currentColor"/>
        </svg>
        <div class="optsell-axis"><span>An 1</span><span>An 15</span><span>An 30</span></div>
      </div>
    `;
  }).join("");

  // AMORTISSEMENT
  const amort = buildAmort(a.toBorrow, inp.loan.rate, inp.loan.duration, a.loanComp, inp.loan.deferred);
  $("amort-tbody").innerHTML = amort.map(r => `
    <tr>
      <td>${r.y}</td>
      <td>${fmtEUR(r.startBal)}</td>
      <td>${fmtEUR(r.interest)}</td>
      <td>${fmtEUR(r.principal)}</td>
      <td>${fmtEUR(r.ins)}</td>
    </tr>
  `).join("");
}

function showEmpty() {
  $("verdict").className = "verdict-card";
  $("verdict").innerHTML = `
    <div class="verdict-empty">
      <div class="verdict-icon">📋</div>
      <h3>Saisissez les informations du bien</h3>
      <p>Renseignez au minimum la <strong>ville</strong>, la <strong>surface</strong> et le <strong>prix</strong> pour générer l'analyse.</p>
    </div>
  `;
  ["kpi-block", "finance-block", "tax-block", "projection-block", "optsell-block", "market-block", "risks-block", "opti-block", "amort-block"].forEach(id => $(id).hidden = true);
}

function showAll() {
  ["kpi-block", "finance-block", "tax-block", "projection-block", "optsell-block", "market-block", "risks-block", "opti-block", "amort-block"].forEach(id => $(id).hidden = false);
}

/* ============================================================
   AUTOCOMPLÉTION VILLE
   ============================================================ */

let acDebounce = null;
let acIndex = -1;
let acItems = [];

function setupAutocomplete() {
  const input = $("b-city");
  const list = $("b-city-list");
  const hint = $("city-hint");

  function close() {
    list.classList.remove("open");
    list.innerHTML = "";
    acIndex = -1;
    acItems = [];
  }

  function selectCommune(c) {
    SELECTED_COMMUNE = c;
    input.value = c.nom;
    if (MARKET_PRECISE[c.nom]) {
      hint.innerHTML = `<span style="color:var(--good)">● Données de marché précises</span>`;
    } else {
      hint.innerHTML = `<span style="color:var(--warn)">● Estimation auto · ${c.population.toLocaleString("fr-FR")} hab. · Dépt ${c.codeDepartement}</span>`;
    }
    close();
    render();
  }

  input.addEventListener("input", () => {
    SELECTED_COMMUNE = null; // reset si l'utilisateur retape
    hint.textContent = "";
    const q = input.value.trim();
    clearTimeout(acDebounce);
    if (q.length < 2) { close(); render(); return; }

    acDebounce = setTimeout(async () => {
      const results = await searchCommunes(q);
      if (!results.length) { close(); return; }
      acItems = results;
      list.innerHTML = results.map((c, i) => `
        <div class="autocomplete-item" data-i="${i}">
          <span>${c.nom}</span>
          <span class="ac-meta">${c.codeDepartement} · ${c.population ? c.population.toLocaleString("fr-FR") + " hab." : ""}</span>
        </div>
      `).join("");
      list.classList.add("open");
      list.querySelectorAll(".autocomplete-item").forEach(el => {
        el.addEventListener("mousedown", (e) => {
          e.preventDefault();
          selectCommune(acItems[+el.dataset.i]);
        });
      });
    }, 200);
  });

  input.addEventListener("keydown", (e) => {
    if (!list.classList.contains("open")) return;
    if (e.key === "ArrowDown") { e.preventDefault(); acIndex = Math.min(acIndex + 1, acItems.length - 1); updateActive(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); acIndex = Math.max(acIndex - 1, 0); updateActive(); }
    else if (e.key === "Enter" && acIndex >= 0) { e.preventDefault(); selectCommune(acItems[acIndex]); }
    else if (e.key === "Escape") { close(); }
  });

  function updateActive() {
    list.querySelectorAll(".autocomplete-item").forEach((el, i) => {
      el.classList.toggle("active", i === acIndex);
    });
  }

  input.addEventListener("blur", () => setTimeout(close, 150));
}

/* ============================================================
   PARTAGE — sérialisation de l'état dans l'URL
   ============================================================ */

// IDs de tous les inputs à conserver (mêmes que readInputs + slider projection)
const SHARE_IDS = [
  "b-city","b-district","b-type","b-surface","b-floor","b-price","b-works",
  "b-rent","b-rent-mode","b-charges","b-taxe","b-elevator","b-cave","b-parking",
  "b-dpe","b-ges","b-copro-lots","b-condition",
  "l-apport","l-borrow-notaire","l-rate","l-insurance","l-duration","l-deferred",
  "a-gestion","a-vacance","a-entretien","a-pno","a-charges-pct","a-tmi",
  "a-amort-bati-pct","a-amort-bati-duree","a-amort-mob-pct","a-amort-mob-duree",
  "p-horizon",
];

function serializeState() {
  const state = {};
  for (const id of SHARE_IDS) {
    const el = $(id);
    if (!el) continue;
    state[id] = el.type === "checkbox" ? (el.checked ? 1 : 0) : el.value;
  }
  if (SELECTED_COMMUNE) {
    state._c = {
      n: SELECTED_COMMUNE.nom,
      c: SELECTED_COMMUNE.code,
      d: SELECTED_COMMUNE.codeDepartement,
      p: SELECTED_COMMUNE.population,
    };
  }
  return state;
}

function encodeState(state) {
  // base64url-safe pour passer dans le hash sans %-encodage moche
  const json = JSON.stringify(state);
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeState(hash) {
  try {
    const padded = hash.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(escape(atob(padded)));
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

function applyState(state) {
  if (!state) return;
  for (const id of SHARE_IDS) {
    if (state[id] === undefined) continue;
    const el = $(id);
    if (!el) continue;
    if (el.type === "checkbox") el.checked = !!state[id];
    else el.value = state[id];
  }
  if (state._c && state._c.n) {
    SELECTED_COMMUNE = {
      nom: state._c.n,
      code: state._c.c,
      codeDepartement: state._c.d,
      population: state._c.p,
    };
    const hint = $("city-hint");
    if (hint) {
      if (MARKET_PRECISE[state._c.n]) {
        hint.innerHTML = `<span style="color:var(--good)">● Données de marché précises</span>`;
      } else {
        hint.innerHTML = `<span style="color:var(--warn)">● Estimation auto · ${(state._c.p || 0).toLocaleString("fr-FR")} hab. · Dépt ${state._c.d}</span>`;
      }
    }
  }
}

let urlSyncTimer = null;
function syncURL() {
  // Debounce pour éviter de spammer history.replaceState à chaque keystroke
  clearTimeout(urlSyncTimer);
  urlSyncTimer = setTimeout(() => {
    const encoded = encodeState(serializeState());
    history.replaceState(null, "", "#" + encoded);
  }, 400);
}

function copyShareLink(btn) {
  const encoded = encodeState(serializeState());
  const url = `${location.origin}${location.pathname}#${encoded}`;
  navigator.clipboard.writeText(url).then(() => {
    const label = btn.querySelector(".btn-share-label");
    const original = label ? label.textContent : "";
    btn.classList.add("copied");
    if (label) label.textContent = "Lien copié !";
    setTimeout(() => {
      btn.classList.remove("copied");
      if (label) label.textContent = original;
    }, 1800);
  }).catch(() => {
    alert("Lien :\n" + url);
  });
}

/* ============================================================
   EXPORT PDF (html2canvas + jsPDF)
   ============================================================ */

async function exportPDF(btn) {
  if (typeof html2canvas !== "function" || !window.jspdf) {
    alert("Bibliothèques PDF non chargées. Vérifiez votre connexion.");
    return;
  }
  const verdictEmpty = document.querySelector("#verdict .verdict-empty");
  if (verdictEmpty) {
    alert("Saisissez d'abord les informations du bien.");
    return;
  }

  const label = btn.querySelector(".btn-share-label");
  const originalLabel = label ? label.textContent : "";
  if (label) label.textContent = "Génération…";
  btn.disabled = true;

  // Déplier tous les .collapsible et garder leur état initial
  const collapsibles = Array.from(document.querySelectorAll(".collapsible"));
  const wasOpen = collapsibles.map(c => c.classList.contains("open"));
  collapsibles.forEach(c => c.classList.add("open"));

  // Désactiver temporairement le sticky header pour la capture
  const header = document.querySelector(".site-header");
  const headerSticky = header ? header.style.position : null;
  if (header) header.style.position = "static";

  // Petit délai pour laisser le navigateur appliquer les changements
  await new Promise(r => setTimeout(r, 50));

  const target = document.querySelector(".col-output");
  let canvas;
  try {
    canvas = await html2canvas(target, {
      backgroundColor: "#f6f5f0",
      scale: 2,
      useCORS: true,
      logging: false,
      windowWidth: target.scrollWidth,
    });
  } catch (e) {
    console.error(e);
    alert("Échec de la génération du PDF : " + e.message);
    collapsibles.forEach((c, i) => { if (!wasOpen[i]) c.classList.remove("open"); });
    if (header && headerSticky !== null) header.style.position = headerSticky;
    if (label) label.textContent = originalLabel;
    btn.disabled = false;
    return;
  }

  // Restaurer l'état initial
  collapsibles.forEach((c, i) => { if (!wasOpen[i]) c.classList.remove("open"); });
  if (header && headerSticky !== null) header.style.position = headerSticky;

  // Construire le PDF A4 portrait : 210 × 297 mm, marges 10 mm
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = 210, pageH = 297, margin = 10;
  const usableW = pageW - 2 * margin;

  // En-tête
  const city = $("b-city").value || "—";
  const surface = $("b-surface").value || "—";
  const price = $("b-price").value || "—";
  const today = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text("Décision Immo — Analyse d'investissement", margin, margin + 6);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(100);
  const subtitle = `${city}${surface !== "—" ? ` · ${surface} m²` : ""}${price !== "—" ? ` · ${Number(price).toLocaleString("fr-FR")} €` : ""} · Édité le ${today}`;
  pdf.text(subtitle, margin, margin + 12);
  pdf.setTextColor(0);

  // Calcul des dimensions de l'image
  const imgRatio = canvas.height / canvas.width;
  const imgW = usableW;
  const imgH = imgW * imgRatio;
  const startY = margin + 18;
  const availH = pageH - startY - margin;

  const imgData = canvas.toDataURL("image/jpeg", 0.92);

  if (imgH <= availH) {
    pdf.addImage(imgData, "JPEG", margin, startY, imgW, imgH);
  } else {
    // Pagination : on découpe l'image source en tranches
    const pxPerMm = canvas.width / imgW;
    const sliceHeightPx = availH * pxPerMm;
    let yOffset = 0;
    let pageIdx = 0;
    while (yOffset < canvas.height) {
      const sliceH = Math.min(sliceHeightPx, canvas.height - yOffset);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = sliceH;
      slice.getContext("2d").drawImage(canvas, 0, yOffset, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      const sliceData = slice.toDataURL("image/jpeg", 0.92);
      const sliceMm = sliceH / pxPerMm;
      if (pageIdx > 0) {
        pdf.addPage();
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(150);
        pdf.text(`${city} · suite p.${pageIdx + 1}`, margin, margin);
        pdf.setTextColor(0);
        pdf.addImage(sliceData, "JPEG", margin, margin + 4, imgW, sliceMm);
      } else {
        pdf.addImage(sliceData, "JPEG", margin, startY, imgW, sliceMm);
      }
      yOffset += sliceH;
      pageIdx++;
    }
  }

  // Pied de page sur la dernière page
  const pageCount = pdf.internal.getNumberOfPages();
  pdf.setPage(pageCount);
  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(8);
  pdf.setTextColor(140);
  pdf.text("Outil d'aide à la décision · Calculs indicatifs · Ne constitue pas un conseil en investissement.", margin, pageH - 5);

  const safeCity = city.replace(/[^a-zA-Z0-9-]/g, "_");
  const filename = `decision-immo_${safeCity}_${new Date().toISOString().slice(0, 10)}.pdf`;
  pdf.save(filename);

  if (label) label.textContent = "Téléchargé !";
  btn.classList.add("copied");
  setTimeout(() => {
    btn.classList.remove("copied");
    if (label) label.textContent = originalLabel;
    btn.disabled = false;
  }, 1500);
}

/* ============================================================
   INIT
   ============================================================ */

function init() {
  // Restaurer l'état depuis l'URL avant de brancher les listeners
  if (location.hash && location.hash.length > 1) {
    const state = decodeState(location.hash.slice(1));
    applyState(state);
  }

  // Tous les inputs déclenchent le recalcul + sync URL
  document.querySelectorAll("input, select").forEach(el => {
    el.addEventListener("input", () => { render(); syncURL(); });
    el.addEventListener("change", () => { render(); syncURL(); });
  });

  // Collapsibles
  document.querySelectorAll(".collapsible").forEach(c => {
    const trig = c.querySelector(".collapsible-trigger");
    if (trig) trig.addEventListener("click", () => c.classList.toggle("open"));
  });

  // Bouton de partage
  const shareBtn = $("btn-share");
  if (shareBtn) shareBtn.addEventListener("click", () => copyShareLink(shareBtn));

  // Bouton export PDF
  const pdfBtn = $("btn-pdf");
  if (pdfBtn) pdfBtn.addEventListener("click", () => exportPDF(pdfBtn));

  setupAutocomplete();
  render();
}

document.addEventListener("DOMContentLoaded", init);
