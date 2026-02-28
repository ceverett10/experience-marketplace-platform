/**
 * Niche-Specific Icon Library for Logo Templates
 *
 * Provides bold, filled SVG icons from Phosphor Icons (MIT licensed)
 * mapped to travel/experience niches. Each niche has multiple icon
 * variants — the brand name hash selects which variant a brand gets,
 * ensuring visual diversity even within the same niche.
 *
 * Icon source: Phosphor Icons Fill (https://phosphoricons.com)
 * License: MIT
 * ViewBox: 256x256
 */

/**
 * Phosphor Icons Fill SVG paths (256x256 viewBox, MIT licensed).
 * Each value contains the inner SVG path elements for a bold, filled icon.
 */
const ICON_PATHS: Record<string, string> = {
  // ── Wine & Drinks ─────────────────────────────────────────────
  wine: `<path d="M205.33,103.67,183.56,29.74A8,8,0,0,0,175.89,24H80.11a8,8,0,0,0-7.67,5.74L50.67,103.67a63.46,63.46,0,0,0,17.42,64.67A87.41,87.41,0,0,0,120,191.63V232H88a8,8,0,1,0,0,16h80a8,8,0,1,0,0-16H136V191.63a87.39,87.39,0,0,0,51.91-23.29A63.48,63.48,0,0,0,205.33,103.67ZM86.09,40h83.82L190,108.19c.09.3.17.6.25.9-21.42,7.68-45.54-1.6-58.63-8.23C106.43,88.11,86.43,86.49,71.68,88.93Z"/>`,

  beerBottle: `<path d="M245.66,42.34l-32-32a8,8,0,0,0-11.32,11.32l1.48,1.47L148.65,64.51l-38.22,7.65a8.05,8.05,0,0,0-4.09,2.18L23,157.66a24,24,0,0,0,0,33.94L64.4,233a24,24,0,0,0,33.94,0l83.32-83.31a8,8,0,0,0,2.18-4.09l7.65-38.22,41.38-55.17,1.47,1.48a8,8,0,0,0,11.32-11.32ZM81.37,224a7.94,7.94,0,0,1-5.65-2.34L34.34,180.28a8,8,0,0,1,0-11.31L40,163.31,92.69,216,87,221.66A8,8,0,0,1,81.37,224ZM177.6,99.2a7.92,7.92,0,0,0-1.44,3.23l-7.53,37.63L160,148.69,107.31,96l8.63-8.63,37.63-7.53a7.92,7.92,0,0,0,3.23-1.44l58.45-43.84,6.19,6.19Z"/>`,

  champagne: `<path d="M149.91,13.53A8,8,0,0,0,142.3,8H97.71a8,8,0,0,0-7.61,5.53a451,451,0,0,0-14.21,59.7c-7.26,44.25-4.35,75.76,8.65,93.66A40,40,0,0,0,112,183.42V232H96a8,8,0,1,0,0,16h48a8,8,0,0,0,0-16H128V183.42a39.94,39.94,0,0,0,27.46-16.53c13-17.9,15.92-49.41,8.66-93.66A451,451,0,0,0,149.91,13.53ZM93.8,64c3-15.58,6.73-29.81,9.79-40h32.83c3.06,10.19,6.77,24.42,9.8,40ZM232,52a12,12,0,1,1-12-12A12,12,0,0,1,232,52ZM184,20a12,12,0,1,1,12,12A12,12,0,0,1,184,20Zm24,80a12,12,0,1,1-12-12A12,12,0,0,1,208,100Z"/>`,

  // ── Food & Dining ─────────────────────────────────────────────
  utensils: `<path d="M216,40V224a8,8,0,0,1-16,0V176H152a8,8,0,0,1-8-8,268.75,268.75,0,0,1,7.22-56.88c9.78-40.49,28.32-67.63,53.63-78.47A8,8,0,0,1,216,40Z"/><path d="M119.89,38.69a8,8,0,1,0-15.78,2.63L111.89,88H88V40a8,8,0,0,0-16,0V88H48.11l7.78-46.68a8,8,0,1,0-15.78-2.63l-8,48A8.17,8.17,0,0,0,32,88a48.07,48.07,0,0,0,40,47.32V224a8,8,0,0,0,16,0V135.32A48.07,48.07,0,0,0,128,88a8.17,8.17,0,0,0-.11-1.31Z"/>`,

  cookingPot: `<path d="M88,48V16a8,8,0,0,1,16,0V48a8,8,0,0,1-16,0Zm40,8a8,8,0,0,0,8-8V16a8,8,0,0,0-16,0V48A8,8,0,0,0,128,56Zm32,0a8,8,0,0,0,8-8V16a8,8,0,0,0-16,0V48A8,8,0,0,0,160,56Zm94.4,35.2a8,8,0,0,0-11.2-1.6L224,104V80a8,8,0,0,0-8-8H40a8,8,0,0,0-8,8v24L12.8,89.6a8,8,0,0,0-9.6,12.8L32,124v60a32,32,0,0,0,32,32H192a32,32,0,0,0,32-32V124l28.8-21.6A8,8,0,0,0,254.4,91.2Z"/>`,

  // ── Museum & Culture ──────────────────────────────────────────
  landmark: `<path d="M248,208a8,8,0,0,1-8,8H16a8,8,0,0,1,0-16H240A8,8,0,0,1,248,208ZM16.3,98.18a8,8,0,0,1,3.51-9l104-64a8,8,0,0,1,8.38,0l104,64A8,8,0,0,1,232,104H208v64h16a8,8,0,0,1,0,16H32a8,8,0,0,1,0-16H48V104H24A8,8,0,0,1,16.3,98.18ZM144,160a8,8,0,0,0,16,0V112a8,8,0,0,0-16,0Zm-48,0a8,8,0,0,0,16,0V112a8,8,0,0,0-16,0Z"/>`,

  // ── Sightseeing & Photography ─────────────────────────────────
  camera: `<path d="M208,56H180.28L166.65,35.56A8,8,0,0,0,160,32H96a8,8,0,0,0-6.65,3.56L75.71,56H48A24,24,0,0,0,24,80V192a24,24,0,0,0,24,24H208a24,24,0,0,0,24-24V80A24,24,0,0,0,208,56Zm-44,76a36,36,0,1,1-36-36A36,36,0,0,1,164,132Z"/>`,

  mapPin: `<path d="M128,16a88.1,88.1,0,0,0-88,88c0,75.3,80,132.17,83.41,134.55a8,8,0,0,0,9.18,0C136,236.17,216,179.3,216,104A88.1,88.1,0,0,0,128,16Zm0,56a32,32,0,1,1-32,32A32,32,0,0,1,128,72Z"/>`,

  // ── Adventure & Outdoors ──────────────────────────────────────
  mountain: `<path d="M254.88,195.92l-54.56-92.08A15.87,15.87,0,0,0,186.55,96h0a15.85,15.85,0,0,0-13.76,7.84l-15.64,26.39a4,4,0,0,0,0,4.07l26.8,45.47a8.13,8.13,0,0,1-1.89,10.55,8,8,0,0,1-11.8-2.26L101.79,71.88a16,16,0,0,0-27.58,0L1.11,195.94a8,8,0,0,0,1,9.52A8.23,8.23,0,0,0,8.23,208H247.77a8.29,8.29,0,0,0,6.09-2.55A8,8,0,0,0,254.88,195.92ZM64.43,120,88,80l23.57,40Z"/>`,

  tent: `<path d="M255.31,188.75l-64-144A8,8,0,0,0,184,40H72a8,8,0,0,0-7.31,4.75h0l0,.12v0L.69,188.75A8,8,0,0,0,8,200H248a8,8,0,0,0,7.31-11.25ZM64,184H20.31L64,85.7Zm16,0V85.7L123.69,184Z"/>`,

  bicycle: `<path d="M54.46,164.71,82.33,126.5a48,48,0,1,1-12.92-9.44L41.54,155.29a8,8,0,1,0,12.92,9.42ZM208,112a47.81,47.81,0,0,0-16.93,3.09L214.91,156A8,8,0,1,1,201.09,164l-23.83-40.86A48,48,0,1,0,208,112ZM165.93,72H192a8,8,0,0,1,8,8,8,8,0,0,0,16,0,24,24,0,0,0-24-24H152a8,8,0,0,0-6.91,12l11.65,20H99.26L82.91,60A8,8,0,0,0,76,56H48a8,8,0,0,0,0,16H71.41L85.12,95.51,69.41,117.06a47.87,47.87,0,0,1,12.92,9.44l11.59-15.9L125.09,164A8,8,0,1,0,138.91,156l-30.32-52h57.48l11.19,19.17a48.11,48.11,0,0,1,13.81-8.08Z"/>`,

  // ── Safari & Wildlife ─────────────────────────────────────────
  binoculars: `<path d="M237.22,151.9l0-.1a1.42,1.42,0,0,0-.07-.22,48.46,48.46,0,0,0-2.31-5.3L193.27,51.8a8,8,0,0,0-1.67-2.44,32,32,0,0,0-45.26,0A8,8,0,0,0,144,55V80H112V55a8,8,0,0,0-2.34-5.66,32,32,0,0,0-45.26,0,8,8,0,0,0-1.67,2.44L21.2,146.28a48.46,48.46,0,0,0-2.31,5.3,1.72,1.72,0,0,0-.07.21s0,.08,0,.11a48,48,0,0,0,90.32,32.51,47.49,47.49,0,0,0,2.9-16.59V96h32v71.83a47.49,47.49,0,0,0,2.9,16.59,48,48,0,0,0,90.32-32.51Zm-143.15,27a32,32,0,0,1-60.2-21.71l1.81-4.13A32,32,0,0,1,96,167.88V168h0A32,32,0,0,1,94.07,178.94ZM203,198.07A32,32,0,0,1,160,168h0v-.11a32,32,0,0,1,60.32-14.78l1.81,4.13A32,32,0,0,1,203,198.07Z"/>`,

  // ── Water & Boats ─────────────────────────────────────────────
  sailboat: `<path d="M160,140V72.85a4,4,0,0,1,7-2.69l55,60.46a8,8,0,0,1,.43,10.26,8.24,8.24,0,0,1-6.58,3.12H164A4,4,0,0,1,160,140Z"/><path d="M247.21,172.53A8,8,0,0,0,240,168H144V8a8,8,0,0,0-14.21-5l-104,128A8,8,0,0,0,32,144h96v24H16a8,8,0,0,0-6.25,13l29.6,37a15.93,15.93,0,0,0,12.49,6H204.16a15.93,15.93,0,0,0,12.49-6l29.6-37A8,8,0,0,0,247.21,172.53Z"/>`,

  anchor: `<path d="M224,144c0,38.11-27.67,45.66-49.9,51.72C149.77,202.36,136,207.31,136,232a8,8,0,0,1-16,0c0-24.69-13.77-29.64-38.1-36.28C59.67,189.66,32,182.11,32,144a8,8,0,0,1,16,0c0,24.69,13.77,29.64,38.1,36.28,11.36,3.1,24.12,6.6,33.9,14.34V128H88a8,8,0,0,1,0-16h32V82.83a28,28,0,1,1,16,0V112h32a8,8,0,0,1,0,16H136v66.62c9.78-7.74,22.54-11.24,33.9-14.34C194.23,173.64,208,168.69,208,144a8,8,0,0,1,16,0Z"/>`,

  // ── Beach & Tropical ──────────────────────────────────────────
  treePalm: `<path d="M239.84,60.33a8,8,0,0,1-4.65,5.75L179,90.55a71.42,71.42,0,0,1,43.36,33.21,70.64,70.64,0,0,1,7.2,54.32A8,8,0,0,1,217,182.36l-81-61.68V224a8,8,0,0,1-16,0V120.68L39,182.36a8,8,0,0,1-12.57-4.28,70.64,70.64,0,0,1,7.2-54.32A71.42,71.42,0,0,1,77,90.55L20.81,66.08a8,8,0,0,1-2.6-12.85,66.86,66.86,0,0,1,97.74,0,72.21,72.21,0,0,1,12,17,72.21,72.21,0,0,1,12.05-17,66.86,66.86,0,0,1,97.74,0A8,8,0,0,1,239.84,60.33Z"/>`,

  // ── City & Urban ──────────────────────────────────────────────
  building: `<path d="M239.73,208H224V96a16,16,0,0,0-16-16H164a4,4,0,0,0-4,4V208H144V32.41a16.43,16.43,0,0,0-6.16-13,16,16,0,0,0-18.72-.69L39.12,72A16,16,0,0,0,32,85.34V208H16.27A8.18,8.18,0,0,0,8,215.47,8,8,0,0,0,16,224H240a8,8,0,0,0,8-8.53A8.18,8.18,0,0,0,239.73,208ZM76,184a8,8,0,0,1-8.53,8A8.18,8.18,0,0,1,60,183.72V168.27A8.19,8.19,0,0,1,67.47,160,8,8,0,0,1,76,168Zm0-56a8,8,0,0,1-8.53,8A8.19,8.19,0,0,1,60,127.72V112.27A8.19,8.19,0,0,1,67.47,104,8,8,0,0,1,76,112Zm40,56a8,8,0,0,1-8.53,8,8.18,8.18,0,0,1-7.47-8.26V168.27a8.19,8.19,0,0,1,7.47-8.26,8,8,0,0,1,8.53,8Zm0-56a8,8,0,0,1-8.53,8,8.19,8.19,0,0,1-7.47-8.26V112.27a8.19,8.19,0,0,1,7.47-8.26,8,8,0,0,1,8.53,8Z"/>`,

  // ── People & Groups ───────────────────────────────────────────
  users: `<path d="M164.47,195.63a8,8,0,0,1-6.7,12.37H10.23a8,8,0,0,1-6.7-12.37,95.83,95.83,0,0,1,47.22-37.71,60,60,0,1,1,66.5,0A95.83,95.83,0,0,1,164.47,195.63Z"/><path d="M252.38,195.48a8,8,0,0,1-6.7,12.52H178.59a4,4,0,0,1-3.95-4.64,23.92,23.92,0,0,1,3.65-16.47,112.32,112.32,0,0,1,29.85-30.83,4,4,0,0,0,1.07-5.53,75.83,75.83,0,0,0-3.63-89.94,4,4,0,0,1,1.33-6A60,60,0,0,1,251.56,157.92,95.87,95.87,0,0,0,204.43,195.48Z"/>`,

  // ── Celebrations & Events ─────────────────────────────────────
  sparkles: `<path d="M208,144a15.78,15.78,0,0,1-10.42,14.94L146,178l-19,51.62a15.92,15.92,0,0,1-29.88,0L78,178l-51.62-19a15.92,15.92,0,0,1,0-29.88L78,110l19-51.62a15.92,15.92,0,0,1,29.88,0L146,110l51.62,19A15.78,15.78,0,0,1,208,144Z"/><path d="M152,48h16V64a8,8,0,0,0,16,0V48h16a8,8,0,0,0,0-16H184V16a8,8,0,0,0-16,0V32H152a8,8,0,0,0,0,16Zm88,32h-8V72a8,8,0,0,0-16,0v8h-8a8,8,0,0,0,0,16h8v8a8,8,0,0,0,16,0V96h8a8,8,0,0,0,0-16Z"/>`,

  ticket: `<path d="M232,104a8,8,0,0,0,8-8V64a16,16,0,0,0-16-16H32A16,16,0,0,0,16,64V96a8,8,0,0,0,8,8,24,24,0,0,1,0,48,8,8,0,0,0-8,8v32a16,16,0,0,0,16,16H224a16,16,0,0,0,16-16V160a8,8,0,0,0-8-8,24,24,0,0,1,0-48ZM32,167.2a40,40,0,0,0,0-78.4V64H88V192H32Z"/>`,

  // ── Romance & Wellness ────────────────────────────────────────
  heart: `<path d="M240,102c0,70-103.79,126.66-108.21,129a8,8,0,0,1-7.58,0C119.79,228.66,16,172,16,102A62.07,62.07,0,0,1,78,40c20.65,0,38.73,8.88,50,23.89C139.27,48.88,157.35,40,178,40A62.07,62.07,0,0,1,240,102Z"/>`,

  flower: `<path d="M210.35,129.36c-.81-.47-1.7-.92-2.62-1.36.92-.44,1.81-.89,2.62-1.36a40,40,0,1,0-40-69.28c-.81.47-1.65,1-2.48,1.59.08-1,.13-2,.13-3a40,40,0,0,0-80,0c0,.94,0,1.94.13,3-.83-.57-1.67-1.12-2.48-1.59a40,40,0,1,0-40,69.28c.81.47,1.7.92,2.62,1.36-.92.44-1.81.89-2.62,1.36a40,40,0,1,0,40,69.28c.81-.47,1.65-1,2.48-1.59-.08,1-.13,2-.13,2.95a40,40,0,0,0,80,0c0-.94-.05-1.94-.13-2.95.83.57,1.67,1.12,2.48,1.59A39.79,39.79,0,0,0,190.29,204a40.43,40.43,0,0,0,10.42-1.38,40,40,0,0,0,9.64-73.28ZM128,156a28,28,0,1,1,28-28A28,28,0,0,1,128,156Z"/>`,

  // ── Navigation & Exploration ──────────────────────────────────
  compass: `<path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm51.58,57.79-32,64a4.08,4.08,0,0,1-1.79,1.79l-64,32a4,4,0,0,1-5.37-5.37l32-64a4.08,4.08,0,0,1,1.79-1.79l64-32A4,4,0,0,1,179.58,81.79Z"/>`,

  globe: `<path d="M128,24h0A104,104,0,1,0,232,128,104.12,104.12,0,0,0,128,24Zm78.36,64H170.71a135.28,135.28,0,0,0-22.3-45.6A88.29,88.29,0,0,1,206.37,88ZM216,128a87.61,87.61,0,0,1-3.33,24H174.16a157.44,157.44,0,0,0,0-48h38.51A87.61,87.61,0,0,1,216,128ZM128,43a115.27,115.27,0,0,1,26,45H102A115.11,115.11,0,0,1,128,43ZM102,168H154a115.11,115.11,0,0,1-26,45A115.27,115.27,0,0,1,102,168Zm-3.9-16a140.84,140.84,0,0,1,0-48h59.88a140.84,140.84,0,0,1,0,48Zm50.35,61.6a135.28,135.28,0,0,0,22.3-45.6h35.66A88.29,88.29,0,0,1,148.41,213.6Z"/>`,
};

/**
 * Niche-to-icon-variants mapping.
 * Each niche category has multiple icon options. The brand name hash
 * selects which variant a particular brand gets.
 */
const NICHE_VARIANTS: Record<string, string[]> = {
  wine: ['wine', 'champagne', 'beerBottle'],
  food: ['utensils', 'cookingPot'],
  museum: ['landmark', 'camera'],
  walk: ['mapPin', 'compass'],
  adventure: ['mountain', 'tent', 'bicycle'],
  water: ['sailboat', 'anchor'],
  safari: ['binoculars', 'compass'],
  city: ['building', 'camera'],
  corporate: ['users', 'globe'],
  party: ['sparkles', 'ticket'],
  romance: ['heart', 'flower'],
  wellness: ['flower', 'heart'],
  beach: ['treePalm', 'sailboat'],
  sightseeing: ['camera', 'landmark', 'mapPin'],
  explore: ['compass', 'globe', 'binoculars'],
  event: ['ticket', 'sparkles'],
};

/** Simple string hash for deterministic variant selection. */
function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Determine the niche category from keywords.
 * Returns the category key used in NICHE_VARIANTS.
 */
function getNicheCategory(niche: string): string {
  const n = niche.toLowerCase();

  if (n.includes('food') || n.includes('culinary') || n.includes('gastro') || n.includes('cook')) {
    return 'food';
  }
  if (n.includes('wine') || n.includes('beer') || n.includes('drink') || n.includes('brew')) {
    return 'wine';
  }
  if (
    n.includes('museum') ||
    n.includes('art') ||
    n.includes('gallery') ||
    n.includes('heritage')
  ) {
    return 'museum';
  }
  if (n.includes('walk') || n.includes('hiking') || n.includes('trek')) {
    return 'walk';
  }
  if (n.includes('safari') || n.includes('wildlife') || n.includes('birdwatch')) {
    return 'safari';
  }
  if (n.includes('adventure') || n.includes('outdoor') || n.includes('mountain')) {
    return 'adventure';
  }
  if (
    n.includes('boat') ||
    n.includes('cruise') ||
    n.includes('sail') ||
    n.includes('water') ||
    n.includes('kayak')
  ) {
    return 'water';
  }
  if (n.includes('beach') || n.includes('tropical') || n.includes('island')) {
    return 'beach';
  }
  if (n.includes('city') || n.includes('urban') || n.includes('architecture')) {
    return 'city';
  }
  if (n.includes('corporate') || n.includes('team') || n.includes('business')) {
    return 'corporate';
  }
  if (
    n.includes('party') ||
    n.includes('bachelorette') ||
    n.includes('bachelor') ||
    n.includes('celebration')
  ) {
    return 'party';
  }
  if (
    n.includes('honeymoon') ||
    n.includes('romantic') ||
    n.includes('anniversary') ||
    n.includes('couple')
  ) {
    return 'romance';
  }
  if (n.includes('spa') || n.includes('wellness') || n.includes('retreat') || n.includes('yoga')) {
    return 'wellness';
  }
  if (n.includes('ticket') || n.includes('event') || n.includes('show')) {
    return 'event';
  }
  if (n.includes('solo') || n.includes('individual') || n.includes('explore')) {
    return 'explore';
  }
  if (
    n.includes('sightseeing') ||
    n.includes('tour') ||
    n.includes('cultural') ||
    n.includes('history')
  ) {
    return 'sightseeing';
  }

  return 'explore'; // default
}

/**
 * Map a niche + brand name to a specific icon variant.
 * Two brands in the same niche will likely get different icons.
 */
export function getIconForNiche(niche: string, brandName?: string): string {
  const category = getNicheCategory(niche);
  const variants = NICHE_VARIANTS[category] ?? ['globe'];
  if (!brandName || variants.length === 1) return variants[0]!;
  return variants[hashString(brandName) % variants.length]!;
}

/**
 * Build a complete SVG string from a Phosphor filled icon and convert to a
 * base64 data URI suitable for use in Satori `<img>` elements.
 */
export function buildIconDataUri(iconKey: string, color: string, size: number = 80): string {
  const pathData = ICON_PATHS[iconKey] ?? ICON_PATHS['globe']!;

  const coloredPaths = pathData.replace(/<path /g, `<path fill="${color}" `);

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 256 256">`,
    coloredPaths,
    `</svg>`,
  ].join('');

  const base64 = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}

/**
 * Build a favicon-sized filled icon data URI.
 */
export function buildFaviconIconDataUri(iconKey: string, color: string, size: number = 96): string {
  const pathData = ICON_PATHS[iconKey] ?? ICON_PATHS['globe']!;

  const coloredPaths = pathData.replace(/<path /g, `<path fill="${color}" `);

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 256 256">`,
    coloredPaths,
    `</svg>`,
  ].join('');

  const base64 = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}
