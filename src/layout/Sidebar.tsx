import { Button } from "../components/Button";
import logoSymbol from "../assets/logo-symbol.svg";
import plusIcon from "../assets/icons/plus.svg";
import layersIcon from "../assets/icons/layers.svg";
import layersActiveIcon from "../assets/icons/layers-active.svg";
import wavesIcon from "../assets/icons/waves.svg";
import searchIcon from "../assets/icons/search-nav.svg";
import searchActiveIcon from "../assets/icons/search-nav-active.svg";
import waypointsIcon from "../assets/icons/waypoints.svg";
import { routeLabels, type Route } from "./routes";

const destinations: { route: Route; icon: string; activeIcon: string }[] = [
  { route: "aquario", icon: layersIcon, activeIcon: layersActiveIcon },
  { route: "mare", icon: wavesIcon, activeIcon: wavesIcon },
  { route: "reencontrar", icon: searchIcon, activeIcon: searchActiveIcon },
];

const currents = [
  { name: "System Design", count: 12 },
  { name: "Freelas", count: 8 },
  { name: "Inglês", count: 6 },
];

type Props = {
  route: Route;
  onNavigate: (route: Route) => void;
};

export function Sidebar({ route, onNavigate }: Props) {
  return (
    <nav className="flex h-full w-sidebar shrink-0 flex-col gap-6 overflow-y-auto border-r border-line bg-surface px-[18px] pt-6 pb-[18px]">
      <div className="flex items-center gap-[7px]">
        <img src={logoSymbol} alt="" width={27} height={40.5} />
        <span className="font-display text-logo text-ink">aquarium</span>
      </div>

      <Button
        icon={<img src={plusIcon} alt="" width={18} height={18} />}
        className="self-start"
      >
        Capturar ideia
      </Button>

      <ul className="flex flex-col gap-[5px]">
        {destinations.map(({ route: target, icon, activeIcon }) => {
          const active = target === route;
          return (
            <li key={target}>
              <button
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => onNavigate(target)}
                className={`flex w-full cursor-pointer items-start gap-2.5 rounded-control p-2.5 text-left text-base ${
                  active ? "bg-highlight font-semibold" : "hover:bg-canvas"
                }`}
              >
                <img
                  src={active ? activeIcon : icon}
                  alt=""
                  width={18}
                  height={18}
                />
                {routeLabels[target]}
              </button>
            </li>
          );
        })}
      </ul>

      <section className="flex flex-col gap-[15px]">
        <h2 className="text-2xs font-semibold text-muted">CORRENTES</h2>
        {currents.map(({ name, count }) => (
          <div key={name} className="flex items-start gap-[9px]">
            <img src={waypointsIcon} alt="" width={15} height={15} />
            <span className="min-w-0 flex-1 text-base">{name}</span>
            <span className="text-xs text-muted">{count}</span>
          </div>
        ))}
      </section>

      <footer className="mt-auto flex flex-col gap-[7px]">
        <hr className="border-line" />
        <p className="text-sm font-medium">Meu conhecimento</p>
        <p className="text-2xs text-muted">
          Documentos / Aquarium
          <br />
          26 notas · nesta máquina
        </p>
        <p className="text-xs whitespace-pre text-success">
          {"●  Todos os arquivos salvos"}
        </p>
      </footer>
    </nav>
  );
}
