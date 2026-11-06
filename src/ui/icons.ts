const paths: Record<string, string> = {
  bolt: '<path d="m14 2-9 12h7l-2 8 10-13h-7l1-7Z"/>',
  rifle: '<path d="M2 8h13v5H9l-1 6H5l-1-6H2zM15 9h7v2h-7zM6 13v3H3v-3M12 7V5h3v2"/>',
  shotgun: '<path d="M2 10h13v4H8l-3 5H2l3-7M15 10h7v2h-7M11 13v3h3v-3"/>',
  smg: '<path d="M3 7h13v6h-6v6H7v-6H4V9H2M16 8h6v3h-6M12 13l2 4h3l-2-4"/>',
  sniper: '<path d="M2 11h13v3H9l-3 5H3l3-6M15 11h8M9 8h6M10 7v4M14 7v4M2 10v6"/>',
  shield: '<path d="M8 7h8l2 3v10H6V10zM9 3h6v4H9zM9 13h6M12 10v6"/>',
  medkit: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M9 6V3h6v3M12 10v6M9 13h6"/>',
  pickaxe: '<path d="m5 22 9-16M4 9l3-5 9-1 6 5-5-1-4 2-6-1z"/>',
  wall: '<path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v6M15 9v6M9 15v6"/>',
  floor: '<path d="m2 15 10-8 10 8-10 7zM7 11l10 8M7 19l10-8"/>',
  ramp: '<path d="M3 21 21 3v18zM9 21V15M15 21V9"/>',
  cone: '<path d="m2 18 10-14 10 14-10 4zM12 4v18M2 18l10-5 10 5"/>',
  wood: '<path d="m5 20 12-16 5 4-12 16zM8 16l5 4M12 10l5 4M4 15l-2-2L13 1l3 2"/>',
  brick: '<path d="M3 7h18v12H3zM3 13h18M12 7v6M8 13v6M17 13v6"/>',
  metal: '<path d="m2 9 5-5h15l-4 5v11H2zM2 9h16M7 4v5M6 13h8"/>',
  people:
    '<circle cx="10" cy="7" r="4"/><path d="M3 21v-3a7 7 0 0 1 14 0v3M17 4a4 4 0 0 1 0 8M20 21v-3a6 6 0 0 0-2-5"/>',
  skull:
    '<path d="M5 14a9 9 0 1 1 14 0v5h-4v3H9v-3H5z"/><circle cx="8" cy="10" r="1"/><circle cx="16" cy="10" r="1"/><path d="m10 16 2-3 2 3"/>',
  gear: '<path d="m9 3 1-2h4l1 2 3 2 3 1v4l-2 2 1 3-2 3-3 1-1 3h-4l-1-3-3-1-2-3 1-3-2-2V6l3-1z"/><circle cx="12" cy="11" r="4"/>',
  arrow: '<path d="M3 12h18M15 6l6 6-6 6"/>',
  heart: '<path d="M12 21 3 12a6 6 0 0 1 9-8 6 6 0 0 1 9 8z"/>',
  shieldbar: '<path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6z"/>',
  speaker: '<path d="M3 9h4l6-5v16l-6-5H3zM16 8a6 6 0 0 1 0 8M19 5a10 10 0 0 1 0 14"/>',
};
export function icon(name: string, cls = '') {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.bolt}</svg>`;
}
