/** 3D perspective applied to the stage. The transform math depends on it, so keep them in sync. */
export const PERSPECTIVE_PX = 1400;

/** Center cover sizing — square, so height drives width. */
export const COVER_HEIGHT_RATIO = 0.75;
export const COVER_MIN_PX = 180;
export const COVER_MAX_PX = 380;

/** Rendered cover height. `coverSizePx` mirrors this in JS for the layout math. */
export const COVER_HEIGHT_CSS = `clamp(${COVER_MIN_PX}px, ${COVER_HEIGHT_RATIO * 100}%, ${COVER_MAX_PX}px)`;

/**
 * Cover flow shape. Every value is a knob — the rack is laid out from these,
 * so tweak and reload rather than editing the transform math.
 *
 * Horizontal distances are percentages of one cover's width; depths are px.
 */
export const COVER_FLOW_TUNING = {
  /** rotateY of the side covers at MIN_SIDE_COUNT. Higher = more edge-on. */
  turnAngle: 50,
  /**
   * Extra degrees of turn per cover added per side. Turning inward narrows each
   * cover, which is what buys room for more of them — the main density knob.
   */
  turnAnglePerCover: 2.5,
  /** Turn ceiling; past this covers are too edge-on to recognise. */
  maxTurnAngle: 74,

  /** translateX of the first side cover. Lower tucks it further behind the center cover. */
  firstX: 66,
  /**
   * Largest translateX step between neighbouring covers. Caps how far the rack
   * fans out at low densities — raise it to spread covers on very wide windows.
   */
  maxStepX: 34,
  /** Space kept between the outermost cover and the stage edge, in px. */
  edgeMarginPx: 28,
  /** How much of the outermost cover's own width is kept inside the stage edge. */
  outerInsetX: 20,
  /** Outermost translateX used until the stage has been measured. */
  fallbackReachX: 130,
  /** Bounds on the measured reach, so tiny or huge windows stay sane. */
  minReachX: 90,
  maxReachX: 300,

  /** translateZ of the first side cover — how far behind the center cover it sits. */
  firstZ: 120,
  /** translateZ added per cover further out. */
  stepZ: 22,

  /** Uniform scale of the side covers. */
  sideScale: 0.7,
  /** Opacity of the side covers; the outermost pair dims and then fades out. */
  sideOpacity: 0.9,
  fadingOpacity: 0.5,
};
