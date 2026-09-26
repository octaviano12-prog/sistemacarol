import Image from "next/image";

export function BrandLogo({ size = 56, className = "" }: { size?: number; className?: string }) {
  return <span style={{ width: size, height: size }} className={`relative inline-block shrink-0 overflow-hidden bg-white ${className}`}>
    <Image src="/logo-dra-maria-carolini-icon-final.jpg" alt="Logotipo da Dra. Maria Carolini" fill sizes={`${size}px`} className="scale-[1.13] object-contain contrast-125 saturate-150" priority unoptimized />
  </span>;
}
