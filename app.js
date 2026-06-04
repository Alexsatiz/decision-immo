/* ============================================================
   app.js — Décision Immo : moteur d'analyse temps réel
   ============================================================ */

const FRAIS_NOTAIRE_PCT = 0.075;
const MEUBLE_BONUS = 0.12;        // +12% loyer en meublé
const ABATTEMENT_LMNP = 0.50;     // micro-BIC
const ABATTEMENT_VIDE = 0.30;     // micro-foncier

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
    }
  };
}

/* ============================================================
   ESTIMATION LOYER / PRIX MARCHÉ
   ============================================================ */

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

  const projectedValue = a.bien.price * Math.pow(1 + g, N);
  const balance = remainingBalance(amort, N);
  const sale = projectedValue - balance;
  flows[flows.length - 1] += sale;

  const netWealth = projectedValue - balance;
  const grossGain = projectedValue - a.bien.price;
  const tri = irr(flows);

  return { growthPct, projectedValue, balance, netWealth, grossGain, cumCF, tri };
}

/* ============================================================
   ANALYSE FINANCIÈRE
   ============================================================ */

function analyze({ bien, loan, assumptions }) {
  if (!bien.price || !bien.surface) return null;

  // Loyer effectif (auto-estimé si vide)
  const marketRent = estimateMarketRent(bien);
  let baseRent = bien.rent || marketRent;
  if (bien.rentMode === "meuble") baseRent = Math.round(baseRent * (1 + MEUBLE_BONUS));

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

  // Cash-flow après impôts (approximation simple)
  // Vide : micro-foncier abattement 30% sur loyer brut
  // Meublé : micro-BIC abattement 50%
  const ab = bien.rentMode === "meuble" ? ABATTEMENT_LMNP : ABATTEMENT_VIDE;
  const taxableAnnual = Math.max(0, rentAnnual * (1 - ab));
  const taxRate = (assumptions.tmi + 17.2) / 100; // TMI + prélèvements sociaux
  const taxAnnual = taxableAnnual * taxRate;
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

  // Meublé
  if (b.rentMode === "vide") {
    const rentMeuble = Math.round(a.baseRent * (1 + MEUBLE_BONUS));
    const gainAnnuel = (rentMeuble - a.baseRent) * 12;
    opti.push({
      title: "Passer en location meublée (LMNP)",
      text: `Loyer +${fmtPct(MEUBLE_BONUS * 100, 0)} → ${fmtEUR(rentMeuble)}/mois (+${fmtEUR(gainAnnuel)}/an). Régime micro-BIC : abattement 50% (vs 30% en vide). Possibilité d'amortissement comptable au régime réel pour neutraliser l'IR pendant 8-12 ans.`
    });
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
  ["kpi-block", "finance-block", "projection-block", "market-block", "risks-block", "opti-block", "amort-block"].forEach(id => $(id).hidden = true);
}

function showAll() {
  ["kpi-block", "finance-block", "projection-block", "market-block", "risks-block", "opti-block", "amort-block"].forEach(id => $(id).hidden = false);
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
   INIT
   ============================================================ */

function init() {
  // Tous les inputs déclenchent le recalcul
  document.querySelectorAll("input, select").forEach(el => {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  // Collapsibles
  document.querySelectorAll(".collapsible").forEach(c => {
    const trig = c.querySelector(".collapsible-trigger");
    if (trig) trig.addEventListener("click", () => c.classList.toggle("open"));
  });

  setupAutocomplete();
  render();
}

document.addEventListener("DOMContentLoaded", init);
