/**
 * Есеп шартындағы (`body_json.figure`) немесе шешіміндегі (`solution_json.figures`) сызба.
 * Деректі тек мұғалім/әкімші енгізеді; бетте React SVG элементтері ретінде салынады (innerHTML жоқ).
 */
export type Color = 'blue' | 'red' | 'green' | 'orange' | 'purple' | 'gray' | 'black';

export interface PlotCurve {
  /** y = f(x), мысалы "2sin(x-pi/2)+2" */
  expr: string;
  /** Легендадағы жазу, $...$ формуласымен: "$y=\\sin x$" */
  label?: string;
  /** dashed — аралық қадам (штрих), solid — негізгі график */
  style?: 'solid' | 'dashed';
  color?: Color;
  /** Анықталу облысын шектеу */
  domain?: [number, number];
}

export interface PlotFigure {
  kind: 'plot';
  x: [number, number];
  y: [number, number];
  /** x осіндегі белгілер: 'pi' — π/2 қадаммен, сан — сол қадаммен */
  xTicks?: 'pi' | number;
  yTicks?: number;
  /** Осьтерде масштаб бірдей (шеңбер, жанама есептері) */
  equal?: boolean;
  curves: PlotCurve[];
  points?: { x: number; y: number; label?: string; color?: Color }[];
  /** Горизонталь/вертикаль көмекші түзулер (мысалы y=0,3) */
  hlines?: { y: number; label?: string; color?: Color }[];
  vlines?: { x: number; color?: Color }[];
  caption?: string;
}

export type Pt = [number, number];
export type PointRef = string | Pt;

export interface GeometryFigure {
  kind: 'geometry';
  /** Аталған нүктелер: { A: [0,0], B: [4,0] } */
  points: Record<string, Pt>;
  /** Тұйық көпбұрыштар: ["A","B","C"] */
  polygons?: string[][];
  /** Кесінділер: ["A","B"] немесе { from, to, dashed } */
  segments?: (string[] | { from: PointRef; to: PointRef; dashed?: boolean })[];
  circles?: { center: PointRef; r?: number; through?: PointRef; dashed?: boolean }[];
  /** Тік бұрыш белгісі: [төбе, бір жақ, екінші жақ] */
  right?: string[][];
  /** Бұрыш доғасы: төбе at, жақтары from/to, жазуы label ("30°", "α") */
  angles?: { at: string; from: string; to: string; label?: string; arcs?: 1 | 2 }[];
  /** Кесінді ұзындығының жазуы */
  lengths?: { seg: [string, string]; text: string }[];
  /** Жазуы көрсетілмейтін нүктелер (мысалы көмекші) */
  hideLabels?: string[];
  /** Нүкте жазуының бағыты: n, s, e, w, ne, nw, se, sw */
  labelPos?: Record<string, string>;
  caption?: string;
}

export type Figure = PlotFigure | GeometryFigure;

/** Шешімдегі сызба: бірнеше қадам болуы мүмкін. */
export interface SolutionJson {
  text: string;
  figures?: Figure[];
}
