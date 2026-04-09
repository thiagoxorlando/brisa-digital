import Image from "next/image";

const SIZES = {
  sm: 20,
  md: 32,
  lg: 75,
  xl: 120,
} as const;

type LogoSize = keyof typeof SIZES;

export default function Logo({
  size = "md",
  src = "/logo.png",
  className = "",
}: {
  size?: LogoSize;
  src?: string;
  className?: string;
}) {
  const px = SIZES[size];
  return (
    <Image
      src={src}
      alt="Brisa Digital"
      width={px}
      height={px}
      className={`object-contain flex-shrink-0 ${className}`.trim()}
      priority
    />
  );
}
