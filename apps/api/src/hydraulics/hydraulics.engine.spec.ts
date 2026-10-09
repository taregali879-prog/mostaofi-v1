import { calculateHydraulics, normalizeHydraulicInput } from './hydraulics.engine';
const base = {segments:[{id:'S1',lengthM:30,flowGpm:500,insideDiameterMm:150,cFactor:120}],residualPressurePsi:12,elevationRiseM:5,designFlowGpm:500};
describe('hydraulics engine',()=>{
  it('calculates positive friction and elevation',()=>{
    const r=calculateHydraulics(base);
    expect(r.frictionLossPsi).toBeGreaterThan(0);
    expect(r.elevationLossPsi).toBeCloseTo(7.112,2);
    expect(r.requiredPressurePsi).toBeGreaterThan(19);
  });
  it('keeps manufacturer data unverified',()=>{
    const r=calculateHydraulics({...base,pump:{ratedFlowGpm:500,shutoffPsi:95,ratedPsi:80,at150Psi:50,inletPsi:0}});
    expect(r.pumpCheck?.heuristic150FlowLimit).toBe(false);
    expect(r.pumpCheck?.manufacturerDataUnverified).toBe(true);
  });
  it('rejects invalid geometry and non finite numbers',()=>{
    expect(()=>normalizeHydraulicInput({...base,segments:[{...base.segments[0],insideDiameterMm:0}]})).toThrow();
    expect(()=>normalizeHydraulicInput({...base,designFlowGpm:NaN})).toThrow();
  });
  it('does not extrapolate manufacturer pump curve',()=>{
    const r=calculateHydraulics({...base,designFlowGpm:900,pump:{ratedFlowGpm:500,shutoffPsi:95,ratedPsi:80,at150Psi:60,inletPsi:0}});
    expect(r.pumpCheck?.withinCurveRange).toBe(false);
    expect(r.pumpCheck?.availableAtDesignPsi).toBeUndefined();
  });
});
