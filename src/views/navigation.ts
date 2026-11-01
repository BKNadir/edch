import { plotGalaxy, shipParams, type GalaxyAlgorithm, type GalaxyOptions, type GalaxyRoute } from "../galaxyRoute.js";
import { setNavRoute } from "../tour.js";
import { locale } from "../i18n.js";
import { spanshGet, spanshJob, spanshPost } from "../bridge.js";
import { h, icon, fmt, replace, toast } from "../dom.js";
import type { Ctx, View } from "../context.js";
import { CARRIER_MAX_JUMP, carrierEstimate, fsdInfo, jumpModel, superchargeMultiplier } from "../jump.js";
import { fmtLy } from "../spansh.js";
import { copySystem } from "./results.js";

type Json = Record<string, any>;

const fmt1 = (n: number) => n.toLocaleString(locale(), { maximumFractionDigits: 2 });
const hours = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, "0")}` : `${Math.round(min)} min`);

/** Coordinates of a system by name (Spansh). */
async function coordsOf(name: string): Promise<[number, number, number] | null> {
  const res = await spanshPost("systems/search", { filters: { distance: { min: "0", max: "1" } }, sort: [{ distance: { direction: "asc" } }], size: 1, page: 0, reference_system: name });
  const r = res?.reference ?? res?.results?.[0];
  return r && typeof r.x === "number" ? [r.x, r.y, r.z] : null;
}

let datalistTimer: number | undefined;
/** A destination to put in the route forms (a system name clicked elsewhere). */
let pendingDestination: string | null = null;
export function setDestination(system: string) {
  pendingDestination = system;
}

function systemInput(id: string, value: string, placeholder: string): HTMLInputElement {
  const list = h("datalist", { id: `${id}-list` });
  const input = h("input", {
    id,
    type: "text",
    value,
    placeholder,
    list: `${id}-list`,
    spellcheck: false,
    oninput: () => {
      window.clearTimeout(datalistTimer);
      const q = input.value.trim();
      if (q.length < 3) return;
      datalistTimer = window.setTimeout(async () => {
        try {
          const res = await spanshGet(`systems/field_values/system_names?q=${encodeURIComponent(q)}`);
          const values: string[] = Array.isArray(res?.values) ? res.values : Array.isArray(res) ? res : [];
          replace(list, values.slice(0, 12).map((v) => h("option", { value: v })));
        } catch {
          /* autocomplete is a nicety */
        }
      }, 300);
    },
  });
  queueMicrotask(() => input.parentElement?.appendChild(list));
  return input;
}

export class NavigationView implements View {
  private root?: HTMLElement;
  private rangeCard = h("section.card");
  private routeOut = h("div.route-out");
  private carrierOut = h("div.route-out");
  private cargo?: number;
  private signature = "";

  constructor(private ctx: Ctx) {}

  mount(root: HTMLElement) {
    this.root = root;
    const cmdr = this.ctx.store.state.cmdr;
    const here = cmdr.location?.system ?? "";

    // ---- ship route ----
    const from = systemInput("nav-from", here, "Départ");
    const dest = pendingDestination ?? "";
    pendingDestination = null;
    const to = systemInput("nav-to", dest, "Destination");
    const range = h("input", { type: "number", step: "0.01", min: "1", value: this.defaultRange() ? String(this.defaultRange()) : "", placeholder: "al" });
    const eff = h("input", { type: "number", min: "1", max: "100", value: "60" });
    // The Caspian Explorer's Mk II drive gets x6 from neutron stars instead of x4: ticked when the
    // current ship has it, and it can be unticked (to plot for another ship).
    const x6 = h("input", { type: "checkbox", checked: superchargeMultiplier(cmdr.loadout?.fsd) === 6 });
    // Exact route (Spansh Galaxy Plotter): knows the ship, so it accounts for fuel and refuels.
    const cargo = h("input", { type: "number", min: "0", max: "2000", value: String(Math.round(cmdr.cargoMass ?? 0)) });
    const algo = h(
      "select",
      null,
      ([
        ["optimistic", "Le moins de sauts (privilégie les étoiles à neutrons)"],
        ["guided", "Suivre l'itinéraire neutron classique"],
        ["pessimistic", "Calcul rapide (itinéraire un peu moins bon)"],
        ["fuel", "Économiser le carburant (sans écoper ni neutrons)"],
        ["fuel_jumps", "Économiser le carburant, puis moins de sauts"],
      ] as [GalaxyAlgorithm, string][]).map(([v, l]) => h("option", { value: v }, l)),
    );
    const opt = (checked: boolean) => h("input", { type: "checkbox", checked });
    const useNeutrons = opt(true);
    const supercharged = opt(false);
    const injections = opt(false);
    const noSecondary = opt(false);
    const refuelAll = opt(false);
    const exact = () => this.ctx.store.state.settings.navExact;
    const plot = async () => {
      if (!from.value.trim() || !to.value.trim()) {
        replace(this.routeOut, h("p.error", null, "Indique un départ et une destination."));
        return;
      }
      if (exact()) {
        await this.plotExact({
          from: from.value.trim(),
          to: to.value.trim(),
          cargo: Number(cargo.value) || 0,
          algorithm: algo.value as GalaxyAlgorithm,
          useSupercharge: useNeutrons.checked,
          isSupercharged: supercharged.checked,
          useInjections: injections.checked,
          excludeSecondary: noSecondary.checked,
          refuelEveryScoopable: refuelAll.checked,
          supercharge: x6.checked ? 6 : 4,
        });
        return;
      }
      const r = Number(range.value) || this.defaultRange();
      if (!r) {
        replace(this.routeOut, h("p.error", null, "Indique un départ, une destination et une portée."));
        return;
      }
      await this.plotShip(from.value.trim(), to.value.trim(), r, Number(eff.value) || 60, x6.checked ? 6 : 4);
    };
    /** Fills the form from the ship you are flying: departure, range with the current cargo, drive. */
    const fromShip = () => {
      const now = this.ctx.store.state.cmdr;
      if (!now.loadout) return toast("Pas encore de vaisseau lu dans le journal : lance le jeu");
      const r = this.defaultRange();
      if (r) range.value = String(r);
      if (now.location?.system) from.value = now.location.system;
      cargo.value = String(Math.round(now.cargoMass ?? 0));
      x6.checked = superchargeMultiplier(now.loadout.fsd) === 6;
      this.renderShipLine(shipLine);
      toast(`${now.ship?.type ?? "Vaisseau"} : portée ${r ? fmtLy(r) : "?"}, bonus neutron ×${x6.checked ? 6 : 4}`);
    };

    const shipLine = h("p.sub.nav-shipline");
    this.shipLine = shipLine;
    const modeSwitch = h("div.segmented.small.nav-mode");
    const card = () => modeSwitch.closest("section.card");
    const setMode = (on: boolean) => {
      if (on !== this.ctx.store.state.settings.navExact) this.ctx.store.updateSettings({ navExact: on });
      replace(
        modeSwitch,
        h("button", { class: on ? "active" : "", onclick: () => setMode(true) }, "Exacte, avec le carburant"),
        h("button", { class: on ? "" : "active", onclick: () => setMode(false) }, "Rapide (neutrons)"),
      );
      card()?.classList.toggle("exact", on);
      const help = card()?.querySelector(".nav-mode-help");
      if (help)
        help.textContent = on
          ? "Spansh calcule avec ton vaisseau (FSD, masse, réservoirs) : chaque saut est possible avec le carburant restant, et l'itinéraire indique où écoper."
          : "Calcul Spansh avec boost des étoiles à neutrons (comme le Neutron Plotter), sans tenir compte du carburant.";
    };

    // ---- carrier ----
    const c = cmdr.carrier;
    const cFrom = systemInput("fc-from", here, "Départ du carrier");
    const cTo = systemInput("fc-to", dest, "Destination");
    const used = h("input", { type: "number", min: "0", max: "25000", value: String(c?.used ?? 5000) });
    const tank = h("input", { type: "number", min: "0", max: "1000", value: String(c?.fuel ?? 1000) });
    const hold = h("input", { type: "number", min: "0", max: "25000", value: String(c?.tritiumInCargo ?? 0) });

    replace(
      root,
      h("header.view-head", null, h("h1", null, "Navigation")),
      h(
        "div.nav-grid",
        null,
        this.rangeCard,
        h(
          "section.card",
          null,
          h("h3", null, "Itinéraire du vaisseau"),
          modeSwitch,
          h("p.sub.nav-mode-help", null, ""),
          shipLine,
          h(
            "div.form-grid",
            null,
            h("label", null, "Départ", from),
            h("label", null, "Destination", to),
            h("label.quick-only", null, "Portée (al)", range),
            h("label.quick-only", { title: "Plus c'est haut, plus l'itinéraire colle à la ligne droite" }, "Efficacité (%)", eff),
            h("label.exact-only", null, "Cargaison (t)", cargo),
            h("label.exact-only", null, "Priorité", algo),
          ),
          h(
            "div.nav-options.exact-only",
            null,
            h("label.check", null, useNeutrons, " Utiliser les étoiles à neutrons"),
            h("label.check", { title: "Ton réacteur FSD est déjà suralimenté au départ (tu viens de passer dans le cône d'une étoile à neutrons)" }, supercharged, " Déjà suralimenté au départ"),
            h("label.check", { title: "Synthèse « Injection FSD » : coûte des matériaux" }, injections, " Utiliser l'Injection FSD (synthèse)"),
            h("label.check", { title: "Évite les sauts vers une étoile secondaire du système (moins de supercroisière)" }, noSecondary, " Éviter les étoiles secondaires"),
            h("label.check", null, refuelAll, " Faire le plein à chaque étoile écopable"),
          ),
          h(
            "div.row.nav-ship",
            null,
            h("label.check", { title: "Le FSD Mk II du Caspian Explorer multiplie la portée par 6 près d'une étoile à neutrons (×4 pour les autres FSD)" }, x6, " Bonus neutron ×6 (FSD Mk II du Caspian Explorer)"),
            h("button.ghost.small", { onclick: fromShip }, icon("play"), " Utiliser mon vaisseau actuel"),
          ),
          h("div.row", null, h("button.primary", { onclick: plot }, "Calculer l'itinéraire"), h("button.ghost.quick-only", { onclick: () => this.estimateShip(from.value.trim(), to.value.trim(), Number(range.value) || this.defaultRange()) }, "Estimation rapide")),
          this.routeOut,
        ),
        h(
          "section.card",
          null,
          h("h3", null, "Fleet Carrier"),
          h("p.sub", null, `Max ${CARRIER_MAX_JUMP} al par saut. Rempli depuis le journal quand tu as ouvert la gestion du carrier.`),
          h(
            "div.form-grid",
            null,
            h("label", null, "Départ", cFrom),
            h("label", null, "Destination", cTo),
            h("label", null, "Capacité utilisée (t)", used),
            h("label", null, "Tritium dans le réservoir", tank),
            h("label", null, "Tritium en soute", hold),
          ),
          h(
            "div.row",
            null,
            h("button.primary", { onclick: () => this.plotCarrier(cFrom.value.trim(), cTo.value.trim(), Number(used.value) || 0, Number(tank.value) || 0, Number(hold.value) || 0) }, "Calculer avec Spansh"),
            h("button.ghost", { onclick: () => this.estimateCarrier(cFrom.value.trim(), cTo.value.trim(), Number(used.value) || 0, Number(tank.value) || 0, Number(hold.value) || 0) }, "Estimation rapide"),
          ),
          this.carrierOut,
        ),
      ),
    );
    setMode(this.ctx.store.state.settings.navExact);
    this.renderShipLine(shipLine);
    this.signature = "";
    this.update();
  }

  /** What the exact route will use from the ship, or what is missing. */
  private renderShipLine(el: HTMLElement) {
    const cmdr = this.ctx.store.state.cmdr;
    const { params, missing, hasScoop } = shipParams(cmdr.loadout);
    if (!params) {
      replace(el, icon("warn"), ` Calcul exact impossible pour l'instant : ${missing.join(", ")}. Lance le jeu, ou utilise le calcul rapide.`);
      el.classList.add("warn");
      return;
    }
    el.classList.remove("warn");
    const fsd = fsdInfo(cmdr.loadout?.fsd);
    replace(
      el,
      h("strong", { "data-no-tr": "" }, cmdr.ship?.type ?? ""),
      ` · FSD ${fsd ? `${fsd.size}${fsd.rating}` : "?"} (masse optimale ${fmt(Math.round(params.optimal_mass))} t, ${fmt(params.max_fuel_per_jump)} t max par saut)`,
      ` · réservoir ${fmt(params.tank_size)} t`,
      params.range_boost ? ` · survolteur Guardians +${fmt(params.range_boost)} al` : "",
      " · ",
      hasScoop ? h("span", null, "récupérateur de carburant : oui") : h("span.bad-text", null, "pas de récupérateur de carburant !"),
    );
  }

  private plottingExact = false;
  private shipLine?: HTMLElement;
  private shipSig = "";

  private async plotExact(o: GalaxyOptions) {
    if (this.plottingExact) return;
    const { params, missing, hasScoop } = shipParams(this.ctx.store.state.cmdr.loadout);
    if (!params) {
      replace(this.routeOut, h("p.error", null, icon("warn"), ` Calcul exact impossible : ${missing.join(", ")}. Utilise le calcul rapide.`));
      return;
    }
    this.plottingExact = true;
    replace(this.routeOut, h("p.sub", null, h("span.spinner"), " Spansh calcule l'itinéraire exact (carburant compris)…"));
    try {
      const r = await plotGalaxy(params, o, (n) => {
        if (n % 4 === 3) replace(this.routeOut, h("p.sub", null, h("span.spinner"), ` Spansh calcule l'itinéraire exact (carburant compris)… ${Math.round((n + 1) * 1.5)} s`));
      });
      setNavRoute(r.jumps.map((j) => j.system));
      this.renderExact(r, params.tank_size, hasScoop);
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      replace(this.routeOut, h("p.error", null, icon("warn"), /unable to find route/i.test(msg) ? " Spansh n'a pas trouvé d'itinéraire avec ce vaisseau (portée ou carburant insuffisants ?)." : ` ${msg}`));
    } finally {
      this.plottingExact = false;
    }
  }

  private renderExact(r: GalaxyRoute, tank: number, hasScoop: boolean) {
    const auto = this.ctx.store.state.settings.navAutoCopy;
    const jumps = r.jumps;
    replace(
      this.routeOut,
      h(
        "div.estimate",
        null,
        stat("Distance", fmtLy(r.distance)),
        stat("Sauts", fmt(Math.max(0, jumps.length - 1))),
        stat("Pleins à faire", fmt(r.refuels)),
        stat("Étoiles à neutrons", fmt(r.neutrons)),
        stat("Durée", `≈ ${hours((Math.max(1, jumps.length - 1) * 50 + r.refuels * 40) / 60)}`),
      ),
      !hasScoop && r.refuels ? h("p.notice.danger", null, icon("warn"), " Ton vaisseau n'a pas de récupérateur de carburant : les pleins prévus ne sont possibles que dans une station ou avec un carrier.") : null,
      h("p.sub", null, auto ? "Copie auto du prochain système à ton arrivée : activée" : "Copie auto du prochain système : désactivée (Paramètres → Jeu et recherche → Navigation)"),
      h(
        "table.table.route.exact",
        null,
        h("thead", null, h("tr", null, h("th", null, "Système"), h("th.num", null, "Saut"), h("th.num", null, "Restant"), h("th", null, "Carburant"))),
        h(
          "tbody",
          null,
          jumps.map((j) =>
            h(
              "tr",
              { class: j.mustRefuel ? "refuel" : "" },
              h(
                "td",
                null,
                h("button.sys", { onclick: () => copySystem(j.system) }, icon("copy"), h("span", null, j.system)),
                j.neutron ? h("span.badge.hit", null, "Neutron") : null,
                j.mustRefuel ? h("span.badge.warn", { title: "Écope ici : le carburant ne suffit pas pour la suite sans plein" }, "⛽ Faire le plein") : j.scoopable ? h("span.badge.muted", { title: "Étoile écopable (KGBFOAM)" }, "Écopable") : null,
              ),
              h("td.num", null, j.distance ? fmtLy(j.distance) : ""),
              h("td.num", null, fmtLy(j.toGo)),
              h(
                "td.fuel",
                null,
                h("div.bar.small", null, h("span", { style: { width: `${Math.max(0, Math.min(100, (j.fuelInTank / Math.max(1, tank)) * 100))}%` } })),
                h("small", null, `${fmt(Math.round(j.fuelInTank * 10) / 10)} t`),
              ),
            ),
          ),
        ),
      ),
    );
  }

  /** Range with a full tank and the current cargo (what you'd plot with). */
  private defaultRange(): number {
    const m = jumpModel(this.ctx.store.state.cmdr.loadout);
    if (!m) return 0;
    const cargo = this.cargo ?? this.ctx.store.state.cmdr.cargoMass ?? 0;
    return Math.floor(m.rangeAt(m.unladen + m.fuel + m.reserve + cargo) * 100) / 100;
  }

  update() {
    if (!this.root) return;
    if (pendingDestination) {
      // Already on this page: fill the destination fields in place.
      for (const id of ["nav-to", "fc-to"]) {
        const input = this.root.querySelector<HTMLInputElement>(`#${id}`);
        if (input) input.value = pendingDestination;
      }
      this.root.querySelector<HTMLInputElement>("#nav-to")?.scrollIntoView({ block: "center", behavior: "smooth" });
      pendingDestination = null;
    }
    const cmdr = this.ctx.store.state.cmdr;
    // The ship is read from the journal after the page opened, or you changed ships: refresh the
    // line saying what the exact route will use (and the ×6 box for the Caspian's drive).
    const shipSig = JSON.stringify([cmdr.loadout?.shipId, cmdr.loadout?.fsd, cmdr.loadout?.fsdOptimalMass, cmdr.loadout?.unladenMass, cmdr.loadout?.fuelMain, cmdr.ship?.type]);
    // The position arrived after the page opened: fill an empty departure.
    const here = cmdr.location?.system;
    if (here) for (const id of ["nav-from", "fc-from"]) {
      const input = this.root.querySelector<HTMLInputElement>(`#${id}`);
      if (input && !input.value && document.activeElement !== input) input.value = here;
    }
    if (this.shipLine && shipSig !== this.shipSig) {
      const first = this.shipSig === "" || this.shipSig === JSON.stringify([null, null, null, null, null, null]);
      this.shipSig = shipSig;
      this.renderShipLine(this.shipLine);
      const x6 = this.root.querySelector<HTMLInputElement>(".nav-ship input[type=checkbox]");
      if (x6 && cmdr.loadout && first) x6.checked = superchargeMultiplier(cmdr.loadout.fsd) === 6;
    }
    const sig = JSON.stringify([cmdr.ship?.type, cmdr.ship?.name, cmdr.loadout?.shipId, cmdr.loadout?.ship, cmdr.loadout?.maxJumpRange, cmdr.loadout?.unladenMass, cmdr.fuel?.main, cmdr.cargoMass, this.cargo]);
    if (sig === this.signature) return;
    this.signature = sig;
    const l = cmdr.loadout;
    const m = jumpModel(l);
    if (!l || !m) {
      replace(this.rangeCard, h("h3", null, "Portée de saut"), h("p.sub", null, "Le jeu n'a pas encore donné la configuration de ton vaisseau (événement Loadout). Lance le jeu ou change de vaisseau."));
      return;
    }
    const fsd = fsdInfo(l.fsd);
    const cargoNow = this.cargo ?? cmdr.cargoMass ?? 0;
    const fuelNow = cmdr.fuel ? cmdr.fuel.main + cmdr.fuel.reserve : m.fuel + m.reserve;
    const rows: [string, number, string][] = [
      ["Maximale (vide, carburant pour 1 saut)", m.maxJumpRange, "Valeur du jeu"],
      ["Réservoir plein, soute vide", m.rangeAt(m.unladen + m.fuel + m.reserve), `${fmt1(m.fuel)} t de carburant`],
      ["Réservoir plein, soute pleine", m.rangeAt(m.unladen + m.fuel + m.reserve + m.cargoCapacity), `${fmt(m.cargoCapacity)} t de cargaison`],
      ["Maintenant", m.rangeAt(m.unladen + fuelNow + cargoNow), `${fmt1(fuelNow)} t de carburant, ${fmt(cargoNow)} t de cargaison`],
    ];
    const cargoInput = h("input", {
      type: "range",
      min: "0",
      max: String(m.cargoCapacity),
      value: String(cargoNow),
      oninput: (e: Event) => {
        this.cargo = Number((e.target as HTMLInputElement).value);
        this.update();
      },
    });
    replace(
      this.rangeCard,
      h("h3", null, "Portée de saut"),
      h(
        "p.sub",
        null,
        `${cmdr.ship?.type ?? l.ship}${cmdr.ship?.name ? ` · ${cmdr.ship.name}` : ""}`,
        ` · FSD ${fsd ? `${fsd.size}${fsd.rating}` : "?"}${l.fsd?.includes("overcharge") ? " SCO" : ""}`,
        m.boost ? " · " : "",
        m.boost ? `booster Gardien +${fmt1(m.boost)} al` : "",
        " · ",
        `${fmt1(m.unladen)} t à vide`,
      ),
      h("table.table.range-table", null, h("tbody", null, rows.map(([label, value, note]) => h("tr", null, h("td", null, label, h("small.sub", null, ` ${note}`)), h("td.num", null, h("strong", null, fmtLy(value))))))),
      m.cargoCapacity
        ? h("label.cargo-slider", null, `Cargaison simulée : ${fmt(cargoNow)} t`, cargoInput, h("strong", null, fmtLy(m.rangeAt(m.unladen + m.fuel + m.reserve + cargoNow))))
        : null,
      h("p.sub", null, "Les portées intermédiaires sont calculées à partir de la valeur du jeu (formule officielle du FSD)."),
    );
  }

  private async estimateShip(from: string, to: string, range: number) {
    if (!from || !to || !range) return replace(this.routeOut, h("p.error", null, "Indique un départ, une destination et une portée."));
    replace(this.routeOut, h("p.sub", null, h("span.spinner"), " Recherche des coordonnées…"));
    try {
      const [a, b] = await Promise.all([coordsOf(from), coordsOf(to)]);
      if (!a || !b) throw new Error("Système introuvable sur Spansh");
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      const jumps = Math.ceil(d / range);
      replace(
        this.routeOut,
        h("div.estimate", null, stat("Distance", fmtLy(d)), stat("Sauts (ligne droite)", `≥ ${fmt(jumps)}`), stat("Durée", `≈ ${hours((jumps * 50) / 60)}`)),
        h("p.sub", null, "Minimum théorique sans boost neutron ; l'itinéraire réel demande un peu plus de sauts."),
      );
    } catch (e) {
      replace(this.routeOut, h("p.error", null, icon("warn"), ` ${String((e as Error).message ?? e)}`));
    }
  }

  private plottingShip = false;

  private async plotShip(from: string, to: string, range: number, efficiency: number, supercharge: 4 | 6 = 4) {
    // A second click while Spansh is still working would ask for the same route twice.
    if (this.plottingShip) return;
    this.plottingShip = true;
    try {
      await this.plotShipNow(from, to, range, efficiency, supercharge);
    } finally {
      this.plottingShip = false;
    }
  }

  private async plotShipNow(from: string, to: string, range: number, efficiency: number, supercharge: 4 | 6) {
    replace(this.routeOut, h("p.sub", null, h("span.spinner"), " Spansh calcule l'itinéraire…"));
    try {
      const res: Json = await spanshJob("route", [
        ["from", from],
        ["to", to],
        ["range", String(range)],
        ["efficiency", String(efficiency)],
        ["supercharge_multiplier", String(supercharge)],
      ]);
      const jumps: Json[] = res.system_jumps ?? [];
      const total = jumps.reduce((s, j) => s + Number(j.jumps ?? 0), 0);
      // Kept for the auto-copy of the next system on arrival (Settings → Navigation).
      setNavRoute(jumps.map((j) => String(j.system)));
      const auto = this.ctx.store.state.settings.navAutoCopy;
      replace(
        this.routeOut,
        h("div.estimate", null, stat("Distance", fmtLy(Number(res.distance ?? 0))), stat("Sauts", fmt(total || Number(res.total_jumps ?? 0))), stat("Étapes", fmt(jumps.length)), stat("Durée", `≈ ${hours(((total || jumps.length) * 50) / 60)}`)),
        h("p.sub", null, auto ? "Copie auto du prochain système à ton arrivée : activée" : "Copie auto du prochain système : désactivée (Paramètres → Jeu et recherche → Navigation)"),
        h(
          "table.table.route",
          null,
          h("thead", null, h("tr", null, h("th", null, "Système"), h("th.num", null, "Distance"), h("th.num", null, "Restant"), h("th.num", null, "Sauts"))),
          h(
            "tbody",
            null,
            jumps.map((j) =>
              h(
                "tr",
                null,
                h("td", null, h("button.sys", { onclick: () => copySystem(j.system) }, icon("copy"), h("span", null, j.system)), j.neutron_star ? h("span.badge.hit", null, "Neutron") : null),
                h("td.num", null, fmtLy(Number(j.distance_jumped ?? 0))),
                h("td.num", null, fmtLy(Number(j.distance_left ?? 0))),
                h("td.num", null, String(j.jumps ?? "")),
              ),
            ),
          ),
        ),
      );
    } catch (e) {
      replace(this.routeOut, h("p.error", null, icon("warn"), ` ${String((e as Error).message ?? e)}`));
    }
  }

  private async estimateCarrier(from: string, to: string, used: number, tank: number, hold: number) {
    if (!from || !to) return replace(this.carrierOut, h("p.error", null, "Indique le départ et la destination."));
    replace(this.carrierOut, h("p.sub", null, h("span.spinner"), " Recherche des coordonnées…"));
    try {
      const [a, b] = await Promise.all([coordsOf(from), coordsOf(to)]);
      if (!a || !b) throw new Error("Système introuvable sur Spansh");
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      const est = carrierEstimate(d, used);
      const missing = Math.max(0, est.fuel - tank - hold);
      replace(
        this.carrierOut,
        h("div.estimate", null, stat("Distance", fmtLy(d)), stat("Sauts", fmt(est.jumps)), stat("Tritium", `≈ ${fmt(est.fuel)} t`), stat("Durée", `≈ ${hours(est.minutes)}`)),
        missing ? h("p.notice", null, icon("warn"), ` Il manque environ ${fmt(missing)} t de tritium (réservoir + soute).`) : h("p.sub", null, "Le tritium du réservoir et de la soute suffit (estimation)."),
        h("p.sub", null, "Estimation communautaire : 5 + distance × (25 + capacité utilisée / 1000) / 200 t par saut, 20 min par saut (compte à rebours + recharge). Utilise « Calculer avec Spansh » pour le plan exact."),
      );
    } catch (e) {
      replace(this.carrierOut, h("p.error", null, icon("warn"), ` ${String((e as Error).message ?? e)}`));
    }
  }

  private plottingCarrier = false;

  private async plotCarrier(from: string, to: string, used: number, tank: number, hold: number) {
    if (!from || !to) return replace(this.carrierOut, h("p.error", null, "Indique le départ et la destination."));
    if (this.plottingCarrier) return;
    this.plottingCarrier = true;
    try {
      await this.plotCarrierNow(from, to, used, tank, hold);
    } finally {
      this.plottingCarrier = false;
    }
  }

  private async plotCarrierNow(from: string, to: string, used: number, tank: number, hold: number) {
    replace(this.carrierOut, h("p.sub", null, h("span.spinner"), " Spansh calcule l'itinéraire du carrier…"));
    try {
      const res: Json = await spanshJob("fleetcarrier/route", [
        ["source", from],
        ["destinations", to],
        ["capacity_used", String(used)],
        ["fuel_loaded", String(tank)],
        ["tritium_stored", String(hold)],
        ["capacity", "25000"],
      ]);
      const jumps: Json[] = res.jumps ?? [];
      const legs = jumps.filter((j, i) => i > 0 || Number(j.distance ?? 0) > 0);
      const fuel = jumps.reduce((s, j) => s + Number(j.fuel_used ?? 0), 0);
      const restock = jumps.filter((j) => j.must_restock);
      replace(
        this.carrierOut,
        h("div.estimate", null, stat("Sauts", fmt(Math.max(0, jumps.length - 1))), stat("Tritium", `${fmt(fuel)} t`), stat("Durée", `≈ ${hours(Math.max(0, jumps.length - 1) * 20)}`)),
        restock.length ? h("p.notice", null, icon("warn"), ` Ravitaillement nécessaire à ${restock.length} étape(s).`) : null,
        h(
          "table.table.route",
          null,
          h("thead", null, h("tr", null, h("th", null, "Système"), h("th.num", null, "Saut"), h("th.num", null, "Restant"), h("th.num", null, "Tritium"), h("th.num", null, "Réservoir"))),
          h(
            "tbody",
            null,
            legs.map((j) =>
              h(
                "tr",
                { class: j.must_restock ? "short" : "" },
                h("td", null, h("button.sys", { onclick: () => copySystem(j.name) }, icon("copy"), h("span", null, j.name)), j.has_icy_ring ? h("span.badge.muted", null, j.is_system_pristine ? "Anneau glacé vierge" : "Anneau glacé") : null, j.must_restock ? h("span.badge.warn", null, `Ravitailler ${fmt(Number(j.restock_amount ?? 0))} t`) : null),
                h("td.num", null, fmtLy(Number(j.distance ?? 0))),
                h("td.num", null, fmtLy(Number(j.distance_to_destination ?? 0))),
                h("td.num", null, fmt(Number(j.fuel_used ?? 0))),
                h("td.num", null, fmt(Number(j.fuel_in_tank ?? 0))),
              ),
            ),
          ),
        ),
      );
    } catch (e) {
      replace(this.carrierOut, h("p.error", null, icon("warn"), ` ${String((e as Error).message ?? e)}`));
    }
  }
}

function stat(label: string, value: string): HTMLElement {
  return h("div.stat", null, h("span", null, label), h("strong", null, value));
}
