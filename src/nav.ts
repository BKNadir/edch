// The side menu: pages in order ("-" is a separator). Settings and About can't be hidden.

export const NAV: { id: string; label: string; icon: string }[] = [
  { id: "materials", label: "Matériaux", icon: "M4 7l8-4 8 4-8 4zM4 12l8 4 8-4M4 17l8 4 8-4" },
  { id: "odyssey", label: "Odyssey", icon: "M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM5 21c0-4 3-7 7-7s7 3 7 7" },
  { id: "engineering", label: "Ingénierie", icon: "M14 6l4 4-9 9H5v-4zM16 4l4 4" },
  { id: "wishlist", label: "Wishlist", icon: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" },
  { id: "engineers", label: "Ingénieurs", icon: "M4 20h16M6 20V9l6-5 6 5v11M10 20v-6h4v6" },
  { id: "search", label: "Recherche", icon: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5L20 20" },
  { id: "navigation", label: "Navigation", icon: "M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" },
  { id: "-", label: "", icon: "" },
  { id: "missions", label: "Missions", icon: "M9 4h6v3H9zM7 5H5v16h14V5h-2M8 11h8M8 15h6" },
  { id: "colonisation", label: "Colonisation", icon: "M5 21V4M5 4h11l-2 4 2 4H5" },
  { id: "goals", label: "Objectifs communautaires", icon: "M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8" },
  { id: "exploration", label: "Exploration", icon: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM3 15c3 2 15-4 18-8" },
  { id: "mining", label: "Minage", icon: "M14 4l6 6M4 20l9-9M11 6c3-2 6-1 7 0M18 13c2-3 1-6 0-7" },
  { id: "powerplay", label: "Powerplay", icon: "M13 2L4 14h7l-1 8 9-12h-7z" },
  { id: "session", label: "Session", icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2" },
  { id: "-", label: "", icon: "" },
  { id: "controls", label: "Commandes", icon: "M6 9h12a4 4 0 0 1 4 4v2a3 3 0 0 1-5.4 1.8L15 15H9l-1.6 1.8A3 3 0 0 1 2 15v-2a4 4 0 0 1 4-4zM7 11v3M5.5 12.5h3M15.5 12h.01M17.5 13.5h.01" },
  { id: "mobile", label: "Mobile", icon: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2" },
  { id: "sync", label: "Synchro", icon: "M4 12a8 8 0 0 1 14-5.3M20 4v4h-4M20 12a8 8 0 0 1-14 5.3M4 20v-4h4" },
  { id: "about", label: "À propos", icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8h.01" },
  { id: "settings", label: "Paramètres", icon: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 12l2-1-1-3-2 .2-1.5-1.5L16.7 4 13.8 3 13 5h-2l-.8-2-2.9 1 .2 2.7L6 8.2 4 8 3 11l2 1v0l-2 1 1 3 2-.2 1.5 1.5L7.3 20l2.9 1 .8-2h2l.8 2 2.9-1-.2-2.7 1.5-1.5 2 .2 1-3z" },
];

export const ALWAYS_SHOWN = new Set(["settings", "about"]);

/** The menu without the pages hidden in Settings (and without separators left side by side). */
export function visibleNav(hidden: string[], extraHidden: string[] = []): typeof NAV {
  const out = NAV.filter((n) => n.id === "-" || ALWAYS_SHOWN.has(n.id) || (!hidden.includes(n.id) && !extraHidden.includes(n.id)));
  return out.filter((n, i) => n.id !== "-" || (i > 0 && out[i - 1].id !== "-" && i < out.length - 1));
}
