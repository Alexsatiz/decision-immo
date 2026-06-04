/* ============================================================
   market.js — Données de marché par commune
   ============================================================
   - 15 communes IDF Est : données précises pré-chargées
   - Autres communes françaises : estimation via heuristique
     calibrée par département / population
   - Recherche : API publique geo.api.gouv.fr (autocomplétion)
   ============================================================ */

/* ---- 1. Communes pré-chargées avec données précises ---- */

const MARKET_PRECISE = {
  "Le Perreux-sur-Marne":    { priceM2: [5500, 7500], rentM2: [19, 24], tension: 5, profile: "Familles, jeunes actifs, cadres", risk: "Faible vacance, ticket d'entrée élevé", transports: "RER A, RER E" },
  "Nogent-sur-Marne":        { priceM2: [6500, 8200], rentM2: [20, 24], tension: 5, profile: "CSP+, familles", risk: "Rendement faible, prix élevé", transports: "RER A, RER E" },
  "Saint-Maur-des-Fossés":   { priceM2: [5800, 7500], rentM2: [19, 22], tension: 5, profile: "Familles, cadres, jeunes actifs", risk: "Hétérogène par quartier", transports: "RER A" },
  "Champigny-sur-Marne":     { priceM2: [3800, 4800], rentM2: [17, 20], tension: 4, profile: "Jeunes actifs, familles, mobilité pro", risk: "Liquidité variable selon secteur", transports: "RER A, future GPE L15 Sud" },
  "Bry-sur-Marne":           { priceM2: [5200, 6400], rentM2: [18, 21], tension: 4, profile: "Familles, cadres", risk: "Ticket élevé, rendement modéré", transports: "RER A, future GPE L15" },
  "Villiers-sur-Marne":      { priceM2: [3600, 4400], rentM2: [17, 19], tension: 4, profile: "Jeunes actifs, familles", risk: "Copros anciennes parfois fragiles", transports: "RER E, future GPE L15" },
  "Fontenay-sous-Bois":      { priceM2: [5500, 7000], rentM2: [19, 22], tension: 5, profile: "Cadres, familles, jeunes actifs", risk: "Rendement souvent < 5%", transports: "RER A, RER E" },
  "Vincennes":               { priceM2: [8500,11000], rentM2: [25, 30], tension: 5, profile: "CSP++, jeunes cadres", risk: "Prix très élevés, rendement faible", transports: "RER A, M1" },
  "Joinville-le-Pont":       { priceM2: [5500, 7000], rentM2: [19, 22], tension: 4, profile: "Familles, jeunes actifs", risk: "Encadrement loyers Grand Paris à venir", transports: "RER A" },
  "Noisy-le-Grand":          { priceM2: [3800, 4800], rentM2: [17, 20], tension: 4, profile: "Jeunes actifs, étudiants UPEM", risk: "Hétérogénéité forte", transports: "RER A, RER E" },
  "Chelles":                 { priceM2: [3400, 4200], rentM2: [16, 18], tension: 3, profile: "Jeunes actifs, familles", risk: "Périphérie, RER E saturé", transports: "RER E, future GPE L16" },
  "Gagny":                   { priceM2: [3200, 4000], rentM2: [15, 17], tension: 3, profile: "Familles, primo-accédants", risk: "Rendement moyen, marché lent", transports: "RER E" },
  "Neuilly-Plaisance":       { priceM2: [4200, 5400], rentM2: [18, 21], tension: 4, profile: "Jeunes actifs, familles", risk: "Mixte, à creuser par quartier", transports: "RER A" },
  "Neuilly-sur-Marne":       { priceM2: [3400, 4400], rentM2: [16, 18], tension: 3, profile: "Familles, primo-accédants", risk: "Bon rendement, transformation urbaine", transports: "Bus, future GPE L15 Est" },
  "Rosny-sous-Bois":         { priceM2: [4000, 5200], rentM2: [17, 20], tension: 4, profile: "Jeunes actifs, familles", risk: "GPE L15/11, en mutation", transports: "RER E, M11, GPE L15 Est" },

  // Métropoles principales
  "Paris":                   { priceM2: [9500,13500], rentM2: [27, 38], tension: 5, profile: "Tous profils, encadrement loyers strict", risk: "Encadrement loyers, prix très élevés", transports: "Métro, RER, Transilien" },
  "Lyon":                    { priceM2: [4500, 6500], rentM2: [14, 18], tension: 5, profile: "Étudiants, cadres, jeunes actifs", risk: "Encadrement loyers depuis 2021", transports: "Métro, tram, TER" },
  "Marseille":               { priceM2: [2500, 4500], rentM2: [12, 16], tension: 4, profile: "Étudiants, jeunes actifs", risk: "Hétérogénéité forte par arrondissement", transports: "Métro, tram, bus" },
  "Bordeaux":                { priceM2: [4200, 5800], rentM2: [14, 17], tension: 4, profile: "Étudiants, cadres", risk: "Marché en correction post-2022", transports: "Tram, TER" },
  "Toulouse":                { priceM2: [3200, 4500], rentM2: [12, 15], tension: 4, profile: "Étudiants, ingénieurs aérospatial", risk: "Forte construction neuve", transports: "Métro, tram" },
  "Lille":                   { priceM2: [2800, 4200], rentM2: [12, 16], tension: 4, profile: "Étudiants, jeunes actifs", risk: "Encadrement loyers à Lille intra-muros", transports: "Métro, tram, TER" },
  "Nantes":                  { priceM2: [3500, 4800], rentM2: [12, 15], tension: 4, profile: "Étudiants, cadres", risk: "Marché tendu, prix en hausse 10 ans", transports: "Tram, busway" },
  "Strasbourg":              { priceM2: [3000, 4500], rentM2: [12, 15], tension: 4, profile: "Étudiants, fonctionnaires européens", risk: "Encadrement loyers depuis 2024", transports: "Tram, TER" },
  "Rennes":                  { priceM2: [3000, 4200], rentM2: [12, 14], tension: 4, profile: "Étudiants, jeunes actifs tech", risk: "Forte tension étudiante", transports: "Métro, bus" },
  "Nice":                    { priceM2: [4000, 5800], rentM2: [15, 19], tension: 4, profile: "Retraités, étudiants, saisonniers", risk: "Saisonnalité forte (Airbnb encadré)", transports: "Tram" },
  "Montpellier":             { priceM2: [3000, 4200], rentM2: [13, 16], tension: 4, profile: "Étudiants (forte proportion)", risk: "Construction neuve massive", transports: "Tram" },
  "Grenoble":                { priceM2: [2500, 3500], rentM2: [12, 14], tension: 4, profile: "Étudiants, ingénieurs", risk: "Encadrement loyers prévu", transports: "Tram, bus" },
};

/* ---- 2. Estimation par défaut (zonage Pinel + population) ---- */

// Heuristique par département : prix/m² médian appartement ancien et loyer/m² nu
// Calibré sur fourchettes nationales 2024-2025 (source : MeilleursAgents, Clameur)
const DEPT_DEFAULTS = {
  // IDF
  "75":{p:[9000,12500],r:[26,35],z:"A bis"},
  "92":{p:[6500, 9500],r:[22,28],z:"A bis"},
  "93":{p:[3500, 5500],r:[16,21],z:"A bis"},
  "94":{p:[4500, 6500],r:[18,23],z:"A bis"},
  "77":{p:[2800, 4200],r:[13,16],z:"A/B1"},
  "78":{p:[3800, 5500],r:[15,19],z:"A/A bis"},
  "91":{p:[3000, 4500],r:[14,17],z:"A/B1"},
  "95":{p:[3000, 4200],r:[14,17],z:"A bis"},
  // Métropoles
  "13":{p:[2800, 4500],r:[12,16],z:"A/B1"},   // Bouches-du-Rhône
  "33":{p:[3500, 5000],r:[13,16],z:"B1"},      // Gironde
  "31":{p:[3000, 4200],r:[12,15],z:"B1"},      // Haute-Garonne
  "59":{p:[2500, 3800],r:[12,15],z:"B1/B2"},   // Nord
  "44":{p:[3000, 4200],r:[12,14],z:"B1"},      // Loire-Atlantique
  "67":{p:[2800, 4000],r:[12,15],z:"B1"},      // Bas-Rhin
  "35":{p:[2800, 3800],r:[12,14],z:"B1"},      // Ille-et-Vilaine
  "06":{p:[3500, 5500],r:[14,18],z:"A/B1"},    // Alpes-Maritimes
  "34":{p:[2800, 4000],r:[13,16],z:"B1"},      // Hérault
  "38":{p:[2300, 3300],r:[11,13],z:"B1"},      // Isère
  "69":{p:[3500, 5500],r:[13,17],z:"A/B1"},    // Rhône (Lyon = précis)
  "63":{p:[1800, 2500],r:[10,12],z:"B2"},      // Puy-de-Dôme (Clermont)
  "21":{p:[2200, 3200],r:[11,13],z:"B1"},      // Côte-d'Or (Dijon)
  "76":{p:[1800, 2700],r:[10,13],z:"B1/B2"},   // Seine-Maritime
  "29":{p:[1700, 2500],r:[10,12],z:"B2"},      // Finistère
  "37":{p:[2200, 3000],r:[11,13],z:"B1"},      // Indre-et-Loire (Tours)
  "45":{p:[1900, 2700],r:[11,13],z:"B1/B2"},   // Loiret (Orléans)
  "51":{p:[1900, 2700],r:[10,13],z:"B1/B2"},   // Marne (Reims)
  "57":{p:[1500, 2400],r:[ 9,12],z:"B2/C"},    // Moselle
  "54":{p:[1700, 2500],r:[10,12],z:"B1/B2"},   // Meurthe-et-Moselle (Nancy)
  "06_DEFAULT":null
};

const DEFAULT_FALLBACK = { p:[1700, 2700], r:[10,13], z:"B2/C" };

function estimateMarketByDept(deptCode, population) {
  const d = DEPT_DEFAULTS[deptCode] || DEFAULT_FALLBACK;
  let priceMod = 1, rentMod = 1;
  // Modulation selon population : grandes villes du dept = haut de fourchette
  if (population > 200000)      { priceMod = 1.10; rentMod = 1.08; }
  else if (population > 80000)  { priceMod = 1.00; rentMod = 1.00; }
  else if (population > 30000)  { priceMod = 0.92; rentMod = 0.95; }
  else if (population > 10000)  { priceMod = 0.85; rentMod = 0.92; }
  else                          { priceMod = 0.75; rentMod = 0.88; }

  const tension = population > 80000 ? 4 : population > 20000 ? 3 : 2;
  return {
    priceM2: [Math.round(d.p[0]*priceMod), Math.round(d.p[1]*priceMod)],
    rentM2:  [Math.round(d.r[0]*rentMod*10)/10, Math.round(d.r[1]*rentMod*10)/10],
    tension,
    profile: tension >= 4 ? "Demande locative soutenue (étudiants, jeunes actifs)" : "Demande locative modérée",
    risk: tension <= 2 ? "Vacance possible, marché lent à la revente" : "À affiner par quartier",
    transports: "Selon localisation",
    zone: d.z,
    estimated: true,
    deptCode, population,
  };
}

/* ---- 3. API publique : getMarket(city) ---- */

function getMarket(city, geoData = null) {
  if (!city) return null;
  // 1. Précis ?
  if (MARKET_PRECISE[city]) {
    return { ...MARKET_PRECISE[city], estimated: false };
  }
  // 2. Estimation depuis geoData (population + département)
  if (geoData && geoData.codeDepartement && geoData.population != null) {
    return estimateMarketByDept(geoData.codeDepartement, geoData.population);
  }
  return null;
}

/* ---- 4. Recherche de communes via API geo.api.gouv.fr ---- */

async function searchCommunes(query) {
  if (!query || query.length < 2) return [];
  const url = `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(query)}&fields=nom,code,codeDepartement,codeRegion,population,centre&boost=population&limit=8`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return data;
  } catch (e) {
    console.warn("Communes API error", e);
    return [];
  }
}
