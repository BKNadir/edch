import {
  plotGalaxy,
  shipParams,
  type GalaxyAlgorithm,
  type GalaxyOptions,
  type GalaxyRoute,
} from "../../features/navigation/galaxyRoute.js";
import { setNavRoute } from "../../features/engineers/tour.js";
import { locale, t } from "../../platform/i18n.js";
import { spanshGet, spanshJob, spanshPost } from "../../platform/bridge.js";
import { h, icon, fmt, replace, toast } from "../../ui/dom.js";
import type { Ctx, View } from "../../state/context.js";
import {
  CARRIER_MAX_JUMP,
  carrierEstimate,
  fsdInfo,
  jumpModel,
  superchargeMultiplier,
} from "../../features/navigation/jumpRange.js";
import { fmtLy } from "../../services/spansh.js";
import { copySystem } from "../shared/resultsTable.js";

type Json = Record<string, any>;

const fmt1 = (n: number) => n.toLocaleString(locale(), { maximumFractionDigits: 2 });
const hours = (min: number) =>
  min >= 60
    ? t("common.h", { h: Math.floor(min / 60), padStart: String(Math.round(min % 60)).padStart(2, "0") })
    : t("common.min", { min: Math.round(min) });

/** Coordinates of a system by name (Spansh). */
async function coordsOf(name: string): Promise<[number, number, number] | null> {
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
          replace(
            list,
            values.slice(0, 12).map((v) => h("option", { value: v })),
          );
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
                  this.estimateShip(from.value.trim(), to.value.trim(), Number(range.value) || this.defaultRange()),
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
                  this.estimateCarrier(
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
      this.renderExact(r, params.tank_size, hasScoop);
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

  private renderExact(r: GalaxyRoute, tank: number, hasScoop: boolean) {
    const auto = this.ctx.store.state.settings.navAutoCopy;
    const jumps = r.jumps;
    replace(
      this.routeOut,
      h(
        "div.estimate",
        null,
        stat(t("common.distance"), fmtLy(r.distance)),
        stat(t("navigation.jumps"), fmt(Math.max(0, jumps.length - 1))),
        stat(t("navigation.refuels"), fmt(r.refuels)),
        stat(t("navigation.neutronStars"), fmt(r.neutrons)),
        stat(t("navigation.duration"), `≈ ${hours((Math.max(1, jumps.length - 1) * 50 + r.refuels * 40) / 60)}`),
      ),
      !hasScoop && r.refuels
        ? h("p.notice.danger", null, icon("warn"), " " + t("navigation.shipHasNoFuelScoopPlanned"))
        : null,
      h(
        "p.sub",
        null,
        auto ? t("navigation.autoCopyNextSystemArrival") : t("navigation.autoCopyNextSystemOffSettings"),
      ),
      h(
        "table.table.route.exact",
        null,
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            h("th", null, t("common.system")),
            h("th.num", null, t("navigation.jump")),
            h("th.num", null, t("common.left")),
            h("th", null, t("navigation.fuel")),
          ),
        ),
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
                j.mustRefuel
                  ? h("span.badge.warn", { title: t("navigation.scoopHereFuelIsnTEnough") }, t("navigation.refuel"))
                  : j.scoopable
                    ? h("span.badge.muted", { title: t("navigation.scoopableStarKgbfoam") }, t("navigation.scoopable"))
                    : null,
              ),
              h("td.num", null, j.distance ? fmtLy(j.distance) : ""),
              h("td.num", null, fmtLy(j.toGo)),
              h(
                "td.fuel",
                null,
                h(
                  "div.bar.small",
                  null,
                  h("span", {
                    style: { width: `${Math.max(0, Math.min(100, (j.fuelInTank / Math.max(1, tank)) * 100))}%` },
                  }),
                ),
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

  private async estimateShip(from: string, to: string, range: number) {
    if (!from || !to || !range)
      return replace(this.routeOut, h("p.error", null, t("navigation.enterStartDestinationRange")));
    replace(this.routeOut, h("p.sub", null, h("span.spinner"), " " + t("navigation.lookingUpCoordinates")));
    try {
      const [a, b] = await Promise.all([coordsOf(from), coordsOf(to)]);
      if (!a || !b) throw new Error(t("navigation.systemNotFoundSpansh"));
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      const jumps = Math.ceil(d / range);
      replace(
        this.routeOut,
        h(
          "div.estimate",
          null,
          stat(t("common.distance"), fmtLy(d)),
          stat(t("navigation.jumpsStraightLine"), `≥ ${fmt(jumps)}`),
          stat(t("navigation.duration"), `≈ ${hours((jumps * 50) / 60)}`),
        ),
        h("p.sub", null, t("navigation.theoreticalMinimumWithoutNeutronBoostsReal")),
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
    replace(this.routeOut, h("p.sub", null, h("span.spinner"), " " + t("common.spanshPlottingRoute")));
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
        h(
          "div.estimate",
          null,
          stat(t("common.distance"), fmtLy(Number(res.distance ?? 0))),
          stat(t("navigation.jumps"), fmt(total || Number(res.total_jumps ?? 0))),
          stat(t("navigation.waypoints"), fmt(jumps.length)),
          stat(t("navigation.duration"), `≈ ${hours(((total || jumps.length) * 50) / 60)}`),
        ),
        h(
          "p.sub",
          null,
          auto ? t("navigation.autoCopyNextSystemArrival") : t("navigation.autoCopyNextSystemOffSettings"),
        ),
        h(
          "table.table.route",
          null,
          h(
            "thead",
            null,
            h(
              "tr",
              null,
              h("th", null, t("common.system")),
              h("th.num", null, t("common.distance")),
              h("th.num", null, t("common.left")),
              h("th.num", null, t("navigation.jumps")),
            ),
          ),
          h(
            "tbody",
            null,
            jumps.map((j) =>
              h(
                "tr",
                null,
                h(
                  "td",
                  null,
                  h("button.sys", { onclick: () => copySystem(j.system) }, icon("copy"), h("span", null, j.system)),
                  j.neutron_star ? h("span.badge.hit", null, "Neutron") : null,
                ),
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
    if (!from || !to) return replace(this.carrierOut, h("p.error", null, t("navigation.enterStartDestination")));
    replace(this.carrierOut, h("p.sub", null, h("span.spinner"), " " + t("navigation.lookingUpCoordinates")));
    try {
      const [a, b] = await Promise.all([coordsOf(from), coordsOf(to)]);
      if (!a || !b) throw new Error(t("navigation.systemNotFoundSpansh"));
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      const est = carrierEstimate(d, used);
      const missing = Math.max(0, est.fuel - tank - hold);
      replace(
        this.carrierOut,
        h(
          "div.estimate",
          null,
          stat(t("common.distance"), fmtLy(d)),
          stat(t("navigation.jumps"), fmt(est.jumps)),
          stat(t("common.tritium"), `≈ ${fmt(est.fuel)} t`),
          stat(t("navigation.duration"), `≈ ${hours(est.minutes)}`),
        ),
        missing
          ? h("p.notice", null, icon("warn"), " " + t("navigation.reAboutTTritiumShortTank", { missing: fmt(missing) }))
          : h("p.sub", null, t("navigation.tritiumTankHoldEnoughEstimate")),
        h("p.sub", null, t("navigation.communityEstimate5Distance25Used")),
      );
    } catch (e) {
      replace(this.carrierOut, h("p.error", null, icon("warn"), ` ${String((e as Error).message ?? e)}`));
    }
  }

  private plottingCarrier = false;

  private async plotCarrier(from: string, to: string, used: number, tank: number, hold: number) {
    if (!from || !to) return replace(this.carrierOut, h("p.error", null, t("navigation.enterStartDestination")));
    if (this.plottingCarrier) return;
    this.plottingCarrier = true;
    try {
      await this.plotCarrierNow(from, to, used, tank, hold);
    } finally {
      this.plottingCarrier = false;
    }
  }

  private async plotCarrierNow(from: string, to: string, used: number, tank: number, hold: number) {
    replace(this.carrierOut, h("p.sub", null, h("span.spinner"), " " + t("navigation.spanshPlottingCarrierRoute")));
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
        h(
          "div.estimate",
          null,
          stat(t("navigation.jumps"), fmt(Math.max(0, jumps.length - 1))),
          stat(t("common.tritium"), `${fmt(fuel)} t`),
          stat(t("navigation.duration"), `≈ ${hours(Math.max(0, jumps.length - 1) * 20)}`),
        ),
        restock.length
          ? h("p.notice", null, icon("warn"), " " + t("navigation.refuelStops", { count: restock.length }))
          : null,
        h(
          "table.table.route",
          null,
          h(
            "thead",
            null,
            h(
              "tr",
              null,
              h("th", null, t("common.system")),
              h("th.num", null, t("navigation.jump")),
              h("th.num", null, t("common.left")),
              h("th.num", null, t("common.tritium")),
              h("th.num", null, t("navigation.tank")),
            ),
          ),
          h(
            "tbody",
            null,
            legs.map((j) =>
              h(
                "tr",
                { class: j.must_restock ? "short" : "" },
                h(
                  "td",
                  null,
                  h("button.sys", { onclick: () => copySystem(j.name) }, icon("copy"), h("span", null, j.name)),
                  j.has_icy_ring
                    ? h(
                        "span.badge.muted",
                        null,
                        j.is_system_pristine ? t("navigation.pristineIcyRing") : t("navigation.icyRing"),
                      )
                    : null,
                  j.must_restock
                    ? h(
                        "span.badge.warn",
                        null,
                        t("navigation.restockT", { restockAmount: fmt(Number(j.restock_amount ?? 0)) }),
                      )
                    : null,
                ),
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
