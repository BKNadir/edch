import { spanshGet, spanshJob, spanshPost } from "../bridge.js";
import { h, icon, fmt, replace } from "../dom.js";
import type { Ctx, View } from "../context.js";
import { CARRIER_MAX_JUMP, carrierEstimate, fsdInfo, jumpModel } from "../jump.js";
import { fmtLy } from "../spansh.js";
import { copySystem } from "./results.js";

type Json = Record<string, any>;

const fmt1 = (n: number) => n.toLocaleString("fr-BE", { maximumFractionDigits: 2 });
const hours = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, "0")}` : `${Math.round(min)} min`);

/** Coordinates of a system by name (Spansh). */
async function coordsOf(name: string): Promise<[number, number, number] | null> {
  const res = await spanshPost("systems/search", { filters: { distance: { min: "0", max: "1" } }, sort: [{ distance: { direction: "asc" } }], size: 1, page: 0, reference_system: name });
  const r = res?.reference ?? res?.results?.[0];
  return r && typeof r.x === "number" ? [r.x, r.y, r.z] : null;
}

let datalistTimer: number | undefined;
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
    const to = systemInput("nav-to", "", "Destination");
    const range = h("input", { type: "number", step: "0.01", min: "1", value: this.defaultRange() ? String(this.defaultRange()) : "", placeholder: "al" });
    const eff = h("input", { type: "number", min: "1", max: "100", value: "60" });
    const plot = async () => {
      const r = Number(range.value) || this.defaultRange();
      if (!from.value.trim() || !to.value.trim() || !r) {
        replace(this.routeOut, h("p.error", null, "Indique un départ, une destination et une portée."));
        return;
      }
      await this.plotShip(from.value.trim(), to.value.trim(), r, Number(eff.value) || 60);
    };

    // ---- carrier ----
    const c = cmdr.carrier;
    const cFrom = systemInput("fc-from", here, "Départ du carrier");
    const cTo = systemInput("fc-to", "", "Destination");
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
          h("p.sub", null, "Calcul Spansh avec boost des étoiles à neutrons (comme le Neutron Plotter)."),
          h(
            "div.form-grid",
            null,
            h("label", null, "Départ", from),
            h("label", null, "Destination", to),
            h("label", null, "Portée (al)", range),
            h("label", { title: "Plus c'est haut, plus l'itinéraire colle à la ligne droite" }, "Efficacité (%)", eff),
          ),
          h("div.row", null, h("button.primary", { onclick: plot }, "Calculer l'itinéraire"), h("button.ghost", { onclick: () => this.estimateShip(from.value.trim(), to.value.trim(), Number(range.value) || this.defaultRange()) }, "Estimation rapide")),
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
    this.signature = "";
    this.update();
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
    const cmdr = this.ctx.store.state.cmdr;
    const sig = JSON.stringify([cmdr.loadout?.ship, cmdr.loadout?.maxJumpRange, cmdr.loadout?.unladenMass, cmdr.fuel?.main, cmdr.cargoMass, this.cargo]);
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
      h("p.sub", null, `${cmdr.ship?.type ?? l.ship}${cmdr.ship?.name ? ` « ${cmdr.ship.name} »` : ""} · FSD ${fsd ? `${fsd.size}${fsd.rating}` : "?"}${l.fsd?.includes("overcharge") ? " SCO" : ""}${m.boost ? ` · booster Gardien +${m.boost} al` : ""} · ${fmt1(m.unladen)} t à vide`),
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

  private async plotShip(from: string, to: string, range: number, efficiency: number) {
    replace(this.routeOut, h("p.sub", null, h("span.spinner"), " Spansh calcule l'itinéraire…"));
    try {
      const res: Json = await spanshJob("route", [
        ["from", from],
        ["to", to],
        ["range", String(range)],
        ["efficiency", String(efficiency)],
      ]);
      const jumps: Json[] = res.system_jumps ?? [];
      const total = jumps.reduce((s, j) => s + Number(j.jumps ?? 0), 0);
      replace(
        this.routeOut,
        h("div.estimate", null, stat("Distance", fmtLy(Number(res.distance ?? 0))), stat("Sauts", fmt(total || Number(res.total_jumps ?? 0))), stat("Étapes", fmt(jumps.length)), stat("Durée", `≈ ${hours(((total || jumps.length) * 50) / 60)}`)),
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

  private async plotCarrier(from: string, to: string, used: number, tank: number, hold: number) {
    if (!from || !to) return replace(this.carrierOut, h("p.error", null, "Indique le départ et la destination."));
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
