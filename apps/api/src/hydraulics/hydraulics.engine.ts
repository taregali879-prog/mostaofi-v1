// Preliminary, engineer-reviewed single-path Hazen-Williams calculation.
// It DOES NOT solve network topology or assert NFPA/SBC compliance.
export type Segment = {
  id: string;
  lengthM: number;
  equivalentLengthM?: number;
  flowGpm: number;
  insideDiameterMm: number;
  cFactor: number;
};
export type PumpCurve = {
  ratedFlowGpm: number;
  shutoffPsi: number;
  ratedPsi: number;
  at150Psi: number;
  inletPsi: number;
};
export type HydraulicInput = {
  segments: Segment[];
  residualPressurePsi: number; // explicitly specified by engineer, not a code default
  elevationRiseM: number;      // source to remote node (+ = higher)
  designFlowGpm: number;
  pump?: PumpCurve;
  extractionMethod?: 'MANUAL_PATH' | 'DXF_ASSISTED';
};
const finite = (n: unknown, min: number, max: number, name: string): number => {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) {
    throw new Error(`INVALID_${name}`);
  }
  return n;
};
export function normalizeHydraulicInput(raw: HydraulicInput): HydraulicInput {
  if (!raw || !Array.isArray(raw.segments) || raw.segments.length < 1 || raw.segments.length > 300) {
    throw new Error('INVALID_SEGMENTS');
  }
  const ids = new Set<string>();
  const segments = raw.segments.map((s, index) => {
    if (!s || typeof s.id !== 'string' || !/^[\w.:-]{1,80}$/.test(s.id) || ids.has(s.id)) {
      throw new Error('INVALID_SEGMENT_ID');
    }
    ids.add(s.id);
    return {
      id: s.id,
      lengthM: finite(s.lengthM, 0.0001, 100000, `LENGTH_${index}`),
      equivalentLengthM: finite(s.equivalentLengthM ?? 0, 0, 100000, `EQUIVALENT_LENGTH_${index}`),
      flowGpm: finite(s.flowGpm, 0, 50000, `FLOW_${index}`),
      insideDiameterMm: finite(s.insideDiameterMm, 1, 2000, `DIAMETER_${index}`),
      cFactor: finite(s.cFactor, 50, 180, `C_FACTOR_${index}`),
    };
  });
  const designFlowGpm = finite(raw.designFlowGpm, 0.001, 50000, 'DESIGN_FLOW');
  const result: HydraulicInput = {
    segments,
    residualPressurePsi: finite(raw.residualPressurePsi, 0, 500, 'RESIDUAL_PRESSURE'),
    elevationRiseM: finite(raw.elevationRiseM, -500, 500, 'ELEVATION'),
    designFlowGpm,
    extractionMethod: raw.extractionMethod === 'DXF_ASSISTED' ? 'DXF_ASSISTED' : 'MANUAL_PATH',
  };
  if (raw.pump) {
    const p = raw.pump;
    result.pump = {
      ratedFlowGpm: finite(p.ratedFlowGpm, 0.001, 50000, 'PUMP_FLOW'),
      shutoffPsi: finite(p.shutoffPsi, 0.001, 1500, 'SHUTOFF'),
      ratedPsi: finite(p.ratedPsi, 0.001, 1500, 'RATED'),
      at150Psi: finite(p.at150Psi, 0.001, 1500, 'AT_150'),
      inletPsi: finite(p.inletPsi, -100, 500, 'INLET'),
    };
  }
  return result;
}
const round = (x: number) => Math.round((x + Number.EPSILON) * 1000) / 1000;
export function calculateHydraulics(raw: HydraulicInput) {
  const input = normalizeHydraulicInput(raw);
  const segments = input.segments.map(s => {
    const diameterInch = s.insideDiameterMm / 25.4;
    const lengthFeet = (s.lengthM + (s.equivalentLengthM ?? 0)) * 3.280839895;
    const lossPsi = (4.52 * s.flowGpm ** 1.85 * lengthFeet) /
      (s.cFactor ** 1.85 * diameterInch ** 4.87);
    return { ...s, frictionLossPsi: round(lossPsi) };
  });
  const frictionLossPsi = segments.reduce((total, s) => total + s.frictionLossPsi, 0);
  const elevationLossPsi = input.elevationRiseM * 1.42233433;
  const requiredPressurePsi = input.residualPressurePsi + frictionLossPsi + elevationLossPsi;
  const result: {
    segments: typeof segments;
    frictionLossPsi: number;
    elevationLossPsi: number;
    requiredPressurePsi: number;
    disclaimer: string;
    pumpCheck?: Record<string, number | boolean | string>;
  } = {
    segments,
    frictionLossPsi: round(frictionLossPsi),
    elevationLossPsi: round(elevationLossPsi),
    requiredPressurePsi: round(requiredPressurePsi),
    disclaimer: 'حسابات أولية – غير معتمد للتنفيذ. المسار والطلب الهيدروليكي يحتاجان مراجعة مهندس مختص.',
  };
  if (input.pump) {
    const p = input.pump, q = input.designFlowGpm;
    // Piecewise-linear interpolation of user-provided MANUFACTURER points only.
    const maxQ = p.ratedFlowGpm * 1.5;
    const inRange = q <= maxQ;
    const head = !inRange ? null : q <= p.ratedFlowGpm
      ? p.shutoffPsi + (p.ratedPsi - p.shutoffPsi) * (q / p.ratedFlowGpm)
      : p.ratedPsi + (p.at150Psi - p.ratedPsi) *
        ((q - p.ratedFlowGpm) / (maxQ - p.ratedFlowGpm));
    const available = head === null ? null : head + p.inletPsi;
    result.pumpCheck = {
      heuristicShutoffLimit: p.shutoffPsi <= p.ratedPsi * 1.4,
      heuristic150FlowLimit: p.at150Psi >= p.ratedPsi * 0.65,
      withinCurveRange: inRange,
      manufacturerDataUnverified: true,
      ...(available === null ? {} : {
        availableAtDesignPsi: round(available),
        marginPsi: round(available - requiredPressurePsi),
        meetsEstimatedDesignDemand: available >= requiredPressurePsi,
      }),
      note: 'المقارنة استرشادية، وليست اعتماد NFPA 20؛ تتطلب منحنى مصنع موثقا وفحوص الموقع.',
    };
  }
  return result;
}
