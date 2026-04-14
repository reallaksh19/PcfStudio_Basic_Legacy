export type Smart2Dcanvas_Point = {
  id: string;
  x: number;
  y: number;
  z?: number;
};

export type Node = Smart2Dcanvas_Point & {
  kind?: 'FREE' | 'PIPE_ENDPOINT' | 'BRANCH' | 'SUPPORT' | 'INLINE' | 'MIDPOINT';
  hostEntityId?: string;
};

export type Segment = {
  id: string;
  startNodeId: string;
  endNodeId: string;
  geometryKind: 'line' | 'polyline' | 'spline';
  points: Smart2Dcanvas_Point[];
  sizeSpecFields?: {
    bore?: number | string;
    wallThickness?: number | string;
    specKey?: string;
    material?: string;
    pipingClass?: string;
    schedule?: string;
    pressure?: number | string;
    temperature?: number | string;
    insulation?: number | string;
    lineNumber?: string;
  };
  metadata?: Record<string, unknown>;
};

export type InlineItem = {
  id: string;
  type: 'valve' | 'flange' | 'fvf' | 'reducer';
  insertionStation: number;
  occupiedLength: number;
  x: number;
  y: number;
  angle: number;
  weight?: number;
  upstreamBore?: number;
  downstreamBore?: number;
  reducerType?: 'concentric' | 'eccentric';
  metadata?: Record<string, unknown>;
};

export type Support = {
  id: string;
  nodeId: string;
  supportType: string;
  x: number;
  y: number;
  metadata?: Record<string, unknown>;
};

export type Fitting = {
  id: string;
  type: 'BEND' | 'TEE' | 'OLET' | 'REDUCER' | 'FLANGE' | 'VALVE';
  x: number;
  y: number;
  angle?: number;
  radius?: number;
  angleDeg?: number;
  startPoint?: { x: number; y: number };
  endPoint?: { x: number; y: number };
  centerPoint?: { x: number; y: number };
  branchPoint?: { x: number; y: number };
  metadata?: Record<string, unknown>;
};

export type UnderlayImage = {
  id: string;
  source: string;
  x: number;
  y: number;
  opacity: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
};
