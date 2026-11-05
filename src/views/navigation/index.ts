import { setNavRoute } from "../../features/engineers/tour.js";
import {
  type GalaxyAlgorithm,
  type GalaxyOptions,
  plotGalaxy,
  shipParams,
} from "../../features/navigation/galaxyRoute.js";
import { CARRIER_MAX_JUMP, fsdInfo, jumpModel, superchargeMultiplier } from "../../features/navigation/jumpRange.js";
import { spanshPost } from "../../platform/bridge.js";
import { t } from "../../platform/i18n.js";
import { fmtLy } from "../../services/spansh.js";
import type { Ctx, View } from "../../state/context.js";
import { fmt, h, icon, replace, toast } from "../../ui/dom.js";
import { estimateCarrier, plotCarrierNow } from "./carrierRoute.js";
import { renderExact } from "./exactRoute.js";
import { estimateShip, plotShipNow } from "./shipRoute.js";
import { fmt1, systemInput } from "./widgets.js";

export type Json = Record<string, any>;

/** Coordinates of a system by name (Spansh). */
export async function coordsOf(name: string): Promise<[number, number, number] | null> {
  const res = await spanshPost("systems/search", {
    filters: { distance: { min: "0", max: "1" } },
    sort: [{ distance: { direction: "asc" } }],
    size: 1,
    page: 0,
    reference_system: name,
  });
  const r = res?.reference ?? res?.results?.[0];
  return r && typeof r.x === "number" ? [r.x, r.y, r.z] : null;
}

/** A destination to put in the route forms (a system name clicked elsewhere). */
let pendingDestination: string | null = null;

export function setDestination(system: string) {
  pendingDestination = system;
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
    const from = systemInput("nav-from", here, t("navigation.from"));
    const dest = pendingDestination ?? "";
    pendingDestination = null;
    const to = systemInput("nav-to", dest, t("common.destination"));
    const range = h("input", {
      type: "number",
      step: "0.01",
      min: "1",
      value: this.defaultRange() ? String(this.defaultRange()) : "",
      placeholder: t("common.lyUnit"),
    });
    const eff = h("input", { type: "number", min: "1", max: "100", value: "60" });
    // The Caspian Explorer's Mk II drive gets x6 from neutron stars instead of x4: ticked when the
    // current ship has it, and it can be unticked (to plot for another ship).
    const x6 = h("input", { type: "checkbox", checked: superchargeMultiplier(cmdr.loadout?.fsd) === 6 });
    // Exact route (Spansh Galaxy Plotter): knows the ship, so it accounts for fuel and refuels.
    const cargo = h("input", { type: "number", min: "0", max: "2000", value: String(Math.round(cmdr.cargoMass ?? 0)) });
    const algo = h(
      "select",
      null,
      (
        [
          ["optimistic", t("navigation.fewestJumpsFavoursNeutronStars")],
          ["guided", t("navigation.followUsualNeutronRoute")],
          ["pessimistic", t("navigation.fastCalculationSlightlyWorseRoute")],
          ["fuel", t("navigation.saveFuelNoScoopingNoNeutrons")],
          ["fuel_jumps", t("navigation.saveFuelThenFewerJumps")],
        ] as [GalaxyAlgorithm, string][]
      ).map(([v, l]) => h("option", { value: v }, l)),
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
        replace(this.routeOut, h("p.error", null, t("navigation.enterDepartureDestination")));
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
        replace(this.routeOut, h("p.error", null, t("navigation.enterStartDestinationRange")));
        return;
      }
      await this.plotShip(from.value.trim(), to.value.trim(), r, Number(eff.value) || 60, x6.checked ? 6 : 4);
    };
    /** Fills the form from the ship you are flying: departure, range with the current cargo, drive. */
    const fromShip = () => {
      const now = this.ctx.store.state.cmdr;
      if (!now.loadout) return toast(t("navigation.noShipReadFromJournalYet"));
      const r = this.defaultRange();
      if (r) range.value = String(r);
      if (now.location?.system) from.value = now.location.system;
      cargo.value = String(Math.round(now.cargoMass ?? 0));
      x6.checked = superchargeMultiplier(now.loadout.fsd) === 6;
      this.renderShipLine(shipLine);
      toast(
        t("navigation.rangeNeutronBoost", {
          type: now.ship?.type ?? t("common.ship"),
          value: r ? fmtLy(r) : "?",
          value2: x6.checked ? 6 : 4,
        }),
      );
    };

    const shipLine = h("p.sub.nav-shipline");
    this.shipLine = shipLine;
    const modeSwitch = h("div.segmented.small.nav-mode");
    const card = () => modeSwitch.closest("section.card");
    const setMode = (on: boolean) => {
      if (on !== this.ctx.store.state.settings.navExact) this.ctx.store.updateSettings({ navExact: on });
      replace(
        modeSwitch,
        h("button", { class: on ? "active" : "", onclick: () => setMode(true) }, t("navigation.exactFuel")),
        h("button", { class: on ? "" : "active", onclick: () => setMode(false) }, t("navigation.quickNeutrons")),
      );
      card()?.classList.toggle("exact", on);
      const help = card()?.querySelector(".nav-mode-help");
      if (help)
        help.textContent = on
          ? t("navigation.spanshPlotsShipFsdMassTanks")
          : t("navigation.spanshRouteNeutronStarBoostsLike");
    };

    // ---- carrier ----
    const c = cmdr.carrier;
    const cFrom = systemInput("fc-from", here, t("navigation.carrierStart"));
    const cTo = systemInput("fc-to", dest, t("common.destination"));
    const used = h("input", { type: "number", min: "0", max: "25000", value: String(c?.used ?? 5000) });
    const tank = h("input", { type: "number", min: "0", max: "1000", value: String(c?.fuel ?? 1000) });
    const hold = h("input", { type: "number", min: "0", max: "25000", value: String(c?.tritiumInCargo ?? 0) });

    replace(
      root,
      h("header.view-head", null, h("h1", null, t("common.navigation"))),
      h(
        "div.nav-grid",
        null,
        this.rangeCard,
        h(
          "section.card",
          null,
          h("h3", null, t("navigation.shipRoute")),
          modeSwitch,
          h("p.sub.nav-mode-help", null, ""),
          shipLine,
          h(
            "div.form-grid",
            null,
            h("label", null, t("navigation.from"), from),
            h("label", null, t("common.destination"), to),
            h("label.quick-only", null, t("navigation.rangeLy"), range),
            h(
              "label.quick-only",
              { title: t("navigation.higherCloserRouteSticksStraightLine") },
              t("navigation.efficiency"),
              eff,
            ),
            h("label.exact-only", null, t("navigation.cargoT"), cargo),
            h("label.exact-only", null, t("navigation.priority"), algo),
          ),
          h(
            "div.nav-options.exact-only",
            null,
            h("label.check", null, useNeutrons, " " + t("navigation.useNeutronStars")),
            h(
              "label.check",
              { title: t("navigation.frameShiftDriveAlreadySuperchargedWhen") },
              supercharged,
              " " + t("navigation.alreadySuperchargedWhenLeaving"),
            ),
            h(
              "label.check",
              { title: t("navigation.fsdInjectionSynthesisCostsMaterials") },
              injections,
              " " + t("navigation.useFsdInjectionSynthesis"),
            ),
            h(
              "label.check",
              { title: t("navigation.avoidsJumpsSystemSSecondaryStar") },
              noSecondary,
              " " + t("navigation.avoidSecondaryStars"),
            ),
            h("label.check", null, refuelAll, " " + t("navigation.refuelEveryScoopableStar")),
          ),
          h(
            "div.row.nav-ship",
            null,
            h(
              "label.check",
              { title: t("navigation.caspianExplorerSMkIiFsd") },
              x6,
              " " + t("navigation.neutronBoost6CaspianExplorerS"),
            ),
            h("button.ghost.small", { onclick: fromShip }, icon("play"), " " + t("navigation.useMyCurrentShip")),
          ),
          h(
            "div.row",
            null,
            h("button.primary", { onclick: plot }, t("navigation.plotRoute")),
            h(
              "button.ghost.quick-only",
              {
                onclick: () =>
                  estimateShip(
                    this.routeOut,
                    from.value.trim(),
                    to.value.trim(),
                    Number(range.value) || this.defaultRange(),
                  ),
              },
              t("navigation.quickEstimate"),
            ),
          ),
          this.routeOut,
        ),
        h(
          "section.card",
          null,
          h("h3", null, "Fleet Carrier"),
          h("p.sub", null, t("navigation.maxLyPerJumpFilledFrom", { CARRIERMAXJUMP: CARRIER_MAX_JUMP })),
          h(
            "div.form-grid",
            null,
            h("label", null, t("navigation.from"), cFrom),
            h("label", null, t("common.destination"), cTo),
            h("label", null, t("navigation.usedCapacityT"), used),
            h("label", null, t("navigation.tritiumTank"), tank),
            h("label", null, t("navigation.tritiumCargo"), hold),
          ),
          h(
            "div.row",
            null,
            h(
              "button.primary",
              {
                onclick: () =>
                  this.plotCarrier(
                    cFrom.value.trim(),
                    cTo.value.trim(),
                    Number(used.value) || 0,
                    Number(tank.value) || 0,
                    Number(hold.value) || 0,
                  ),
              },
              t("navigation.plotSpansh"),
            ),
            h(
              "button.ghost",
              {
                onclick: () =>
                  estimateCarrier(
                    this.carrierOut,
                    cFrom.value.trim(),
                    cTo.value.trim(),
                    Number(used.value) || 0,
                    Number(tank.value) || 0,
                    Number(hold.value) || 0,
                  ),
              },
              t("navigation.quickEstimate"),
            ),
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
      replace(el, icon("warn"), " " + t("navigation.exactRouteNotPossibleYetStart", { value: missing.join(", ") }));
      el.classList.add("warn");
      return;
    }
    el.classList.remove("warn");
    const fsd = fsdInfo(cmdr.loadout?.fsd);
    replace(
      el,
      h("strong", { "data-no-tr": "" }, cmdr.ship?.type ?? ""),
      " " +
        t("navigation.fsdOptimalMassTTMax", {
          value: fsd ? `${fsd.size}${fsd.rating}` : "?",
          optimalMass: fmt(Math.round(params.optimal_mass)),
          maxFuelPerJump: fmt(params.max_fuel_per_jump),
        }),
      " " + t("navigation.tankT", { tankSize: fmt(params.tank_size) }),
      params.range_boost ? " " + t("navigation.guardianFsdBoosterLy", { rangeBoost: fmt(params.range_boost) }) : "",
      " · ",
      hasScoop ? h("span", null, t("navigation.fuelScoopYes")) : h("span.bad-text", null, t("navigation.noFuelScoop")),
    );
  }

  private plottingExact = false;
  private shipLine?: HTMLElement;
  private shipSig = "";

  private async plotExact(o: GalaxyOptions) {
    if (this.plottingExact) return;
    const { params, missing, hasScoop } = shipParams(this.ctx.store.state.cmdr.loadout);
    if (!params) {
      replace(
        this.routeOut,
        h(
          "p.error",
          null,
          icon("warn"),
          " " + t("navigation.exactRouteNotPossibleUseQuick", { value: missing.join(", ") }),
        ),
      );
      return;
    }
    this.plottingExact = true;
    replace(
      this.routeOut,
      h("p.sub", null, h("span.spinner"), " " + t("navigation.spanshPlottingExactRouteFuelIncluded")),
    );
    try {
      const r = await plotGalaxy(params, o, (n) => {
        if (n % 4 === 3)
          replace(
            this.routeOut,
            h(
              "p.sub",
              null,
              h("span.spinner"),
              " " + t("navigation.spanshPlottingExactRouteFuelIncluded2", { value: Math.round((n + 1) * 1.5) }),
            ),
          );
      });
      setNavRoute(r.jumps.map((j) => j.system));
      renderExact(this.ctx, this.routeOut, r, params.tank_size, hasScoop);
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      replace(
        this.routeOut,
        h(
          "p.error",
          null,
          icon("warn"),
          /unable to find route/i.test(msg) ? " " + t("navigation.spanshFoundNoRouteShipNot") : ` ${msg}`,
        ),
      );
    } finally {
      this.plottingExact = false;
    }
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
    const shipSig = JSON.stringify([
      cmdr.loadout?.shipId,
      cmdr.loadout?.fsd,
      cmdr.loadout?.fsdOptimalMass,
      cmdr.loadout?.unladenMass,
      cmdr.loadout?.fuelMain,
      cmdr.ship?.type,
    ]);
    // The position arrived after the page opened: fill an empty departure.
    const here = cmdr.location?.system;
    if (here)
      for (const id of ["nav-from", "fc-from"]) {
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
    const sig = JSON.stringify([
      cmdr.ship?.type,
      cmdr.ship?.name,
      cmdr.loadout?.shipId,
      cmdr.loadout?.ship,
      cmdr.loadout?.maxJumpRange,
      cmdr.loadout?.unladenMass,
      cmdr.fuel?.main,
      cmdr.cargoMass,
      this.cargo,
    ]);
    if (sig === this.signature) return;
    this.signature = sig;
    const l = cmdr.loadout;
    const m = jumpModel(l);
    if (!l || !m) {
      replace(
        this.rangeCard,
        h("h3", null, t("navigation.jumpRange")),
        h("p.sub", null, t("navigation.gameHasnTSentShipS")),
      );
      return;
    }
    const fsd = fsdInfo(l.fsd);
    const cargoNow = this.cargo ?? cmdr.cargoMass ?? 0;
    const fuelNow = cmdr.fuel ? cmdr.fuel.main + cmdr.fuel.reserve : m.fuel + m.reserve;
    const rows: [string, number, string][] = [
      [t("navigation.maximumEmptyFuel1Jump"), m.maxJumpRange, t("navigation.gameValue")],
      [
        t("navigation.fullTankEmptyHold"),
        m.rangeAt(m.unladen + m.fuel + m.reserve),
        t("navigation.tFuel", { fmt1: fmt1(m.fuel) }),
      ],
      [
        t("navigation.fullTankFullHold"),
        m.rangeAt(m.unladen + m.fuel + m.reserve + m.cargoCapacity),
        t("navigation.tCargo", { cargoCapacity: fmt(m.cargoCapacity) }),
      ],
      [
        t("navigation.now"),
        m.rangeAt(m.unladen + fuelNow + cargoNow),
        t("navigation.tFuelTCargo", { fmt1: fmt1(fuelNow), cargoNow: fmt(cargoNow) }),
      ],
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
      h("h3", null, t("navigation.jumpRange")),
      h(
        "p.sub",
        null,
        `${cmdr.ship?.type ?? l.ship}${cmdr.ship?.name ? ` · ${cmdr.ship.name}` : ""}`,
        ` · FSD ${fsd ? `${fsd.size}${fsd.rating}` : "?"}${l.fsd?.includes("overcharge") ? " SCO" : ""}`,
        m.boost ? " · " : "",
        m.boost ? t("navigation.guardianBoosterLy", { fmt1: fmt1(m.boost) }) : "",
        " · ",
        t("navigation.tUnladen", { fmt1: fmt1(m.unladen) }),
      ),
      h(
        "table.table.range-table",
        null,
        h(
          "tbody",
          null,
          rows.map(([label, value, note]) =>
            h(
              "tr",
              null,
              h("td", null, label, h("small.sub", null, ` ${note}`)),
              h("td.num", null, h("strong", null, fmtLy(value))),
            ),
          ),
        ),
      ),
      m.cargoCapacity
        ? h(
            "label.cargo-slider",
            null,
            t("navigation.simulatedCargoT", { cargoNow: fmt(cargoNow) }),
            cargoInput,
            h("strong", null, fmtLy(m.rangeAt(m.unladen + m.fuel + m.reserve + cargoNow))),
          )
        : null,
      h("p.sub", null, t("navigation.intermediateRangesAreCalculatedFromGame")),
    );
  }

  private plottingShip = false;

  private async plotShip(from: string, to: string, range: number, efficiency: number, supercharge: 4 | 6 = 4) {
    // A second click while Spansh is still working would ask for the same route twice.
    if (this.plottingShip) return;
    this.plottingShip = true;
    try {
      await plotShipNow(this.ctx, this.routeOut, from, to, range, efficiency, supercharge);
    } finally {
      this.plottingShip = false;
    }
  }

  private plottingCarrier = false;

  private async plotCarrier(from: string, to: string, used: number, tank: number, hold: number) {
    if (!from || !to) return replace(this.carrierOut, h("p.error", null, t("navigation.enterStartDestination")));
    if (this.plottingCarrier) return;
    this.plottingCarrier = true;
    try {
      await plotCarrierNow(this.carrierOut, from, to, used, tank, hold);
    } finally {
      this.plottingCarrier = false;
    }
  }
}
