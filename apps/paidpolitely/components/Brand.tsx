import Image from "next/image";

export function BrandMark({ size = 42 }: { size?: number }) {
  return (
    <Image
      src="/brand/paidpolitely-mark.svg"
      alt="PaidPolitely mark"
      width={size}
      height={size}
      priority
      className="brand-mark"
    />
  );
}

export function Wordmark() {
  return (
    <div className="flex items-center gap-3">
      <BrandMark />
      <div className="leading-none">
        <p className="text-lg font-black tracking-tight text-white">PaidPolitely</p>
        <p className="mt-1 text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-rose-200/70">
          Direct adult display network
        </p>
      </div>
    </div>
  );
}
