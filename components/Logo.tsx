/**
 * Official CastAnet brand mark — the single way to render the logo in the UI.
 *
 * Renders the supplied vector masters from public/brand/castanet-new/SVG.
 * The viewBox frames the artwork's measured bounds (plus a small safety
 * margin), so the transparent padding baked into the masters doesn't distort
 * sizing or alignment. The artwork itself is never cropped, recolored or
 * stretched: aspect ratio always comes from the viewBox.
 *
 *   variant     "horizontal" (symbol + wordmark) | "symbol"
 *   background  the surface the logo sits on: "dark" → white wordmark,
 *               "light" → dark wordmark (the symbol is the same on both)
 *   size        visible artwork height; `lgSize` overrides it from the lg
 *               breakpoint up
 */

type LogoVariant = "horizontal" | "symbol";
type LogoBackground = "light" | "dark";
type LogoSize = "xs" | "sm" | "md" | "lg" | "xl";

const ARTWORK = {
  horizontal: {
    dark: "/brand/castanet-new/SVG/castanet-logo-horizontal-white.svg",
    light: "/brand/castanet-new/SVG/castanet-logo-horizontal-dark.svg",
    canvas: { width: 4000, height: 1200 },
    // Measured artwork bounds 280,305 3582×590 + 12-unit safety margin.
    viewBox: { x: 268, y: 293, width: 3606, height: 614 },
  },
  symbol: {
    dark: "/brand/castanet-new/SVG/castanet-symbol.svg",
    light: "/brand/castanet-new/SVG/castanet-symbol.svg",
    canvas: { width: 1000, height: 1000 },
    // Measured artwork bounds 190,205 575×590, centred in a square frame.
    viewBox: { x: 170, y: 193, width: 614, height: 614 },
  },
} as const;

// Literal class names so Tailwind can see them.
const HEIGHT: Record<LogoSize, string> = {
  xs: "h-[18px]",
  sm: "h-[22px]",
  md: "h-7",
  lg: "h-[34px]",
  xl: "h-10",
};
const LG_HEIGHT: Record<LogoSize, string> = {
  xs: "lg:h-[18px]",
  sm: "lg:h-[22px]",
  md: "lg:h-7",
  lg: "lg:h-[34px]",
  xl: "lg:h-10",
};

export default function Logo({
  variant = "horizontal",
  background = "light",
  size = "md",
  lgSize,
  className = "",
}: {
  variant?: LogoVariant;
  background?: LogoBackground;
  size?: LogoSize;
  lgSize?: LogoSize;
  className?: string;
}) {
  const art = ARTWORK[variant];
  const { x, y, width, height } = art.viewBox;

  return (
    <svg
      viewBox={`${x} ${y} ${width} ${height}`}
      role="img"
      aria-label="CastAnet"
      className={[HEIGHT[size], lgSize ? LG_HEIGHT[lgSize] : "", "w-auto flex-shrink-0", className]
        .filter(Boolean)
        .join(" ")}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <title>CastAnet</title>
      <image
        href={art[background]}
        x={0}
        y={0}
        width={art.canvas.width}
        height={art.canvas.height}
      />
    </svg>
  );
}
