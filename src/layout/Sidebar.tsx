import logoSymbol from "../assets/logo-symbol.svg";

export function Sidebar() {
  return (
    <nav className="flex h-full w-sidebar shrink-0 flex-col gap-6 overflow-y-auto border-r border-line bg-surface px-[18px] pt-6 pb-[18px]">
      <div className="flex items-center gap-[7px]">
        <img src={logoSymbol} alt="" width={27} height={40.5} />
        <span className="font-display text-logo text-ink">aquarium</span>
      </div>
    </nav>
  );
}
