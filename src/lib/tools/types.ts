/** М6/М7/М8: оқушы салған сызбалардың деректері (`response_json.sketch`). */
export type XY = [number, number];

/** М6 график тақтасы — математикалық координаталарда */
export type GraphObj =
  | { t: 'pt'; p: XY; label?: string }
  | { t: 'line'; a: XY; b: XY; dashed?: boolean }
  | { t: 'seg'; a: XY; b: XY }
  | { t: 'vec'; a: XY; b: XY }
  | { t: 'circle'; c: XY; r: number }
  | { t: 'curve'; pts: XY[]; dashed?: boolean }
  | { t: 'region'; pts: XY[] };
export interface GraphSketch { kind: 'graph'; objs: GraphObj[]; view?: { x: XY; y: XY } }

/** М7 геометрия тақтасы — экран бірліктерінде (600×420), y төмен қарай */
export interface GeoPoint { id: string; label: string; p: XY }
export type GeoObj =
  | { t: 'seg'; a: string; b: string; dashed?: boolean }
  | { t: 'line'; a: string; b: string }
  | { t: 'circle'; c: string; through?: string; r?: number }
  | { t: 'right'; at: string; a: string; b: string }
  | { t: 'tick'; a: string; b: string; n: number }
  | { t: 'len'; a: string; b: string; text: string }
  | { t: 'angle'; at: string; a: string; b: string; text: string };
export interface GeoSketch { kind: 'board'; points: GeoPoint[]; objs: GeoObj[]; log?: string[] }

/** М8 3D тақта: дене және қима нүктелері (қыр индексі + орны) */
export interface SolidSketch { kind: 'solid3d'; solid: string; marks: { edge: number; t: number }[] }

export type Sketch = GraphSketch | GeoSketch | SolidSketch;
export interface ToolCheck { status: 'ok' | 'error' | 'warn'; text: string }
