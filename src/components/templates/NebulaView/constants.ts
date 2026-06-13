export const UNKNOWN_GENRE = "Unknown";

export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Average world-space distance between neighbouring points in a cluster. */
export const POINT_SPACING = 7;

/** World-space padding added around the outermost point. */
export const CLUSTER_GAP = 36;

/** Disc radius as a multiple of avg cluster radius × √(genre count). Sets how
 * spread out the clusters are; lower = more overlap / denser enmeshing. */
export const DISC_SPREAD = 1.3;

/** Number of turns the hue-ordered arm winds across the whole genre set,
 * scaled mildly by count. Keeps adjacent hues adjacent while the √-radius
 * distribution fills the disc evenly for any number of genres. */
export const SPIRAL_TURNS_MIN = 1;
export const SPIRAL_TURNS_MAX = 2.5;

/** Core scatter reaches this far past the nominal cluster radius, so each
 * genre's points bleed deep into its neighbours. */
export const SCATTER_BLEED = 1.35;

/** Fraction of a genre's tracks scattered as fringe satellites. */
export const OUTLIER_FRACTION = 0.18;

/** Smallest cluster radius so tiny genres still read as a blob. */
export const MIN_CLUSTER_RADIUS = 14;

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 12;

/** Screen-space radius a cluster must reach before its label is drawn. */
export const LABEL_MIN_SCREEN_RADIUS = 26;

/** Fetch ceiling — well above any realistic personal library. */
export const TRACK_FETCH_LIMIT = 500_000;

/** Orbital speed at a cluster's edge, in radians per second. */
export const ORBIT_BASE_SPEED = 0.04;

/** How long the big-bang intro takes for a single point, in ms. */
export const INTRO_DURATION_MS = 1800;

/** Maximum extra stagger before a point starts its intro, in ms. */
export const INTRO_STAGGER_MS = 700;

/** Extra swirl (radians) points travel through while assembling. */
export const INTRO_SWIRL = 2.2;

export const STAR_COUNT = 380;

/** Resolution of the density grid behind the heat shading and contours. */
export const HEAT_GRID_SIZE = 192;

/** How far past the cluster extent the heat field reaches (1 = exact fit). */
export const HEAT_FIELD_MARGIN = 1.15;

/** Normalized density values traced as topographic contour lines. */
export const CONTOUR_LEVELS = [0.14, 0.28, 0.45, 0.64, 0.82];

/** Per-frame interpolation factor easing the zoom toward its target. */
export const ZOOM_SMOOTHING = 0.16;

/** Per-frame (at 60fps) velocity retention for pan momentum. */
export const PAN_FRICTION = 0.92;
