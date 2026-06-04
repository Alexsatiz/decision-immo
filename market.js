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

/* ---- 1quater. Loyers par arrondissement (Paris/Lyon/Marseille) ----
   Sources : Clameur 2024-2025 + OLAP (encadrement loyers Paris/Lyon).
   Indexé par code postal. Le prix/m² est repris du DVF arrondissement.
*/
const MARKET_PRECISE_ARR = {
  // Paris — encadrement OLAP. Fourchettes loyers de marché meublé/nu confondus, parcs récents+anciens.
  "75001": { rentM2: [29, 38], tension: 5, profile: "Cadres, expats, courte durée", risk: "Encadrement loyers strict, rendement très faible", transports: "M1/M4/M7/M14, RER A/B/D" },
  "75002": { rentM2: [29, 37], tension: 5, profile: "Cadres, jeunes actifs, expats", risk: "Encadrement loyers strict", transports: "M3/M4/M7/M8/M9, Sentier" },
  "75003": { rentM2: [29, 38], tension: 5, profile: "Cadres, créatifs, jeunes actifs", risk: "Encadrement loyers strict", transports: "M3/M8/M11, Marais" },
  "75004": { rentM2: [30, 40], tension: 5, profile: "CSP++, expats, courte durée", risk: "Prix très élevés, rendement < 3%", transports: "M1/M7/M11, RER A/B/D" },
  "75005": { rentM2: [29, 38], tension: 5, profile: "Étudiants, enseignants, familles CSP+", risk: "Encadrement loyers, demande étudiante très forte", transports: "M7/M10, RER B" },
  "75006": { rentM2: [32, 42], tension: 5, profile: "CSP++, courte durée premium", risk: "Le plus cher de Paris, rendement < 3%", transports: "M4/M10/M12, RER B" },
  "75007": { rentM2: [31, 40], tension: 5, profile: "CSP++, diplomatique, expats", risk: "Prix très élevés, rendement faible", transports: "M8/M12/M13, RER C" },
  "75008": { rentM2: [29, 38], tension: 5, profile: "Cadres affaires, expats", risk: "Marché business, vacance possible août", transports: "M1/M2/M9/M13, RER A" },
  "75009": { rentM2: [27, 35], tension: 5, profile: "Jeunes actifs, cadres, créatifs", risk: "Encadrement loyers", transports: "M2/M3/M7/M8/M9/M12, RER A/E" },
  "75010": { rentM2: [25, 33], tension: 5, profile: "Jeunes actifs, étudiants, mixte social", risk: "Hétérogénéité forte par micro-quartier", transports: "Gares Nord/Est, M2/M4/M5/M7" },
  "75011": { rentM2: [26, 34], tension: 5, profile: "Jeunes actifs, créatifs, bobos", risk: "Encadrement loyers, marché très tendu", transports: "M1/M2/M3/M5/M8/M9/M11" },
  "75012": { rentM2: [25, 32], tension: 5, profile: "Familles, jeunes actifs", risk: "Encadrement loyers", transports: "M1/M6/M8, RER A/D, Gare de Lyon" },
  "75013": { rentM2: [24, 31], tension: 4, profile: "Étudiants (BNF), jeunes actifs, asiatique", risk: "Encadrement loyers, secteurs hétérogènes", transports: "M5/M6/M7/M14, RER C" },
  "75014": { rentM2: [25, 33], tension: 5, profile: "Cadres, familles, étudiants", risk: "Encadrement loyers", transports: "M4/M6/M13, RER B, Montparnasse" },
  "75015": { rentM2: [25, 33], tension: 5, profile: "Familles, cadres, jeunes actifs", risk: "Encadrement loyers", transports: "M6/M8/M10/M12, RER C" },
  "75016": { rentM2: [27, 36], tension: 4, profile: "CSP++, familles, expats", risk: "Marché bourgeois, vacance estivale", transports: "M1/M2/M6/M9/M10, RER C" },
  "75017": { rentM2: [26, 34], tension: 5, profile: "Cadres, familles, jeunes actifs", risk: "Encadrement loyers, hétérogène", transports: "M1/M2/M3/M13, RER C" },
  "75018": { rentM2: [24, 32], tension: 5, profile: "Jeunes actifs, créatifs, étudiants", risk: "Encadrement loyers, fortes disparités intra-arr.", transports: "M2/M4/M12/M13, RER B/E" },
  "75019": { rentM2: [22, 29], tension: 4, profile: "Jeunes actifs, étudiants, mixte social", risk: "Encadrement loyers, secteurs sensibles", transports: "M2/M5/M7/M7bis/M11, RER E" },
  "75020": { rentM2: [22, 29], tension: 4, profile: "Jeunes actifs, mixte social, créatifs", risk: "Encadrement loyers, hétérogénéité par quartier", transports: "M2/M3/M3bis/M9/M11, RER E" },

  // Lyon — encadrement loyers depuis 2021
  "69001": { rentM2: [14, 19], tension: 5, profile: "Étudiants, jeunes actifs, créatifs", risk: "Encadrement loyers, marché très tendu", transports: "M A/C, F1, tram T1" },
  "69002": { rentM2: [14, 19], tension: 5, profile: "Cadres, courte durée, étudiants", risk: "Encadrement loyers, presqu'île premium", transports: "M A/D, tram T1/T2" },
  "69003": { rentM2: [13, 17], tension: 5, profile: "Jeunes actifs, cadres Part-Dieu", risk: "Encadrement loyers", transports: "M B/D, tram T1/T3/T4, gare TGV" },
  "69004": { rentM2: [13, 17], tension: 4, profile: "Familles CSP+, jeunes actifs", risk: "Encadrement loyers, Croix-Rousse", transports: "M C, F2" },
  "69005": { rentM2: [12, 16], tension: 4, profile: "Étudiants, familles, touristique", risk: "Encadrement loyers, Vieux-Lyon UNESCO", transports: "M D, F1/F2" },
  "69006": { rentM2: [14, 18], tension: 5, profile: "Cadres, familles, expats", risk: "Encadrement loyers, secteur Tête d'Or premium", transports: "M A/B, tram T1/T4" },
  "69007": { rentM2: [13, 17], tension: 4, profile: "Étudiants, jeunes actifs", risk: "Encadrement loyers, Guillotière mixte", transports: "M B/D, tram T1/T2" },
  "69008": { rentM2: [12, 15], tension: 4, profile: "Familles, jeunes actifs", risk: "Hétérogène (Mermoz vs États-Unis)", transports: "M D, tram T2/T4/T6" },
  "69009": { rentM2: [12, 15], tension: 3, profile: "Familles, primo-accédants", risk: "Vaise en mutation, ZAC nord plus calme", transports: "M D, tram T1, gare Vaise" },

  // Marseille — pas d'encadrement, hétérogénéité maximale
  "13001": { rentM2: [13, 17], tension: 4, profile: "Étudiants, jeunes actifs, mixte", risk: "Hyper-centre, sécurité variable", transports: "M1/M2, tram T2/T3" },
  "13002": { rentM2: [13, 17], tension: 4, profile: "Jeunes actifs, créatifs (Joliette/Euromed)", risk: "Mutation urbaine, secteurs encore inégaux", transports: "M2, tram T2/T3" },
  "13003": { rentM2: [9, 13], tension: 3, profile: "Mixte social, primo-investisseurs prudents", risk: "Secteur sensible (Belle de Mai partielle)", transports: "M2, tram T2" },
  "13004": { rentM2: [12, 16], tension: 4, profile: "Familles, jeunes actifs, étudiants", risk: "Cinq-Avenues / Chartreux corrects", transports: "M1, tram T1" },
  "13005": { rentM2: [13, 17], tension: 4, profile: "Étudiants (Timone), jeunes actifs", risk: "Bonne tension étudiante, hétérogène", transports: "M1, tram T1" },
  "13006": { rentM2: [14, 18], tension: 5, profile: "Cadres, étudiants, courte durée", risk: "Hyper-tendu Préfecture/Vauban, prix élevés", transports: "M1/M2, tram T2/T3" },
  "13007": { rentM2: [16, 22], tension: 5, profile: "CSP++, courte durée premium (Pharo, Endoume)", risk: "Le plus cher, rendement faible", transports: "Bus, M1 limité" },
  "13008": { rentM2: [15, 19], tension: 5, profile: "CSP++, familles, retraités (Roucas/Prado)", risk: "Prix élevés, rendement faible", transports: "M2, bus" },
  "13009": { rentM2: [12, 16], tension: 4, profile: "Familles, étudiants (Luminy), expat fac", risk: "Hétérogène (Mazargues vs Cayolle)", transports: "M2, bus, tram T3 partiel" },
  "13010": { rentM2: [11, 14], tension: 3, profile: "Familles, primo-accédants", risk: "Saint-Loup/Pont-de-Vivaux corrects", transports: "M1, bus" },
  "13011": { rentM2: [11, 14], tension: 3, profile: "Familles, jeunes actifs (La Valentine)", risk: "Périphérique est, dépendance voiture", transports: "M1, bus" },
  "13012": { rentM2: [12, 16], tension: 4, profile: "Familles, étudiants Saint-Jérôme", risk: "Saint-Barnabé / Quatre-Chemins corrects", transports: "M1, bus" },
  "13013": { rentM2: [11, 14], tension: 3, profile: "Familles, mixte social", risk: "Secteurs très hétérogènes (Olives vs Castellane)", transports: "M1, bus" },
  "13014": { rentM2: [9, 12], tension: 3, profile: "Mixte social, primo-investisseurs prudents", risk: "Secteurs sensibles (Bon-Secours, Merlan partiels)", transports: "M2, bus" },
  "13015": { rentM2: [9, 12], tension: 3, profile: "Mixte social, primo-investisseurs prudents", risk: "Quartiers nord, sécurité variable", transports: "M2, tram T3, bus" },
  "13016": { rentM2: [12, 15], tension: 3, profile: "Familles, retraités (L'Estaque)", risk: "Excentré, vue mer compense", transports: "Bus, train TER L'Estaque" },
};

// Construit un objet "MARKET_PRECISE-like" pour un arrondissement,
// en combinant DVF (prix/m²) + table loyers manuelle.
function buildArrondMarket(cp) {
  const cpStr = String(cp).trim();
  const rentData = MARKET_PRECISE_ARR[cpStr];
  const dvf = MARKET_DVF_ARR[cpStr];
  if (!rentData || !dvf) return null;
  return {
    priceM2: [dvf.m2P25, dvf.m2P75],
    rentM2: rentData.rentM2,
    tension: rentData.tension,
    profile: rentData.profile,
    risk: rentData.risk,
    transports: rentData.transports,
    estimated: false,
    arrondissement: dvf.label,
    cp: cpStr,
  };
}

/* ---- 1bis. Stats DVF agrégées par commune (ventes appartements 2024-2025) ----
   Source : DVF (Demandes de Valeurs Foncières), data.gouv.fr / Etalab.
   Calculé localement via /tmp/dvf-stats/compute.py sur les CSV bruts.
   Filtres : Vente, Appartement, prix [30k–5M], surface [9–300m²], prix/m² [500–30000].
   Pour Paris/Lyon/Marseille : agrégation tous arrondissements.
   Strasbourg absent : Bas-Rhin utilise le Livre Foncier (pas de DVF).
*/
const MARKET_DVF = {
  "Le Perreux-sur-Marne":  { n:  669, prixMed: 270000, m2Med: 5300, m2P25: 4452, m2P75: 6137, lastDate: "2025-12-30" },
  "Nogent-sur-Marne":      { n:  817, prixMed: 325000, m2Med: 6029, m2P25: 5167, m2P75: 6831, lastDate: "2025-12-31" },
  "Saint-Maur-des-Fossés": { n: 1514, prixMed: 274300, m2Med: 5309, m2P25: 4574, m2P75: 6176, lastDate: "2025-12-31" },
  "Champigny-sur-Marne":   { n:  658, prixMed: 190000, m2Med: 3608, m2P25: 3097, m2P75: 4301, lastDate: "2025-12-31" },
  "Bry-sur-Marne":         { n:  292, prixMed: 268000, m2Med: 4690, m2P25: 3956, m2P75: 5423, lastDate: "2025-12-31" },
  "Villiers-sur-Marne":    { n:  433, prixMed: 199900, m2Med: 3750, m2P25: 3173, m2P75: 4400, lastDate: "2025-12-31" },
  "Fontenay-sous-Bois":    { n:  722, prixMed: 268000, m2Med: 5628, m2P25: 4443, m2P75: 6639, lastDate: "2025-12-30" },
  "Vincennes":             { n: 1457, prixMed: 406000, m2Med: 8571, m2P25: 7542, m2P75: 9691, lastDate: "2025-12-30" },
  "Joinville-le-Pont":     { n:  347, prixMed: 276500, m2Med: 5484, m2P25: 4667, m2P75: 6375, lastDate: "2025-12-31" },
  "Noisy-le-Grand":        { n:  954, prixMed: 215000, m2Med: 4305, m2P25: 3242, m2P75: 5000, lastDate: "2025-12-31" },
  "Chelles":               { n:  577, prixMed: 178600, m2Med: 3240, m2P25: 2659, m2P75: 3944, lastDate: "2025-12-30" },
  "Gagny":                 { n:  333, prixMed: 163300, m2Med: 3037, m2P25: 2575, m2P75: 3852, lastDate: "2025-12-30" },
  "Neuilly-Plaisance":     { n:  279, prixMed: 181000, m2Med: 3859, m2P25: 3065, m2P75: 4778, lastDate: "2025-12-30" },
  "Neuilly-sur-Marne":     { n:  347, prixMed: 175000, m2Med: 3022, m2P25: 2269, m2P75: 3780, lastDate: "2025-12-30" },
  "Rosny-sous-Bois":       { n:  658, prixMed: 193975, m2Med: 3734, m2P25: 3017, m2P75: 4333, lastDate: "2025-12-30" },
  "Bordeaux":              { n: 6741, prixMed: 210000, m2Med: 4241, m2P25: 3517, m2P75: 5094, lastDate: "2025-12-31" },
  "Toulouse":              { n:12853, prixMed: 158000, m2Med: 3268, m2P25: 2586, m2P75: 4157, lastDate: "2025-12-31" },
  "Lille":                 { n: 5132, prixMed: 171000, m2Med: 3797, m2P25: 3018, m2P75: 4672, lastDate: "2025-12-31" },
  "Nantes":                { n: 7632, prixMed: 165000, m2Med: 3430, m2P25: 2830, m2P75: 4111, lastDate: "2025-12-31" },
  "Rennes":                { n: 5521, prixMed: 180000, m2Med: 3676, m2P25: 2918, m2P75: 4401, lastDate: "2025-12-31" },
  "Nice":                  { n:14033, prixMed: 230000, m2Med: 4833, m2P25: 3782, m2P75: 6109, lastDate: "2025-12-31" },
  "Montpellier":           { n: 7907, prixMed: 155000, m2Med: 3382, m2P25: 2643, m2P75: 4115, lastDate: "2025-12-31" },
  "Grenoble":              { n: 4694, prixMed: 130670, m2Med: 2524, m2P25: 1970, m2P75: 3133, lastDate: "2025-12-31" },
  "Paris":                 { n:56072, prixMed: 398000, m2Med: 9727, m2P25: 8200, m2P75:11636, lastDate: "2025-12-31" },
  "Lyon":                  { n:12967, prixMed: 243000, m2Med: 4492, m2P25: 3667, m2P75: 5331, lastDate: "2025-12-31" },
  "Marseille":             { n:20461, prixMed: 170000, m2Med: 3226, m2P25: 2333, m2P75: 4262, lastDate: "2025-12-31" },
};

/* ---- 1ter. Stats DVF par arrondissement (Paris/Lyon/Marseille) ----
   Indexé par code postal (ex: 75018 = Paris 18ème).
   Permet de capter les écarts massifs intra-ville (ex: Paris 6ème 14k€/m² vs 19ème 8k€/m²).
*/
const MARKET_DVF_ARR = {
  "75001": { label: "Paris 1er", n:   539, prixMed:  528500, m2Med: 12286, m2P25: 10424, m2P75: 14975, lastDate: "2025-12-23" },
  "75002": { label: "Paris 2ème", n:   735, prixMed:  414988, m2Med: 11250, m2P25:  9545, m2P75: 12875, lastDate: "2025-12-31" },
  "75003": { label: "Paris 3ème", n:  1318, prixMed:  452250, m2Med: 11875, m2P25: 10288, m2P75: 13795, lastDate: "2025-12-30" },
  "75004": { label: "Paris 4ème", n:  1033, prixMed:  528000, m2Med: 12727, m2P25: 10795, m2P75: 14819, lastDate: "2025-12-30" },
  "75005": { label: "Paris 5ème", n:  1726, prixMed:  431700, m2Med: 11806, m2P25: 10247, m2P75: 13468, lastDate: "2025-12-31" },
  "75006": { label: "Paris 6ème", n:  1487, prixMed:  670000, m2Med: 14324, m2P25: 12226, m2P75: 17300, lastDate: "2025-12-30" },
  "75007": { label: "Paris 7ème", n:  1718, prixMed:  800000, m2Med: 13889, m2P25: 11776, m2P75: 17089, lastDate: "2025-12-30" },
  "75008": { label: "Paris 8ème", n:  1295, prixMed:  753623, m2Med: 12059, m2P25: 10204, m2P75: 14367, lastDate: "2025-12-31" },
  "75009": { label: "Paris 9ème", n:  2169, prixMed:  479000, m2Med: 10714, m2P25:  9239, m2P75: 12323, lastDate: "2025-12-31" },
  "75010": { label: "Paris 10ème", n:  2796, prixMed:  347250, m2Med:  9318, m2P25:  8033, m2P75: 10626, lastDate: "2025-12-30" },
  "75011": { label: "Paris 11ème", n:  4645, prixMed:  355769, m2Med:  9922, m2P25:  8712, m2P75: 11073, lastDate: "2025-12-31" },
  "75012": { label: "Paris 12ème", n:  3073, prixMed:  362620, m2Med:  8983, m2P25:  7975, m2P75: 10122, lastDate: "2025-12-30" },
  "75013": { label: "Paris 13ème", n:  2886, prixMed:  340500, m2Med:  8677, m2P25:  7545, m2P75:  9857, lastDate: "2025-12-31" },
  "75014": { label: "Paris 14ème", n:  3032, prixMed:  363550, m2Med:  9418, m2P25:  8198, m2P75: 10714, lastDate: "2025-12-31" },
  "75015": { label: "Paris 15ème", n:  5901, prixMed:  410000, m2Med:  9482, m2P25:  8327, m2P75: 10740, lastDate: "2025-12-31" },
  "75016": { label: "Paris 16ème", n:  4509, prixMed:  720000, m2Med: 10886, m2P25:  9286, m2P75: 12747, lastDate: "2025-12-31" },
  "75017": { label: "Paris 17ème", n:  4821, prixMed:  425000, m2Med: 10116, m2P25:  8607, m2P75: 11667, lastDate: "2025-12-31" },
  "75018": { label: "Paris 18ème", n:  5702, prixMed:  304000, m2Med:  8797, m2P25:  7368, m2P75: 10401, lastDate: "2025-12-31" },
  "75019": { label: "Paris 19ème", n:  2930, prixMed:  320000, m2Med:  7973, m2P25:  6786, m2P75:  9120, lastDate: "2025-12-31" },
  "75020": { label: "Paris 20ème", n:  3757, prixMed:  321565, m2Med:  8308, m2P25:  7244, m2P75:  9333, lastDate: "2025-12-31" },
  "69001": { label: "Lyon 1er", n:   821, prixMed:  247600, m2Med:  4921, m2P25:  4060, m2P75:  5826, lastDate: "2025-12-30" },
  "69002": { label: "Lyon 2ème", n:   856, prixMed:  292800, m2Med:  5235, m2P25:  4375, m2P75:  6071, lastDate: "2025-12-31" },
  "69003": { label: "Lyon 3ème", n:  2612, prixMed:  255000, m2Med:  4521, m2P25:  3857, m2P75:  5183, lastDate: "2025-12-31" },
  "69004": { label: "Lyon 4ème", n:   953, prixMed:  300000, m2Med:  4831, m2P25:  4127, m2P75:  5701, lastDate: "2025-12-30" },
  "69005": { label: "Lyon 5ème", n:  1165, prixMed:  230000, m2Med:  3792, m2P25:  3011, m2P75:  4692, lastDate: "2025-12-31" },
  "69006": { label: "Lyon 6ème", n:  1273, prixMed:  350961, m2Med:  5391, m2P25:  4602, m2P75:  6250, lastDate: "2025-12-30" },
  "69007": { label: "Lyon 7ème", n:  2339, prixMed:  225000, m2Med:  4474, m2P25:  3805, m2P75:  5154, lastDate: "2025-12-31" },
  "69008": { label: "Lyon 8ème", n:  1757, prixMed:  205525, m2Med:  4000, m2P25:  3126, m2P75:  4833, lastDate: "2025-12-30" },
  "69009": { label: "Lyon 9ème", n:  1191, prixMed:  203000, m2Med:  3714, m2P25:  2917, m2P75:  4516, lastDate: "2025-12-30" },
  "13001": { label: "Marseille 1er", n:  1335, prixMed:  165050, m2Med:  3275, m2P25:  2540, m2P75:  4158, lastDate: "2025-12-31" },
  "13002": { label: "Marseille 2ème", n:   751, prixMed:  150000, m2Med:  3316, m2P25:  2458, m2P75:  4204, lastDate: "2025-12-30" },
  "13003": { label: "Marseille 3ème", n:  1062, prixMed:   80000, m2Med:  1855, m2P25:  1360, m2P75:  2487, lastDate: "2025-12-30" },
  "13004": { label: "Marseille 4ème", n:  1827, prixMed:  152000, m2Med:  2900, m2P25:  2400, m2P75:  3650, lastDate: "2025-12-30" },
  "13005": { label: "Marseille 5ème", n:  1931, prixMed:  160000, m2Med:  3468, m2P25:  2854, m2P75:  4242, lastDate: "2025-12-30" },
  "13006": { label: "Marseille 6ème", n:  1697, prixMed:  220000, m2Med:  3865, m2P25:  3109, m2P75:  4799, lastDate: "2025-12-30" },
  "13007": { label: "Marseille 7ème", n:  1279, prixMed:  265000, m2Med:  5000, m2P25:  4020, m2P75:  6263, lastDate: "2025-12-30" },
  "13008": { label: "Marseille 8ème", n:  2397, prixMed:  275000, m2Med:  4321, m2P25:  3507, m2P75:  5226, lastDate: "2025-12-31" },
  "13009": { label: "Marseille 9ème", n:  1626, prixMed:  193150, m2Med:  3078, m2P25:  2375, m2P75:  3991, lastDate: "2025-12-31" },
  "13010": { label: "Marseille 10ème", n:  1487, prixMed:  146300, m2Med:  2656, m2P25:  2139, m2P75:  3311, lastDate: "2025-12-31" },
  "13011": { label: "Marseille 11ème", n:   766, prixMed:  165000, m2Med:  2737, m2P25:  2132, m2P75:  3899, lastDate: "2025-12-30" },
  "13012": { label: "Marseille 12ème", n:  1303, prixMed:  202900, m2Med:  3352, m2P25:  2645, m2P75:  4221, lastDate: "2025-12-30" },
  "13013": { label: "Marseille 13ème", n:  1310, prixMed:  150000, m2Med:  2569, m2P25:  1953, m2P75:  3506, lastDate: "2025-12-30" },
  "13014": { label: "Marseille 14ème", n:   786, prixMed:   87750, m2Med:  1596, m2P25:  1185, m2P75:  2418, lastDate: "2025-12-30" },
  "13015": { label: "Marseille 15ème", n:   700, prixMed:   80100, m2Med:  1486, m2P25:  1091, m2P75:  2066, lastDate: "2025-12-30" },
  "13016": { label: "Marseille 16ème", n:   204, prixMed:  176250, m2Med:  3109, m2P25:  2333, m2P75:  3913, lastDate: "2025-12-29" },
};

// Renvoie les stats DVF, en privilégiant l'arrondissement si un CP est fourni.
// `cp` peut être string ou number (ex: "75018" ou 75018).
function getDVF(city, cp = null) {
  if (cp != null) {
    const cpStr = String(cp).trim();
    if (MARKET_DVF_ARR[cpStr]) return MARKET_DVF_ARR[cpStr];
  }
  return city && MARKET_DVF[city] ? MARKET_DVF[city] : null;
}

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

/* ---- 3. API publique : getMarket(city, geoData, cp) ---- */

function getMarket(city, geoData = null, cp = null) {
  // 0. Code postal d'arrondissement Paris/Lyon/Marseille → priorité absolue
  if (cp != null) {
    const cpStr = String(cp).trim();
    const arr = buildArrondMarket(cpStr);
    if (arr) return arr;
  }
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
  const url = `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(query)}&fields=nom,code,codeDepartement,codeRegion,population,centre,codesPostaux&boost=population&limit=8`;
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
