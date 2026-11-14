// Material traders and technology brokers come in kinds, and the station's economy decides which
// one it has: raw materials at Extraction and Refinery stations, manufactured at Industrial, encoded
// (data) at High Tech and Military; Guardian technology at High Tech, human at Industrial. It's the
// community's observed rule, right in the vast majority of cases.

/** A kind of trader or broker, the service it is and the station economies that have it. */
export interface ServiceKind {
  /** The service's name in Spansh's searches. */
  service: "Material Trader" | "Technology Broker";
  kind: "raw" | "manufactured" | "encoded" | "guardian" | "human";
  economies: string[];
}

export const SERVICE_KINDS: ServiceKind[] = [
  { service: "Material Trader", kind: "raw", economies: ["Extraction", "Refinery"] },
  { service: "Material Trader", kind: "manufactured", economies: ["Industrial"] },
  { service: "Material Trader", kind: "encoded", economies: ["High Tech", "Military"] },
  { service: "Technology Broker", kind: "guardian", economies: ["High Tech"] },
  { service: "Technology Broker", kind: "human", economies: ["Industrial"] },
];

/** The kind a station's trader or broker should be, from its primary economy (undefined if unknown). */
export function serviceKindOf(service: string, economy: string | undefined): ServiceKind | undefined {
  if (!economy) return undefined;
  return SERVICE_KINDS.find((k) => k.service === service && k.economies.includes(economy));
}
