import Image from "next/image";

export function BrandLogo({ size = 56, className = "" }: { size?: number; className?: string }) {
  return <span style={{ width: size, height: size }} className={`relative inline-block shrink-0 overflow-hidden bg-white ${className}`}>
    <Image src="/logo-dra-maria-carolini.jpg" alt="Logotipo da Dra. Maria Carolini" fill sizes={`${size}px`} className="object-cover scale-[2.25]" style={{ transformOrigin: "53% 34%" }} priority />
  </span>;
}
